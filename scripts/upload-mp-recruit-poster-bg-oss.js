#!/usr/bin/env node
/**
 * 上传招募分享海报背景图至 OSS（mp-recruit-covers/posters/）
 *
 * 源目录（需先放入 AI 设计导出的 png/webp）：
 *   灵祺达人撮合小程序/assets/recruit-poster-bg/
 *     style-sunset-v1.png
 *     qr-frame-sunset-v1.png
 *     …（共 6 套 × 头图 + QR 框）
 *
 * 本地 AI 生成：
 *   cd web版/merchant-erp && npx tsx scripts/generate-mp-recruit-poster-styles.ts
 *
 * 环境变量同 scripts/upload-mp-recruit-covers-oss.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, '灵祺达人撮合小程序/assets/recruit-poster-bg')
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

function readOssEnv() {
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env.local'))
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env.merchant'))
  loadEnvFile(path.join(ROOT, 'web版/merchant-erp/.env'))
  const accessKeyId = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_ID ||
    process.env.ALIYUN_ICE_ACCESS_KEY_ID ||
    ''
  ).trim()
  const accessKeySecret = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET ||
    process.env.ALIYUN_ICE_ACCESS_KEY_SECRET ||
    ''
  ).trim()
  const ice = parseOssPrefix(process.env.ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX)
  const bucket = (process.env.MERCHANT_PRODUCT_IMAGE_OSS_BUCKET || ice?.bucket || '').trim()
  let region = (process.env.MERCHANT_PRODUCT_IMAGE_OSS_REGION || '').trim()
  if (!region && ice) region = `oss-${ice.region}`
  if (!region) region = 'oss-cn-shanghai'
  if (!accessKeyId || !accessKeySecret || !bucket) {
    throw new Error('缺少 OSS 凭证，见 upload-mp-recruit-covers-oss.js')
  }
  const coverPrefix = String(process.env.RECRUIT_COVER_OSS_PREFIX || 'mp-recruit-covers').replace(/^\/+|\/+$/g, '')
  return { accessKeyId, accessKeySecret, bucket, region, prefix: `${coverPrefix}/posters` }
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`请先创建目录并放入背景图：${SRC}`)
    process.exit(1)
  }
  const files = fs.readdirSync(SRC).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f))
  if (!files.length) {
    console.error('目录内无图片文件')
    process.exit(1)
  }
  const OSS = require(OSS_MODULE)
  const { accessKeyId, accessKeySecret, bucket, region, prefix } = readOssEnv()
  const client = new OSS({ region, accessKeyId, accessKeySecret, bucket })
  for (const file of files) {
    const local = path.join(SRC, file)
    const key = `${prefix}/${file}`
    await client.put(key, local, { headers: { 'Cache-Control': 'public, max-age=31536000' } })
    console.log('OK', key)
  }
  console.log(`完成：${files.length} 张 → https://${bucket}.${region}.aliyuncs.com/${prefix}/`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
