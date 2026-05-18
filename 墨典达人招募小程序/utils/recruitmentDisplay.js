const {
  shouldExcludeRecruitmentSegment,
  filterRecruitmentInfoLines,
  filterRecruitmentInfoText,
  filterTaskDetailText,
  explodeAndFilterDisplayLines,
  normalizeRecruitmentPlatform,
} = require('./recruitmentInfoFilter.js')

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
  const summary = merchant
    ? String(merchant.infoSummary || '').trim()
    : String(mp.merchantRequirements || '').trim()
  const customerName = mp.customerName || (merchant && merchant.customerName) || '—'
  const storeName = mp.storeName || (merchant && merchant.storeName) || '—'
  const merchantOrderNo = mp.sourceMerchantOrderId || (merchant && merchant.id) || '—'
  const platform = normalizeRecruitmentPlatform(
    mp.platform ||
      merchant?.recruitmentPlatform ||
      (merchant && merchant.accountType && merchant.accountType !== '—' ? merchant.accountType : '') ||
      '抖音',
  )
  const region =
    mp.region || pickField(summary, '城市') || storeName || (merchant && merchant.storeAddress) || '—'
  const category =
    mp.category || pickField(summary, '行业') || (merchant && merchant.category) || '本地生活'
  const serviceAmount =
    mp.serviceAmount != null
      ? mp.serviceAmount
      : merchant
        ? Math.max(0, merchant.serviceAmount || 0)
        : 0
  const budgetText =
    mp.budgetText || (serviceAmount > 0 ? `¥${serviceAmount.toLocaleString('zh-CN')}` : '面议')
  const recruitCount =
    mp.recruitCount ||
    (merchant ? parseRecruitCount(summary, merchant.fans) : 0) ||
    (merchant && merchant.fans > 0 ? merchant.fans : 1)
  const fansRequirement =
    mp.fansRequirement ||
    (merchant && merchant.fans >= 5000
      ? `≥${merchant.fans.toLocaleString('zh-CN')}`
      : '≥5000')

  let title = mp.title
  if (!title) {
    title =
      region && category
        ? `${region}${category}${platform}招募`
        : `${customerName}·${storeName}达人招募`
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
  if (platform === '小红书') {
    recruitmentInfoLines = recruitmentInfoLines.filter((l) => !/带货等级/.test(l))
  }
  const taskDetailLines = explodeAndFilterDisplayLines(taskDetail)

  const tags = [
    { text: platform, tone: platform.includes('红') ? 'pink' : 'blue' },
    { text: '线下结算', tone: 'gray' },
    { text: '需要反选', tone: 'gray' },
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
