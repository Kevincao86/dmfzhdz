const IDENTITY_KEY = 'meoo_talent_identity_v1'
const OWNED_KEY = 'meoo_owned_work_identities_v1'
const PR_PROFILE_KEY = 'meoo_pr_profile_v1'
const identityTypes = require('./identityTypes.js')
const scope = require('./mpAccountLocalScope.js')

function prProfileStorageKey() {
  return scope.scopedStorageKey(PR_PROFILE_KEY)
}

const IDENTITIES = identityTypes.WORK_IDENTITIES

function readIdentity() {
  try {
    const v = wx.getStorageSync(IDENTITY_KEY)
    return identityTypes.isWorkIdentity(v) ? v : 'talent'
  } catch {
    return 'talent'
  }
}

function normalizeOwned(raw) {
  const allow = ['talent', 'shoot', 'edit']
  const list = Array.isArray(raw) ? raw.map((id) => String(id || '').trim()).filter((id) => allow.includes(id)) : []
  return [...new Set(list)]
}

function readOwnedIdentities() {
  try {
    const raw = wx.getStorageSync(OWNED_KEY)
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = normalizeOwned(parsed)
    if (list.length) return list
  } catch (_) {}
  const current = readIdentity()
  return current === 'pr' ? [] : [current === 'shoot' || current === 'edit' ? current : 'talent']
}

function writeOwnedIdentities(list) {
  const next = normalizeOwned(list).slice(0, 3)
  wx.setStorageSync(OWNED_KEY, JSON.stringify(next))
  return next
}

function noteOwnedIdentity(id) {
  const allow = ['talent', 'shoot', 'edit']
  if (!allow.includes(id)) return readOwnedIdentities()
  const list = readOwnedIdentities()
  if (!list.includes(id) && list.length < 3) list.push(id)
  return writeOwnedIdentities(list)
}

function adoptAccountIdentity(account) {
  const serverOwned = normalizeOwned(account && account.ownedWorkIdentities)
  const derived = serverOwned.length ? serverOwned : []
  if (!derived.length && account) {
    const wid = String(account.workIdentity || '').trim()
    const talentId = String(account.lingqiTalentId || '').trim()
    if (wid === 'talent' || (talentId && wid !== 'shoot' && wid !== 'edit')) derived.push('talent')
    if (account.lingqiShootTeamId || wid === 'shoot') derived.push('shoot')
    if (account.lingqiEditTeamId || wid === 'edit') derived.push('edit')
  }
  const raw = account && account.workIdentity
  let id = identityTypes.isWorkIdentity(raw)
    ? raw
    : account && account.activeRole === 'pr'
      ? 'pr'
      : 'talent'
  if (id !== 'pr' && derived.includes('talent') && (derived.includes('shoot') || derived.includes('edit'))) {
    id = 'talent'
  }
  if (id !== 'pr') writeOwnedIdentities(derived.length ? derived : [id])
  writeIdentity(id)
  return id
}

function writeIdentity(id) {
  wx.setStorageSync(
    IDENTITY_KEY,
    identityTypes.isWorkIdentity(id) ? id : 'talent',
  )
  try {
    require('./identityTheme.js').broadcast()
  } catch (_) {}
}

function identityLabel(id) {
  return identityTypes.workIdentityLabel(id)
}

function isSupplierIdentity(id) {
  return identityTypes.isSupplierWorkIdentity(id || readIdentity())
}

function readPrProfile() {
  try {
    scope.migrateLegacyKeyToScoped(PR_PROFILE_KEY)
    const raw = wx.getStorageSync(prProfileStorageKey())
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

function writePrProfile(profile) {
  wx.setStorageSync(prProfileStorageKey(), JSON.stringify(profile))
  try {
    wx.removeStorageSync(PR_PROFILE_KEY)
  } catch (_) {}
  try {
    require('./mpAccountClientSync.js').schedulePush()
  } catch (_) {}
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
    companyLogoUrl: '',
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
  readOwnedIdentities,
  writeOwnedIdentities,
  noteOwnedIdentity,
  writeIdentity,
  adoptAccountIdentity,
  identityLabel,
  isSupplierIdentity,
  readPrProfile,
  writePrProfile,
  emptyPrProfile,
  prDisplayName,
  prDisplaySub,
  supplierDisplaySub,
}
