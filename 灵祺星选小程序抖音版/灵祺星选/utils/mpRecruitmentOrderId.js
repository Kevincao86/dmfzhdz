/** 12 位时间后缀（÷10ms），分享文案「招募单号：MP-RO-…」不易在微信换行 */
function mpOrderTimeSuffix(nowMs) {
  return Math.floor(Number(nowMs != null ? nowMs : Date.now()) / 10)
}

function buildMpRecruitmentOrderId(kind, nowMs) {
  const k = String(kind || 'RO').trim().toUpperCase() || 'RO'
  return `MP-${k}-${mpOrderTimeSuffix(nowMs)}`
}

/** 从 MP-RO-178099398735 等单号后缀反推创建时间（÷10ms） */
function resolveCreatedMsFromMpId(id) {
  const s = String(id || '').trim()
  const m = s.match(/^MP-(?:RO|ICE|USER)-(\d{10,13})$/i)
  if (!m) return 0
  const suffix = Number(m[1])
  if (!Number.isFinite(suffix) || suffix <= 0) return 0
  const ms = suffix >= 1e12 ? suffix : suffix * 10
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

module.exports = {
  mpOrderTimeSuffix,
  buildMpRecruitmentOrderId,
  resolveCreatedMsFromMpId,
}
