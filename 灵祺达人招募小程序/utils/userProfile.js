const IDENTITY_KEY = 'meoo_talent_identity_v1'
const PR_PROFILE_KEY = 'meoo_pr_profile_v1'

const IDENTITIES = {
  talent: { id: 'talent', label: '达人' },
  pr: { id: 'pr', label: 'PR' },
}

function readIdentity() {
  try {
    const v = wx.getStorageSync(IDENTITY_KEY)
    return v === 'pr' ? 'pr' : 'talent'
  } catch {
    return 'talent'
  }
}

function writeIdentity(id) {
  wx.setStorageSync(IDENTITY_KEY, id === 'pr' ? 'pr' : 'talent')
}

function identityLabel(id) {
  return IDENTITIES[id === 'pr' ? 'pr' : 'talent'].label
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

module.exports = {
  IDENTITIES,
  readIdentity,
  writeIdentity,
  identityLabel,
  readPrProfile,
  writePrProfile,
  emptyPrProfile,
  prDisplayName,
  prDisplaySub,
}
