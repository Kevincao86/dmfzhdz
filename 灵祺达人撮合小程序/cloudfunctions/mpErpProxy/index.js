/**
 * 备案期：手机 → 云函数 → 轻量 IP（读 erp-target.js）
 */
const cloud = require('wx-server-sdk')
const https = require('https')
const http = require('http')
const target = require('./erp-target.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ORIGIN = String(process.env.ECS_ERP_ORIGIN || '').replace(/\/$/, '')
const ERP_IP = String(process.env.ECS_ERP_IP || target.ip || '').trim()
const ERP_HOST = String(process.env.ECS_ERP_HOST || target.host || 'mofangdianai.com').trim()

function apiPath(raw) {
  let p = String(raw || '').trim()
  if (!p.startsWith('/')) p = `/${p}`
  if (p.startsWith('/api/')) p = `/erp-api${p.slice(4)}`
  else if (!p.startsWith('/erp-api')) p = `/erp-api${p}`
  return p
}

function ipTarget(path, { https, port }) {
  const useHttps = https === true
  const p = port || (useHttps ? 443 : 80)
  return {
    mode: 'ip',
    proto: useHttps ? 'https' : 'http',
    hostname: ERP_IP,
    port: p,
    path,
    host: ERP_HOST,
  }
}

function urlTarget(path) {
  const base = ORIGIN || `https://${ERP_HOST}/erp-api`
  const rel = path.replace(/^\/erp-api/, '') || '/'
  return { mode: 'url', fullUrl: `${base.replace(/\/$/, '')}${rel}` }
}

function buildAttempts(path) {
  if (ORIGIN) return [urlTarget(path)]
  if (!ERP_IP) return [urlTarget(path)]
  const list = []
  if (target.https !== false) list.push(ipTarget(path, { https: true }))
  list.push(ipTarget(path, { https: false, port: 80 }))
  const alt = Number(target.altPort)
  if (alt > 0) list.push(ipTarget(path, { https: false, port: alt }))
  return list
}

function upstreamRequest(t, method, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = body != null && method !== 'GET' ? JSON.stringify(body) : ''
    let opts
    if (t.mode === 'ip') {
      opts = {
        hostname: t.hostname,
        port: t.port,
        path: t.path,
        method,
        headers: {
          Accept: 'application/json',
          Host: t.host,
          ...(method !== 'GET'
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        servername: t.host,
        rejectUnauthorized: target.insecure !== true,
        timeout: 20000,
      }
    } else {
      const u = new URL(t.fullUrl)
      opts = {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          Accept: 'application/json',
          Host: u.host,
          ...(method !== 'GET'
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
        servername: u.hostname,
        rejectUnauthorized: true,
        timeout: 20000,
      }
    }
    const lib =
      t.mode === 'ip' ? (t.proto === 'https' ? https : http) : t.fullUrl.startsWith('https') ? https : http
    const req = lib.request(opts, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let data
        try {
          data = raw ? JSON.parse(raw) : {}
        } catch {
          data = { message: raw }
        }
        resolve({ status: res.statusCode || 0, data })
      })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => {
      req.destroy(new Error('timeout'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

function describeTarget(t) {
  if (t.mode === 'ip') return `${t.proto}://${t.host}${t.path}@${t.hostname}:${t.port}`
  return t.fullUrl
}

exports.main = async (event) => {
  const method = String(event.method || 'GET').toUpperCase()
  const path = apiPath(event.path || '/api/mp-cronet-ping')
  const body = event.body
  const headers = event.headers && typeof event.headers === 'object' ? event.headers : {}
  const attempts = buildAttempts(path)
  const errors = []

  for (const t of attempts) {
    try {
      const { status, data } = await upstreamRequest(t, method, body, headers)
      return {
        ok: status >= 200 && status < 300,
        status,
        data,
        via: 'cloud-mpErpProxy',
        upstream: describeTarget(t),
      }
    } catch (e) {
      errors.push(`${describeTarget(t)} → ${e.message || e}`)
    }
  }

  return {
    ok: false,
    status: 0,
    error: errors.join(' | ') || 'all attempts failed',
    via: 'cloud-mpErpProxy',
    hint: '请在轻量检查：公网IP、443/80安全组、meoo-auth-api与Nginx是否在跑',
  }
}
