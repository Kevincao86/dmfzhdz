const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const memberStore = require('./talentMember.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const supplierTeamProfile = require('./supplierTeamProfile.js')
const identityTypes = require('./identityTypes.js')
const api = require('./api.js')
const ops = require('./opsRegistryTalentMp.js')

function workIdentityForApi(id) {
  if (id === 'shoot' || id === 'edit' || id === 'talent') return id
  return undefined
}

function syncLocalProfilesFromAccount(account, workId) {
  const wid = workId || userProfile.readIdentity()
  const accountRole = identityTypes.accountRoleForWorkIdentity(wid)
  if (accountRole === 'pr') {
    const accountMemberSync = require('./accountMemberSync.js')
    accountMemberSync.syncPrProfileFromAccount(account)
    return
  }
  const prev = memberStore.readMember() || {}
  const tags = supplierTeamProfile.supplierTagsForWorkId(wid)
  const platformProfiles = prev.platformProfiles || talentPlatforms.emptyAllProfiles()
  if (tags.length) {
    const primary = platformProfiles.douyin?.enabled
      ? platformProfiles.douyin
      : platformProfiles.xiaohongshu
    if (primary) {
      const existing = Array.isArray(primary.accountTags) ? primary.accountTags : []
      primary.accountTags = [...new Set([...existing, ...tags])]
    }
  }
  memberStore.writeMember({
    ...prev,
    id: account.registryMemberId || prev.id || `MTM-${Date.now()}`,
    lingqiTalentId: account.lingqiTalentId || prev.lingqiTalentId || '',
    lingqiShootTeamId: account.lingqiShootTeamId || prev.lingqiShootTeamId || '',
    lingqiEditTeamId: account.lingqiEditTeamId || prev.lingqiEditTeamId || '',
    workIdentity: wid === 'shoot' || wid === 'edit' ? wid : prev.workIdentity || 'talent',
    wxNickName: require('./wxProfileDisplay.js').pickWxNick(account.wxNickName, prev.wxNickName),
    wxAvatarUrl: require('./wxProfileDisplay.js').pickWxAvatar(account.wxAvatarUrl, prev.wxAvatarUrl),
    wxOpenId: account.openid || prev.wxOpenId || '',
    contact: prev.contact || account.loginName || '',
    wechatId: prev.wechatId || account.loginName || '',
    platformProfiles,
    supplierProfile: prev.supplierProfile || supplierTeamProfile.emptySupplierProfile(),
    registeredAt: prev.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
}

function identitySatisfied(workId, account) {
  const role = identityTypes.accountRoleForWorkIdentity(workId)
  if (role === 'pr') return Boolean(account.lingqiPrId)
  if (workId === 'shoot') return Boolean(account.lingqiShootTeamId)
  if (workId === 'edit') return Boolean(account.lingqiEditTeamId)
  return Boolean(account.lingqiTalentId)
}

function mergeRegIntoAccount(account, reg) {
  if (!account) return account
  if (!reg) return account
  return {
    ...account,
    registryMemberId: reg.id || account.registryMemberId,
    lingqiTalentId: reg.lingqiTalentId || account.lingqiTalentId,
    lingqiShootTeamId: reg.lingqiShootTeamId || account.lingqiShootTeamId,
    lingqiEditTeamId: reg.lingqiEditTeamId || account.lingqiEditTeamId,
    workIdentity: reg.workIdentity || account.workIdentity,
  }
}

function contactFallback(account, member) {
  const phone = String(account?.loginName || member?.contact || '').trim()
  const openId = String(account?.openid || member?.wxOpenId || '').trim()
  const nick = String(member?.wxNickName || account?.wxNickName || '').trim()
  return phone || openId || nick || 'mp'
}

/** 已登录账号切换拍摄/剪辑身份时，用同一手机号/openid 在注册表补注册团队 ID */
async function registerTeamIdFallback(workId, account) {
  if (workId !== 'shoot' && workId !== 'edit') return null
  if (!api.hasApi()) return null
  const prev = memberStore.readMember() || {}
  const fallback = contactFallback(account, prev)
  const contact = String(prev.contact || account?.loginName || fallback).trim()
  const wechatId = String(prev.wechatId || account?.loginName || fallback).trim()
  const payload = supplierTeamProfile.memberToRegistryPayload(
    {
      ...prev,
      id: account?.registryMemberId || prev.id || `MTM-${Date.now()}`,
      memberType: prev.memberType || 'douyin',
      wxNickName: prev.wxNickName || account?.wxNickName || '用户',
      wxAvatarUrl: prev.wxAvatarUrl || account?.wxAvatarUrl || '',
      wxOpenId: account?.openid || prev.wxOpenId || '',
      contact,
      wechatId,
      lingqiTalentId: account?.lingqiTalentId || prev.lingqiTalentId || '',
      lingqiShootTeamId: prev.lingqiShootTeamId || account?.lingqiShootTeamId || '',
      lingqiEditTeamId: prev.lingqiEditTeamId || account?.lingqiEditTeamId || '',
    },
    workId,
  )
  try {
    return await ops.registerTalentMember(payload)
  } catch (_) {
    return null
  }
}

async function finalizeAccountForWorkId(workId, account) {
  let next = account || auth.readAccount()
  if (!next) return null
  if (identitySatisfied(workId, next)) {
    syncLocalProfilesFromAccount(next, workId)
    return next
  }
  const reg = await registerTeamIdFallback(workId, next)
  if (reg) {
    next = mergeRegIntoAccount(next, reg)
    const token = auth.readSessionToken()
    if (token) auth.writeSession(token, next)
    syncLocalProfilesFromAccount(next, workId)
    try {
      await auth.refreshSession()
      next = auth.readAccount() || next
      syncLocalProfilesFromAccount(next, workId)
    } catch (_) {}
  }
  return next
}

/** 进入资料页 / 登录后：按当前工作台身份 ensure 并刷新团队/达人 ID */
async function ensureWorkIdentityIfNeeded() {
  if (!auth.isLoggedIn()) return null
  try {
    await auth.refreshSession()
  } catch (_) {}
  const account = auth.readAccount()
  if (account) userProfile.adoptAccountIdentity(account)
  return account
}

async function applyWorkIdentitySwitch() {
  const prev = userProfile.readIdentity()
  return { workId: prev, cloudWarning: '身份在注册时已确定，不能切换' }
}

async function applyWorkIdentityAfterLogin(token, account) {
  const fixed = userProfile.adoptAccountIdentity(account)
  auth.writeSession(token, account)
  syncLocalProfilesFromAccount(account, fixed)
  return auth.readAccount() || account
}

function claimSwitchTarget(code) {
  if (code === 'edit_only') return 'edit'
  if (code === 'shoot_only') return 'shoot'
  if (code === 'talent_only' || code === 'wrong_identity') return 'talent'
  return ''
}

function promptPickIdentity() {
  const current = userProfile.readIdentity()
  wx.showToast({ title: '身份在注册时已确定', icon: 'none' })
  return Promise.resolve({ workId: current, cloudWarning: '身份在注册时已确定，不能切换' })
}

module.exports = {
  workIdentityForApi,
  syncLocalProfilesFromAccount,
  identitySatisfied,
  ensureWorkIdentityIfNeeded,
  applyWorkIdentitySwitch,
  applyWorkIdentityAfterLogin,
  claimSwitchTarget,
  promptPickIdentity,
}
