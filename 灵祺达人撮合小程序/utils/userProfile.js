const IDENTITY_KEY = 'meoo_talent_identity_v1'
const PR_PROFILE_KEY = 'meoo_pr_profile_v1'
const identityTypes = require('./identityTypes.js')

const IDENTITIES = identityTypes.WORK_IDENTITIES

function readIdentity() {
  try {
    const v = wx.getStorageSync(IDENTITY_KEY)
    return identityTypes.isWorkIdentity(v) ? v : 'talent'
  } catch {
    return 'talent'
  }
}

function writeIdentity(id) {
  wx.setStorageSync(
    IDENTITY_KEY,
    identityTypes.isWorkIdentity(id) ? id : 'talent',
  )
}

function identityLabel(id) {
  return identityTypes.workIdentityLabel(id)
}

function isSupplierIdentity(id) {
  return identityTypes.isSupplierWorkIdentity(id || readIdentity())
}

function readPrProfile() {
  try {
    const raw = wx.getStorageSync(PR_PROFILE_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

function writePrProfile(profile) {
  wx.setStorageSync(PR_PROFILE_KEY, JSON.stringify(profile))
}

function emptyPrProfile() {
  return {
    accountType: 'company',
    companyName: '',
    personalName: '',
    contactName: '',
    contactPhone: '',
    wechatId: '',
    province: '',
    city: '',
    intro: '',
    wxNickName: '',
    wxAvatarUrl: '',
    lingqiPrId: '',
    updatedAt: '',
  }
}

function prDisplayName(profile) {
  if (!profile) return ''
  if (profile.accountType === 'personal') {
    return String(profile.personalName || profile.contactName || '').trim()
  }
  return String(profile.companyName || profile.contactName || '').trim()
}

function prDisplaySub(profile) {
  if (!profile) return 'PR · 发招募找达人'
  if (profile.accountType === 'personal') {
    const region = [profile.province, profile.city].filter(Boolean).join(' · ')
    return region ? `个人 PR · ${region}` : '个人 PR · 发招募找达人'
  }
  const region = [profile.province, profile.city].filter(Boolean).join(' · ')
  return region || String(profile.companyName || '').trim() || 'PR · 发招募找达人'
}

function supplierDisplaySub(id) {
  const identity = id || readIdentity()
  if (identity === 'shoot') return '拍摄团队 · 接单大厅'
  if (identity === 'edit') return '剪辑团队 · 接单大厅'
  return '达人 · 浏览商单、报名招募'
}

module.exports = {
  IDENTITIES,
  readIdentity,
  writeIdentity,
  identityLabel,
  isSupplierIdentity,
  readPrProfile,
  writePrProfile,
  emptyPrProfile,
  prDisplayName,
  prDisplaySub,
  supplierDisplaySub,
}
