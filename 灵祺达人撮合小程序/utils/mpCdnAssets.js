/** 小程序大图：真机/体验版走 CDN 或 OSS（合法域名），包内不打包大图 */
const config = require('./config.js')

function cdnBase() {
  return String(config.RECRUIT_COVER_CDN_BASE || 'https://mofangdianai.com/recruit-covers').replace(/\/$/, '')
}

function ossBase() {
  try {
    if (config.MP_ASSET_OSS_BASE) {
      return String(config.MP_ASSET_OSS_BASE).replace(/\/$/, '')
    }
    const base = require('./recruitCoverOssBase.js')
    if (base && String(base).trim().startsWith('http')) return String(base).trim().replace(/\/$/, '')
  } catch (_) {}
  return ''
}

function cacheVer() {
  return String(config.MP_ASSET_CACHE_VER || '1').trim() || '1'
}

function withCacheBust(url) {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return u
  if (/[?&]v=/.test(u)) return u
  return `${u}${u.includes('?') ? '&' : '?'}v=${cacheVer()}`
}

/** 大图仅远程：auth/home/login-orbit/identity 已被 pack ignore */
function assetUrl(relPath) {
  if (config.MP_COVER_PREFER_CDN !== false) {
    return withCacheBust(`${cdnBase()}/${relPath}`)
  }
  const oss = ossBase()
  if (oss) return withCacheBust(`${oss}/${relPath}`)
  return withCacheBust(`${cdnBase()}/${relPath}`)
}

const IDENTITY_ICON_FILES = {
  talent: 'identity/identity-talent.png',
  shoot: 'identity/identity-shoot.png',
  edit: 'identity/identity-edit.png',
  pr: 'identity/identity-pr.png',
}

function identityIcon(id) {
  const rel = IDENTITY_ICON_FILES[id] || IDENTITY_ICON_FILES.talent
  return assetUrl(rel)
}

function ossAssetUrl(relPath) {
  const oss = ossBase()
  if (!oss) return ''
  return withCacheBust(`${oss}/${relPath}`)
}

const LOGIN_ORBIT_FILES = [
  'login-orbit/orbit-01.jpg',
  'login-orbit/orbit-02.jpg',
  'login-orbit/orbit-03.jpg',
  'login-orbit/orbit-04.jpg',
  'login-orbit/orbit-05.jpg',
  'login-orbit/orbit-06.jpg',
]

module.exports = {
  assetUrl,
  ossAssetUrl,
  identityIcon,
  welcomeHeroBg: assetUrl('auth/welcome-hero-bg.jpg'),
  welcomeBottomDeco: assetUrl('auth/welcome-bottom-deco.png'),
  loginHeroBg: assetUrl('auth/login-hero-bg.jpg'),
  loginOrbitDeco: assetUrl('auth/login-orbit-deco.jpg'),
  loginOrbitImages: LOGIN_ORBIT_FILES.map((rel) => assetUrl(rel)),
}
