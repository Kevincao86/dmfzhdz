import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'

import {
  HALL_DEFAULT_STATUS_FILTER,
  HALL_STATUS_FILTERS,
  matchHallStatusFilter,
  matchHallTabCountStatusFilter,
} from './mpOrderStatus'

export const STATUS_FILTER_OPTIONS = HALL_STATUS_FILTERS
export { HALL_DEFAULT_STATUS_FILTER, matchHallStatusFilter, matchHallTabCountStatusFilter }

function matchesRoleRecruit(row: RecruitmentOrderRow, identity: MpWorkIdentity): boolean {
  const target = row.recruitTarget || 'talent'
  /** 剪辑类招募全身份可见（含剪辑云剪任务包） */
  if (target === 'edit') return true
  /** 招募大厅公开展示：达人/PR 可见全部对象（含剪辑/拍摄单） */
  if (identity === 'pr' || identity === 'talent') return true
  if (identity === 'shoot') return target === 'shoot'
  if (identity === 'edit') return false
  return true
}

export function orderVisibleToWorkIdentity(row: RecruitmentOrderRow, identity: MpWorkIdentity): boolean {
  const target = row.recruitTarget || 'talent'
  if (target === 'edit') return true
  if (identity === 'pr' || identity === 'talent') return true
  if (row.isIce) return true
  if (identity === 'shoot') return target === 'shoot'
  if (identity === 'edit') return false
  return true
}

export function matchStatusLabel(row: RecruitmentOrderRow, filter: string): boolean {
  return matchHallStatusFilter(String(row.statusLabel || ''), filter)
}

export function prioritizeActiveStatus<T extends { statusLabel?: string; publishedAtMs?: number }>(rows: T[]): T[] {
  const rank = (label?: string) => {
    if (label === '招募中') return 0
    if (label === '收集中') return 1
    if (label === '已截止') return 2
    return 3
  }
  return [...rows].sort((a, b) => {
    const d = rank(a.statusLabel) - rank(b.statusLabel)
    if (d !== 0) return d
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
}

export type RoleHallBuckets = {
  normalRows: RecruitmentOrderRow[]
  urgentRows: RecruitmentOrderRow[]
  shootRows: RecruitmentOrderRow[]
  editRows: RecruitmentOrderRow[]
  iceRows: RecruitmentOrderRow[]
  todayCount: number
}

export function splitRoleHallRows(rows: RecruitmentOrderRow[], identity: MpWorkIdentity): RoleHallBuckets {
  const visible = rows.filter((r) => orderVisibleToWorkIdentity(r, identity))
  /** 与小程序 hallIdentityBuckets 对齐：云剪单始终入池；非云剪按身份匹配 */
  const pool = visible.filter((r) => r.isIce || matchesRoleRecruit(r, identity))
  const urgentRows = pool.filter((r) => r.urgent)
  const nonUrgent = pool.filter((r) => !r.urgent)
  const primaryRows = pool.filter((r) => !r.isIce)
  const iceRows = pool.filter((r) => r.isIce)
  let shootRows: RecruitmentOrderRow[] = []
  let editRows: RecruitmentOrderRow[] = []
  if (identity === 'shoot') shootRows = primaryRows
  else if (identity === 'edit') editRows = primaryRows
  else if (identity === 'pr' || identity === 'talent') {
    shootRows = primaryRows.filter((r) => r.recruitTarget === 'shoot')
    editRows = [
      ...primaryRows.filter((r) => r.recruitTarget === 'edit'),
      ...iceRows.filter((r) => r.recruitTarget === 'edit'),
    ]
  }
  /** 招募大厅 Tab：非急单全部可见（含云剪），再由状态筛选项过滤 */
  const normalRows = nonUrgent
  const todayCount = pool.filter((r) => r.isPublishedToday).length
  return { normalRows, urgentRows, shootRows, editRows, iceRows, todayCount }
}
