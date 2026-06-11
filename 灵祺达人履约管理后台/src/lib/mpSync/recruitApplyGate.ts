import { isEditTeamIceMpOrder } from './iceOrderDetect'
import type { MpWorkIdentity } from '../mpWorkIdentity'

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

export function isEditTeamRecruitment(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (isEditTeamIceMpOrder(mp)) return true
  return recruitTargetFromMpOrder(mp) === 'edit'
}

export function hallOrderVisibleToIdentity(
  row: { recruitTarget?: string; isIce?: boolean },
  identity: MpWorkIdentity,
): boolean {
  if (!row) return false
  if (row.recruitTarget === 'edit') return true
  if (row.isIce) return true
  if (identity === 'pr' || identity === 'talent') return true
  if (identity === 'shoot') return row.recruitTarget === 'shoot'
  if (identity === 'edit') return row.recruitTarget === 'edit'
  return true
}

export function hallOrderMatchesIdentityPool(
  row: { recruitTarget?: string; isIce?: boolean },
  identity: MpWorkIdentity,
): boolean {
  return hallOrderVisibleToIdentity(row, identity)
}

export function validateRecruitmentClaim(
  mp: Record<string, unknown>,
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
  return { ok: true }
}

export function claimBlockHint(mp: Record<string, unknown> | null | undefined, workIdentity?: string | null): string {
  if (!mp) return ''
  const v = validateRecruitmentClaim(mp, workIdentity)
  return v.ok ? '' : v.message
}

export function canClaimRecruitment(mp: Record<string, unknown> | null | undefined, workIdentity?: string | null): boolean {
  if (!mp) return false
  return validateRecruitmentClaim(mp, workIdentity).ok
}
