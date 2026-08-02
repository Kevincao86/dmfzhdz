/**
 * AI 智能体确认执行 — 与 Web AiAgentContext.confirmPendingTask 同源 API。
 */
const listing = require('./productListingMp.js')
const ops = require('./opsRegistryMp.js')
const rest = require('./supabaseRest.js')
const briefStore = require('./kolBriefStorageMp.js')
const { readPlatformToken } = require('./platformTokensMp.js')
const erpNav = require('./erpNavMp.js')

const DEFAULT_PRODUCT_PLATFORMS = ['douyin', 'meituan', 'xiaohongshu']

function boundPlatforms(platforms) {
  return (platforms || DEFAULT_PRODUCT_PLATFORMS).filter((p) => {
    if (p === 'jd') return false
    return Boolean(readPlatformToken(p))
  })
}

function formatSubmitSummary(results) {
  if (!results.length) return '未提交任何平台（请先完成平台绑定）'
  return results
    .map((r) => {
      const plat = listing.createPlatformLabel(r.platform)
      return `${r.planLabel} @ ${plat}：${r.ok ? '已保存草稿' : r.message || '失败'}`
    })
    .join('\n')
}

async function submitProductPlansFromPreview(previewMsg) {
  const plans = (previewMsg.preview.productPlans || []).filter(
    (p) => p.enrichStatus !== 'error' && String(p.productName || '').trim(),
  )
  if (!plans.length) {
    return { ok: false, message: '预览尚未就绪或方案为空，请等待生成完成后再确认。' }
  }
  const platforms = boundPlatforms(DEFAULT_PRODUCT_PLATFORMS)
  if (!platforms.length) {
    return {
      ok: false,
      message: '尚未绑定任何商品平台。请在电脑端「系统设置」完成抖音/美团/小红书授权后，下拉刷新「我的」页同步。',
    }
  }
  const results = []
  for (const plan of plans) {
    const title = String(plan.productName || plan.slotLabel || '').trim()
    const priceYuan = Number(plan.suggestedPriceYuan) > 0 ? Number(plan.suggestedPriceYuan) : 99
    const desc = [plan.description, ...(plan.comboLines || [])].filter(Boolean).join('\n')
    for (const plat of platforms) {
      const r = await listing.postPlatformProductDraft(plat, {
        title,
        priceYuan,
        description: desc || undefined,
      })
      results.push({
        planLabel: plan.slotLabel || title,
        platform: plat,
        ok: r.ok,
        message: r.message || (r.ok ? '已保存' : '失败'),
        draftId: r.draftId,
      })
    }
  }
  const okCount = results.filter((x) => x.ok).length
  return {
    ok: okCount > 0,
    okCount,
    failCount: results.length - okCount,
    summary: formatSubmitSummary(results),
    results,
    navUrl: erpNav.navForTaskType('create_product'),
  }
}

async function submitRecruitmentFromPreview(previewMsg, userBrief) {
  const brief = previewMsg.preview && previewMsg.preview.recruitmentBrief
  const text = String((brief && brief.briefText) || '').trim()
  if (!text) {
    return { ok: false, message: 'Brief 为空，请等待生成完成或补充需求后重试。' }
  }

  const recordId = `brief-${Date.now()}`
  const platform = String(brief.platform || '抖音来客')
  const mainProductName = String(brief.mainProductName || '主推商品').slice(0, 48)
  const tags = Array.isArray(brief.tags) ? brief.tags : []
  const previews = Array.isArray(brief.previews) && brief.previews.length
    ? brief.previews
    : [text, text, text]

  briefStore.appendRecord({
    id: recordId,
    createdAt: new Date().toISOString(),
    platform,
    mainProductName,
    tags,
    previews,
  })
  briefStore.writeSelectedBrief({
    recordId,
    variantIndex: 0,
    text,
    platform,
    mainProductName,
    tags,
  })

  let customerName = ''
  try {
    const tid = await rest.fetchPrimaryTenantId()
    customerName = (await rest.fetchTenantMerchantName(tid)) || ''
  } catch (_) {}
  if (!customerName) {
    try {
      customerName = wx.getStorageSync('meoo_erp_merchant_display_name') || wx.getStorageSync('meoo_login_name') || ''
    } catch (_) {}
  }
  customerName = customerName || '小程序商户'

  const orderId = `RO${Date.now()}`
  const order = {
    id: orderId,
    customerName,
    storeName: mainProductName,
    talentId: '—',
    talentName: '待管控台接单分配',
    fans: 0,
    accountType: platform,
    coopTimes: 0,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    status: 'pending',
    serviceAmount: 0,
    commissionPct: 0,
    netAmount: 0,
    storeAddress: '—',
    category: tags[0] || '达人招募',
    infoSummary: `AI智能体招募：${mainProductName}（${platform}）；Brief 已生成；需求摘要：${String(userBrief || text).slice(0, 280)}`,
  }

  await ops.appendRecruitmentOrder(order)
  try {
    wx.setStorageSync('meoo_last_recruitment_order_id', orderId)
  } catch (_) {}

  return {
    ok: true,
    orderId,
    message: `招募订单 ${orderId} 已推送运营台（待接单），与电脑端同源注册表。`,
    navUrl: erpNav.navForTaskType('recruit_influencer'),
  }
}

async function confirmPreviewMessage(previewMsg, context) {
  const taskType = previewMsg.preview && previewMsg.preview.taskType
  if (taskType === 'create_product') {
    return submitProductPlansFromPreview(previewMsg)
  }
  if (taskType === 'recruit_influencer') {
    return submitRecruitmentFromPreview(previewMsg, context && context.userBrief)
  }
  if (taskType === 'handle_review') {
    return { ok: true, message: '请前往评价管理完成回复。', navUrl: erpNav.navForTaskType('handle_review') }
  }
  if (taskType === 'optimize_local_ads') {
    return { ok: true, message: '请前往投流管理查看投放计划。', navUrl: erpNav.navForTaskType('optimize_local_ads') }
  }
  if (taskType === 'follow_local_lead') {
    return { ok: true, message: '请前往线索中心跟进线索。', navUrl: erpNav.navForTaskType('follow_local_lead') }
  }
  if (taskType === 'file_tax') {
    return { ok: true, message: '请前往报税管理导出申报资料。', navUrl: erpNav.navForTaskType('file_tax') }
  }
  if (taskType === 'analyze_exception') {
    return {
      ok: true,
      message: '诊断已确认。可按 Todo 前往看板与对应模块继续处理；写操作仍须在各场景再次确认。',
      navUrl: erpNav.navForTaskType('analyze_exception'),
    }
  }
  if (taskType === 'sync_platform') {
    return { ok: true, message: '请前往商品/同步相关模块处理。', navUrl: erpNav.navForTaskType('sync_platform') }
  }
  if (taskType === 'generate_copywriting') {
    return {
      ok: true,
      message: '请前往推广文案相关模块继续。',
      navUrl: erpNav.navForTaskType('generate_copywriting'),
    }
  }
  return { ok: true, message: '任务已记录，可在功能中心查看对应模块。', navUrl: erpNav.navForTaskType('general') }
}

module.exports = {
  submitProductPlansFromPreview,
  submitRecruitmentFromPreview,
  confirmPreviewMessage,
}
