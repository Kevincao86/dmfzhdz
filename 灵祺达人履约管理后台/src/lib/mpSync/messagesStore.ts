import { notifyLocalClientStateChanged } from '../mpClientSyncHooks'
import { getAccount } from '../mpSession'
import { scopedStorageKey, scopeIdFromAccount } from '../mpAccountLocalScope'

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
  ownerAccountId?: string
  ownerMemberId?: string
  ownerTalentId?: string
}

function ownerIdsForFilter() {
  const account = getAccount()
  return {
    ownerAccountId: scopeIdFromAccount(account),
    memberId: String(account?.registryMemberId || '').trim(),
    talentId: String(account?.lingqiTalentId || '').trim(),
  }
}

function entryBelongsToCurrentAccount(
  entry: { ownerAccountId?: string; ownerMemberId?: string; ownerTalentId?: string },
  ids: ReturnType<typeof ownerIdsForFilter>,
) {
  if (!entry.ownerAccountId && !entry.ownerMemberId && !entry.ownerTalentId) return false
  if (!ids.ownerAccountId) {
    if (ids.memberId && entry.ownerMemberId) return entry.ownerMemberId === ids.memberId
    if (ids.talentId && entry.ownerTalentId) return entry.ownerTalentId === ids.talentId
    return false
  }
  if (!entry.ownerAccountId) return false
  if (entry.ownerAccountId !== ids.ownerAccountId) return false
  if (entry.ownerMemberId && ids.memberId && entry.ownerMemberId !== ids.memberId) return false
  if (entry.ownerTalentId && ids.talentId && entry.ownerTalentId !== ids.talentId) return false
  return true
}

function storageKey(base: string) {
  return scopedStorageKey(base)
}

function readList(key: string): NotificationRow[] {
  try {
    const raw = localStorage.getItem(storageKey(key))
    const list = raw ? (JSON.parse(raw) as unknown) : []
    const rows = Array.isArray(list) ? (list as NotificationRow[]) : []
    const ids = ownerIdsForFilter()
    return rows.filter((item) => entryBelongsToCurrentAccount(item, ids))
  } catch {
    return []
  }
}

function writeList(key: string, list: NotificationRow[]) {
  const ids = ownerIdsForFilter()
  const scoped = (list || []).filter((item) => entryBelongsToCurrentAccount(item, ids))
  localStorage.setItem(storageKey(key), JSON.stringify(scoped.slice(0, 100)))
  notifyLocalClientStateChanged()
}

function sortTsFromId(id: string) {
  const s = String(id || '')
  const m = s.match(/(?:msg|ntf|inbox)-(\d+)/)
  return m ? Number(m[1]) : 0
}

function isVideoRejectNotice(row: NotificationRow): boolean {
  return row.noticeType === 'video_reject' || /探店视频需重新上传/.test(String(row.title || ''))
}

export function isPinnedUnread(row: NotificationRow): boolean {
  if (row.read) return false
  if (row.pinned) return true
  return isVideoRejectNotice(row)
}

export function sortNotificationRows(rows: NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    const pa = isPinnedUnread(a) ? 1 : 0
    const pb = isPinnedUnread(b) ? 1 : 0
    if (pa !== pb) return pb - pa
    const ta = sortTsFromId(a.id) || Date.parse(String(a.createdAt || '').replace(/\//g, '-')) || 0
    const tb = sortTsFromId(b.id) || Date.parse(String(b.createdAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
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
  return sortNotificationRows(merged.map(mapNotificationRow))
}

/** 合并 registry 站内信 + 本机通知（达人身份） */
export function mergeNotificationsWithRegistry(
  registryRows: NotificationRow[],
  localRows?: NotificationRow[],
): NotificationRow[] {
  const seen = readInboxSeenSet()
  const remote = registryRows.map((r) => ({
    ...mapNotificationRow(r),
    read: !!r.read || seen.has(String(r.id)),
  }))
  const local = localRows ?? readAllNotificationRows()
  const remoteIds = new Set(remote.map((r) => r.id))
  const rest = local.filter((r) => !remoteIds.has(r.id))
  return sortNotificationRows([...remote, ...rest])
}

export function pushNotification(item: Partial<NotificationRow> & { title?: string; body?: string }) {
  const ids = ownerIdsForFilter()
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
    ownerAccountId: ids.ownerAccountId,
    ownerMemberId: ids.memberId,
    ownerTalentId: ids.talentId,
  })
  writeList(NOTIFY_KEY, list)
}

export function unreadNotificationCount(rows?: NotificationRow[]) {
  const list = rows ?? readAllNotificationRows()
  return list.filter((m) => !m.read).length
}

export function markNotificationsRead(ids?: string[]) {
  const idSet = ids?.length ? new Set(ids.map(String)) : null
  const patch = (m: NotificationRow) => {
    if (idSet) return idSet.has(m.id) ? { ...m, read: true } : m
    return { ...m, read: true }
  }
  writeList(NOTIFY_KEY, readList(NOTIFY_KEY).map(patch))
  writeList(MSG_KEY, readList(MSG_KEY).map(patch))
  if (idSet) markInboxSeen([...idSet])
}

/** 本机通知 + 已拉取的 registry 站内信一并标已读 */
export function markAllNotificationsRead(registryRows?: NotificationRow[]) {
  markNotificationsRead()
  const remoteIds = (registryRows || []).map((r) => String(r.id || '')).filter(Boolean)
  if (remoteIds.length) markInboxSeen(remoteIds)
}

export function readInboxSeenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(INBOX_SEEN_KEY))
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

export function markInboxSeen(ids: string[]) {
  const set = readInboxSeenSet()
  for (const id of ids || []) set.add(String(id))
  localStorage.setItem(storageKey(INBOX_SEEN_KEY), JSON.stringify([...set].slice(-500)))
  notifyLocalClientStateChanged()
}
