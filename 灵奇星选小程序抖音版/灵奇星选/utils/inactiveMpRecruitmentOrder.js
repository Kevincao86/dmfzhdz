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
  if (!mp) return false
  if (isMpOrderDeleted(mp)) return true
  const raw = String(mp.status || '').trim()
  if (raw === 'done' || raw === 'pending_settlement') return true
  return resolveMpSignupExpired(mp, nowMs)
}

function resolveRowEffectiveOrderStatus(row, nowMs) {
  if (row && row.effectiveOrderStatus) return String(row.effectiveOrderStatus)
  const mp = pickMpFromRow(row)
  if (!mp) return 'missing'
  return resolveMpSignupExpired(mp, nowMs) ? 'expired' : String(mp.status || 'open')
}

/** 达人/拍摄/剪辑「已报名」Tab：隐藏商单已删或报名已截止 */
function shouldHideRegisteredApplicationRow(row, nowMs) {
  if (!row) return true
  if (row.mpMissingFromRegistry) return true

  const mp = pickMpFromRow(row)
  const effective = resolveRowEffectiveOrderStatus(row, nowMs)

  if (effective === 'deleted' || effective === 'missing' || effective === 'expired' || effective === 'done') {
    return true
  }
  if (String(row.status || '') === 'deleted' || String(row.status || '') === 'expired') return true
  if (row.statusLabel === '已删除' || row.statusLabel === '已截止' || row.statusLabel === '已完成') return true

  if (mp && isInactiveMpRecruitmentOrder(mp, nowMs)) return true

  if (row.registrySynced && mp && row.applicantOrphaned) return true

  return false
}

/** PR「已发布」Tab：隐藏已删 / 已截止（仍在「已删除」Tab 可见） */
function shouldHidePrPublishedRow(row, nowMs) {
  if (!row) return true
  if (row.isRemovedFromRegistry) return true
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
  resolveRowEffectiveOrderStatus,
  isInactiveMpRecruitmentOrder,
  shouldHideRegisteredApplicationRow,
  shouldHidePrPublishedRow,
}
