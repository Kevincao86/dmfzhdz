const { isEditTeamIceMpOrder } = require('./iceOrderDetect.js')

/** 从 MP 商单解析招募人数上限（独立模块，避免与 mpOrderIceStatus 循环依赖） */
function parseRecruitCountFromMp(mp) {
  if (mp && mp.recruitCount != null) {
    const n = Number.parseInt(String(mp.recruitCount), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const summary = [mp && mp.merchantRequirements, mp && mp.recruitmentInfo].filter(Boolean).join('\n')
  const pack = String(summary).match(/成片位总数[:：]\s*(\d+)/)
  if (pack) return Math.max(1, Number.parseInt(pack[1], 10) || 1)
  const m = String(summary).match(/招募人数[:：]\s*(\d+)/)
  if (m) return Math.max(1, Number.parseInt(m[1], 10) || 1)
  return 1
}

/** 云剪 / 剪辑云剪：成片位总数（优先 iceVideoSlots 长度） */
function parseIceSlotTotalFromMp(mp) {
  const slots = Array.isArray(mp && mp.iceVideoSlots) ? mp.iceVideoSlots : []
  if (slots.length > 0) return slots.length
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const mode = String(meta.recruitMode || '').trim()
  if (mode === 'edit_ice' || isEditTeamIceMpOrder(mp)) {
    return parseRecruitCountFromMp(mp)
  }
  return parseRecruitCountFromMp(mp)
}

function readNonNegCount(value) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** 站内报名 + 转发原表跳转。大厅若只回了本人报名行，用已经写好的 applicantCount。 */
function resolveApplicantCountFromMp(mp) {
  if (!mp || typeof mp !== 'object') return 0
  const apps = Array.isArray(mp.applicants) ? mp.applicants.length : 0
  const stored = readNonNegCount(mp.applicantCount)
  const clicks = readNonNegCount(mp.formRelayClickCount)
  if (apps > 0) return Math.max(apps + clicks, stored)
  return Math.max(stored, clicks)
}

module.exports = {
  parseRecruitCountFromMp,
  parseIceSlotTotalFromMp,
  resolveApplicantCountFromMp,
}
