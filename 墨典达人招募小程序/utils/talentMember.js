const STORAGE_KEY = 'meoo_talent_member_v1'

const MEMBER_TYPES = {
  douyin: { id: 'douyin', label: '抖音达人', platforms: ['抖音'] },
  xiaohongshu: { id: 'xiaohongshu', label: '小红书达人', platforms: ['小红书'] },
  both: { id: 'both', label: '双平台达人', platforms: ['抖音', '小红书'] },
}

function emptyPlatformProfile() {
  return {
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
    douyinSalesLevel: '',
    quotePrice: '',
    alipayAccount: '',
  }
}

function readMember() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw) return null
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return j && j.memberType ? j : null
  } catch {
    return null
  }
}

function writeMember(member) {
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(member))
}

function clearMember() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function memberTypeLabel(memberType) {
  return MEMBER_TYPES[memberType]?.label || '墨典达人会员'
}

function memberCoversPlatform(member, platform) {
  if (!member) return false
  const p = String(platform || '').includes('红') ? '小红书' : '抖音'
  const t = MEMBER_TYPES[member.memberType]
  return t ? t.platforms.includes(p) : false
}

function platformProfileFromMember(member, platform) {
  if (!member) return null
  const p = String(platform || '').includes('红') ? 'xiaohongshu' : 'douyin'
  if (p === 'xiaohongshu') return member.xiaohongshu || null
  return member.douyin || null
}

module.exports = {
  STORAGE_KEY,
  MEMBER_TYPES,
  emptyPlatformProfile,
  readMember,
  writeMember,
  clearMember,
  memberTypeLabel,
  memberCoversPlatform,
  platformProfileFromMember,
}
