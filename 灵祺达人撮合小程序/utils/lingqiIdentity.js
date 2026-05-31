const TALENT_ID_RE = /^LQ-D-(\d+)$/i
const PR_ID_RE = /^LQ-P-(\d+)$/i

function isTalentId(id) {
  return TALENT_ID_RE.test(String(id || '').trim())
}

function isPrId(id) {
  return PR_ID_RE.test(String(id || '').trim())
}

function formatTalentIdLabel(id) {
  const v = String(id || '').trim()
  return v && isTalentId(v) ? `达人ID：${v.toUpperCase()}` : ''
}

function formatPrIdLabel(id) {
  const v = String(id || '').trim()
  return v && isPrId(v) ? `PRID：${v.toUpperCase()}` : ''
}

/** 本地预览用；正式 ID 以服务端注册返回为准 */
function provisionalTalentId(member) {
  if (member && isTalentId(member.lingqiTalentId)) return member.lingqiTalentId
  if (member && member.id) return `LQ-D-${String(member.id).replace(/\D/g, '').slice(-6).padStart(6, '0')}`
  return ''
}

module.exports = {
  isTalentId,
  isPrId,
  formatTalentIdLabel,
  formatPrIdLabel,
  provisionalTalentId,
}
