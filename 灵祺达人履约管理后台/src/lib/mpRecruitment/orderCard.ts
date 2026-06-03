import type { MpRegistry, RecruitmentOrderRow } from './types'
import { normalizeHallPlatform } from './hallFilters'
import * as listFilters from './listFilters'

function isUrgentMpOrder(mp: Record<string, unknown>): boolean {
  return mp.urgent === true
}

function isIceMpOrder(mp: Record<string, unknown>): boolean {
  return mp.hall === 'ice' || mp.orderKind === 'recruitment_ice'
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
  const applicantCount = Array.isArray(mp.applicants) ? mp.applicants.length : 0
  const recruitCap = listFilters.parseRecruitCountFromMp(mp)
  let title = String(mp.title || '').trim()
  if (!title) title = `${customerName}·${storeName}达人招募`

  return {
    id: String(mp.id),
    isMock: false,
    merchantName: customerName,
    storeName,
    title,
    statusLabel: { open: '招募中', collecting: '收集中', closed: '已关闭', done: '已完成' }[
      String(mp.status)
    ] || String(mp.status),
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
    overRecruitHot: recruitCap > 0 && applicantCount > recruitCap,
    urgent,
    isIce: isIceMpOrder(mp),
    recommended: urgent || applicantCount >= 3 || priceAmount >= 1000,
    priceAmount,
    publishedAtMs,
    deadlineMs: publishedAtMs + (urgent ? 86400000 : 7 * 86400000),
  }
}

export function loadOpenOrderRows(reg: MpRegistry): RecruitmentOrderRow[] {
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const openList = mpList.filter(
    (o) => o && (o.status === 'open' || o.status === 'collecting'),
  ) as Record<string, unknown>[]
  return openList.map((mp) => mapMpOrderRow(mp, reg))
}

export function splitHallRows(reg: MpRegistry) {
  const mapped = loadOpenOrderRows(reg)
  const iceRows = mapped.filter((r) => r.isIce)
  const urgentRows = mapped.filter((r) => r.urgent && !r.isIce)
  const realNormal = mapped.filter((r) => !r.urgent && !r.isIce)
  const normalRows = realNormal.length > 0 ? realNormal : [listFilters.buildMockRecruitmentRow()]
  return { normalRows, urgentRows, iceRows, todayCount: mapped.length }
}
