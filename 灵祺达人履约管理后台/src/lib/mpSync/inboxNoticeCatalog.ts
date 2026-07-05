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

function isOrderGroupChatNotice(row: NotificationRow): boolean {
  const title = String(row?.title || '').trim()
  const body = String(row?.body || '').trim()
  return title === '商单协作群已创建' || /点击进入群聊/.test(body)
}

function isTargetedInviteNotice(row: NotificationRow): boolean {
  return String(row?.title || '').trim() === '定向合作邀约'
}

function isSelectionNotice(row: NotificationRow): boolean {
  if (!row) return false
  if (row.noticeType === 'selection') return true
  return /恭喜入选|已被选入|PR 选入/.test(`${row.title || ''}${row.body || ''}`)
}

function resolveDetailTarget(row: NotificationRow) {
  const mp = String(row.mpOrderId || '').trim()
  if (mp) {
    if (isOrderGroupChatNotice(row)) {
      return {
        type: 'group_chat' as const,
        href: `/orders/${encodeURIComponent(mp)}/group-chat`,
        label: '进入群聊',
      }
    }
    if (isTargetedInviteNotice(row)) {
      return {
        type: 'targeted_invite' as const,
        href: `/recruitment/${encodeURIComponent(mp)}?targetedInvite=1`,
        label: '查看邀约详情',
      }
    }
    const applied = !!(row.applicantId || isSelectionNotice(row))
    return {
      type: 'order' as const,
      href: `/recruitment/${encodeURIComponent(mp)}${applied ? '?applied=1' : ''}`,
      label: isSelectionNotice(row) ? '查看入选商单' : '查看关联商单',
    }
  }
  return null
}

export function resolveNoticeKind(row: NotificationRow): NoticeKind {
  if (isSelectionNotice(row)) return 'selection'
  if (row.noticeType === 'ops_broadcast') return 'system'
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
  const target = resolveDetailTarget(row)
  return {
    ...row,
    noticeKind: kind,
    noticeKindLabel: NOTICE_KIND_LABELS[kind] || NOTICE_KIND_LABELS.system,
    detailHref: target?.href || '',
    detailLabel: target?.label || '',
    detailTargetType: target?.type || '',
  }
}
