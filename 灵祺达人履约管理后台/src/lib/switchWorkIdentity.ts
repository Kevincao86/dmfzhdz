import { registerPrUser, registerTalentMember, switchRole } from './mpApi'
import {
  DEV_PREVIEW_TOKEN,
  getAccount,
  getActiveRole,
  getToken,
  isDevPreviewSession,
  setActiveRole,
  setSession,
  type MpAccount,
} from './mpSession'
import { readMember, writeMember } from './mpSync/talentMember'
import { emptyAllProfiles } from './mpSync/talentPlatformProfiles'
import { emptyPrProfile, readPrProfile, writePrProfile } from './mpSync/userProfile'
import {
  getWorkIdentity,
  setWorkIdentity,
  workIdentityToAccountRole,
  type MpWorkIdentity,
} from './mpWorkIdentity'

function syncLocalProfilesFromAccount(account: MpAccount) {
  if (account.lingqiTalentId) {
    const prev = readMember()
    writeMember({
      id: account.registryMemberId || prev?.id || `MTM-${Date.now()}`,
      lingqiTalentId: account.lingqiTalentId,
      memberType: prev?.memberType || 'douyin',
      wxNickName: account.wxNickName || prev?.wxNickName || '',
      wxAvatarUrl: account.wxAvatarUrl || prev?.wxAvatarUrl || '',
      contact: prev?.contact || '',
      wechatId: prev?.wechatId || '',
      platformProfiles: prev?.platformProfiles || emptyAllProfiles(),
      registeredAt: prev?.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    })
  }
  if (account.lingqiPrId) {
    const prev = readPrProfile() || emptyPrProfile()
    writePrProfile({
      ...prev,
      id: account.registryPrId || prev.id || `MPR-${Date.now()}`,
      lingqiPrId: account.lingqiPrId,
      wxNickName: account.wxNickName || prev.wxNickName || '',
      wxAvatarUrl: account.wxAvatarUrl || prev.wxAvatarUrl || '',
      personalName: prev.personalName || account.wxNickName || '',
      contactName: prev.contactName || account.wxNickName || '',
      registeredAt: prev.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    })
  }
}

async function ensureTargetIdentityId(workId: MpWorkIdentity, account: MpAccount): Promise<MpAccount> {
  const accountRole = workIdentityToAccountRole(workId)
  let acc = account

  if (accountRole === 'pr' && !acc.lingqiPrId) {
    const prev = readPrProfile() || emptyPrProfile()
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const reg = (await registerPrUser({
      id: acc.registryPrId || prev.id || `MPR-${Date.now()}`,
      lingqiPrId: '',
      accountType: prev.accountType || 'personal',
      companyName: prev.companyName || '',
      personalName: prev.personalName || acc.wxNickName || acc.loginName || '',
      contactName: prev.contactName || acc.wxNickName || acc.loginName || '',
      contactPhone: prev.contactPhone || acc.loginName || '',
      wechatId: prev.wechatId || '',
      province: prev.province || '',
      city: prev.city || '',
      intro: prev.intro || '',
      wxNickName: acc.wxNickName || prev.wxNickName || '',
      wxAvatarUrl: acc.wxAvatarUrl || prev.wxAvatarUrl || '',
      registeredAt: prev.registeredAt || now,
      updatedAt: now,
    })) as { lingqiPrId?: string; id?: string }
    acc = {
      ...acc,
      lingqiPrId: reg.lingqiPrId || acc.lingqiPrId,
      registryPrId: reg.id || acc.registryPrId,
      activeRole: 'pr',
    }
  }

  if (accountRole === 'talent' && !acc.lingqiTalentId) {
    const prev = readMember()
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const reg = (await registerTalentMember({
      id: acc.registryMemberId || prev?.id || `MTM-${Date.now()}`,
      lingqiTalentId: '',
      memberType: prev?.memberType || 'douyin',
      wxNickName: acc.wxNickName || prev?.wxNickName || '',
      wxAvatarUrl: acc.wxAvatarUrl || prev?.wxAvatarUrl || '',
      platformProfiles: prev?.platformProfiles || emptyAllProfiles(),
      contact: prev?.contact || '',
      wechatId: prev?.wechatId || '',
      registeredAt: prev?.registeredAt || now,
      updatedAt: now,
    })) as { lingqiTalentId?: string; id?: string }
    acc = {
      ...acc,
      lingqiTalentId: reg.lingqiTalentId || acc.lingqiTalentId,
      registryMemberId: reg.id || acc.registryMemberId,
      activeRole: 'talent',
    }
  }

  return acc
}

/** 同一账号切换工作台身份（达人/拍摄/剪辑/PR），并自动注册对应系统 ID */
export async function applyWorkIdentitySwitch(next: MpWorkIdentity): Promise<MpWorkIdentity> {
  const prev = getWorkIdentity()
  if (next === prev) return prev

  const accountRole = workIdentityToAccountRole(next)
  setWorkIdentity(next)

  if (isDevPreviewSession()) {
    const acc = getAccount()
    if (acc) {
      const updated: MpAccount = {
        ...acc,
        activeRole: accountRole,
        lingqiTalentId: acc.lingqiTalentId || 'T-DEV-001',
        lingqiPrId: acc.lingqiPrId || 'PR-DEV-001',
      }
      setSession(DEV_PREVIEW_TOKEN, updated)
      setActiveRole(accountRole)
      syncLocalProfilesFromAccount(updated)
    }
    return next
  }

  const token = getToken()
  if (!token) {
    setActiveRole(accountRole)
    return next
  }

  const acc = getAccount()
  const missingTargetId =
    accountRole === 'pr' ? !acc?.lingqiPrId : !acc?.lingqiTalentId
  const roleChanged = getActiveRole() !== accountRole

  let account = acc
  if (roleChanged || missingTargetId) {
    const res = await switchRole(accountRole)
    account = res.account
    setSession(token, account)
    setActiveRole(accountRole)
  }

  if (account) {
    const stillMissing =
      accountRole === 'pr' ? !account.lingqiPrId : !account.lingqiTalentId
    if (stillMissing) {
      account = await ensureTargetIdentityId(next, account)
      setSession(token, account)
      setActiveRole(account.activeRole)
    }
    syncLocalProfilesFromAccount(account)
  } else {
    setActiveRole(accountRole)
  }

  return next
}
