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

module.exports = {
  loadPrRecruitOrderPickerRows,
  filterRecruitOrders,
  buildContextProductName,
  buildTitleDraftFromOrder,
}
