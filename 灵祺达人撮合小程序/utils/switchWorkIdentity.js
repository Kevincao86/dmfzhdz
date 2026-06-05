const auth = require('./auth.js')
const userProfile = require('./userProfile.js')
const memberStore = require('./talentMember.js')
const talentPlatforms = require('./talentPlatformProfiles.js')
const supplierTeamProfile = require('./supplierTeamProfile.js')
const identityTypes = require('./identityTypes.js')

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
    wxNickName: prev.wxNickName || account.wxNickName || '',
    wxAvatarUrl: prev.wxAvatarUrl || account.wxAvatarUrl || '',
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
  return Boolean(account.lingqiTalentId)
}

async function applyWorkIdentitySwitch(next) {
  const prev = userProfile.readIdentity()
  if (!next || next === prev) return { workId: prev }

  const accountRole = identityTypes.accountRoleForWorkIdentity(next)
  userProfile.writeIdentity(next)

  if (!auth.isLoggedIn()) {
    return { workId: next, needsReLogin: true, cloudWarning: '请登录以完成身份注册' }
  }

  try {
    const data = await auth.ensureIdentity(accountRole, workIdentityForApi(next))
    const account = data.account || auth.readAccount()
    if (account) syncLocalProfilesFromAccount(account, next)
    if (account && !identitySatisfied(next, account)) {
      return {
        workId: next,
        needsReLogin: true,
        cloudWarning: '身份 ID 未生成，请重新登录完成注册',
      }
    }
    return { workId: next }
  } catch (e) {
    const msg = String(e?.message || e)
    if (/invalid_session|account_not_found|invalid_credentials/i.test(msg)) {
      return { workId: next, needsReLogin: true, cloudWarning: '登录已过期，请重新登录' }
    }
    throw e
  }
}

async function applyWorkIdentityAfterLogin(token, account, workId) {
  const accountRole = identityTypes.accountRoleForWorkIdentity(workId)
  userProfile.writeIdentity(workId)
  auth.writeSession(token, account)
  try {
    const data = await auth.ensureIdentity(accountRole, workIdentityForApi(workId))
    const next = data.account || account
    syncLocalProfilesFromAccount(next, workId)
    return next
  } catch (_) {
    syncLocalProfilesFromAccount(account, workId)
    return account
  }
}

module.exports = {
  workIdentityForApi,
  syncLocalProfilesFromAccount,
  applyWorkIdentitySwitch,
  applyWorkIdentityAfterLogin,
}
