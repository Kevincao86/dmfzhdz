/** 云剪招募单：满额/履约/完成 状态（大厅 vs PR 发单展示分离） */
const { isIceMpOrder } = require('./iceOrderDetect.js')
const iceOrderStats = require('./iceOrderStats.js')
const mpOrderStatus = require('./mpOrderStatus.js')
const { parseRecruitCountFromMp } = require('./mpRecruitCount.js')

function isIceRecruitFull(mp) {
  if (!mp || !isIceMpOrder(mp)) return false
  const cap = parseRecruitCountFromMp(mp)
  return iceOrderStats.isIceSlotsFull(mp, cap)
}

function isIceOrderFulfilled(mp) {
  if (!mp || !isIceMpOrder(mp)) return false
  const raw = String(mp.status || '').trim()
  if (raw === 'done' || raw === 'pending_settlement') return true
  const cap = parseRecruitCountFromMp(mp)
  if (cap <= 0) return false
  const { claimed, completed } = iceOrderStats.countIceOrderStats(mp)
  if (claimed < cap) return false
  if (iceOrderStats.getIceVerifyMode(mp) === 'ai') {
    return completed >= cap
  }
  return raw === 'done'
}

function resolveIceHallStatus(mp) {
  const raw = String((mp && mp.status) || 'open').trim() || 'open'
  if (raw === 'done' || raw === 'deleted') return raw
  if (raw === 'pending_settlement') return 'done'
  if (isIceOrderFulfilled(mp)) return 'done'
  if (isIceRecruitFull(mp)) return 'closed'
  if (raw === 'closed') return 'closed'
  return raw
}

function resolveIcePrStatus(mp) {
  const raw = String((mp && mp.status) || 'open').trim() || 'open'
  if (raw === 'done' || raw === 'deleted') return raw
  if (raw === 'pending_settlement') return 'done'
  if (isIceOrderFulfilled(mp)) return 'done'
  if (isIceRecruitFull(mp) || raw === 'collecting' || raw === 'closed') return 'collecting'
  return raw
}

function resolveDisplayStatus(mp, view, deadlineMs, nowMs) {
  if (mp && isIceMpOrder(mp)) {
    return view === 'pr' ? resolveIcePrStatus(mp) : resolveIceHallStatus(mp)
  }
  return mpOrderStatus.resolveEffectiveMpStatus(mp && mp.status, deadlineMs, nowMs)
}

function displayStatusLabel(status, mp, view) {
  if (
    mp &&
    isIceMpOrder(mp) &&
    isIceRecruitFull(mp) &&
    !isIceOrderFulfilled(mp)
  ) {
    if (view === 'pr' && status === 'collecting') return '进行中'
    if (view !== 'pr') return '已收满'
  }
  if (
    view === 'pr' &&
    mp &&
    isIceMpOrder(mp) &&
    status === 'collecting' &&
    isIceRecruitFull(mp) &&
    !isIceOrderFulfilled(mp)
  ) {
    return '进行中'
  }
  return mpOrderStatus.statusLabel(status)
}

function shouldShowIceInHall(mp) {
  if (!mp || !isIceMpOrder(mp)) return false
  const status = resolveIceHallStatus(mp)
  return status !== 'done' && status !== 'deleted'
}

function canPrCompleteIceOrder(mp) {
  if (!mp || !isIceMpOrder(mp)) return false
  if (String(mp.status || '') === 'done') return false
  if (iceOrderStats.getIceVerifyMode(mp) !== 'pr') return false
  const cap = parseRecruitCountFromMp(mp)
  const apps = (Array.isArray(mp.applicants) ? mp.applicants : []).filter(
    (a) => a && iceOrderStats.isIceApplicantClaimed(a),
  )
  if (apps.length < cap) return false
  return apps.every((a) => iceOrderStats.isIceApplicantCompleted(a))
}

function maybeCloseIceWhenFull(mp) {
  if (!mp || !isIceMpOrder(mp)) return mp
  if (isIceRecruitFull(mp) && !isIceOrderFulfilled(mp)) {
    const raw = String(mp.status || 'open')
    if (raw === 'open' || raw === 'collecting') {
      return { ...mp, status: 'closed' }
    }
  }
  return mp
}

module.exports = {
  isIceRecruitFull,
  isIceOrderFulfilled,
  resolveIceHallStatus,
  resolveIcePrStatus,
  resolveDisplayStatus,
  displayStatusLabel,
  shouldShowIceInHall,
  canPrCompleteIceOrder,
  maybeCloseIceWhenFull,
}
