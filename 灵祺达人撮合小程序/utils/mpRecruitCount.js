/** 从 MP 商单解析招募人数上限（独立模块，避免与 mpOrderIceStatus 循环依赖） */
function parseRecruitCountFromMp(mp) {
  if (mp && mp.recruitCount != null) {
    const n = Number.parseInt(String(mp.recruitCount), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const summary = [mp && mp.merchantRequirements, mp && mp.recruitmentInfo].filter(Boolean).join('\n')
  const m = String(summary).match(/招募人数[:：]\s*(\d+)/)
  if (m) return Math.max(1, Number.parseInt(m[1], 10) || 1)
  return 1
}

module.exports = {
  parseRecruitCountFromMp,
}
