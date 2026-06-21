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
  if (/^商家订单|^ERP|^MO-|linkedMp|infoSummary|talentId|管控台|注册表/i.test(t)) return true
  if (/sourceMerchant|merchantOrderId/i.test(t)) return true
  return false
}

/** 是否运营/商家后台同步的小程序单（非 PR 在小程序内发布） */
function isMerchantSyncedMpOrder(mp) {
  if (!mp || typeof mp !== 'object') return false
  if (mp.publisherIdentity === 'pr') return false
  if (mp.publisherIdentity === 'merchant') return true
  const sid = String(mp.sourceMerchantOrderId || '').trim()
  if (!sid) return false
  return !/^MP-(RO|ICE|USER)-/i.test(sid)
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
  if (!s) return '抖音'
  if (s.includes('红') || s.includes('小红书')) return '小红书'
  if (s.includes('点评') || s.includes('大众')) return '大众点评'
  if (s.includes('快手')) return '快手'
  if (s.includes('视频号')) return '微信视频号'
  if (s.includes('美团')) return '美团'
  if (s.includes('抖')) return '抖音'
  return s
}

module.exports = {
  shouldExcludeRecruitmentSegment,
  shouldShowRecruitmentInfoLine,
  explodeAndFilterDisplayLines,
  filterRecruitmentInfoLines,
  filterRecruitmentInfoText,
  filterTaskDetailText,
  normalizeRecruitmentPlatform,
  isMerchantSyncedMpOrder,
}
