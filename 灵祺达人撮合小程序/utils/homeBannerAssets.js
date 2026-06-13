/** 首页 Banner 人物/云朵：默认 OSS，本地仅作离线兜底（勿把大图打进包） */
function readOssBase() {
  try {
    const config = require('./config.js')
    if (config.MP_HOME_BANNER_OSS_BASE) {
      return String(config.MP_HOME_BANNER_OSS_BASE).replace(/\/$/, '')
    }
    const base = require('./recruitCoverOssBase.js')
    if (base && String(base).trim().startsWith('http')) return String(base).trim().replace(/\/$/, '')
  } catch (_) {}
  return ''
}

function ossOrLocal(fileName, localPath) {
  const base = readOssBase()
  if (base) return `${base}/home/${fileName}`
  return localPath
}

module.exports = {
  heroTalent: ossOrLocal('hero-talent.png', '/images/home/hero-talent.png'),
  heroTalentSearch: ossOrLocal('hero-talent-v2-search.png', '/images/home/hero-talent-v2-search.png'),
  homeBannerClouds: ossOrLocal('home-banner-clouds.png', '/images/home/home-banner-clouds.png'),
}
