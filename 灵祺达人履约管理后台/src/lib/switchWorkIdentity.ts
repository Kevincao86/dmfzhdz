import { ensureIdentity } from './mpApi'
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

export type WorkIdentitySwitchResult = {
  workId: MpWorkIdentity
  cloudWarning?: string
  /** 会话失效时需以目标身份重新登录以完成 ID 注册 */
  needsReLogin?: boolean
}

function isSessionCloudError(msg: string): boolean {
  return /invalid_session|account_not_found|invalid_credentials/i.test(msg)
}

function supplierTagsForWorkId(workId: MpWorkIdentity): string[] {
  if (workId === 'shoot') return ['拍摄团队', '拍摄', '跟拍']
  if (workId === 'edit') return ['剪辑团队', '剪辑', '后期']
  return []
}

function syncLocalProfilesFromAccount(account: MpAccount, workId?: MpWorkIdentity) {
  const wid = workId || getWorkIdentity()
  if (account.lingqiTalentId || workIdentityToAccountRole(wid) === 'talent') {
    const prev = readMember()
    const tags = supplierTagsForWorkId(wid)
    const platformProfiles = prev?.platformProfiles || emptyAllProfiles()
    if (tags.length) {
      const primary = platformProfiles.douyin?.enabled
        ? platformProfiles.douyin
        : platformProfiles.xiaohongshu
      if (primary) {
        const existing = Array.isArray(primary.accountTags) ? primary.accountTags : []
        primary.accountTags = [...new Set([...existing, ...tags])]
      }
    }
    writeMember({
      id: account.registryMemberId || prev?.id || `MTM-${Date.now()}`,
      lingqiTalentId: account.lingqiTalentId || prev?.lingqiTalentId || '',
      lingqiShootTeamId: account.lingqiShootTeamId || prev?.lingqiShootTeamId || '',
      lingqiEditTeamId: account.lingqiEditTeamId || prev?.lingqiEditTeamId || '',
      workIdentity: wid === 'shoot' || wid === 'edit' ? wid : prev?.workIdentity || 'talent',
      memberType: prev?.memberType || 'douyin',
      wxNickName: account.wxNickName || prev?.wxNickName || '',
      wxAvatarUrl: account.wxAvatarUrl || prev?.wxAvatarUrl || '',
      contact: prev?.contact || account.loginName || '',
      wechatId: prev?.wechatId || account.loginName || '',
      platformProfiles,
      supplierProfile: prev?.supplierProfile,
      registeredAt: prev?.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    } as never)
  }
  if (account.lingqiPrId) {
    const prev = readPrProfile() || emptyPrProfile()
    writePrProfile({
      ...prev,
      id: account.registryPrId || prev.id || `MPR-${Date.now()}`,
      lingqiPrId: account.lingqiPrId,
      wxNickName: account.wxNickName || prev.wxNickName || '',
      wxAvatarUrl: account.wxAvatarUrl || prev.wxAvatarUrl || '',
      personalName: prev.personalName || account.wxNickName || account.loginName || '',
      contactName: prev.contactName || account.wxNickName || account.loginName || '',
      contactPhone: prev.contactPhone || account.loginName || '',
      registeredAt: prev.registeredAt || new Date().toLocaleString('zh-CN', { hour12: false }),
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    })
  }
}

function workIdentityForApi(workId: MpWorkIdentity): 'talent' | 'shoot' | 'edit' | undefined {
  if (workId === 'shoot' || workId === 'edit') return workId
  if (workId === 'talent') return 'talent'
  return undefined
}

function identitySatisfied(workId: MpWorkIdentity, account: MpAccount): boolean {
  const role = workIdentityToAccountRole(workId)
  if (role === 'pr') return Boolean(account.lingqiPrId)
  if (workId === 'shoot') return Boolean(account.lingqiShootTeamId)
  if (workId === 'edit') return Boolean(account.lingqiEditTeamId)
  return Boolean(account.lingqiTalentId)
}

/** 同一账号切换工作台身份（达人/拍摄/剪辑/PR），并自动注册对应系统 ID */
export async function applyWorkIdentitySwitch(next: MpWorkIdentity): Promise<WorkIdentitySwitchResult> {
  const prev = getWorkIdentity()
  if (next === prev) return { workId: prev }

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
      syncLocalProfilesFromAccount(updated, next)
    }
    return { workId: next }
  }

  const token = getToken()
  if (!token) {
    setActiveRole(accountRole)
    return {
      workId: next,
      needsReLogin: true,
      cloudWarning: '请重新登录以完成身份注册',
    }
  }

  try {
    const { account } = await ensureIdentity(accountRole, workIdentityForApi(next))
    setSession(token, account)
    setActiveRole(accountRole)
    syncLocalProfilesFromAccount(account, next)
    if (!identitySatisfied(next, account)) {
      return {
        workId: next,
        cloudWarning: '已切换身份，团队 ID 同步中，请稍后刷新',
      }
    }
    return { workId: next }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (isSessionCloudError(msg)) {
      setActiveRole(accountRole)
      const acc = getAccount()
      if (acc) syncLocalProfilesFromAccount(acc, next)
      return {
        workId: next,
        needsReLogin: true,
        cloudWarning: '登录已过期，请重新登录以完成身份注册',
      }
    }
    throw e
  }
}

/** 登录成功后绑定工作台身份并生成对应 ID */
export async function applyWorkIdentityAfterLogin(
  token: string,
  account: MpAccount,
  workId: MpWorkIdentity,
): Promise<MpAccount> {
  const accountRole = workIdentityToAccountRole(workId)
  setWorkIdentity(workId)
  setSession(token, account)
  setActiveRole(accountRole)
  try {
    const { account: next } = await ensureIdentity(accountRole, workIdentityForApi(workId))
    setSession(token, next)
    setActiveRole(accountRole)
    syncLocalProfilesFromAccount(next, workId)
    return next
  } catch {
    setActiveRole(accountRole)
    syncLocalProfilesFromAccount(account, workId)
    return account
  }
}
