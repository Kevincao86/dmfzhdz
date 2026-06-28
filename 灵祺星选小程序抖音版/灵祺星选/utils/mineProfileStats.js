const applicationsStore = require('./applicationsStore.js')
const auth = require('./auth.js')
const prPublishedOrders = require('./prPublishedOrders.js')
const prWorkflow = require('./prOrderWorkflowStage.js')
const listFilters = require('./recruitmentListFilters.js')

function computeTalentStats() {
  const apps = applicationsStore.readApplications()
  let inProgress = 0
  let completed = 0
  for (const a of apps) {
    const pid = String(a.progressId || '').trim()
    if (pid === 'completed') completed += 1
    else if (pid === 'in_progress') inProgress += 1
    else if (a.applicantId) inProgress += 1
  }
  return {
    statApplied: apps.length,
    statInProgress: inProgress,
    statCompleted: completed,
    statAppliedLabel: '已报名',
    statInProgressLabel: '进行中',
    statCompletedLabel: '已完成',
  }
}

function computePrStatsFromOrders(localOrders, mpList, account) {
  const mpById = new Map()
  ;(mpList || []).forEach((mp) => {
    const id = String(mp && mp.id ? mp.id : '').trim()
    if (id) mpById.set(id, mp)
  })

  const merged = account
    ? prPublishedOrders.mergePublishedOrdersFromRegistry(localOrders, mpList, account)
    : (localOrders || []).filter((o) => o && !o.deletedAt)

  let statApplied = 0
  let statInProgress = 0
  let statCompleted = 0

  for (const item of merged) {
    if (!item || item.deletedAt) continue
    const mp = mpById.get(String(item.mpOrderId || '').trim()) || null
    const row = listFilters.enrichMpOrderListItem(mp, item)
    statApplied += 1
    if (row.status === 'closed' || row.statusLabel === '已停止') continue
    const stage = prWorkflow.resolvePrWorkflowStage(mp)
    if (stage === 'completed') statCompleted += 1
    else statInProgress += 1
  }

  return {
    statApplied,
    statInProgress,
    statCompleted,
    statAppliedLabel: '已发单',
    statInProgressLabel: '招募中',
    statCompletedLabel: '已完结',
  }
}

function computePrStats() {
  return computePrStatsFromOrders(applicationsStore.readPublishedOrders(), [], auth.readAccount())
}

async function loadPrStatsAsync() {
  const api = require('./api.js')
  if (!api.hasApi()) return computePrStats()
  try {
    const ops = require('./opsRegistryTalentMp.js')
    const account = auth.readAccount()
    const reg = await ops.fetchRegistry({ includePrOwned: true })
    const mpList = reg.mpRecruitmentOrders || []
    prPublishedOrders.pruneOrphanPublishedOrders(mpList)
    const local = prPublishedOrders.listPublishedOrdersForCurrentPr(mpList)
    return computePrStatsFromOrders(local, mpList, account)
  } catch (_) {
    return computePrStats()
  }
}

function computeMineStats(identity) {
  if (identity === 'pr') return computePrStats()
  return computeTalentStats()
}

module.exports = { computeMineStats, loadPrStatsAsync }
