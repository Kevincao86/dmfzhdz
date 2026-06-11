import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isEditTeamIceMpOrder, isIceMpOrder } from './iceOrderDetect.js'
import { countFreeEditPackSlots, parseIceRecruitCapacity } from './mpRecruitmentIceCore.js'

export type MpWorkIdentity = 'talent' | 'shoot' | 'edit' | 'pr'

export function recruitTargetFromMpOrder(
  mp: Record<string, unknown> | null | undefined,
): 'talent' | 'shoot' | 'edit' {
  if (!mp) return 'talent'
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const t = String(meta.recruitTarget || mp.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

/** 剪辑师云剪 / 剪辑招募对象 */
export function isEditTeamRecruitment(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (isEditTeamIceMpOrder(mp)) return true
  return recruitTargetFromMpOrder(mp) === 'edit'
}

/** 大厅：剪辑类招募全身份可见（含剪辑云剪任务包） */
export function hallOrderVisibleToIdentity(
  row: { recruitTarget?: string; isIce?: boolean },
  _identity: MpWorkIdentity,
): boolean {
  if (!row) return false
  if (row.recruitTarget === 'edit') return true
  if (row.isIce) return true
  if (_identity === 'pr' || _identity === 'talent') return true
  if (_identity === 'shoot') return row.recruitTarget === 'shoot'
  if (_identity === 'edit') return row.recruitTarget === 'edit'
  return true
}

export function hallOrderMatchesIdentityPool(
  row: { recruitTarget?: string; isIce?: boolean },
  identity: MpWorkIdentity,
): boolean {
  return hallOrderVisibleToIdentity(row, identity)
}

function isIceSlotsFull(mp: RegistryMpRecruitmentOrder | Record<string, unknown>): boolean {
  if (!isIceMpOrder(mp as Record<string, unknown>)) return false
  const cap = parseIceRecruitCapacity(mp as RegistryMpRecruitmentOrder)
  if (cap <= 0) return false
  return countFreeEditPackSlots(mp as RegistryMpRecruitmentOrder) <= 0
}

export function validateRecruitmentClaim(
  mp: RegistryMpRecruitmentOrder | Record<string, unknown>,
  workIdentity?: string | null,
): { ok: true } | { ok: false; message: string; code: string } {
  const wid = String(workIdentity || '').trim() as MpWorkIdentity
  if (!wid || wid === 'pr') {
    return {
      ok: false,
      message: '请切换为达人 / 拍摄 / 剪辑身份后再报名',
      code: 'wrong_identity',
    }
  }

  const target = recruitTargetFromMpOrder(mp)
  const editTeam = isEditTeamRecruitment(mp)

  if (editTeam || target === 'edit') {
    if (wid !== 'edit') {
      return { ok: false, message: '该任务仅限剪辑身份认领', code: 'edit_only' }
    }
    if (isIceSlotsFull(mp)) {
      return { ok: false, message: '任务已收满', code: 'slots_full' }
    }
    return { ok: true }
  }
  if (target === 'shoot') {
    if (wid !== 'shoot') {
      return { ok: false, message: '该任务仅限拍摄身份报名', code: 'shoot_only' }
    }
    return { ok: true }
  }
  if (wid !== 'talent') {
    return { ok: false, message: '该任务仅限达人身份认领', code: 'talent_only' }
  }
  if (isIceMpOrder(mp as Record<string, unknown>) && isIceSlotsFull(mp)) {
    return { ok: false, message: '任务已收满', code: 'slots_full' }
  }
  return { ok: true }
}

export function claimBlockHint(
  mp: Record<string, unknown> | null | undefined,
  workIdentity?: string | null,
): string {
  const v = validateRecruitmentClaim((mp || {}) as RegistryMpRecruitmentOrder, workIdentity)
  if (v.ok) return ''
  return v.message
}
