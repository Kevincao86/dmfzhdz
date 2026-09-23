/**
 * AI 智能体确认执行 — 与 Web AiAgentContext.confirmPendingTask 同源 API。
 */
const listing = require('./productListingMp.js')
const ops = require('./opsRegistryMp.js')
const rest = require('./supabaseRest.js')
const briefStore = require('./kolBriefStorageMp.js')
const erpNav = require('./erpNavMp.js')
const library = require('./productEditLibraryMp.js')
const intelSnap = require('./merchantIntelSnapshotMp.js')

const DEFAULT_PRODUCT_PLATFORMS = ['douyin', 'meituan', 'xiaohongshu']

function selectedPlatforms(previewMsg, override) {
  if (Array.isArray(override)) {
    return override.filter((p) => p && p !== 'jd')
  }
  const chips = previewMsg && previewMsg.previewPlatforms
  if (Array.isArray(chips) && chips.length) {
    const on = chips.filter((p) => p && p.checked !== false).map((p) => p.id)
    if (on.length) return on.filter((p) => p !== 'jd')
  }
  return DEFAULT_PRODUCT_PLATFORMS.slice()
}

function planPriceYuan(plan) {
  const n = Number(plan && plan.suggestedPriceYuan)
  return Number.isFinite(n) && n > 0 ? n : 99
}

function saveLocalDraft(plan, platform, status) {
  const title = String((plan && (plan.productName || plan.slotLabel)) || '').trim()
  if (!title) return { ok: false, message: '方案名称为空' }
  const price = planPriceYuan(plan)
  let store = '—'
  try {
    const snap = intelSnap.loadSnapshot()
    store = (snap && snap.storeName) || '—'
  } catch (_) {}
  const id = `agent-${platform}-${title.slice(0, 40)}`
  const saved = library.upsertProductEditLibraryDraft({
    id,
    name: title,
    platform: listing.createPlatformLabel(platform),
    store,
    status,
    price,
    platformApi: platform,
  })
  return saved
    ? { ok: true, draftId: id, price, message: '已写入商品列表草稿箱' }
    : { ok: false, message: '写入草稿箱失败' }
}

async function submitProductPlansFromPreview(previewMsg, options) {
  const mode = options && options.mode === 'submit' ? 'submit' : 'draft'
  const plans = ((previewMsg.preview && previewMsg.preview.productPlans) || []).filter((p) => {
    if (!p || p.enrichStatus === 'loading') return false
    if (p.enrichStatus === 'error') return false
    return Boolean(String(p.productName || p.slotLabel || '').trim())
  })
  if (!plans.length) {
    const loading = ((previewMsg.preview && previewMsg.preview.productPlans) || []).some(
      (p) => p && p.enrichStatus === 'loading',
    )
    return {
      ok: false,
      message: loading ? '方案还在生成，请等预览出现后再操作。' : '预览尚未就绪或方案为空，请核对后再试。',
    }
  }
  const platforms = selectedPlatforms(previewMsg, options && options.platforms)
  if (!platforms.length) return { ok: false, message: '请至少勾选一个目标平台。' }

  const lines = []
  let localOk = 0
  let platformOk = 0
  for (const plan of plans) {
    const title = String(plan.productName || plan.slotLabel || '').trim()
    const priceYuan = planPriceYuan(plan)
    const priceNote = Number(plan.suggestedPriceYuan) > 0 ? '' : '（方案未给售价，已按 ¥99 写入）'
    const desc = [plan.description, ...(plan.comboLines || [])].filter(Boolean).join('\n')
    for (const plat of platforms) {
      const label = listing.createPlatformLabel(plat)
      const local = saveLocalDraft(plan, plat, '草稿')
      if (!local.ok) {
        lines.push(`${title} @ ${label}：${local.message}`)
        continue
      }
      localOk += 1
      if (mode === 'draft') {
        lines.push(`${title} @ ${label}：已保存至商品列表草稿箱${priceNote}`)
        continue
      }
      const r = await listing.postPlatformProductDraft(plat, {
        title,
        priceYuan,
        description: desc || undefined,
      })
      const placeholder = /占位/.test(String((r && r.message) || ''))
      if (r.ok && !placeholder) {
        platformOk += 1
        saveLocalDraft(plan, plat, '审核中')
        lines.push(`${title} @ ${label}：平台已接收${r.draftId ? `（${r.draftId}）` : ''}，列表中为审核中`)
      } else if (r.ok && placeholder) {
        lines.push(
          `${title} @ ${label}：已写入草稿箱${priceNote}。线上「提交至平台」目前是占位接口，不会进入抖音/美团/小红书商家后台。真上品要在「创建商品」补类目、主图和门店后再保存。`,
        )
      } else {
        lines.push(
          `${title} @ ${label}：已写入草稿箱${priceNote}。提交平台未成功：${r.message || '失败'}。草稿可在商品列表「草稿」中继续编辑。`,
        )
      }
    }
  }
  const ok = localOk > 0
  return {
    ok,
    localOk,
    platformOk,
    summary: lines.join('\n'),
    message: lines.join('\n'),
    navUrl: mode === 'draft' || platformOk === 0 ? '' : erpNav.navForTaskType('create_product'),
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
    infoSummary: `智能招募：${mainProductName}（${platform}）；Brief 已生成；需求摘要：${String(userBrief || text).slice(0, 280)}`,
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
    return submitProductPlansFromPreview(previewMsg, context)
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
