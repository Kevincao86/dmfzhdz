const { labels, normalizePlatform } = require('./platformLabels.js')

const DOUYIN_LEVELS = ['LV0', 'LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6', 'LV7', '暂无等级']

function validatePlatformProfile(platform, profile) {
  const lb = labels(platform)
  const p = profile || {}
  if (!String(p.platformAccount || '').trim()) return `请填写${lb.accountId}`
  if (!String(p.platformNickname || '').trim()) return `请填写${lb.nickname}`
  if (!String(p.profileLink || '').trim()) return `请填写${lb.profileLink}`
  const followers = Number.parseInt(String(p.followers || '').replace(/,/g, ''), 10)
  if (!Number.isFinite(followers) || followers <= 0) return '请填写有效粉丝数'
  if (lb.showSalesLevel && !String(p.douyinSalesLevel || '').trim()) return '请选择抖音带货等级'
  if (!String(p.quotePrice || '').trim()) return '请填写默认报价'
  if (!String(p.alipayAccount || '').trim()) return '请填写支付宝账号'
  return null
}

function applicantFromProfile(platform, profile, extra) {
  const plat = normalizePlatform(platform)
  const lb = labels(plat)
  const followers = Number.parseInt(String(profile.followers || '').replace(/,/g, ''), 10)
  const platformNickname = String(profile.platformNickname || '').trim()
  const alipayAccount = String(profile.alipayAccount || '').trim()
  return {
    id: extra?.id || `app-${Date.now()}`,
    name: platformNickname,
    platform: plat,
    platformAccount: String(profile.platformAccount || '').trim(),
    platformNickname,
    profileLink: String(profile.profileLink || '').trim(),
    followers: Math.max(0, followers),
    douyinSalesLevel: lb.showSalesLevel ? String(profile.douyinSalesLevel || '').trim() : undefined,
    contact: String(extra?.contact || '').trim(),
    wechatId: String(extra?.wechatId || '').trim(),
    quotePrice: String(profile.quotePrice || '').trim(),
    alipayAccount,
    paymentMethod: `支付宝：${alipayAccount}`,
    mpOrderId: extra?.mpOrderId,
    merchantOrderNo: extra?.merchantOrderNo,
    visitTimeSlot: extra?.visitTimeSlot,
    province: String(extra?.province || '').trim() || undefined,
    city: String(extra?.city || '').trim() || undefined,
    appliedAt: extra?.appliedAt || new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}

module.exports = {
  DOUYIN_LEVELS,
  validatePlatformProfile,
  applicantFromProfile,
}
