/**
 * ERP 小程序静态图：包内不打包大图，真机走 CDN（downloadFile 合法域名），
 * OSS 为同源备份（见 erpMpStaticOssBase.js）。
 */
const config = require('./config.js')

function cdnBase() {
  return String(config.ERP_MP_STATIC_CDN_BASE || 'https://mofangdianai.com/erp-mp-static').replace(/\/$/, '')
}

function ossBase() {
  try {
    if (config.ERP_MP_STATIC_OSS_BASE) {
      return String(config.ERP_MP_STATIC_OSS_BASE).replace(/\/$/, '')
    }
    const base = require('./erpMpStaticOssBase.js')
    if (base && String(base).trim().startsWith('http')) return String(base).trim().replace(/\/$/, '')
  } catch (_) {}
  return ''
}

function cacheVer() {
  return String(config.MP_ASSET_CACHE_VER || '20260725').trim() || '1'
}

function withCacheBust(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return u
  if (/[?&]v=/.test(u)) return u
  return `${u}${u.includes('?') ? '&' : '?'}v=${cacheVer()}`
}

/**
 * @param {string} relPath 相对 images/ 的路径，如 logo.png、func-icons/shop.png
 */
function assetUrl(relPath) {
  const rel = String(relPath || '')
    .replace(/^\/+/, '')
    .replace(/^images\//, '')
  if (!rel) return ''
  if (config.ERP_MP_STATIC_PREFER_CDN !== false) {
    return withCacheBust(`${cdnBase()}/${rel}`)
  }
  const oss = ossBase()
  if (oss) return withCacheBust(`${oss}/${rel}`)
  return withCacheBust(`${cdnBase()}/${rel}`)
}

module.exports = { assetUrl, cdnBase, ossBase }
