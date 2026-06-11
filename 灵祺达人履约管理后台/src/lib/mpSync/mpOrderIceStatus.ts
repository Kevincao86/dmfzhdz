/** 云剪招募单：满额/履约/完成 状态（大厅 vs PR 发单展示分离） */
import { isIceMpOrder } from './iceOrderDetect'
import {
  countIceOrderStats,
  getIceVerifyMode,
  isIceSlotsFull,
} from '../mpRecruitment/iceOrderStats'
import { parseRecruitCountFromMp } from '../mpRecruitment/listFilters'
import { resolveEffectiveMpStatus, statusLabel } from '../mpRecruitment/mpOrderStatus'

export function isIceRecruitFull(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp || !isIceMpOrder(mp)) return false
  return isIceSlotsFull(mp, parseRecruitCountFromMp(mp))
}

export function isIceOrderFulfilled(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp || !isIceMpOrder(mp)) return false
  const raw = String(mp.status || '').trim()
  if (raw === 'done' || raw === 'pending_settlement') return true
  const cap = parseRecruitCountFromMp(mp)
  if (cap <= 0) return false
  const { claimed, completed } = countIceOrderStats(mp)
  if (claimed < cap) return false
  if (getIceVerifyMode(mp) === 'ai') {
    return completed >= cap
  }
  return raw === 'done'
}

export function resolveIceHallStatus(mp: Record<string, unknown> | null | undefined): string {
  const raw = String((mp && mp.status) || 'open').trim() || 'open'
  if (raw === 'done' || raw === 'deleted') return raw
  if (raw === 'pending_settlement') return 'done'
  if (isIceOrderFulfilled(mp)) return 'done'
  if (isIceRecruitFull(mp)) return 'closed'
  if (raw === 'closed') return 'closed'
  return raw
}

export function resolveIcePrStatus(mp: Record<string, unknown> | null | undefined): string {
  const raw = String((mp && mp.status) || 'open').trim() || 'open'
  if (raw === 'done' || raw === 'deleted') return raw
  if (raw === 'pending_settlement') return 'done'
  if (isIceOrderFulfilled(mp)) return 'done'
  if (isIceRecruitFull(mp) || raw === 'collecting' || raw === 'closed') return 'collecting'
  return raw
}

export function resolveDisplayStatus(
  mp: Record<string, unknown> | null | undefined,
  view: 'hall' | 'pr',
  deadlineMs?: number,
  nowMs?: number,
): string {
  if (mp && isIceMpOrder(mp)) {
    return view === 'pr' ? resolveIcePrStatus(mp) : resolveIceHallStatus(mp)
  }
  return resolveEffectiveMpStatus(mp?.status, deadlineMs ?? 0, nowMs)
}

export function displayStatusLabel(
  status: string,
  mp: Record<string, unknown> | null | undefined,
  view: 'hall' | 'pr',
): string {
  if (mp && isIceMpOrder(mp) && isIceRecruitFull(mp) && !isIceOrderFulfilled(mp)) {
    if (view === 'pr' && status === 'collecting') return '进行中'
    if (view !== 'pr') return '已收满'
  }
  if (
    view === 'pr' &&
    mp &&
    isIceMpOrder(mp) &&
    status === 'collecting' &&
    isIceRecruitFull(mp) &&
    !isIceOrderFulfilled(mp)
  ) {
    return '进行中'
  }
  return statusLabel(status)
}

export function shouldShowIceInHall(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp || !isIceMpOrder(mp)) return false
  const status = resolveIceHallStatus(mp)
  return status !== 'done' && status !== 'deleted'
}
