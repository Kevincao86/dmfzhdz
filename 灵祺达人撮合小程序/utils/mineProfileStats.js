const applicationsStore = require('./applicationsStore.js')

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
    statEarnings: '—',
    statAppliedLabel: '已报名',
    statInProgressLabel: '进行中',
    statCompletedLabel: '已完成',
    statEarningsLabel: '累计收益',
  }
}

function computePrStats() {
  const orders = applicationsStore.readPublishedOrders()
  const active = orders.filter((o) => o && !o.deletedAt).length
  return {
    statApplied: active,
    statInProgress: orders.filter((o) => o && !o.deletedAt && !o.completedAt).length,
    statCompleted: orders.filter((o) => o && o.completedAt).length,
    statEarnings: '—',
    statAppliedLabel: '已发单',
    statInProgressLabel: '招募中',
    statCompletedLabel: '已完结',
    statEarningsLabel: '转化概况',
  }
}

function computeMineStats(identity) {
  if (identity === 'pr') return computePrStats()
  return computeTalentStats()
}

module.exports = { computeMineStats }
