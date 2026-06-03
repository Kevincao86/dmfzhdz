const auth = require('./auth.js')
const memberStore = require('./talentMember.js')
const userProfile = require('./userProfile.js')

const STABLE_OPENID_KEY = 'meoo_stable_wx_openid_v1'

function readStableDevOpenId() {
  try {
    return String(wx.getStorageSync(STABLE_OPENID_KEY) || '').trim()
  } catch {
    return ''
  }
}

/** 开发者工具：首次登录前即生成稳定 openid，避免每次 wx.login code 变导致新账号 */
function ensureStableDevOpenId() {
  const existing = readStableDevOpenId()
  if (existing) return existing
  const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  writeStableDevOpenId(id)
  return id
}

function writeStableDevOpenId(openid) {
  const id = String(openid || '').trim()
  if (!id) return
  try {
    wx.setStorageSync(STABLE_OPENID_KEY, id)
  } catch (_) {}
}

function syncTalentMemberFromAccount(account) {
  if (!account) return null
  const prev = memberStore.readMember() || {}
  const next = {
    ...prev,
    id: String(account.registryMemberId || prev.id || '').trim(),
    lingqiTalentId: String(account.lingqiTalentId || prev.lingqiTalentId || '').trim(),
    wxOpenId: String(account.openid || prev.wxOpenId || '').trim(),
    wxNickName: prev.wxNickName || account.wxNickName || '',
    wxAvatarUrl: prev.wxAvatarUrl || account.wxAvatarUrl || '',
  }
  memberStore.writeMember(next)
  return next
}

function syncPrProfileFromAccount(account) {
  if (!account) return null
  const prev = userProfile.readPrProfile() || userProfile.emptyPrProfile()
  const next = {
    ...prev,
    id: String(account.registryPrId || prev.id || '').trim(),
    lingqiPrId: String(account.lingqiPrId || prev.lingqiPrId || '').trim(),
    wxOpenId: String(account.openid || prev.wxOpenId || '').trim(),
    wxNickName: prev.wxNickName || account.wxNickName || '',
    wxAvatarUrl: prev.wxAvatarUrl || account.wxAvatarUrl || '',
  }
  userProfile.writePrProfile(next)
  return next
}

function syncLocalProfilesFromAccount(account) {
  if (!account) return
  writeStableDevOpenId(account.openid)
  const role = account.activeRole === 'pr' ? 'pr' : 'talent'
  if (role === 'pr') syncPrProfileFromAccount(account)
  else syncTalentMemberFromAccount(account)
}

function afterAuthSuccess(data) {
  if (!data || !data.account) return data
  syncLocalProfilesFromAccount(data.account)
  return data
}

module.exports = {
  STABLE_OPENID_KEY,
  readStableDevOpenId,
  ensureStableDevOpenId,
  writeStableDevOpenId,
  syncTalentMemberFromAccount,
  syncPrProfileFromAccount,
  syncLocalProfilesFromAccount,
  afterAuthSuccess,
}
