#!/usr/bin/env node
/**
 * 上传小程序封面图库 JPEG 至阿里云 OSS（公共读前缀），并写入 recruitCoverOssBase.js
 *
 * 环境变量（可与商品图 OSS 共用）：
 *   MERCHANT_PRODUCT_IMAGE_OSS_BUCKET / _REGION / _ACCESS_KEY_ID / _ACCESS_KEY_SECRET
 *   或 ECS auth-api.env：OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET / OSS_ENDPOINT
 *   或 ALIYUN_ICE_ACCESS_KEY_ID / ALIYUN_ICE_ACCESS_KEY_SECRET + ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX
 *   RECRUIT_COVER_OSS_PREFIX=mp-recruit-covers（默认）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MP = path.join(ROOT, '灵祺达人撮合小程序')
const SRC = path.join(MP, 'packages/recruit-covers-mp')
const OUT_BASE = path.join(MP, 'utils/recruitCoverOssBase.js')
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
      '缺少 OSS 凭证：请在 ~/stack/auth-api.env 配置 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET，或 MERCHANT_PRODUCT_IMAGE_OSS_* / ALIYUN_ICE_ACCESS_KEY_*',
    )
  }
  const prefix = String(process.env.RECRUIT_COVER_OSS_PREFIX || 'mp-recruit-covers').replace(/^\/+|\/+$/g, '')
  return { accessKeyId, accessKeySecret, bucket, region, prefix }
}

function listJpgFiles() {
  const out = []
  for (const sub of ['platforms', 'tags']) {
    const dir = path.join(SRC, sub)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (!/\.jpe?g$/i.test(name)) continue
      out.push(`${sub}/${name}`)
    }
  }
  return out.sort()
}

function writeOssBase(publicBase) {
  const content = `/** 自动生成：小程序封面图库 OSS 公网前缀（bash scripts/upload-mp-recruit-covers-oss.js） */\nmodule.exports = '${publicBase.replace(/'/g, "\\'")}'\n`
  fs.writeFileSync(OUT_BASE, content)
  console.log('Wrote', OUT_BASE)
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`缺少源目录 ${SRC}，请先 bash scripts/sync-mp-recruit-covers.sh`)
  }
  const files = listJpgFiles()
  if (!files.length) throw new Error(`未找到 JPEG：${SRC}`)

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
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    ok += 1
    if (ok % 10 === 0 || ok === files.length) process.stdout.write(`\r上传 ${ok}/${files.length}`)
  }
  console.log('')
  writeOssBase(publicBase)

  const shareLocal = path.join(MP, 'images/share/share-cover-ai-match.jpg')
  if (fs.existsSync(shareLocal)) {
    const shareKey = `${cfg.prefix}/share/share-cover-ai-match.jpg`
    await client.put(shareKey, shareLocal, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    console.log(`OK: share card -> ${publicBase}/share/share-cover-ai-match.jpg`)
  }

  const homeDir = path.join(MP, 'images/home')
  const homeFiles = ['hero-talent.png', 'hero-talent-v2-search.png', 'home-banner-clouds.png']
  for (const name of homeFiles) {
    const local = path.join(homeDir, name)
    if (!fs.existsSync(local)) continue
    const key = `${cfg.prefix}/home/${name}`
    const ctype = name.endsWith('.png') ? 'image/png' : 'image/jpeg'
    await client.put(key, local, {
      headers: {
        'Content-Type': ctype,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
    console.log(`OK: home banner -> ${publicBase}/home/${name}`)
  }

  async function uploadDir(relSub, srcDir, pattern) {
    if (!fs.existsSync(srcDir)) return
    for (const name of fs.readdirSync(srcDir)) {
      if (!pattern.test(name)) continue
      const local = path.join(srcDir, name)
      if (!fs.statSync(local).isFile()) continue
      const key = `${cfg.prefix}/${relSub}/${name}`
      const ctype = /\.png$/i.test(name) ? 'image/png' : 'image/jpeg'
      await client.put(key, local, {
        headers: {
          'Content-Type': ctype,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
      console.log(`OK: ${relSub} -> ${publicBase}/${relSub}/${name}`)
    }
  }

  await uploadDir('auth', path.join(MP, 'images/auth'), /\.(jpe?g|png)$/i)
  await uploadDir('login-orbit', path.join(MP, 'images/login-orbit'), /\.jpe?g$/i)

  console.log(`OK: ${ok} files -> ${publicBase}/`)
  console.log('请在微信公众平台 → 开发 → 开发管理 → 服务器域名 → downloadFile 合法域名 添加：')
  console.log(`  https://${cfg.bucket}.${cfg.region}.aliyuncs.com`)
}

main().catch((e) => {
  console.error(String(e.message || e))
  process.exit(1)
})
