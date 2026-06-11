import type { MpRegistry, RecruitmentOrderRow } from './types'
import { normalizeHallPlatform } from './hallFilters'
import * as listFilters from './listFilters'
import { isMpOrderRecruiting, resolveEffectiveMpStatus, statusLabel } from './mpOrderStatus'
import { buildHallSignupCountText, countIceClaimedSlots, isIceSlotsFull } from './iceOrderStats'

function isUrgentMpOrder(mp: Record<string, unknown>): boolean {
  return mp.urgent === true
}

export function isIceMpOrder(mp: Record<string, unknown> | null | undefined): boolean {
  if (!mp) return false
  if (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice' || mp.orderKind === 'ice') return true
  const id = String(mp.id || '').trim()
  if (/^MP-ICE-/i.test(id)) return true
  if (String(mp.category || '').trim() === '云剪') return true
  const meta = mp.mpPublishMeta as Record<string, unknown> | undefined
  const mode = String(meta?.recruitMode || '').trim()
  if (mode === 'ice' || mode === 'edit_ice') return true
  return false
}

export function recruitTargetFromMp(mp: Record<string, unknown>): 'talent' | 'shoot' | 'edit' {
  const meta = mp.mpPublishMeta as Record<string, unknown> | undefined
  const t = String(meta?.recruitTarget || mp.recruitTarget || '').trim()
  if (t === 'shoot' || t === 'edit') return t
  return 'talent'
}

function isMerchantSyncedMpOrder(mp: Record<string, unknown>): boolean {
  if (mp.publisherIdentity === 'pr') return false
  if (mp.publisherIdentity === 'merchant') return true
  const sid = String(mp.sourceMerchantOrderId || '').trim()
  if (!sid) return false
  return !/^MP-(RO|ICE|USER)-/i.test(sid)
}

function findMerchantOrder(reg: MpRegistry, sourceId: unknown) {
  const list = Array.isArray(reg.recruitmentOrders) ? reg.recruitmentOrders : []
  return list.find((o) => o && o.id === sourceId) || null
}

function buildBudgetDisplay(budgetText: string): RecruitmentOrderRow['budgetDisplay'] {
  const raw = budgetText.trim() || '面议'
  if (raw.length > 32) return { kind: 'text', line: `${raw.slice(0, 30)}…`, full: raw }
  return { kind: 'text', line: raw }
}

export function mapMpOrderRow(mp: Record<string, unknown>, reg: MpRegistry): RecruitmentOrderRow {
  const merchantOrder = findMerchantOrder(reg, mp.sourceMerchantOrderId) as Record<string, unknown> | null
  const urgent = isUrgentMpOrder(mp)
  const platform = normalizeHallPlatform(
    mp.platform || merchantOrder?.recruitmentPlatform || merchantOrder?.accountType || '抖音',
  )
  const customerName = String(mp.customerName || merchantOrder?.customerName || mp.title || '—')
  const storeName = String(mp.storeName || merchantOrder?.storeName || '—')
  const region = String(mp.region || storeName || '—')
  const hideBudget = isMerchantSyncedMpOrder(mp)
  const serviceAmount = Number(mp.serviceAmount ?? merchantOrder?.serviceAmount ?? 0)
  const budgetText =
    hideBudget ? '' : String(mp.budgetText || (serviceAmount > 0 ? `¥${serviceAmount.toLocaleString('zh-CN')}` : '面议'))
  const priceAmount = listFilters.resolvePriceAmount(mp, budgetText)
  const publishedAtMs = listFilters.resolvePublishedMs(mp)
  const summaryText = String(mp.recruitmentInfo || mp.merchantRequirements || '').trim()
  const deadlineMs = listFilters.resolveDeadlineMsFromMp(mp, summaryText)
  const applicantCount = Array.isArray(mp.applicants) ? mp.applicants.length : 0
  const recruitCap = listFilters.parseRecruitCountFromMp(mp)
  const isIce = isIceMpOrder(mp)
  const iceProgress = isIce ? countIceClaimedSlots(mp, recruitCap) : null
  const iceSlotsFull =
    isIce && iceProgress && iceProgress.total > 0 && iceProgress.claimed >= iceProgress.total
  let title = String(mp.title || '').trim()
  if (!title) title = `${customerName}·${storeName}达人招募`
  const effectiveStatus = resolveEffectiveMpStatus(mp.status, deadlineMs)

  return {
    id: String(mp.id),
    merchantOrderNo: String(mp.id || '').trim(),
    sourceMerchantOrderId: String(mp.sourceMerchantOrderId || '').trim(),
    isMock: false,
    merchantName: customerName,
    storeName,
    title,
    mpStatus: effectiveStatus,
    statusLabel: iceSlotsFull ? '已收满' : statusLabel(effectiveStatus),
    platform,
    region,
    category: String(mp.category || '本地生活'),
    hideBudget,
    budgetText,
    budgetDisplay: buildBudgetDisplay(budgetText),
    fansRequirement: String(mp.fansRequirement || '不限'),
    summary: String(mp.recruitmentInfo || mp.merchantRequirements || '').slice(0, 120),
    applicantCount,
    recruitCount: recruitCap > 0 ? recruitCap : '不限',
    claimedSlotCount: iceProgress ? iceProgress.claimed : 0,
    signupCountText: buildHallSignupCountText(mp, applicantCount, recruitCap),
    overRecruitHot: isIce
      ? !!(iceProgress && iceProgress.total > 0 && iceProgress.claimed > iceProgress.total)
      : recruitCap > 0 && applicantCount > recruitCap,
    iceSlotsFull: !!iceSlotsFull,
    urgent,
    isIce: isIceMpOrder(mp),
    recruitTarget: recruitTargetFromMp(mp),
    recommended: urgent || applicantCount >= 3 || priceAmount >= 1000,
    priceAmount,
    publishedAtMs,
    deadlineMs,
  }
}

export function loadAllOrderRows(reg: MpRegistry): RecruitmentOrderRow[] {
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const list = mpList.filter((o) => o && o.status !== 'deleted') as Record<string, unknown>[]
  return list.map((mp) => mapMpOrderRow(mp, reg))
}

export function loadOpenOrderRows(reg: MpRegistry): RecruitmentOrderRow[] {
  return loadAllOrderRows(reg).filter((r) => isMpOrderRecruiting(r.mpStatus))
}

export function splitHallRows(reg: MpRegistry) {
  const mapped = loadOpenOrderRows(reg)
  const shootRows = mapped.filter((r) => r.recruitTarget === 'shoot')
  const editRows = mapped.filter((r) => r.recruitTarget === 'edit')
  const iceRows = mapped.filter((r) => r.isIce)
  const urgentRows = mapped.filter((r) => r.urgent && !r.isIce && r.recruitTarget === 'talent')
  const realNormal = mapped.filter((r) => !r.urgent && !r.isIce && r.recruitTarget === 'talent')
  const normalRows = realNormal
  return { normalRows, urgentRows, shootRows, editRows, iceRows, todayCount: mapped.length }
}
