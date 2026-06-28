#!/usr/bin/env node
/**
 * 上传 dr 履约 Web 营销静态资源至 OSS（原图/原视频，不做有损压缩）
 *
 * 前缀：mp-recruit-covers/dr-landing/
 * 环境变量同 upload-mp-recruit-covers-oss.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PUBLIC = path.join(ROOT, '灵祺达人履约管理后台/public')
const LANDING = path.join(PUBLIC, 'landing')
const OSS_MODULE = path.join(ROOT, 'web版/merchant-erp/node_modules/ali-oss')
const OSS_SUBDIR = String(process.env.DR_LANDING_OSS_SUBDIR || 'dr-landing').replace(/^\/+|\/+$/g, '')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
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
  loadEnvFile(path.join(home, 'stack/auth-api.env'))
  loadEnvFile(path.join(home, 'stack/.env'))
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env.local'))
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env.merchant'))
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env.production'))
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env'))
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
  if (lower.endsWith('.mp4')) return 'video/mp4'
  return 'application/octet-stream'
}

function listFiles() {
  const out = []
  if (!fs.existsSync(LANDING)) throw new Error(`缺少目录 ${LANDING}`)
  for (const name of fs.readdirSync(LANDING)) {
    if (!/\.(png|jpe?g|webp|mp4)$/i.test(name)) continue
    out.push({ rel: name, local: path.join(LANDING, name) })
  }
  const loginHero = path.join(PUBLIC, 'login-hero.png')
  if (fs.existsSync(loginHero)) out.push({ rel: 'login-hero.png', local: loginHero })
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

async function main() {
  const files = listFiles()
  if (!files.length) throw new Error('未找到 landing / login-hero 资源')

  const cfg = readOssEnv()
  const OSS = require(OSS_MODULE)
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
  })

  const publicBase = `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${cfg.prefix}/${OSS_SUBDIR}`
  let ok = 0
  for (const { rel, local } of files) {
    const key = `${cfg.prefix}/${OSS_SUBDIR}/${rel}`
    const stat = fs.statSync(local)
    await client.put(key, local, {
      headers: {
        'Content-Type': contentType(rel),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    ok += 1
    console.log(`OK: ${rel} (${(stat.size / 1024 / 1024).toFixed(2)} MB) -> ${publicBase}/${rel}`)
  }
  console.log('')
  console.log(`完成：${ok} 个文件（原图/原视频，未做有损压缩）`)
  console.log(`公网前缀: ${publicBase}`)
}

main().catch((e) => {
  console.error(String(e.message || e))
  process.exit(1)
})
