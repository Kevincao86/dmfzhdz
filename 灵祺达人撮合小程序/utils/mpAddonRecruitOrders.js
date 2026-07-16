const ops = require('./opsRegistryTalentMp.js')
const prPublishedOrders = require('./prPublishedOrders.js')
const orderHighlightTag = require('./orderHighlightTag.js')
const orderCard = require('./recruitmentOrderCard.js')
const prWorkflow = require('./prOrderWorkflowStage.js')
const inactiveOrder = require('./inactiveMpRecruitmentOrder.js')

function normalizePlatform(mp) {
  return String((mp && (mp.platform || mp.recruitmentPlatform)) || '抖音').trim() || '抖音'
}

function buildOrderPickerRow(mp, reg) {
  const row = orderCard.mapMpOrderRow(mp, reg || {})
  const recruitContent = orderHighlightTag.buildRecruitContentForAi(mp)
  return {
    id: String(mp.id || '').trim(),
    title: String(row.title || mp.title || mp.id || '').trim(),
    platform: normalizePlatform(mp),
    region: String(row.region || mp.region || '').trim(),
    category: String(row.category || '本地生活').trim(),
    statusLabel: String(row.statusLabel || '').trim(),
    recruitContent,
    searchText: [
      mp.id,
      row.title,
      row.merchantName,
      row.storeName,
      row.region,
      row.category,
      mp.merchantRequirements,
      mp.recruitmentInfo,
      mp.taskDetail,
    ]
      .join(' ')
      .toLowerCase(),
  }
}

function isPublishedRecruitingOrder(mp, reg) {
  if (!mp || !mp.id) return false
  if (String(mp.status) === 'deleted') return false
  if (String(mp.status) === 'closed') return false
  if (!prWorkflow.matchPrOrdersTab('published', mp)) return false
  const row = orderCard.mapMpOrderRow(mp, reg || {})
  if (row.deletedAt || row.isDeleted) return false
  if (row.status === 'closed' || row.statusLabel === '已停止') return false
  if (inactiveOrder.shouldHidePrPublishedRow(row)) return false
  return true
}

async function loadPrRecruitOrderPickerRows() {
  const reg = await ops.fetchRegistry({ includePrOwned: true, includeLocalContext: true })
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const ownedIds = new Set(
    prPublishedOrders.listPublishedOrdersForCurrentPr(mpList).map((x) => String(x.mpOrderId || '').trim()),
  )
  const rows = []
  const seen = new Set()
  mpList.forEach((mp) => {
    if (!mp || typeof mp !== 'object') return
    const id = String(mp.id || '').trim()
    if (!id || seen.has(id) || !ownedIds.has(id)) return
    if (!isPublishedRecruitingOrder(mp, reg)) return
    seen.add(id)
    rows.push(buildOrderPickerRow(mp, reg))
  })
  return rows.sort((a, b) => String(b.id).localeCompare(String(a.id)))
}

function filterRecruitOrders(rows, keyword) {
  const q = String(keyword || '').trim().toLowerCase()
  if (!q) return rows || []
  return (rows || []).filter((r) => r.searchText.includes(q))
}

function buildContextProductName(order) {
  if (!order) return '抖音；招募订单：（未选择）'
  return `${order.platform}；招募订单：${order.title || order.id}；区域：${order.region || '—'}；品类：${order.category || '—'}`
}

function buildTitleDraftFromOrder(order, mode, extra) {
  const base = String(order && order.recruitContent ? order.recruitContent : '').trim()
  const hint = String(extra || '').trim()
  if (mode === 'article') {
    return [
      '请根据下列招募订单实际情况，撰写适合抖音发布的图文稿件（标题+正文结构，口语化、可转化）。',
      hint ? `补充要点：${hint}` : '',
      '',
      base || '（订单详情为空，请结合标题与品类发挥）',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (mode === 'topic') {
    return [
      '请根据下列招募订单实际情况，推荐 5–8 条本周短视频选题（每条含标题+一句话卖点）。',
      hint ? `经营侧重：${hint}` : '',
      '',
      base || '（订单详情为空，请结合标题与品类发挥）',
    ]
      .filter(Boolean)
      .join('\n')
  }
  if (mode === 'brief') {
    return [
      '请根据下列招募订单，输出云剪用的「剪辑指令」与「上屏字幕文案」。',
      '必须严格按两行标题分段：',
      '【剪辑指令】',
      '（BGM、节奏、转场、色调等，不上屏）',
      '【字幕文案】',
      '（4-20字短句，与镜头对应）',
      hint ? `补充说明：${hint}` : '',
      '',
      base,
    ]
      .filter(Boolean)
      .join('\n')
  }
  return base
}

/** 达人侧：仅本账号已报名（未撤报）的订单，不是大厅全量在招商单 */
async function loadTalentRecruitOrderPickerRows() {
  const applicationsStore = require('./applicationsStore.js')
  const appRegistrySync = require('./applicationsRegistrySync.js')
  let reg = null
  try {
    reg = await appRegistrySync.fetchRegistryAndReconcileApplications({ includeLocalContext: true })
  } catch (_) {
    try {
      reg = await ops.fetchRegistry({ includeLocalContext: true })
    } catch (__) {
      reg = null
    }
  }
  const apps = applicationsStore
    .readApplications()
    .filter((a) => a && String(a.mpOrderId || '').trim() && !String(a.withdrawnAt || '').trim())
  const appliedIds = []
  const seenApp = new Set()
  apps.forEach((a) => {
    const id = String(a.mpOrderId || '').trim()
    if (!id || seenApp.has(id)) return
    seenApp.add(id)
    appliedIds.push(id)
  })
  const mpList = Array.isArray(reg && reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const byId = new Map()
  mpList.forEach((mp) => {
    if (!mp || typeof mp !== 'object') return
    const id = String(mp.id || '').trim()
    if (id) byId.set(id, mp)
  })
  const rows = []
  const seen = new Set()
  appliedIds.forEach((id) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    const mp = byId.get(id)
    if (mp) {
      if (String(mp.status) === 'deleted') return
      rows.push(buildOrderPickerRow(mp, reg || {}))
      return
    }
    const app = apps.find((a) => String(a.mpOrderId || '').trim() === id)
    rows.push({
      id,
      title: String((app && app.title) || id).trim() || id,
      platform: String((app && app.platform) || '抖音').trim() || '抖音',
      region: '',
      category: '本地生活',
      statusLabel: '已报名',
      recruitContent: String((app && app.title) || id).trim(),
      searchText: [id, app && app.title, app && app.platform].join(' ').toLowerCase(),
    })
  })
  return rows.sort((a, b) => String(b.id).localeCompare(String(a.id)))
}

async function loadRecruitOrderPickerRowsForIdentity(identity) {
  if (identity === 'pr') return loadPrRecruitOrderPickerRows()
  return loadTalentRecruitOrderPickerRows()
}

module.exports = {
  loadPrRecruitOrderPickerRows,
  loadTalentRecruitOrderPickerRows,
  loadRecruitOrderPickerRowsForIdentity,
  filterRecruitOrders,
  buildContextProductName,
  buildTitleDraftFromOrder,
}
