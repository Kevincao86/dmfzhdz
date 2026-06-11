import type { RegistryMpRecruitmentOrder, RegistrySnapshot } from './opsRegistryTypes.js'

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
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const summary = [mp.recruitmentInfo, mp.taskDetail, mp.merchantRequirements].filter(Boolean).join('\n')
  const fromField =
    parseTs(mp.deadline) ||
    parseTs(meta?.signupDeadline) ||
    parseTs(pickField(summary, '报名截止')) ||
    parseTs(pickField(summary, '截止')) ||
    parseTs(pickField(summary, '截止时间'))
  if (fromField > 0) return fromField
  const pub = parseTs(mp.createdAt || mp.updatedAt)
  if (mp.urgent && pub > 0) return pub + 86400000
  return pub > 0 ? pub + 7 * 86400000 : 0
}

export function resolveEffectiveMpOrderStatus(
  mp: RegistryMpRecruitmentOrder,
  nowMs = Date.now(),
): RegistryMpRecruitmentOrder['status'] | 'expired' {
  let raw = String(mp.status || 'open').trim() || 'open'
  if (raw === 'pending_settlement') return 'done'
  if (raw === 'closed' || raw === 'done' || raw === 'deleted') return raw as RegistryMpRecruitmentOrder['status']
  const deadlineMs = resolveMpOrderDeadlineMs(mp)
  if (deadlineMs > 0 && nowMs >= deadlineMs && (raw === 'open' || raw === 'collecting')) return 'expired'
  return raw as RegistryMpRecruitmentOrder['status']
}

/** 招募大厅仍展示：招募中/收集中/已停止/已截止（closed = 运营台「已关闭」） */
export function isMpOrderHallVisible(mp: RegistryMpRecruitmentOrder, nowMs = Date.now()): boolean {
  const s = resolveEffectiveMpOrderStatus(mp, nowMs)
  return s === 'open' || s === 'collecting' || s === 'closed' || s === 'expired'
}

export function isMpOrderHallRecruiting(mp: RegistryMpRecruitmentOrder, nowMs = Date.now()): boolean {
  const s = resolveEffectiveMpOrderStatus(mp, nowMs)
  return s === 'open' || s === 'collecting'
}

export function syncExpiredMpOrdersInSnapshot(
  data: RegistrySnapshot,
  nowMs = Date.now(),
): { syncedIds: string[] } {
  const syncedIds: string[] = []
  for (const mp of data.mpRecruitmentOrders ?? []) {
    if (!mp?.id) continue
    const raw = String(mp.status || '').trim()
    if (raw !== 'open') continue
    if (resolveEffectiveMpOrderStatus(mp, nowMs) !== 'done') continue
    mp.status = 'done'
    syncedIds.push(String(mp.id))
  }
  return { syncedIds: syncedIds.filter(Boolean) }
}
