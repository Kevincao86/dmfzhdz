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

function bannerUrl(fileName, localPath) {
  if (config.MP_COVER_PREFER_CDN !== false) {
    return withCacheBust(`${cdnBase()}/home/${fileName}`)
  }
  const oss = ossBase()
  if (oss) return withCacheBust(`${oss}/home/${fileName}`)
  return localPath
}

module.exports = {
  heroTalent: bannerUrl('hero-talent.png', '/images/home/hero-talent.png'),
  heroTalentSearch: bannerUrl('hero-talent-v2-search.png', '/images/home/hero-talent-v2-search.png'),
  heroShoot: bannerUrl('hero-shoot.png', '/images/home/hero-shoot.png'),
  heroEdit: bannerUrl('hero-edit.png', '/images/home/hero-edit.png'),
  homeBannerClouds: bannerUrl('home-banner-clouds.png', '/images/home/home-banner-clouds.png'),
}
