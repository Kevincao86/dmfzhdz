const {
  shouldExcludeRecruitmentSegment,
  filterRecruitmentInfoLines,
  filterRecruitmentInfoText,
  filterTaskDetailText,
  explodeAndFilterDisplayLines,
  normalizeRecruitmentPlatform,
  isMerchantSyncedMpOrder,
} = require('./recruitmentInfoFilter.js')
const listFilters = require('./recruitmentListFilters.js')
const { readExternalFormRelay } = require('./formRelayPlatforms.js')
const formRelayPlatforms = require('./formRelayPlatforms.js')
const formRelaySourceMpLink = require('./formRelaySourceMpLink.js')

function pickField(summary, key) {
  const re = new RegExp(`${key}[:：]([^；;]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

function parseRecruitCount(summary, fallbackFans) {
  const tier = String(summary || '').match(/档位[:：]([^；;]+)/)
  if (tier) {
    const nums = tier[1].match(/\d+/g) || []
    let sum = 0
    for (const n of nums) {
      const v = Number(n)
      if (Number.isFinite(v)) sum += v
    }
    if (sum > 0) return sum
  }
  if (fallbackFans > 0 && fallbackFans < 500) return fallbackFans
  return 0
}

function splitLines(text) {
  return String(text || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function findMerchantOrder(registry, sourceMerchantOrderId) {
  const list = Array.isArray(registry.recruitmentOrders) ? registry.recruitmentOrders : []
  return list.find((o) => o && o.id === sourceMerchantOrderId) || null
}

/** 合并小程序单 + 商家订单，输出详情页/列表展示结构 */
function enrichMpOrder(mp, merchant) {
  const merchantSynced = isMerchantSyncedMpOrder(mp)
  const linkedMerchant = merchantSynced ? null : merchant
  const summary = linkedMerchant
    ? String(linkedMerchant.infoSummary || '').trim()
    : String(mp.merchantRequirements || mp.recruitmentInfo || '').trim()
  const customerName =
    mp.customerName ||
    (linkedMerchant && linkedMerchant.customerName) ||
    mp.title ||
    '—'
  const storeName = mp.storeName || (linkedMerchant && linkedMerchant.storeName) || '—'
  /** 达人端统一展示小程序招募单号，不暴露商家 ERP 内部单号 */
  const merchantOrderNo = mp.id || '—'
  const platform = normalizeRecruitmentPlatform(
    mp.platform ||
      linkedMerchant?.recruitmentPlatform ||
      (linkedMerchant && linkedMerchant.accountType && linkedMerchant.accountType !== '—'
        ? linkedMerchant.accountType
        : '') ||
      '抖音',
  )
  const region =
    mp.region ||
    pickField(summary, '城市') ||
    storeName ||
    (linkedMerchant && linkedMerchant.storeAddress) ||
    '—'
  const category =
    mp.category || pickField(summary, '行业') || (linkedMerchant && linkedMerchant.category) || '本地生活'
  const serviceAmount =
    mp.serviceAmount != null
      ? mp.serviceAmount
      : linkedMerchant
        ? Math.max(0, linkedMerchant.serviceAmount || 0)
        : 0
  const budgetText =
    mp.budgetText || (serviceAmount > 0 ? `¥${serviceAmount.toLocaleString('zh-CN')}` : '面议')
  const recruitCount =
    mp.recruitCount ||
    (linkedMerchant ? parseRecruitCount(summary, linkedMerchant.fans) : 0) ||
    (linkedMerchant && linkedMerchant.fans > 0 ? linkedMerchant.fans : 1)
  const fansRequirement =
    mp.fansRequirement ||
    (linkedMerchant && linkedMerchant.fans >= 5000
      ? `≥${linkedMerchant.fans.toLocaleString('zh-CN')}`
      : '≥5000')

  let title = String(mp.title || '').trim()
  if (!title) {
    title =
      region && category && region !== '—'
        ? `${region}${category}${platform}招募`
        : `${customerName}·${storeName}达人招募`
  }
  if (merchantSynced && title.length > 48) {
    title = title.slice(0, 48)
  }

  let recruitmentInfo = mp.recruitmentInfo ? filterRecruitmentInfoText(mp.recruitmentInfo) : ''
  let taskDetail = mp.taskDetail
  if (!recruitmentInfo && summary) {
    const parts = summary.split(/[；;]/).map((p) => p.trim()).filter(Boolean)
    const rec = []
    const task = []
    for (const p of parts) {
      if (shouldExcludeRecruitmentSegment(p)) continue
      if (/套餐|探店|策略|档位|佣金|招募[:：]|城市|行业|时段|达人|粉丝|带货|营销/.test(p)) rec.push(p)
      else if (/说明|交付|备注|要求|结算|出片|组/.test(p)) task.push(p)
      else rec.push(p)
    }
    recruitmentInfo = filterRecruitmentInfoLines(rec).join('\n') || filterRecruitmentInfoText(summary)
    if (!taskDetail) taskDetail = task.length ? filterTaskDetailText(task.join('\n')) : ''
  }
  if (!taskDetail) {
    taskDetail = filterTaskDetailText(mp.merchantRequirements || summary || '详见招募信息')
  } else {
    taskDetail = filterTaskDetailText(taskDetail)
  }
  if (!recruitmentInfo) {
    recruitmentInfo = filterRecruitmentInfoText(mp.merchantRequirements || summary || '—')
  } else {
    recruitmentInfo = filterRecruitmentInfoText(recruitmentInfo)
  }

  let recruitmentInfoLines = explodeAndFilterDisplayLines(recruitmentInfo)
  recruitmentInfoLines = recruitmentInfoLines.filter((l) => !/^招募标题[:：]/.test(String(l || '').trim()))
  if (platform === '小红书') {
    recruitmentInfoLines = recruitmentInfoLines.filter((l) => !/带货等级/.test(l))
  }
  const formRelay = readExternalFormRelay(mp)
  const formRelaySourceUrl = formRelay && formRelay.sourceUrl ? String(formRelay.sourceUrl) : ''
  const formRelaySourceMp = formRelaySourceUrl
    ? formRelaySourceMpLink.resolveFormRelaySourceMpLink(
        formRelaySourceUrl,
        formRelay && formRelay.sourcePlatform,
        formRelaySourceMpLink.pickFormRelaySourceMpCache(formRelay),
      )
    : null
  const formRelaySourceDisplayLink =
    (formRelaySourceMp && formRelaySourceMp.displayLink) || formRelaySourceUrl
  const isFormRelay = !!formRelay
  if (isFormRelay) {
    recruitmentInfo = formRelayPlatforms.formatFormRelayRecruitmentText(recruitmentInfo, formRelay)
    recruitmentInfoLines = explodeAndFilterDisplayLines(recruitmentInfo).filter(
      (l) =>
        !/^招募标题[:：]/.test(String(l || '').trim()) &&
        !formRelayPlatforms.isFormRelaySourceLinkLine(l),
    )
  }
  const taskDetailLines = explodeAndFilterDisplayLines(taskDetail)

  const isIce = mp.hall === 'ice' || mp.orderKind === 'recruitment_ice'
  const summaryForDeadline = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const deadlineMs = listFilters.resolveDeadlineMs(mp, summaryForDeadline)
  const tags = [
    { text: platform, tone: platform.includes('红') ? 'pink' : 'blue' },
    isIce ? { text: '闭环·云剪', tone: 'pink' } : { text: '开环·线下', tone: 'gray' },
    isIce ? { text: '确认接收', tone: 'gray' } : { text: '运营反选', tone: 'gray' },
  ]

  return {
    mpOrderId: mp.id,
    merchantOrderNo,
    merchantName: customerName,
    storeName,
    title,
    platform,
    region,
    category,
    fansRequirement,
    budgetText,
    recruitCount: String(recruitCount),
    recruitmentInfo,
    recruitmentInfoLines,
    taskDetail,
    taskDetailLines,
    tags,
    applicantCount: (mp.applicants || []).length,
    status: mp.status,
    summaryShort: recruitmentInfoLines[0] || title,
    isIce,
    isFormRelay,
    deadlineMs,
    iceSlotsTotal: isIce ? (mp.iceVideoSlots || []).length || Number(recruitCount) || 0 : 0,
    iceSlotsTaken: isIce
      ? (mp.iceVideoSlots || []).filter((s) => s && s.assignedApplicantId).length
      : 0,
    formRelaySourceUrl,
    formRelaySourceDisplayLink,
    formRelaySourceOpen: formRelaySourceMp,
  }
}

function enrichRegistry(registry) {
  const mpList = Array.isArray(registry.mpRecruitmentOrders) ? registry.mpRecruitmentOrders : []
  return mpList.map((mp) => {
    const merchant = findMerchantOrder(registry, mp.sourceMerchantOrderId)
    return enrichMpOrder(mp, merchant)
  })
}

module.exports = {
  findMerchantOrder,
  enrichMpOrder,
  enrichRegistry,
  splitLines,
}
