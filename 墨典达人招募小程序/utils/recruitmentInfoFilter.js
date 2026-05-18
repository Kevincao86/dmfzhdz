/** 招募信息 / 任务详情展示时排除的片段（模式、Brief、预算、桌数等） */
function shouldExcludeRecruitmentSegment(text) {
  const t = String(text || '').trim()
  if (!t) return true
  if (/^(模式|Brief|brief|预算金额)[:：]/i.test(t)) return true
  if (/^(模式|Brief|brief|预算|桌数)[:：]/i.test(t)) return true
  if (/^预算[¥￥]?/i.test(t)) return true
  if (/^预算/i.test(t) && /[¥￥\d/]/.test(t)) return true
  if (/^桌数/.test(t)) return true
  if (/^【[^】]*AI[^】]*】/.test(t) && /模式|Brief|预算|桌数/.test(t)) return true
  return false
}

function shouldShowRecruitmentInfoLine(line) {
  return !shouldExcludeRecruitmentSegment(line)
}

/** 按换行、分号拆段后过滤（招募信息列表、任务详情列表共用） */
function explodeAndFilterDisplayLines(text) {
  return String(text || '')
    .split(/[\n\r；;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !shouldExcludeRecruitmentSegment(s))
}

function filterRecruitmentInfoLines(lines) {
  return (lines || []).map((l) => String(l).trim()).filter((l) => shouldShowRecruitmentInfoLine(l))
}

function filterRecruitmentInfoText(text) {
  return explodeAndFilterDisplayLines(text).join('\n')
}

function filterTaskDetailText(text) {
  return explodeAndFilterDisplayLines(text).join('\n')
}

function normalizeRecruitmentPlatform(raw) {
  const s = String(raw || '').trim()
  if (s.includes('红')) return '小红书'
  return '抖音'
}

module.exports = {
  shouldExcludeRecruitmentSegment,
  shouldShowRecruitmentInfoLine,
  explodeAndFilterDisplayLines,
  filterRecruitmentInfoLines,
  filterRecruitmentInfoText,
  filterTaskDetailText,
  normalizeRecruitmentPlatform,
}
