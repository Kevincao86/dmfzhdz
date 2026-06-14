/** 小程序大图：真机走 mofangdianai.com/recruit-covers（合法域名），包内仅保留小图标 */
const config = require('./config.js')

function preferLocalAssets() {
  try {
    const mpRuntime = require('./mpRuntime.js')
    return mpRuntime.isLocalDevRuntime()
  } catch {
    return false
  }
}

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

function assetUrl(relPath, localPath) {
  if (preferLocalAssets() && localPath) return localPath
  if (config.MP_COVER_PREFER_CDN !== false) {
    return withCacheBust(`${cdnBase()}/${relPath}`)
  }
  const oss = ossBase()
  if (oss) return withCacheBust(`${oss}/${relPath}`)
  return localPath
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
  welcomeHeroBg: assetUrl('auth/welcome-hero-bg.jpg', '/images/auth/welcome-hero-bg.jpg'),
  welcomeBottomDeco: assetUrl('auth/welcome-bottom-deco.png', '/images/auth/welcome-bottom-deco.png'),
  loginHeroBg: assetUrl('auth/login-hero-bg.jpg', '/images/auth/login-hero-bg.jpg'),
  loginOrbitDeco: assetUrl('auth/login-orbit-deco.jpg', '/images/auth/login-orbit-deco.jpg'),
  loginOrbitImages: LOGIN_ORBIT_FILES.map((rel, i) =>
    assetUrl(rel, `/images/login-orbit/orbit-0${i + 1}.jpg`),
  ),
}
