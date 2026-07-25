#!/usr/bin/env node
/**
 * 上传 灵祺ERP小程序/images → OSS 前缀 erp-mp-static，并写入 erpMpStaticOssBase.js
 * 环境变量同 upload-mp-recruit-covers-oss.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MP = path.join(ROOT, '灵祺ERP小程序')
const SRC = path.join(MP, 'images')
const OUT_BASE = path.join(MP, 'utils/erpMpStaticOssBase.js')
const OSS_MODULE = path.join(ROOT, 'web版/merchant-erp/node_modules/ali-oss')

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
  const prefix = String(process.env.ERP_MP_STATIC_OSS_PREFIX || 'erp-mp-static').replace(/^\/+|\/+$/g, '')
  return { accessKeyId, accessKeySecret, bucket, region, prefix }
}

function listFiles(dir, base = '') {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const rel = base ? `${base}/${name}` : name
    const st = fs.statSync(full)
    if (st.isDirectory()) out.push(...listFiles(full, rel))
    else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) out.push(rel)
  }
  return out.sort()
}

function contentType(name) {
  if (/\.svg$/i.test(name)) return 'image/svg+xml'
  if (/\.webp$/i.test(name)) return 'image/webp'
  if (/\.gif$/i.test(name)) return 'image/gif'
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg'
  return 'image/png'
}

function writeOssBase(publicBase) {
  const content = `/** 自动生成：ERP 小程序静态图 OSS 公网前缀（scripts/upload-erp-mp-static-oss.js） */\nmodule.exports = '${publicBase.replace(/'/g, "\\'")}'\n`
  fs.writeFileSync(OUT_BASE, content)
  console.log('Wrote', OUT_BASE)
}

async function main() {
  const files = listFiles(SRC)
  if (!files.length) throw new Error(`未找到图片：${SRC}`)
  const cfg = readOssEnv()
  const OSS = require(OSS_MODULE)
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
  })
  const publicBase = `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${cfg.prefix}`
  let ok = 0
  for (const rel of files) {
    const key = `${cfg.prefix}/${rel}`
    const local = path.join(SRC, rel)
    await client.put(key, local, {
      headers: {
        'Content-Type': contentType(rel),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    ok += 1
    process.stdout.write(`\r上传 ${ok}/${files.length}`)
  }
  console.log('')
  writeOssBase(publicBase)
  console.log(`OK: ${ok} files -> ${publicBase}/`)
  console.log('真机请同步 CDN：bash scripts/ecs-sync-erp-mp-static.sh（轻量）')
  console.log('downloadFile 合法域名：https://mofangdianai.com （优先 CDN）')
}

main().catch((e) => {
  console.error(String(e.message || e))
  process.exit(1)
})
