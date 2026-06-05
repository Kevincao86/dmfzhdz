import { switchRole } from './mpApi'
import { getActiveRole, getToken, setActiveRole, setSession } from './mpSession'
import {
  getWorkIdentity,
  setWorkIdentity,
  workIdentityToAccountRole,
  type MpWorkIdentity,
} from './mpWorkIdentity'

/** 同一账号切换工作台身份（达人/拍摄/剪辑/PR），跨 PR 时同步服务端 active_role */
export async function applyWorkIdentitySwitch(next: MpWorkIdentity): Promise<MpWorkIdentity> {
  const prev = getWorkIdentity()
  if (next === prev) return prev

  const accountRole = workIdentityToAccountRole(next)
  setWorkIdentity(next)

  if (getActiveRole() !== accountRole) {
    const { account } = await switchRole(accountRole)
    const token = getToken()
    if (token) setSession(token, account)
    setActiveRole(accountRole)
  }

  return next
}
