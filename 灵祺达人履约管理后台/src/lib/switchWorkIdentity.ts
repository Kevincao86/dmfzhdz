import { fetchSession, registerPrUser, registerTalentMember, switchRole } from './mpApi'
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
  workIdentityLabel,
  workIdentityToAccountRole,
  type MpWorkIdentity,
} from './mpWorkIdentity'

export type WorkIdentitySwitchResult = {
  workId: MpWorkIdentity
  cloudWarning?: string
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
  if (account.lingqiTalentId) {
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
      lingqiTalentId: account.lingqiTalentId,
      memberType: prev?.memberType || 'douyin',
      wxNickName: account.wxNickName || prev?.wxNickName || '',
      wxAvatarUrl: account.wxAvatarUrl || prev?.wxAvatarUrl || '',
      contact: prev?.contact || '',
      wechatId: prev?.wechatId || '',
      platformProfiles,
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

async function ensureTargetIdentityId(
  workId: MpWorkIdentity,
  account: MpAccount,
): Promise<{ account: MpAccount; cloudWarning?: string }> {
  const accountRole = workIdentityToAccountRole(workId)
  let acc = account
  let cloudWarning: string | undefined

  if (accountRole === 'pr' && !acc.lingqiPrId) {
    const prev = readPrProfile() || emptyPrProfile()
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    try {
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isSessionCloudError(msg)) {
        cloudWarning = '云端 PR ID 同步未完成，请重新登录后在「我的」完善资料'
      } else {
        throw e
      }
    }
  }

  if (accountRole === 'talent' && !acc.lingqiTalentId) {
    const prev = readMember()
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const tags = supplierTagsForWorkId(workId)
    try {
      const reg = (await registerTalentMember({
        id: acc.registryMemberId || prev?.id || `MTM-${Date.now()}`,
        lingqiTalentId: '',
        memberType: prev?.memberType || 'douyin',
        wxNickName: acc.wxNickName || prev?.wxNickName || '',
        wxAvatarUrl: acc.wxAvatarUrl || prev?.wxAvatarUrl || '',
        platformProfiles: prev?.platformProfiles || emptyAllProfiles(),
        contact: prev?.contact || acc.loginName || '',
        wechatId: prev?.wechatId || '',
        registeredAt: prev?.registeredAt || now,
        updatedAt: now,
        workIdentity: workId === 'shoot' || workId === 'edit' ? workId : 'talent',
        accountTags: tags,
      })) as { lingqiTalentId?: string; id?: string }
      acc = {
        ...acc,
        lingqiTalentId: reg.lingqiTalentId || acc.lingqiTalentId,
        registryMemberId: reg.id || acc.registryMemberId,
        activeRole: 'talent',
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isSessionCloudError(msg)) {
        cloudWarning = `云端${workIdentityLabel(workId)} ID 同步未完成，请重新登录后在「我的」完善资料`
      } else {
        throw e
      }
    }
  }

  return { account: acc, cloudWarning }
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
    syncLocalProfilesFromAccount(getAccount() || ({} as MpAccount), next)
    return { workId: next }
  }

  const acc = getAccount()
  const missingTargetId =
    accountRole === 'pr' ? !acc?.lingqiPrId : !acc?.lingqiTalentId
  const roleChanged = getActiveRole() !== accountRole
  let cloudWarning: string | undefined
  let account = acc

  if (roleChanged || missingTargetId) {
    try {
      await fetchSession()
    } catch {
      /* 会话刷新失败时仍尝试 switch_role */
    }
    try {
      const res = await switchRole(accountRole)
      account = res.account
      setSession(token, account)
      setActiveRole(accountRole)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isSessionCloudError(msg)) {
        cloudWarning = '云端身份同步未完成，已切换本地工作台身份'
        setActiveRole(accountRole)
      } else {
        throw e
      }
    }
  }

  if (account) {
    const stillMissing =
      accountRole === 'pr' ? !account.lingqiPrId : !account.lingqiTalentId
    if (stillMissing) {
      const ensured = await ensureTargetIdentityId(next, account)
      account = ensured.account
      if (ensured.cloudWarning) cloudWarning = ensured.cloudWarning
      if (token) setSession(token, account)
      setActiveRole(account.activeRole)
    }
    syncLocalProfilesFromAccount(account, next)
  } else {
    setActiveRole(accountRole)
  }

  return { workId: next, cloudWarning }
}
