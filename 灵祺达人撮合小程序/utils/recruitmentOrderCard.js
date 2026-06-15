const display = require('./recruitmentDisplay.js')
const budgetDisplayUtil = require('./recruitmentBudgetDisplay.js')
const { isUrgentMpOrder, isIceMpOrder } = require('./recruitmentUrgent.js')
const { recruitTargetFromMp } = require('./recruitTarget.js')
const { isMerchantSyncedMpOrder } = require('./recruitmentInfoFilter.js')
const listFilters = require('./recruitmentListFilters.js')
const mpOrderStatus = require('./mpOrderStatus.js')
const mpOrderIce = require('./mpOrderIceStatus.js')
const iceOrderStats = require('./iceOrderStats.js')
const orderHighlightTag = require('./orderHighlightTag.js')
const coverLib = require('./recruitCoverLibrary.js')

const STATUS_LABEL = mpOrderStatus.MP_STATUS_LABEL

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
  const applicantCount = listFilters.resolveApplicantCountFromMp(mp)
  const recruitCap = listFilters.parseRecruitCountFromMp(mp)
  const isIce = isIceMpOrder(mp)
  const iceProgress = isIce ? iceOrderStats.countIceClaimedSlots(mp, recruitCap) : null
  const iceSlotsFull =
    isIce && iceProgress && iceProgress.total > 0 && iceProgress.claimed >= iceProgress.total
  const overRecruitHot = isIce
    ? iceProgress && iceProgress.total > 0 && iceProgress.claimed > iceProgress.total
    : recruitCap > 0 && applicantCount > recruitCap
  const effectiveStatus = mpOrderIce.resolveDisplayStatus(mp, 'hall', deadlineMs)
  let rowStatusLabel = mpOrderIce.displayStatusLabel(effectiveStatus, mp, 'hall')
  if (iceSlotsFull && effectiveStatus !== 'expired') rowStatusLabel = '已收满'
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const talentTags = Array.isArray(meta.talentTags) ? meta.talentTags : []
  const recruitmentInfo = String(mp.recruitmentInfo || '').trim()
  const merchantRequirements = String(mp.merchantRequirements || view.recruitmentInfo || '').trim()
  const taskDetail = String(mp.taskDetail || view.taskDetail || '').trim()
  const recruitContent = orderHighlightTag.buildRecruitContentForAi({
    title: view.title,
    merchantRequirements,
    recruitmentInfo,
    taskDetail,
  })
  const hallAiTag = orderHighlightTag.readHallAiTagFromMeta(meta)
  return {
    id: mp.id,
    isMock: false,
    merchantOrderNo: view.merchantOrderNo,
    sourceMerchantOrderId: String(mp.sourceMerchantOrderId || '').trim(),
    merchantName: view.merchantName,
    storeName: view.storeName,
    title: view.title,
    status: effectiveStatus,
    statusLabel: rowStatusLabel,
    platform,
    platformIcon: platformIcon(platform),
    region: view.region,
    category: view.category || '本地生活',
    categoryTagsText: listFilters.resolveRequiredCategoryTagsText(mp, view.category),
    hideBudget,
    budgetText,
    budgetDisplay: hideBudget
      ? null
      : budgetDisplayUtil.buildBudgetDisplay(budgetText, mp.mpPublishMeta),
    fansRequirement: view.fansRequirement || '不限',
    summary: view.summaryShort,
    talentTags,
    recruitmentInfo,
    merchantRequirements,
    taskDetail,
    recruitContent,
    aiTag: hallAiTag ? hallAiTag.tag : '',
    aiTagTone: hallAiTag ? hallAiTag.tone : 'default',
    aiTagBg: hallAiTag ? hallAiTag.bg : '',
    aiTagFg: hallAiTag ? hallAiTag.fg : '',
    aiTagSource: hallAiTag ? 'persisted' : 'pending',
    applicantCount,
    recruitCount: recruitCap > 0 ? recruitCap : view.recruitCount || '不限',
    claimedSlotCount: iceProgress ? Math.min(iceProgress.claimed, iceProgress.total || iceProgress.claimed) : 0,
    signupCountText: iceOrderStats.buildHallSignupCountText(mp, applicantCount, recruitCap),
    iceSlotsFull: !!iceSlotsFull,
    slotsRemaining: iceProgress
      ? Math.max(0, (iceProgress.total || recruitCap) - Math.min(iceProgress.claimed, iceProgress.total || iceProgress.claimed))
      : recruitCap > 0
        ? Math.max(0, recruitCap - applicantCount)
        : 999,
    overRecruitHot,
    isPublishedToday: listFilters.isPublishedTodayMs(publishedAtMs),
    urgent,
    isIce: isIceMpOrder(mp),
    recruitTarget: recruitTargetFromMp(mp),
    recommended: urgent || view.applicantCount >= 3 || priceAmount >= 1000,
    priceAmount,
    publishedAtMs,
    deadlineMs,
    coverThumb: (() => {
      try {
        return coverLib.resolveOrderCoverUrl(mp) || ''
      } catch {
        return ''
      }
    })(),
    deadlineText: deadlineMs
      ? new Date(deadlineMs).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')
      : '',
  }
}

function shouldIncludeMpOrderInHallPool(mp) {
  if (!mp || !mp.id || String(mp.status) === 'deleted') return false
  if (isIceMpOrder(mp)) return mpOrderIce.shouldShowIceInHall(mp)
  const summary = String(mp.merchantRequirements || '').trim()
  const deadlineMs = listFilters.resolveDeadlineMs(mp, summary)
  const status = mpOrderStatus.resolveEffectiveMpStatus(mp.status, deadlineMs)
  /** 与 ECS mpRecruitmentOrdersForTalentHall 一致（含 closed/已停止、expired/已截止） */
  return status === 'open' || status === 'collecting' || status === 'closed' || status === 'expired'
}

function loadOpenOrderRows(reg) {
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const openList = mpList.filter((o) => {
    if (!o || !o.id || String(o.status) === 'deleted') return false
    if (isIceMpOrder(o)) return mpOrderIce.shouldShowIceInHall(o)
    const summary = String(o.merchantRequirements || '').trim()
    const deadlineMs = listFilters.resolveDeadlineMs(o, summary)
    const status = mpOrderStatus.resolveEffectiveMpStatus(o.status, deadlineMs)
    return mpOrderStatus.isMpOrderRecruiting(status)
  })
  return openList.map((mp) => mapMpOrderRow(mp, reg))
}

function loadAllOrderRows(reg) {
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  return mpList
    .filter((o) => shouldIncludeMpOrderInHallPool(o))
    .map((mp) => mapMpOrderRow(mp, reg))
}

module.exports = {
  STATUS_LABEL,
  PLATFORM_ICONS,
  mapMpOrderRow,
  loadOpenOrderRows,
  loadAllOrderRows,
}
