/**
 * 已删除 / 报名已截止的商单：在「已报名」「PR 已发布」等列表自动隐藏
 */
const listFilters = require('./recruitmentListFilters.js')
const mpOrderIce = require('./mpOrderIceStatus.js')

function pickMpFromRow(row) {
  if (!row) return null
  return row.progressMp || row._progressMp || row.mp || null
}

function isMpOrderDeleted(mp) {
  if (!mp) return false
  return String(mp.status || '').trim() === 'deleted'
}

function resolveMpSignupExpired(mp, nowMs) {
  if (!mp || isMpOrderDeleted(mp)) return false
  const summary = [mp.merchantRequirements, mp.recruitmentInfo, mp.taskDetail].filter(Boolean).join('\n')
  const deadlineMs = listFilters.resolveDeadlineMs(mp, summary)
  const status = mpOrderIce.resolveDisplayStatus(mp, 'hall', deadlineMs, nowMs)
  return status === 'expired'
}

function isInactiveMpRecruitmentOrder(mp, nowMs) {
  return isMpOrderDeleted(mp) || resolveMpSignupExpired(mp, nowMs)
}

/** 达人/拍摄/剪辑「已报名」Tab：隐藏商单已删或报名已截止 */
function shouldHideRegisteredApplicationRow(row, nowMs) {
  const mp = pickMpFromRow(row)
  if (!mp) return false
  return isInactiveMpRecruitmentOrder(mp, nowMs)
}

/** PR「已发布」Tab：隐藏已删 / 已截止（仍在「已删除」Tab 可见） */
function shouldHidePrPublishedRow(row, nowMs) {
  if (!row) return true
  if (row.isDeleted || row.deletedAt) return true
  if (String(row.status || '') === 'deleted' || row.statusLabel === '已删除') return true
  const mp = pickMpFromRow(row)
  if (mp && isMpOrderDeleted(mp)) return true
  if (String(row.status || '') === 'expired' || row.statusLabel === '已截止') return true
  const deadlineMs = Number(row.deadlineMs) || 0
  const now = nowMs != null && Number.isFinite(nowMs) ? nowMs : Date.now()
  if (deadlineMs > 0 && now >= deadlineMs) {
    const raw = String(row.status || (mp && mp.status) || 'open')
    if (raw === 'open' || raw === 'collecting') return true
  }
  if (mp && resolveMpSignupExpired(mp, now)) return true
  return false
}

module.exports = {
  pickMpFromRow,
  isMpOrderDeleted,
  resolveMpSignupExpired,
  isInactiveMpRecruitmentOrder,
  shouldHideRegisteredApplicationRow,
  shouldHidePrPublishedRow,
}
