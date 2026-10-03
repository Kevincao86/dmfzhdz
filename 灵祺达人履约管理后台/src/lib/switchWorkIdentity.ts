import { setActiveRole, setSession, type MpAccount } from './mpSession'
import { readMember, writeMember } from './mpSync/talentMember'
import { emptyAllProfiles } from './mpSync/talentPlatformProfiles'
import { emptyPrProfile, readPrProfile, writePrProfile } from './mpSync/userProfile'
import {
  getWorkIdentity,
  identityFromAccount,
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

/** 身份在注册时确定，登录后不能再切换 */
export async function applyWorkIdentitySwitch(_next: MpWorkIdentity): Promise<WorkIdentitySwitchResult> {
  return {
    workId: getWorkIdentity(),
    cloudWarning: '身份在注册时已确定，不能切换',
  }
}

/** 登录成功后采用账号库里的身份 */
export async function applyWorkIdentityAfterLogin(
  token: string,
  account: MpAccount,
  _workId?: MpWorkIdentity,
): Promise<MpAccount> {
  const workId = identityFromAccount(account)
  setWorkIdentity(workId)
  setSession(token, { ...account, workIdentity: workId })
  setActiveRole(workIdentityToAccountRole(workId))
  syncLocalProfilesFromAccount(account, workId)
  return account
}
