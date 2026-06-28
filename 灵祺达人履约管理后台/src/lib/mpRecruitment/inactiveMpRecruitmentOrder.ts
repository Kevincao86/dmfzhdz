import { resolveDisplayStatus } from '../mpSync/mpOrderIceStatus'
import { resolveDeadlineMsFromMp } from './listFilters'

export function pickMpFromRow(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null
  const mp =
    (row.progressMp as Record<string, unknown> | undefined) ||
    (row._progressMp as Record<string, unknown> | undefined) ||
    (row.mp as Record<string, unknown> | undefined)
  return mp && typeof mp === 'object' ? mp : null
}

export function isMpOrderDeleted(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  return String(mp.status || '').trim() === 'deleted'
}

export function resolveMpSignupExpired(mp: Record<string, unknown>, nowMs?: number): boolean {
  if (isMpOrderDeleted(mp)) return false
  const summary = [mp.merchantRequirements, mp.recruitmentInfo, mp.taskDetail].filter(Boolean).join('\n')
  const deadlineMs = resolveDeadlineMsFromMp(mp, summary)
  const status = resolveDisplayStatus(mp, 'hall', deadlineMs, nowMs)
  return status === 'expired'
}

export function isInactiveMpRecruitmentOrder(mp: Record<string, unknown>, nowMs?: number): boolean {
  return isMpOrderDeleted(mp) || resolveMpSignupExpired(mp, nowMs)
}

export function shouldHideRegisteredApplicationRow(
  row: Record<string, unknown> | null | undefined,
  nowMs?: number,
): boolean {
  const mp = pickMpFromRow(row)
  if (!mp) return false
  return isInactiveMpRecruitmentOrder(mp, nowMs)
}

export function shouldHidePrPublishedRow(row: Record<string, unknown> | null | undefined, nowMs?: number): boolean {
  if (!row) return true
  if (row.isDeleted || row.deletedAt) return true
  if (String(row.status || '') === 'deleted' || row.statusLabel === '已删除') return true
  const mp = pickMpFromRow(row)
  if (mp && isMpOrderDeleted(mp)) return true
  if (String(row.status || '') === 'expired' || row.statusLabel === '已截止') return true
  const deadlineMs = Number(row.deadlineMs) || 0
  const now = nowMs != null && Number.isFinite(nowMs) ? nowMs : Date.now()
  if (deadlineMs > 0 && now >= deadlineMs) {
    const raw = String(row.status || mp?.status || 'open')
    if (raw === 'open' || raw === 'collecting') return true
  }
  if (mp && resolveMpSignupExpired(mp, now)) return true
  return false
}
