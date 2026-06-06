import { notifyLocalClientStateChanged } from '../mpClientSyncHooks'

const MSG_KEY = 'meoo_talent_messages_v1'
const NOTIFY_KEY = 'meoo_talent_notifications_v1'
const INBOX_SEEN_KEY = 'meoo_talent_inbox_seen_v1'

export const CATEGORY_LABELS = {
  order: '订单',
  business: '业务',
  system: '系统',
} as const

export type NotificationRow = {
  id: string
  title: string
  body: string
  category: keyof typeof CATEGORY_LABELS | string
  categoryLabel?: string
  createdAt?: string
  read?: boolean
  imageUrl?: string
  fromRegistry?: boolean
  noticeType?: string
  mpOrderId?: string
  applicantId?: string
  pinned?: boolean
}

function readList(key: string): NotificationRow[] {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? (list as NotificationRow[]) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: NotificationRow[]) {
  localStorage.setItem(key, JSON.stringify(list.slice(0, 100)))
  notifyLocalClientStateChanged()
}

function sortTsFromId(id: string) {
  const m = String(id || '').match(/(?:msg|ntf)-(\d+)/)
  return m ? Number(m[1]) : 0
}

function normalizeCategory(cat: unknown): keyof typeof CATEGORY_LABELS {
  if (cat === 'order' || cat === 'business' || cat === 'system') return cat
  return 'system'
}

function mapNotificationRow(row: NotificationRow): NotificationRow {
  return {
    ...row,
    category: normalizeCategory(row.category),
    categoryLabel: row.categoryLabel || CATEGORY_LABELS[normalizeCategory(row.category)],
  }
}

export function readAllNotificationRows(): NotificationRow[] {
  const merged = [...readList(NOTIFY_KEY), ...readList(MSG_KEY)]
  return merged.map(mapNotificationRow).sort((a, b) => sortTsFromId(b.id) - sortTsFromId(a.id))
}

/** 合并 registry 站内信 + 本机通知（达人身份） */
export function mergeNotificationsWithRegistry(
  registryRows: NotificationRow[],
  localRows?: NotificationRow[],
): NotificationRow[] {
  const local = localRows ?? readAllNotificationRows()
  const remoteIds = new Set(registryRows.map((r) => r.id))
  const rest = local.filter((r) => !remoteIds.has(r.id))
  return [...registryRows.map(mapNotificationRow), ...rest].sort(
    (a, b) => sortTsFromId(b.id) - sortTsFromId(a.id),
  )
}

export function pushNotification(item: Partial<NotificationRow> & { title?: string; body?: string }) {
  const list = readList(NOTIFY_KEY)
  const cat = normalizeCategory(item.category)
  list.unshift({
    title: '',
    body: '',
    ...item,
    id: `ntf-${Date.now()}`,
    read: false,
    category: cat,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
  writeList(NOTIFY_KEY, list)
}

export function unreadNotificationCount() {
  return readAllNotificationRows().filter((m) => !m.read).length
}

export function markNotificationsRead() {
  writeList(
    NOTIFY_KEY,
    readList(NOTIFY_KEY).map((m) => ({ ...m, read: true })),
  )
  writeList(
    MSG_KEY,
    readList(MSG_KEY).map((m) => ({ ...m, read: true })),
  )
}

export function readInboxSeenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(INBOX_SEEN_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

export function markInboxSeen(ids: string[]) {
  const set = readInboxSeenSet()
  for (const id of ids || []) set.add(String(id))
  localStorage.setItem(INBOX_SEEN_KEY, JSON.stringify([...set].slice(-500)))
  notifyLocalClientStateChanged()
}
