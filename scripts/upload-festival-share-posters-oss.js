#!/usr/bin/env node
/**
 * 上传节日分享海报到 OSS：mp-recruit-covers/festivals/
 * 凭证与 scripts/upload-mp-recruit-covers-oss.js 相同。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, '灵祺达人撮合小程序/assets/recruit-poster-bg/festivals')
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
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
    ''
  ).trim()
  const accessKeySecret = (
    process.env.MERCHANT_PRODUCT_IMAGE_OSS_ACCESS_KEY_SECRET ||
    process.env.OSS_ACCESS_KEY_SECRET ||
    process.env.ALIYUN_ICE_ACCESS_KEY_SECRET ||
    ''
  ).trim()
  const bucket = (process.env.MERCHANT_PRODUCT_IMAGE_OSS_BUCKET || process.env.OSS_BUCKET || 'modianningbo').trim()
  const region = (process.env.MERCHANT_PRODUCT_IMAGE_OSS_REGION || 'oss-cn-shanghai').trim()
  if (!accessKeyId || !accessKeySecret) throw new Error('缺少 OSS 凭证')
  return { accessKeyId, accessKeySecret, bucket, region, prefix: 'mp-recruit-covers/festivals' }
}

async function main() {
  const files = fs.readdirSync(SRC).filter((name) => /^festival-.*\.jpe?g$/i.test(name))
  if (!files.length) throw new Error(`没有节日图：${SRC}`)
  const cfg = readOssEnv()
  const OSS = require(OSS_MODULE)
  const client = new OSS({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    bucket: cfg.bucket,
  })
  for (const name of files) {
    await client.put(`${cfg.prefix}/${name}`, path.join(SRC, name), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
    console.log(`OK ${name}`)
  }
  console.log(`https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${cfg.prefix}/`)
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err)
  process.exit(1)
})
