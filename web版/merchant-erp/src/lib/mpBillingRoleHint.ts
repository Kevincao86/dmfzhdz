import type { MpLibraryRole } from './mpMembershipCatalog.js'

const WORK_IDENTITY_STORAGE_KEY = 'lingqi_mp_work_identity_v1'

export function parseMpBillingRole(raw: unknown): MpLibraryRole | undefined {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'pr' || s === 'talent' || s === 'shoot' || s === 'edit') return s
  return undefined
}

/** 星选 Web 工作台身份（localStorage），与履约端 mpWorkIdentity 一致 */
export function readMpBillingRoleHint(): MpLibraryRole | undefined {
  if (typeof localStorage === 'undefined') return undefined
  return parseMpBillingRole(localStorage.getItem(WORK_IDENTITY_STORAGE_KEY))
}
