import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'

import { HALL_DEFAULT_STATUS_FILTER, HALL_STATUS_FILTERS, matchHallStatusFilter } from './mpOrderStatus'

export const STATUS_FILTER_OPTIONS = HALL_STATUS_FILTERS
export { HALL_DEFAULT_STATUS_FILTER, matchHallStatusFilter }

function matchesRoleRecruit(row: RecruitmentOrderRow, identity: MpWorkIdentity): boolean {
  /** PR 运营视角：招募大厅展示全部对象（达人/拍摄/剪辑），与运营台、我的发单一致 */
  if (identity === 'pr') return true
  if (identity === 'talent') return (row.recruitTarget || 'talent') === 'talent'
  if (identity === 'shoot') return row.recruitTarget === 'shoot'
  if (identity === 'edit') return row.recruitTarget === 'edit'
  return true
}

export function orderVisibleToWorkIdentity(row: RecruitmentOrderRow, identity: MpWorkIdentity): boolean {
  if (identity === 'pr') return true
  if (row.isIce) return true
  const target = row.recruitTarget || 'talent'
  if (identity === 'talent') return target === 'talent'
  if (identity === 'shoot') return target === 'shoot'
  if (identity === 'edit') return target === 'edit'
  return true
}

export function matchStatusLabel(row: RecruitmentOrderRow, filter: string): boolean {
  return matchHallStatusFilter(String(row.statusLabel || ''), filter)
}

export function prioritizeActiveStatus<T extends { statusLabel?: string; publishedAtMs?: number }>(rows: T[]): T[] {
  const rank = (label?: string) => {
    if (label === '招募中') return 0
    if (label === '收集中') return 1
    return 2
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
  else if (identity === 'pr') {
    shootRows = primaryRows.filter((r) => r.recruitTarget === 'shoot')
    editRows = primaryRows.filter((r) => r.recruitTarget === 'edit')
  }
  /** 招募大厅 Tab：非急单全部可见（含云剪），再由状态筛选项过滤 */
  const normalRows = nonUrgent
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = pool.filter((r) => (r.publishedAtMs || 0) >= todayStart.getTime()).length
  return { normalRows, urgentRows, shootRows, editRows, iceRows, todayCount }
}
