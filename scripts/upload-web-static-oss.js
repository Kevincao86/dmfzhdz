#!/usr/bin/env node
/**
 * 上传 cs / fws / dr Web 静态资源至 OSS（原图/原视频/原音频，不做有损压缩）
 *
 * 主前缀：mp-recruit-covers/web-static/{merchant|dr}/...
 * 兼容：dr landing → mp-recruit-covers/dr-landing/
 * 兼容：dr recruit-covers → mp-recruit-covers/（小程序同源）
 *
 * 环境变量同 upload-mp-recruit-covers-oss.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MERCHANT_PUBLIC = path.join(ROOT, 'web版/merchant-erp/public')
const DR_PUBLIC = path.join(ROOT, '灵祺达人履约管理后台/public')
const OSS_MODULE = path.join(ROOT, 'web版/merchant-erp/node_modules/ali-oss')

const MEDIA_RE = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mp3|wav|m4a)$/i

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false
  let n = 0
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = val
      n += 1
    }
  }
  return n > 0
}

function parseOssPrefix(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    const m = url.hostname.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
    if (!m) return null
    return { bucket: m[1], region: m[2] }
  } catch {
    return null
  }
}

function parseOssEndpoint(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const fromUrl = parseOssPrefix(trimmed)
  if (fromUrl) return { bucket: fromUrl.bucket, region: `oss-${fromUrl.region}` }
  const m = trimmed.match(/oss-([a-z0-9-]+)\.aliyuncs\.com/i)
  if (m) return { bucket: '', region: `oss-${m[1]}` }
  return null
}

function readOssEnv() {
  const home = process.env.HOME || ''
  const envFiles = [
    path.join(home, 'stack/auth-api.env'),
    path.join(home, 'stack/.env'),
    path.join(ROOT, 'web版/merchant-erp/.env.local'),
    path.join(ROOT, 'web版/merchant-erp/.env.merchant'),
    path.join(ROOT, 'web版/merchant-erp/.env.production'),
    path.join(ROOT, 'web版/merchant-erp/.env'),
  ]
  for (const f of envFiles) {
    if (loadEnvFile(f)) console.log(`已读取: ${f}`)
  }
  const accessKeyId = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID ||
    process.env.OSS_ACCESS_KEY_ID ||
    process.env.ALIYUN_ICE_ACCESS_KEY_ID ||
    process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ||
    ''
  ).trim()
  const accessKeySecret = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET ||
    process.env.OSS_ACCESS_KEY_SECRET ||
    process.env.ALIYUN_ICE_ACCESS_KEY_SECRET ||
    process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ||
    ''
  ).trim()
  const ice = parseOssPrefix(process.env.ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX)
  const ep = parseOssEndpoint(process.env.OSS_ENDPOINT)
  const bucket = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_BUCKET ||
    process.env.OSS_BUCKET ||
    ice?.bucket ||
    ep?.bucket ||
    ''
  ).trim()
  let region = (process.env.MERCHANT_PRODUCT_IMAGE_OSS_REGION || '').trim()
  if (!region && ice) region = `oss-${ice.region}`
  if (!region && ep?.region) region = ep.region
  if (!region) region = 'oss-cn-shanghai'
  if (!accessKeyId || !accessKeySecret || !bucket) {
    throw new Error(
      '缺少 OSS 凭证：请在 ~/stack/auth-api.env 配置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET',
    )
  }
  const prefix = String(process.env.RECRUIT_COVER_OSS_PREFIX || 'mp-recruit-covers').replace(/^\/+|\/+$/g, '')
  return { accessKeyId, accessKeySecret, bucket, region, prefix }
}

function contentType(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  return 'application/octet-stream'
}

function shouldSkipFile(name) {
  if (name.startsWith('.')) return true
  if (/\s2\.(png|jpe?g)$/i.test(name)) return true
  return false
}

function walkMediaFiles(dir, baseDir, out) {
  if (!fs.existsSync(dir)) return
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (shouldSkipFile(ent.name)) continue
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      walkMediaFiles(full, baseDir, out)
      continue
    }
    if (!MEDIA_RE.test(ent.name)) continue
    const rel = path.relative(baseDir, full).replace(/\\/g, '/')
    out.push({ rel, local: full })
  }
}

function collectUploadJobs() {
  const jobs = []
  const seen = new Set()

  const add = (app, rel, local, extraKeys = []) => {
    const key = `${app}:${rel}`
    if (seen.has(key)) return
    seen.add(key)
    jobs.push({ app, rel, local, extraKeys })
  }

  const MERCHANT_DIRS = [
    'landing-merchant',
    'landing-partner',
    'digital-human',
    'subscription',
    'platforms',
    'ai-vendors',
    'douyin-bind-guide',
  ]
  for (const dir of MERCHANT_DIRS) {
    const base = path.join(MERCHANT_PUBLIC, dir)
    const files = []
    walkMediaFiles(base, base, files)
    for (const { rel, local } of files) {
      add('merchant', `${dir}/${rel}`, local)
    }
  }

  for (const name of [
    'logo.png',
    'favicon.png',
    'meoo-agent-idle.png',
    'meoo-agent-mascot.png',
    'meoo-agent-writing.gif',
  ]) {
    const local = path.join(MERCHANT_PUBLIC, name)
    if (fs.existsSync(local)) add('merchant', name, local)
  }

  const DR_DIRS = ['landing', 'identity-mascots', 'recruit-covers', 'images', 'payment']
  for (const dir of DR_DIRS) {
    const base = path.join(DR_PUBLIC, dir)
    const files = []
    walkMediaFiles(base, base, files)
    for (const { rel, local } of files) {
      const fullRel = `${dir}/${rel}`
      const extra = []
      if (dir === 'landing') {
        extra.push(`dr-landing/${rel}`)
      }
      if (dir === 'recruit-covers') {
        extra.push(`recruit-covers/${rel}`)
      }
      add('dr', fullRel, local, extra)
    }
  }

  for (const name of ['login-hero.png', 'logo.png', 'favicon.png']) {
    const local = path.join(DR_PUBLIC, name)
    if (!fs.existsSync(local)) continue
    const extra = name === 'login-hero.png' ? ['dr-landing/login-hero.png'] : []
    add('dr', name, local, extra)
  }

  return jobs.sort((a, b) => a.rel.localeCompare(b.rel))
}

async function main() {
  const jobs = collectUploadJobs()
  if (!jobs.length) throw new Error('未找到可上传的 Web 静态资源')

  const cfg = readOssEnv()
  const OSS = require(OSS_MODULE)
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
  })

  const webStaticBase = `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${cfg.prefix}/web-static`
  let ok = 0
  let bytes = 0

  for (const job of jobs) {
    const keys = [`${cfg.prefix}/web-static/${job.app}/${job.rel}`, ...job.extraKeys.map((k) => `${cfg.prefix}/${k}`)]
    const uniqKeys = [...new Set(keys)]
    const stat = fs.statSync(job.local)
    bytes += stat.size
    for (const key of uniqKeys) {
      await client.put(key, job.local, {
        headers: {
          'Content-Type': contentType(job.rel),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }
    ok += 1
    console.log(
      `OK: [${job.app}] ${job.rel} (${(stat.size / 1024 / 1024).toFixed(2)} MB) → ${uniqKeys.length} key(s)`,
    )
  }

  console.log('')
  console.log(`完成：${ok} 个文件，合计 ${(bytes / 1024 / 1024).toFixed(1)} MB（原图/原视频，未做有损压缩）`)
  console.log(`公网前缀: ${webStaticBase}`)
}

main().catch((e) => {
  console.error(String(e.message || e))
  process.exit(1)
})
