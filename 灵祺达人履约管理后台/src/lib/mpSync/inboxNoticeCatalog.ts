import type { NotificationRow } from './messagesStore'

export const NOTICE_KIND_LABELS = {
  selection: '入选',
  order: '订单',
  business: '业务',
  system: '系统',
} as const

export type NoticeKind = keyof typeof NOTICE_KIND_LABELS

export type NoticeTabId = 'all' | NoticeKind

export const NOTICE_TABS: { id: NoticeTabId; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'selection', label: '入选' },
  { id: 'order', label: '订单' },
  { id: 'business', label: '业务' },
  { id: 'system', label: '系统' },
]

function isSelectionNotice(row: NotificationRow): boolean {
  if (!row) return false
  if (row.noticeType === 'selection') return true
  return /恭喜入选|已被选入|PR 选入/.test(`${row.title || ''}${row.body || ''}`)
}

export function resolveNoticeKind(row: NotificationRow): NoticeKind {
  if (isSelectionNotice(row)) return 'selection'
  const mp = String(row.mpOrderId || '').trim()
  const app = String(row.applicantId || '').trim()
  if (mp && app && /恭喜入选|已被选入|PR 选入/.test(`${row.title || ''}${row.body || ''}`)) {
    return 'selection'
  }
  const c = row.category
  if (c === 'order' || c === 'business' || c === 'system') return c
  return 'system'
}

export function filterNoticesByTab(rows: NotificationRow[], tabId: NoticeTabId): NotificationRow[] {
  if (!tabId || tabId === 'all') return rows || []
  return (rows || []).filter((r) => resolveNoticeKind(r) === tabId)
}

export function noticeTabCounts(rows: NotificationRow[]): Record<NoticeTabId, number> {
  const counts: Record<NoticeTabId, number> = {
    all: (rows || []).length,
    selection: 0,
    order: 0,
    business: 0,
    system: 0,
  }
  for (const row of rows || []) {
    const k = resolveNoticeKind(row)
    counts[k]++
  }
  return counts
}

export function enrichNoticeRow(row: NotificationRow) {
  const kind = resolveNoticeKind(row)
  const mp = String(row.mpOrderId || '').trim()
  const detailHref = mp ? `/recruitment/${encodeURIComponent(mp)}?applied=1` : ''
  const detailLabel = isSelectionNotice(row) ? '查看入选商单' : mp ? '查看关联商单' : ''
  return {
    ...row,
    noticeKind: kind,
    noticeKindLabel: NOTICE_KIND_LABELS[kind] || NOTICE_KIND_LABELS.system,
    detailHref,
    detailLabel,
  }
}
