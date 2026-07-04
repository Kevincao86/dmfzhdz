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

function identityIconRel(id) {
  return IDENTITY_ICON_FILES[id] || IDENTITY_ICON_FILES.talent
}

/** 身份 3D 图候选：OSS 与 CDN 内容可能不一致，须 upload + ecs-sync 同步最新包内 PNG */
function identityIconCandidates(id) {
  const rel = identityIconRel(id)
  const cdn = withCacheBust(`${cdnBase()}/${rel}`)
  const oss = ossBase() ? withCacheBust(`${ossBase()}/${rel}`) : ''
  const preferOss = config.MP_IDENTITY_ICON_PREFER_OSS === true
  if (preferOss && oss) return [oss, cdn]
  if (config.MP_COVER_PREFER_CDN !== false) return oss ? [cdn, oss] : [cdn]
  return oss ? [oss, cdn] : [cdn]
}

function identityIcon(id) {
  const list = identityIconCandidates(id)
  return list[0] || ''
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

function defaultShareCover() {
  return assetUrl('share/share-cover-ai-match.jpg')
}

function merchantNotifyPosterCandidates(relPath) {
  const rel = String(relPath || '').replace(/^\/+/, '')
  const cdn = withCacheBust(`${cdnBase()}/${rel}`)
  const oss = ossBase() ? withCacheBust(`${ossBase()}/${rel}`) : ''
  const preferOss = config.MP_MERCHANT_NOTIFY_POSTER_PREFER_OSS !== false
  if (preferOss && oss) return [oss, cdn]
  if (config.MP_COVER_PREFER_CDN !== false) return oss ? [cdn, oss] : [cdn]
  return oss ? [oss, cdn] : [cdn]
}

function merchantNotifyTalentReviewShare() {
  return merchantNotifyPosterCandidates('share/merchant-notify-talent-review.png')[0]
}

function merchantNotifyContentReviewShare() {
  return merchantNotifyPosterCandidates('share/merchant-notify-content-review.png')[0]
}

const MEMBERSHIP_HERO_FILES = {
  talent: 'membership/hero-talent.png',
  pr: 'membership/hero-pr.png',
  shoot: 'membership/hero-shoot.png',
  edit: 'membership/hero-edit.png',
}

function membershipHero(id) {
  const rel = MEMBERSHIP_HERO_FILES[id] || MEMBERSHIP_HERO_FILES.talent
  return assetUrl(rel)
}

module.exports = {
  assetUrl,
  ossAssetUrl,
  identityIcon,
  identityIconRel,
  identityIconCandidates,
  defaultShareCover,
  merchantNotifyTalentReviewShare,
  merchantNotifyContentReviewShare,
  merchantNotifyPosterCandidates,
  membershipHero,
  welcomeHeroBg: assetUrl('auth/welcome-hero-bg.jpg'),
  welcomeBottomDeco: assetUrl('auth/welcome-bottom-deco.png'),
  loginHeroBg: assetUrl('auth/login-hero-bg.jpg'),
  loginOrbitDeco: assetUrl('auth/login-orbit-deco.jpg'),
  loginOrbitImages: LOGIN_ORBIT_FILES.map((rel) => assetUrl(rel)),
}
