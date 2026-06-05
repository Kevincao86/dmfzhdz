import type { MpWorkIdentity } from '../mpWorkIdentity'
import type { RecruitmentOrderRow } from './types'

export const STATUS_FILTER_OPTIONS = ['全部', '招募中', '收集中', '待结算', '已停止', '已完成'] as const

function matchesRoleRecruit(row: RecruitmentOrderRow, identity: MpWorkIdentity): boolean {
  if (identity === 'pr') return (row.recruitTarget || 'talent') === 'talent'
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
  if (!filter || filter === '全部') return true
  return row.statusLabel === filter
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
  const iceRows = visible.filter((r) => r.isIce)
  const shootRows = visible.filter((r) => r.recruitTarget === 'shoot' && !r.isIce)
  const editRows = visible.filter((r) => r.recruitTarget === 'edit' && !r.isIce)
  const urgentRows = visible.filter((r) => r.urgent && !r.isIce && matchesRoleRecruit(r, identity))
  const normalRows = visible.filter((r) => !r.urgent && !r.isIce && matchesRoleRecruit(r, identity))
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCount = visible.filter((r) => (r.publishedAtMs || 0) >= todayStart.getTime()).length
  return { normalRows, urgentRows, shootRows, editRows, iceRows, todayCount }
}
