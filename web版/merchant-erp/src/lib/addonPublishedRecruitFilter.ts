/**
 * 浏览器安全：Brief / 增值服务订单下拉 — 仅「已发布 · 在招」筛选（不依赖 vite-plugins）。
 */
import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes'
import { isIceMpOrder } from './iceOrderDetect'
import { resolvePrWorkflowStage } from './mpRecruitmentPrWorkflowCore'

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

function resolveMpOrderDeadlineMs(mp: RegistryMpRecruitmentOrder): number {
  const summary = [mp.recruitmentInfo, mp.taskDetail, mp.merchantRequirements].filter(Boolean).join('\n')
  if (isIceMpOrder(mp as unknown as Record<string, unknown>)) {
    const meta =
      mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
        ? (mp.mpPublishMeta as Record<string, unknown>)
        : null
    const fromSignup = parseTs(meta?.signupDeadline) || parseTs(pickField(summary, '报名截止'))
    if (fromSignup > 0) return fromSignup
    const deliveryMs = parseTs(meta?.deliveryDeadline) || parseTs(pickField(summary, '交付截止'))
    const deadlineField = parseTs(mp.deadline)
    if (deadlineField > 0 && (!deliveryMs || deadlineField !== deliveryMs)) return deadlineField
    const pub = parseTs(mp.createdAt || mp.updatedAt)
    if (mp.urgent && pub > 0) return pub + 86400000
    return pub > 0 ? pub + 7 * 86400000 : 0
  }
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
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

function resolveEffectiveMpOrderStatus(
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

export function isPublishedRecruitingMp(
  mp: RegistryMpRecruitmentOrder,
  nowMs = Date.now(),
  localItem?: { deletedAt?: string },
): boolean {
  if (!mp?.id) return false
  const raw = String(mp.status || 'open').trim()
  if (raw === 'deleted' || raw === 'closed') return false
  if (localItem?.deletedAt) return false
  if (resolvePrWorkflowStage(mp) !== 'recruiting') return false
  const effective = resolveEffectiveMpOrderStatus(mp, nowMs)
  if (effective === 'closed' || effective === 'done' || effective === 'expired') return false
  const deadlineMs = resolveMpOrderDeadlineMs(mp)
  if (deadlineMs > 0 && nowMs >= deadlineMs) {
    if (raw === 'open' || raw === 'collecting') return false
  }
  return effective === 'open' || effective === 'collecting'
}

export function filterPublishedRecruitingOrders(
  mpList: RegistryMpRecruitmentOrder[],
  opts?: {
    owned?: (mp: RegistryMpRecruitmentOrder) => boolean
    localById?: Map<string, { deletedAt?: string }>
  },
): RegistryMpRecruitmentOrder[] {
  const nowMs = Date.now()
  return mpList.filter((mp) => {
    if (!mp?.id) return false
    if (opts?.owned && !opts.owned(mp)) return false
    const local = opts?.localById?.get(String(mp.id).trim())
    return isPublishedRecruitingMp(mp, nowMs, local)
  })
}
