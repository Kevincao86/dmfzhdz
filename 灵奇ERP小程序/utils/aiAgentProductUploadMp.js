/**
 * 助手确认上品：用户核对价格/库存/组合/售卖与可用时间/主图，其余由平台资料与方案补齐后走真实保存接口。
 */
const douyin = require('./douyinGoodsMp.js')
const listing = require('./productListingMp.js')
const intelSnap = require('./merchantIntelSnapshotMp.js')
const agent = require('./aiAgentMp.js')

function ymd(d) {
  const x = d instanceof Date ? d : new Date()
  const m = `${x.getMonth() + 1}`.padStart(2, '0')
  const day = `${x.getDate()}`.padStart(2, '0')
  return `${x.getFullYear()}-${m}-${day}`
}

function addDays(d, n) {
  const x = new Date(d.getTime())
  x.setDate(x.getDate() + n)
  return x
}

function dayStartUnix(ymdText) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymdText || '').trim())
  if (!m) return 0
  return Math.floor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0).getTime() / 1000)
}

function dayEndUnix(ymdText) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymdText || '').trim())
  if (!m) return 0
  return Math.floor(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59).getTime() / 1000)
}

function keywordsFrom(plan) {
  const snap = intelSnap.loadSnapshot()
  const raw = [snap.industryPath, snap.storeName, plan && plan.productName, plan && plan.description]
    .filter(Boolean)
    .join(' ')
  return raw
    .split(/[\s/／>·,，。；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 24)
}

function scoreName(name, keywords) {
  const text = String(name || '')
  let s = 0
  for (const k of keywords) {
    if (text.includes(k)) s += k.length
  }
  return s
}

async function pickCategory(keywords) {
  const tree = await douyin.fetchCategoryTree()
  if (!tree.ok) return { ok: false, message: tree.message || '未读到抖音类目' }
  let nodes = tree.tree || []
  let best = null
  let bestScore = 0
  for (let depth = 0; depth < 3 && nodes.length; depth += 1) {
    let top = nodes[0]
    let topScore = -1
    for (const n of nodes) {
      const s = scoreName(n.name, keywords)
      if (s > topScore) {
        top = n
        topScore = s
      }
    }
    if (topScore > bestScore) {
      best = top
      bestScore = topScore
    }
    if (!top || top.is_leaf) break
    const ch = await douyin.fetchCategoryChildren(top.category_id)
    if (!ch.ok || !ch.children || !ch.children.length) break
    nodes = ch.children
    if (topScore <= 0 && depth === 0) break
  }
  if (!best || bestScore <= 0) {
    return { ok: false, message: '没能按经营类目自动对上抖音三级类目，请先在「创建商品」选定类目后再提交。' }
  }
  return { ok: true, categoryId: best.category_id, categoryName: best.name }
}

async function resolveDouyinContext(plan) {
  if (!douyin.douyinToken()) {
    return { ok: false, message: '尚未绑定抖音来客。请在电脑端系统设置完成授权后，下拉刷新「我的」再提交。' }
  }
  const keywords = keywordsFrom(plan)
  const [cat, stores] = await Promise.all([pickCategory(keywords), douyin.fetchDouyinStores()])
  if (!cat.ok) return cat
  if (!stores.ok) return { ok: false, message: stores.message || '未读到门店' }
  const pois = (stores.items || []).slice(0, 20)
  if (!pois.length) return { ok: false, message: '抖音来客没有可用门店，无法提交商品。' }
  let productType = 1
  let typeLabel = '团购'
  const types = await douyin.fetchProductTypes(cat.categoryId)
  if (types.ok && types.types && types.types.length) {
    const hit =
      types.types.find((t) => t.eligible !== false && /团购/.test(t.label)) ||
      types.types.find((t) => t.eligible !== false) ||
      types.types[0]
    if (hit) {
      productType = hit.product_type
      typeLabel = hit.label
    }
  }
  return {
    ok: true,
    categoryId: cat.categoryId,
    categoryName: cat.categoryName,
    productType,
    typeLabel,
    poiIds: pois.map((p) => p.id),
    storeNames: pois.map((p) => p.name).slice(0, 3).join('、'),
  }
}

function sheetFromPlan(plan) {
  const price = Number(plan && plan.suggestedPriceYuan)
  const origin = Number(plan && plan.originYuan)
  const priceText = Number.isFinite(price) && price > 0 ? String(price) : ''
  const originText =
    Number.isFinite(origin) && origin > 0 ? String(origin) : priceText ? String(Math.round(Number(priceText) * 1.2)) : ''
  const lines = ((plan && plan.comboLines) || []).map((x) => String(x || '').trim()).filter(Boolean)
  const today = new Date()
  return {
    slotKey: (plan && plan.slotKey) || 'plan-0',
    productName: String((plan && (plan.productName || plan.slotLabel)) || '').trim(),
    description: String((plan && plan.description) || '').trim(),
    form: {
      originYuan: originText,
      priceYuan: priceText,
      stockQty: '999',
      comboText: lines.join('\n') || String((plan && plan.productName) || '').trim(),
      saleUnlimited: false,
      saleStart: ymd(today),
      saleEnd: ymd(addDays(today, 365)),
      useDays: '360',
      useAllDay: true,
      useTimeStart: '10:00',
      useTimeEnd: '22:00',
      headUrl: '',
      headLocal: '',
    },
  }
}

async function attachSheets(msg) {
  const plans = (msg.preview && msg.preview.productPlans) || []
  const ready = plans.filter((p) => p && p.enrichStatus === 'ready')
  if (!ready.length) return msg
  const uploadSheets = ready.map(sheetFromPlan)
  let uploadContext = { ok: false, message: '正在读取平台类目与门店…' }
  try {
    uploadContext = await resolveDouyinContext(ready[0])
  } catch (e) {
    uploadContext = { ok: false, message: e instanceof Error ? e.message : '读取平台资料失败' }
  }
  const aiLine = uploadContext.ok
    ? `类目 ${uploadContext.categoryName} · ${uploadContext.typeLabel} · 门店 ${uploadContext.storeNames}`
    : uploadContext.message
  const aiRest =
    '使用规则、退款政策、不可用日期、预约、投放渠道、券码、收款方式、到店核销、限购、商品名'
  return Object.assign({}, msg, {
    uploadSheets,
    uploadContext,
    content: `${msg.content}\n\n请确认抖音团购必填：标价、售价、库存、菜品搭配、售卖起止、可使用日期与每日时段、封面图（可留空由 AI 生成）。\nAI 已补充：${aiLine}。其余必填：${aiRest}。`,
  })
}

function downloadToTemp(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('主图下载失败'))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '主图下载失败'))
      },
    })
  })
}

async function ensureHeadUrl(form, productName) {
  let local = String((form && form.headLocal) || '').trim()
  let remote = String((form && form.headUrl) || '').trim()
  if (!local && !remote) {
    const gen = await agent.postAiAgentNativeImage(
      `${productName || '团购商品'} 商品主图，真实摄影，干净背景，不要文字和水印`,
      '',
    )
    const img = String(gen.imageUrl || '').trim()
    if (/^https?:\/\//i.test(img)) remote = img
    else local = img
  }
  if (!local && /^https?:\/\//i.test(remote)) {
    try {
      local = await downloadToTemp(remote)
    } catch (_) {
      if (/^https?:\/\//i.test(remote)) return { ok: true, url: remote, generated: true }
    }
  }
  if (local && !/^https?:\/\//i.test(local)) {
    const up = await douyin.uploadProductImage(local)
    if (!up.ok) return up
    return { ok: true, url: up.url, generated: !form.headLocal && !form.headUrl }
  }
  if (/^https?:\/\//i.test(remote)) return { ok: true, url: remote, generated: false }
  return { ok: false, message: '主图未能生成或上传' }
}

function packageCombo(comboText, originYuan) {
  const lines = String(comboText || '')
    .split(/\n|、|，|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
  const items = (lines.length ? lines : ['套餐内容']).map((name) => ({
    name: name.slice(0, 40),
    count: 1,
    origin_price_yuan: originYuan,
  }))
  return { groups: [{ group_name: '套餐', items }] }
}

async function uploadConfirmed(plan, sheet, platform, uploadContext) {
  const form = (sheet && sheet.form) || {}
  const name = String((sheet && sheet.productName) || (plan && plan.productName) || '').trim()
  const price = Number(form.priceYuan)
  const origin = Number(form.originYuan)
  const stock = Math.floor(Number(form.stockQty))
  const useDays = Math.floor(Number(form.useDays))
  if (!name) return { ok: false, message: '缺少商品名称' }
  if (!Number.isFinite(price) || price <= 0) return { ok: false, message: '请填写大于 0 的售价' }
  if (!Number.isFinite(origin) || origin <= 0) return { ok: false, message: '请填写大于 0 的标价' }
  if (!Number.isFinite(stock) || stock <= 0) return { ok: false, message: '请填写库存' }
  if (!Number.isFinite(useDays) || useDays <= 0) return { ok: false, message: '请填写可使用天数' }

  if (platform !== 'douyin') {
    const head = await ensureHeadUrl(form, name).catch((e) => ({
      ok: false,
      message: e instanceof Error ? e.message : '主图失败',
    }))
    const r = await listing.postGoodsProductSave(platform, {
      mode: 'submit',
      product: {
        product_name: name.slice(0, 40),
        product_desc: String((sheet && sheet.description) || name).slice(0, 500),
        price_yuan: price,
        origin_price_yuan: origin,
        head_image_urls: head.ok ? [head.url] : [],
        sales_info: { stock_qty: stock, stock_limited: true },
        package_combo: packageCombo(form.comboText, origin),
      },
    })
    return r.ok ? { ok: true, productId: r.productId, message: r.message || '已提交平台' } : r
  }

  const ctx = uploadContext && uploadContext.ok ? uploadContext : await resolveDouyinContext(plan)
  if (!ctx.ok) return { ok: false, message: ctx.message || '平台资料不完整' }
  const head = await ensureHeadUrl(form, name)
  if (!head.ok) return head
  const detail = douyin.buildDefaultPayload({
    categoryId: ctx.categoryId,
    productType: ctx.productType,
    productName: name,
    priceYuan: String(price),
    originYuan: String(origin),
    productDesc: String((sheet && sheet.description) || name),
    headUrl: head.url,
    poiIds: ctx.poiIds,
    consumeValidDays: String(useDays),
    afterSalePolicy: 'refund_anytime',
  })
  if (!detail) return { ok: false, message: '商品资料仍不完整，请核对价格与主图' }
  detail.sales_info.stock_limited = true
  detail.sales_info.stock_qty = stock
  detail.package_combo = packageCombo(form.comboText, origin)
  if (!form.saleUnlimited) {
    const start = dayStartUnix(form.saleStart)
    const end = dayEndUnix(form.saleEnd)
    if (start > 0 && end > start) {
      detail.sold_start_time = start
      detail.sold_end_time = end
      detail.sales_info.sale_time_limited = true
      detail.sales_info.sold_start_time = start
      detail.sales_info.sold_end_time = end
    }
  }
  if (form.useAllDay) {
    detail.trade_rules.daily_consume_mode = 'all_day'
    detail.trade_rules.daily_all_day = true
  } else {
    const start = String(form.useTimeStart || '10:00').trim()
    const end = String(form.useTimeEnd || '22:00').trim()
    detail.trade_rules.daily_consume_mode = 'time_slots'
    detail.trade_rules.daily_all_day = false
    detail.trade_rules.daily_time_periods = [{ start, end }]
  }
  const saved = await douyin.saveProduct('submit', detail)
  if (!saved.ok) return saved
  return {
    ok: true,
    productId: saved.product_id,
    message: saved.message || (saved.product_id ? `已提交抖音来客审核（${saved.product_id}）` : '已提交抖音来客'),
    headGenerated: Boolean(head.generated),
  }
}

module.exports = {
  attachSheets,
  uploadConfirmed,
  sheetFromPlan,
}
