/** 抖音 CPS 定向计划 — 前后端共用字段转换 */

function douyinCpsCommissionRateFromPct(pct) {
  const n = Math.max(0, Math.min(80, Number(pct) || 0))
  return Math.round(n * 100)
}

function extractDouyinTalentId(applicant) {
  const raw = String((applicant && applicant.platformAccount) || '').trim()
  if (raw && isLikelyDouyinTalentId(raw)) return raw
  return ''
}

function isLikelyDouyinTalentId(raw) {
  const s = String(raw || '').trim()
  if (s.length < 2 || s.length > 64) return false
  if (/[\u4e00-\u9fff]/.test(s)) return false
  if (/\s/.test(s)) return false
  return /^[A-Za-z0-9._-]+$/.test(s)
}

function douyinCpsPlanNameFromRecruitment(name, orderId) {
  const base = String(name || '').trim() || `招募${String(orderId || '').slice(-6)}`
  return base.length <= 20 ? base : base.slice(0, 20)
}

function douyinCpsPlanTimeRangeSec(meta) {
  const nowSec = Math.floor(Date.now() / 1000)
  const parse = (v) => {
    const s = String(v || '').trim()
    if (!s) return null
    const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'))
    if (!Number.isFinite(t)) return null
    return Math.floor(t / 1000)
  }
  let start = parse(meta && meta.visitStart) || parse(meta && meta.recruitStart) || nowSec + 3600
  let end = parse(meta && meta.visitEnd) || parse(meta && meta.recruitEnd) || start + 30 * 86400
  if (end <= start) end = start + 30 * 86400
  if (start < nowSec) start = nowSec + 3600
  return { startSec: start, endSec: end }
}

function parseOrientedPlanTalentDetailPayload(upstream) {
  if (!upstream || typeof upstream !== 'object') return {}
  const root = upstream
  const data = root.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) return data.data
    const keys = Object.keys(data)
    if (keys.length && keys.every((k) => data[k] && typeof data[k] === 'object')) return data
  }
  return {}
}

function cpsTalentDetailRowsFromMap(map) {
  return Object.entries(map || {}).map(([douyinId, v]) => ({
    douyinId,
    gmv: numOrUndef(v.gmv),
    usedGmv: numOrUndef(v.used_gmv),
    talentCommission: numOrUndef(v.talent_commission),
    liveCnt: numOrUndef(v.live_cnt),
    shortVideoCnt: numOrUndef(v.short_video_cnt),
  }))
}

function numOrUndef(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

module.exports = {
  douyinCpsCommissionRateFromPct,
  extractDouyinTalentId,
  isLikelyDouyinTalentId,
  douyinCpsPlanNameFromRecruitment,
  douyinCpsPlanTimeRangeSec,
  parseOrientedPlanTalentDetailPayload,
  cpsTalentDetailRowsFromMap,
}
