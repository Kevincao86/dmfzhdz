import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'
import { resolveRowIsPublishedToday } from './listFilters'

import {
  HALL_DEFAULT_STATUS_FILTER,
  HALL_STATUS_FILTERS,
  matchHallStatusFilter,
  matchHallTabCountStatusFilter,
} from './mpOrderStatus'

export const STATUS_FILTER_OPTIONS = HALL_STATUS_FILTERS
export { HALL_DEFAULT_STATUS_FILTER, matchHallStatusFilter, matchHallTabCountStatusFilter }

/** 只列出当前身份能报名的单。PR 浏览全部开放商单。 */
export function orderVisibleToWorkIdentity(row: RecruitmentOrderRow, identity: MpWorkIdentity): boolean {
  if (!row) return false
  if (identity === 'pr') return true
  const target = row.recruitTarget || 'talent'
  if (row.isIce || target === 'edit') return identity === 'edit'
  if (identity === 'shoot') return target === 'shoot'
  return identity === 'talent' && target === 'talent'
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
  const pool = rows.filter((r) => orderVisibleToWorkIdentity(r, identity))
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
  const todayCount = pool.filter((r) => resolveRowIsPublishedToday(r)).length
  return { normalRows, urgentRows, shootRows, editRows, iceRows, todayCount }
}
