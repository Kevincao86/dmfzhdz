/** 12 位时间后缀（÷10ms），分享文案「招募单号：MP-RO-…」不易在微信换行 */
function mpOrderTimeSuffix(nowMs) {
  return Math.floor(Number(nowMs != null ? nowMs : Date.now()) / 10)
}

function buildMpRecruitmentOrderId(kind, nowMs) {
  const k = String(kind || 'RO').trim().toUpperCase() || 'RO'
  return `MP-${k}-${mpOrderTimeSuffix(nowMs)}`
}

module.exports = {
  mpOrderTimeSuffix,
  buildMpRecruitmentOrderId,
}
