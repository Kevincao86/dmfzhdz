/** 首页 Banner：真机优先 mofangdianai.com 静态图（合法域名），包内小图为兜底 */
const config = require('./config.js')

function cdnBase() {
  return String(config.RECRUIT_COVER_CDN_BASE || 'https://mofangdianai.com/recruit-covers').replace(/\/$/, '')
}

function ossBase() {
  try {
    if (config.MP_HOME_BANNER_OSS_BASE) {
      return String(config.MP_HOME_BANNER_OSS_BASE).replace(/\/$/, '')
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

function bannerUrl(fileName) {
  // 首页人物优先包内透明 PNG（真机即时生效，不依赖 CDN 同步）
  if (config.MP_HOME_BANNER_USE_PACKAGE !== false) {
    return `/images/home/${fileName}`
  }
  if (config.MP_COVER_PREFER_CDN !== false) {
    return withCacheBust(`${cdnBase()}/home/${fileName}`)
  }
  const oss = ossBase()
  if (oss) return withCacheBust(`${oss}/home/${fileName}`)
  return withCacheBust(`${cdnBase()}/home/${fileName}`)
}

module.exports = {
  heroTalent: bannerUrl('hero-talent.png'),
  heroTalentSearch: bannerUrl('hero-talent-v2-search.png'),
  heroShoot: bannerUrl('hero-shoot.png'),
  heroEdit: bannerUrl('hero-edit.png'),
  homeBannerClouds: bannerUrl('home-banner-clouds.png'),
}
