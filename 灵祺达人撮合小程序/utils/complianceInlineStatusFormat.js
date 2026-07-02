/**
 * AI 检核结果 → 列表行内展示文案（成片分通道 / 文稿段落）
 */

function formatVideoChannelSummary(res) {
  const summary = String(res.summary || res.message || '').trim()
  if (summary && /口播|字幕|画面/.test(summary)) {
    const body = summary.replace(/^可能违规请注意(审核|修改)[：:]\s*/, '')
    return `AI检测到：${body}`.slice(0, 120)
  }

  const report = res.channelReport
  if (report && typeof report === 'object') {
    const parts = []
    const push = (label, ch) => {
      if (!ch || !ch.checked) return
      if (ch.normal) parts.push(`${label}正常`)
      else {
        const issues = Array.isArray(ch.issues) ? ch.issues : []
        const detail = issues
          .slice(0, 2)
          .map((i) => `${i.timeLabel || ''}「${i.phrase || ''}」`)
          .filter(Boolean)
          .join('、')
        parts.push(detail ? `${label}${detail}` : `${label}有问题`)
      }
    }
    push('口播', report.asr)
    push('字幕', report.subtitle)
    push('画面', report.visual)
    if (parts.length) return `AI检测到：${parts.join('；')}`.slice(0, 120)
  }

  return ''
}

function videoBillingSuffix(res) {
  if (!res || typeof res !== 'object') return ''
  const pts = Number(res.pointsCharged)
  if (!Number.isFinite(pts) || pts <= 0) return ''
  const min = Number(res.videoMinutesBilled)
  const sec = Number(res.durationSec)
  if (Number.isFinite(min) && min > 0) {
    const secPart = Number.isFinite(sec) && sec > 0 ? `（${sec} 秒）` : ''
    return ` · ${min} 分钟${secPart} · 消耗 ${pts} 积分`
  }
  return ` · 消耗 ${pts} 积分`
}

function formatVideoComplianceInline(res) {
  const billing = videoBillingSuffix(res)
  if (!res || res.verdict === 'normal') {
    return { text: `AI检测通过${billing}`.trim(), tone: 'pass' }
  }

  const channelText = formatVideoChannelSummary(res)
  if (channelText) {
    return { text: `${channelText}，请注意修改${billing}`.slice(0, 140), tone: 'warn' }
  }

  const locations = Array.isArray(res.locations) ? res.locations : []
  if (locations.length) {
    const parts = locations
      .slice(0, 3)
      .map((loc) => {
        const phrase = String(loc.phrase || '').trim()
        if (!phrase) return ''
        if (loc.atSec != null && loc.timeLabel) {
          const src =
            loc.source === 'subtitle' ? '字幕' : loc.source === 'asr' ? '口播' : loc.source === 'visual' ? '画面' : ''
          return src ? `${src}${loc.timeLabel}「${phrase}」` : `${loc.timeLabel}「${phrase}」`
        }
        return `「${phrase}」`
      })
      .filter(Boolean)
    if (parts.length) {
      return { text: `AI检测到（${parts.join('、')}）请注意修改`.slice(0, 120), tone: 'warn' }
    }
  }

  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  if (hits.length) {
    return { text: `AI检测到（${hits.slice(0, 2).join('、')}）请注意修改`, tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

function formatScriptComplianceInline(res) {
  if (!res || res.verdict === 'normal') {
    return { text: 'AI检测通过', tone: 'pass' }
  }
  const violations = Array.isArray(res.violations) ? res.violations : []
  if (violations.length) {
    const v = violations[0] || {}
    const excerpt = String(v.excerpt || '').trim()
    const suggestion = String(v.suggestion || '').trim()
    const rule = String(v.rule || '').trim()
    const paragraphNo = typeof v.paragraphNo === 'number' && v.paragraphNo > 0 ? v.paragraphNo : 0
    let text = 'AI检测到可能违规内容'
    if (excerpt) {
      text =
        paragraphNo > 0
          ? `第${paragraphNo}段「${excerpt.slice(0, 16)}」可能违规`
          : `「${excerpt.slice(0, 18)}」可能违规`
    }
    if (suggestion) text += `，建议：${suggestion.slice(0, 24)}`
    else if (rule) text += `（${rule.slice(0, 18)}）`
    return { text: text.slice(0, 80), tone: 'warn' }
  }
  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  const msg = String(res.message || '')
  if (msg && /第\d+段/.test(msg)) {
    return { text: msg.slice(0, 80), tone: 'warn' }
  }
  if (hits.length) {
    return { text: `AI检测到（${hits.slice(0, 2).join('、')}）请注意修改`, tone: 'warn' }
  }
  if (msg && /[\u4e00-\u9fa5]/.test(msg)) {
    return { text: msg.slice(0, 80), tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

module.exports = {
  formatVideoComplianceInline,
  formatScriptComplianceInline,
}
