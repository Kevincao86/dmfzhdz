#!/usr/bin/env node
/**
 * 上传商家短视频案例墙素材 → OSS（公网直链，秒开级带宽）
 *
 * 目标前缀：
 *   mp-recruit-covers/web-static/merchant/short-video-cases/
 *
 * 环境变量同 upload-mp-recruit-covers-oss.js / upload-web-static-oss.js
 *
 * 用法：
 *   node scripts/upload-short-video-cases-oss.js
 *   # 或带轻量 env：
 *   set -a && source /tmp/oss-upload.env && set +a && node ...
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'web版/merchant-erp/public/short-video-cases')
const OUT_TS = path.join(ROOT, 'web版/merchant-erp/src/lib/shortVideoCaseCdn.ts')
const OSS_MODULE = path.join(ROOT, 'web版/merchant-erp/node_modules/ali-oss')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false
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
    if (!process.env[key]) process.env[key] = val
  }
  return true
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
  for (const f of [
    '/tmp/oss-upload.env',
    path.join(home, 'stack/auth-api.env'),
    path.join(home, 'stack/.env'),
    path.join(ROOT, 'web版/merchant-erp/.env.local'),
    path.join(ROOT, 'web版/merchant-erp/.env.merchant'),
    path.join(ROOT, 'web版/merchant-erp/.env.production'),
    path.join(ROOT, 'web版/merchant-erp/.env'),
  ]) {
    loadEnvFile(f)
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
    throw new Error('缺少 OSS 凭证（OSS_ACCESS_KEY_ID / SECRET / BUCKET）')
  }
  const rootPrefix = String(process.env.RECRUIT_COVER_OSS_PREFIX || 'mp-recruit-covers').replace(/^\/+|\/+$/g, '')
  const prefix = `${rootPrefix}/web-static/merchant/short-video-cases`
  return { accessKeyId, accessKeySecret, bucket, region, prefix }
}

function contentType(name) {
  if (/\.png$/i.test(name)) return 'image/png'
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.mp4$/i.test(name)) return 'video/mp4'
  return 'application/octet-stream'
}

function writeCdnTs(publicBase) {
  const content = `/**
 * 短视频案例墙 CDN/OSS 公网前缀（由 upload-short-video-cases-oss.js 自动生成）
 * 直链 OSS，避免新ECS 静态带宽瓶颈。
 */
export const SHORT_VIDEO_CASE_CDN_BASE = '${publicBase.replace(/'/g, "\\'")}'
`
  fs.writeFileSync(OUT_TS, content)
  console.log('Wrote', OUT_TS)
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`缺少目录: ${SRC}`)
  const files = fs
    .readdirSync(SRC)
    .filter((n) => /\.(mp4|png|jpe?g|webp)$/i.test(n))
    .sort()
  if (!files.length) throw new Error('short-video-cases 下无素材')

  const cfg = readOssEnv()
  const OSS = require(OSS_MODULE)
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
  })

  const publicBase = `https://mofangdianai.com/erp-mp-static/short-video-cases`
  // OSS 仍上传作备份；播放走轻量 CDN（OSS 桶强制 attachment 无法 <video> 内联）
  const ossBase = `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${cfg.prefix}`
  let ok = 0
  let bytes = 0
  for (const name of files) {
    const local = path.join(SRC, name)
    const key = `${cfg.prefix}/${name}`
    const size = fs.statSync(local).size
    bytes += size
    await client.put(key, local, {
      headers: {
        'Content-Type': contentType(name),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-oss-object-acl': 'public-read',
      },
    })
    ok += 1
    console.log(`OK ${ok}/${files.length} ${name} (${(size / 1024).toFixed(0)}KB)`)
  }

  writeCdnTs(publicBase)
  console.log(`DONE ${ok} files ${(bytes / 1024 / 1024).toFixed(2)}MB`)
  console.log(`播放 CDN: ${publicBase}/`)
  console.log(`OSS 备份: ${ossBase}/`)
  console.log('请再执行: bash scripts/ecs-sync-short-video-cases.sh')
}

main().catch((e) => {
  console.error(String(e && e.message ? e.message : e))
  process.exit(1)
})
