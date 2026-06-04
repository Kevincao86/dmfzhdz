import type { RegistryMpRecruitmentOrder, RegistryMpTalentInboxItem, RegistrySnapshot } from './opsRegistryTypes.js'

/** 报名截止后保留群二维码的天数 */
export const GROUP_QR_RETENTION_DAYS = 7
export const GROUP_QR_RETENTION_MS = GROUP_QR_RETENTION_DAYS * 86400000

function parseTs(text: unknown): number {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function pickField(summary: string, key: string): string {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

/** 与小程序 recruitmentListFilters.resolveDeadlineMs 一致 */
export function resolveMpOrderDeadlineMs(mp: RegistryMpRecruitmentOrder): number {
  const summary = String(mp.recruitmentInfo || mp.taskDetail || '')
  const fromField =
    parseTs(mp.deadline) ||
    parseTs(pickField(summary, '报名截止')) ||
    parseTs(pickField(summary, '截止')) ||
    parseTs(pickField(summary, '截止时间'))
  if (fromField > 0) return fromField
  const pub = parseTs(mp.createdAt || mp.updatedAt)
  if (mp.urgent && pub > 0) return pub + 86400000
  return pub > 0 ? pub + 7 * 86400000 : 0
}

export function isGroupQrExpired(mp: RegistryMpRecruitmentOrder, nowMs = Date.now()): boolean {
  const deadlineMs = resolveMpOrderDeadlineMs(mp)
  if (deadlineMs <= 0) return false
  return nowMs > deadlineMs + GROUP_QR_RETENTION_MS
}

function orderHasGroupQr(mp: RegistryMpRecruitmentOrder): boolean {
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  return !!(String(mp.groupQrImage || '').trim() || String(meta?.groupQrImage || '').trim())
}

function clearOrderGroupQr(mp: RegistryMpRecruitmentOrder, nowMs: number): void {
  mp.groupQrImage = ''
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? { ...(mp.mpPublishMeta as Record<string, unknown>) }
      : {}
  delete meta.groupQrImage
  mp.mpPublishMeta = Object.keys(meta).length ? meta : undefined
  mp.groupQrClearedAt = new Date(nowMs).toLocaleString('zh-CN', { hour12: false })
}

export type GroupQrPurgeResult = {
  purgedOrderIds: string[]
  purgedInboxCount: number
}

export function purgeExpiredGroupQrsInSnapshot(
  data: RegistrySnapshot,
  nowMs = Date.now(),
): GroupQrPurgeResult {
  const purgedOrderIds: string[] = []
  const orders = data.mpRecruitmentOrders ?? []
  for (let i = 0; i < orders.length; i++) {
    const mp = orders[i]
    if (!mp || !orderHasGroupQr(mp) || !isGroupQrExpired(mp, nowMs)) continue
    clearOrderGroupQr(mp, nowMs)
    purgedOrderIds.push(String(mp.id || ''))
  }
  const purgeSet = new Set(purgedOrderIds.filter(Boolean))
  let purgedInboxCount = 0
  const inbox = data.mpTalentInbox ?? []
  for (let j = 0; j < inbox.length; j++) {
    const row = inbox[j] as RegistryMpTalentInboxItem
    if (!row || !row.imageUrl) continue
    const mpId = String(row.mpOrderId || '').trim()
    if (!mpId || !purgeSet.has(mpId)) continue
    row.imageUrl = ''
    purgedInboxCount++
  }
  return { purgedOrderIds: [...purgeSet], purgedInboxCount }
}

export async function maybePurgeExpiredGroupQrsAndSave(
  io: { load(): Promise<RegistrySnapshot>; save(data: RegistrySnapshot): Promise<void> },
  nowMs = Date.now(),
): Promise<GroupQrPurgeResult & { saved: boolean }> {
  const data = await io.load()
  const result = purgeExpiredGroupQrsInSnapshot(data, nowMs)
  const changed = result.purgedOrderIds.length > 0 || result.purgedInboxCount > 0
  if (changed) await io.save(data)
  return { ...result, saved: changed }
}
