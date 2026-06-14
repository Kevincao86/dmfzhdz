import { getAccount, getActiveRole } from './mpSession'
import { readMember } from './mpSync/talentMember'
import { prDisplayName, readPrProfile } from './mpSync/userProfile'

/** 顶栏 / 欢迎区展示名：达人·拍摄·剪辑用资料昵称，PR 用个人/机构名称 */
export function resolveShellDisplayName(): string {
  const account = getAccount()
  const fallback = account?.loginName || '灵祺用户'

  if (getActiveRole() === 'pr') {
    return prDisplayName(readPrProfile()) || fallback
  }

  const nick = String(readMember()?.wxNickName || '').trim()
  return nick || fallback
}
