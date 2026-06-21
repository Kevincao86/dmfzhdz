/**
 * 招募分享海报静态资源 URL（与 recruitCoverLibrary 一致：真机优先 ECS CDN，OSS 备份）
 */
const config = require('./config.js')

function readOssCoverBase() {
  if (config.MP_COVER_OSS_BASE) {
    return String(config.MP_COVER_OSS_BASE).replace(/\/$/, '')
  }
  try {
    const base = require('./recruitCoverOssBase.js')
    if (base && String(base).trim().startsWith('http')) return String(base).trim().replace(/\/$/, '')
  } catch (_) {}
  return ''
}

function assetCacheVer() {
  return String(config.MP_ASSET_CACHE_VER || '1').trim() || '1'
}

function withCacheBust(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return u
  if (/[?&]v=/.test(u)) return u
  return `${u}${u.includes('?') ? '&' : '?'}v=${assetCacheVer()}`
}

function posterRootCdn() {
  return `${String(config.RECRUIT_COVER_CDN_BASE || 'https://mofangdianai.com/recruit-covers').replace(/\/$/, '')}/posters`
}

function posterRootOss() {
  const oss = readOssCoverBase()
  return oss ? `${oss}/posters` : ''
}

function posterRoot() {
  if (config.MP_COVER_PREFER_CDN !== false) return posterRootCdn()
  const oss = posterRootOss()
  if (oss) return oss
  return posterRootCdn()
}

function posterAssetUrl(filename) {
  const rel = String(filename || '').replace(/^\/+/, '')
  if (!rel) return ''
  return withCacheBust(`${posterRoot()}/${rel}`)
}

/** CDN 优先，OSS 备份（新图上传 OSS 后真机仍可加载） */
function posterAssetUrlCandidates(filename) {
  const rel = String(filename || '').replace(/^\/+/, '')
  if (!rel) return []
  const out = []
  const seen = new Set()
  const add = (base) => {
    const root = String(base || '').replace(/\/$/, '')
    if (!root) return
    const url = withCacheBust(`${root}/${rel}`)
    if (seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  if (config.MP_COVER_PREFER_CDN !== false) {
    add(posterRootCdn())
    add(posterRootOss())
  } else {
    add(posterRootOss())
    add(posterRootCdn())
  }
  return out
}

function posterQrFrameCandidates(tmpl) {
  const file = String((tmpl && tmpl.qrFrameFile) || '').trim()
  if (file) return posterAssetUrlCandidates(file)
  const url = String((tmpl && tmpl.qrFrameUrl) || '').trim()
  return url ? [withCacheBust(url)] : []
}

module.exports = {
  posterRoot,
  posterAssetUrl,
  posterAssetUrlCandidates,
  posterQrFrameCandidates,
  withCacheBust,
}
