/** 钱包 — 积分换算与展示 */
const POINTS_PER_YUAN = 50
const BRIEF_POINTS_COST = 8

function centsToYuan(cents) {
  const n = Number(cents) || 0
  return (n / 100).toFixed(2)
}

function centsToPoints(cents) {
  const yuan = (Number(cents) || 0) / 100
  return Math.round(yuan * POINTS_PER_YUAN)
}

function formatPoints(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0))
  return v.toLocaleString('zh-CN')
}

module.exports = {
  POINTS_PER_YUAN,
  BRIEF_POINTS_COST,
  centsToYuan,
  centsToPoints,
  formatPoints,
}
