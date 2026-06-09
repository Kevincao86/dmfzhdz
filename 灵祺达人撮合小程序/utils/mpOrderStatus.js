/** 小程序/大厅共用：招募单有效状态（含截止自动已完成） */
const MP_STATUS_LABEL = {
  open: '招募中',
  collecting: '收集中',
  closed: '已停止',
  done: '已完成',
}

const HALL_STATUS_FILTERS = ['全部', '招募中', '收集中', '已停止', '已完成']

function resolveEffectiveMpStatus(rawStatus, deadlineMs, nowMs) {
  const now = nowMs != null && Number.isFinite(nowMs) ? nowMs : Date.now()
  let raw = String(rawStatus || 'open').trim() || 'open'
  if (raw === 'pending_settlement') raw = 'closed'
  if (raw === 'closed' || raw === 'done') return raw
  if (deadlineMs && Number(deadlineMs) > 0 && now >= Number(deadlineMs)) return 'done'
  return raw
}

function statusLabel(status) {
  return MP_STATUS_LABEL[status] || String(status || '')
}

function isMpOrderRecruiting(status) {
  return status === 'open' || status === 'collecting'
}

function isHallRecruitingVisible(status) {
  return status === 'open' || status === 'collecting'
}

module.exports = {
  MP_STATUS_LABEL,
  HALL_STATUS_FILTERS,
  resolveEffectiveMpStatus,
  statusLabel,
  isMpOrderRecruiting,
  isHallRecruitingVisible,
}
