/**
 * 备案期：手机 → 云函数 → 轻量 IP（读 erp-target.js）
 */
const cloud = require('wx-server-sdk')
const https = require('https')
const http = require('http')
const target = require('./erp-target.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const PROXY_BUILD = 'mpErpProxy-20260603-post-once'
const ORIGIN = String(process.env.ECS_ERP_ORIGIN || '').replace(/\/$/, '')
const ERP_IP = String(process.env.ECS_ERP_IP || target.ip || '').trim()
const ERP_HOST = String(process.env.ECS_ERP_HOST || target.host || 'mofangdianai.com').trim()
const TLS_SNI = String(target.tlsSni || ERP_HOST).trim()

function requestHost(useIp) {
  if (useIp && target.useIpHost !== false && ERP_IP) return ERP_IP
  return ERP_HOST
}

function apiPath(raw) {
  let p = String(raw || '').trim()
  if (!p.startsWith('/')) p = `/${p}`
  if (p.startsWith('/api/')) p = `/erp-api${p.slice(4)}`
  else if (!p.startsWith('/erp-api')) p = `/erp-api${p}`
  return p
}

function ipTarget(path, { https, port, useIp }) {
  const useHttps = https === true
  const p = port || (useHttps ? 443 : 80)
  const host = requestHost(useIp)
  return {
    mode: 'ip',
    proto: useHttps ? 'https' : 'http',
    hostname: ERP_IP,
    port: p,
    path,
    host,
    sni: TLS_SNI,
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
  if (target.http80IpOnly) {
    list.push(ipTarget(path, { https: false, port: 80, useIp: true }))
  }
  if (target.https !== false) {
    list.push(ipTarget(path, { https: true, useIp: true }))
    if (!target.httpsIpOnly) list.push(ipTarget(path, { https: true, useIp: false }))
  }
  const alt = Number(target.altPort)
  if (alt > 0) list.push(ipTarget(path, { https: false, port: alt, useIp: true }))
  return list
}

function upstreamRequest(t, method, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = body != null && method !== 'GET' ? JSON.stringify(body) : ''
    const reqPath = t.mode === 'ip' ? t.path : `${new URL(t.fullUrl).pathname}${new URL(t.fullUrl).search}`
    const timeoutMs = /video-upload|ice-multipart/i.test(reqPath)
      ? 120000
      : /registry|hall-registry|publisher-display|meoo-ops-mp-auth/i.test(reqPath)
        ? 45000
        : 20000
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
        servername: t.sni || t.host,
        rejectUnauthorized: target.insecure !== true,
        timeout: timeoutMs,
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
        timeout: timeoutMs,
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
          data = { message: raw.slice(0, 500) }
        }
        resolve({ status: res.statusCode || 0, data })
      })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'))
    })
    if (payload) req.write(payload)
    req.end()
  })
}

function describeTarget(t) {
  if (t.mode === 'ip') return `${t.proto}://Host:${t.host}${t.path}@${t.hostname}:${t.port}(sni:${t.sni})`
  return t.fullUrl
}

function isIcpBlock(data) {
  const s = JSON.stringify(data || '')
  return /ICP Filing|beian-block|Non-compliance/i.test(s)
}

exports.main = async (event) => {
  const method = String(event.method || 'GET').toUpperCase()
  const path = apiPath(event.path || '/api/mp-cronet-ping')
  const body = event.body
  const headers = event.headers && typeof event.headers === 'object' ? event.headers : {}
  const attempts = buildAttempts(path)
  const trace = []
  let lastFail = null

  for (const t of attempts) {
    const label = describeTarget(t)
    try {
      const { status, data } = await upstreamRequest(t, method, body, headers)
      if (status >= 200 && status < 300) {
        return {
          ok: true,
          status,
          data,
          via: 'cloud-mpErpProxy',
          upstream: label,
          build: PROXY_BUILD,
        }
      }
      const apiErr = data && typeof data.error === 'string' ? data.error : ''
      const note = isIcpBlock(data) ? 'icp-block' : apiErr || `http-${status}`
      trace.push(`${label} → ${note}`)
      lastFail = { status, data, upstream: label }
      /** 微信 login code 一次性，禁止换端口重试以免 code 作废 */
      if (method === 'POST') {
        break
      }
    } catch (e) {
      trace.push(`${label} → ${e.message || e}`)
      if (method === 'POST') break
    }
  }

  return {
    ok: false,
    status: lastFail ? lastFail.status : 0,
    data: lastFail ? lastFail.data : undefined,
    error: trace.join(' | ') || 'all attempts failed',
    via: 'cloud-mpErpProxy',
    build: PROXY_BUILD,
    upstream: lastFail ? lastFail.upstream : undefined,
    hint:
      '登录 http-500：在 ECS 执行 curl POST meoo-ops-mp-auth 与 journalctl -u meoo-auth-api；常见为微信密钥或 mp_accounts 表',
  }
}
