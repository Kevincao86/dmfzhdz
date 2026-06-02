const display = require('./recruitmentDisplay.js')
const budgetDisplayUtil = require('./recruitmentBudgetDisplay.js')
const { isUrgentMpOrder, isIceMpOrder } = require('./recruitmentUrgent.js')
const { isMerchantSyncedMpOrder } = require('./recruitmentInfoFilter.js')
const listFilters = require('./recruitmentListFilters.js')

const STATUS_LABEL = {
  open: '招募中',
  collecting: '收集中',
  pending_settlement: '待结算',
  closed: '已关闭',
  done: '已完成',
}

const {
  platformIcon,
  normalizeHallPlatform,
  PLATFORM_ICONS,
} = require('./recruitmentHallFilters.js')

function mapMpOrderRow(mp, reg) {
  const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
  const view = display.enrichMpOrder(mp, merchantOrder)
  const urgent = isUrgentMpOrder(mp)
  const platform = normalizeHallPlatform(view.platform || '抖音')
  const summary = merchantOrder
    ? String(merchantOrder.infoSummary || '').trim()
    : String(mp.merchantRequirements || '').trim()
  const priceAmount = listFilters.resolvePriceAmount(mp, view)
  const publishedAtMs = listFilters.resolvePublishedMs(mp)
  const deadlineMs = listFilters.resolveDeadlineMs(mp, summary)
  const hideBudget = isMerchantSyncedMpOrder(mp)
  const budgetText = hideBudget ? '' : view.budgetText || '面议'
  const applicantCount = view.applicantCount || 0
  const recruitCap = listFilters.parseRecruitCountFromMp(mp)
  const overRecruitHot = recruitCap > 0 && applicantCount > recruitCap
  return {
    id: mp.id,
    isMock: false,
    merchantOrderNo: view.merchantOrderNo,
    merchantName: view.merchantName,
    storeName: view.storeName,
    title: view.title,
    statusLabel: STATUS_LABEL[mp.status] || mp.status,
    platform,
    platformIcon: platformIcon(platform),
    region: view.region,
    category: view.category || '本地生活',
    hideBudget,
    budgetText,
    budgetDisplay: hideBudget
      ? null
      : budgetDisplayUtil.buildBudgetDisplay(budgetText, mp.mpPublishMeta),
    fansRequirement: view.fansRequirement || '不限',
    summary: view.summaryShort,
    applicantCount,
    recruitCount: recruitCap > 0 ? recruitCap : view.recruitCount || '不限',
    overRecruitHot,
    urgent,
    isIce: isIceMpOrder(mp),
    recommended: urgent || view.applicantCount >= 3 || priceAmount >= 1000,
    priceAmount,
    publishedAtMs,
    deadlineMs,
  }
}

function loadOpenOrderRows(reg) {
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const openList = mpList.filter((o) => o && (o.status === 'open' || o.status === 'collecting'))
  return openList.map((mp) => mapMpOrderRow(mp, reg))
}

module.exports = {
  STATUS_LABEL,
  PLATFORM_ICONS,
  mapMpOrderRow,
  loadOpenOrderRows,
}
