import { readMpSessionToken } from '../lib/merchantApiAuth'
import { readMpBillingRoleHint } from '../lib/mpBillingRoleHint'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'

export type ComplianceInlineStatus = {
  text: string
  tone: 'checking' | 'pass' | 'warn' | ''
}

async function postCompliance(path: string, body: Record<string, unknown>) {
  const token = readMpSessionToken()
  if (!token) throw new Error('请先登录后再使用 AI 检核')
  const billingRole = readMpBillingRoleHint()
  let lastErr = 'request_failed'
  for (const url of merchantApiFetchUrls(path)) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Mp-Session': token,
        },
        body: JSON.stringify({
          ...body,
          sessionToken: token,
          token,
          ...(billingRole ? { billingRole } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        lastErr = String(data.message || data.detail || data.error || `http_${res.status}`)
        if (/404|not_found/i.test(lastErr)) continue
        throw new Error(lastErr)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  throw new Error(lastErr)
}

export function getCheckingInlineStatus(): ComplianceInlineStatus {
  return { text: 'AI检核中', tone: 'checking' }
}

export function formatScriptComplianceInline(res: Record<string, unknown> | null | undefined): ComplianceInlineStatus {
  if (!res || res.verdict === 'normal') return { text: 'AI检测通过', tone: 'pass' }
  const violations = Array.isArray(res.violations) ? res.violations : []
  if (violations.length) {
    const v = (violations[0] || {}) as Record<string, unknown>
    const excerpt = String(v.excerpt || '').trim()
    const suggestion = String(v.suggestion || '').trim()
    const paragraphNo = typeof v.paragraphNo === 'number' && v.paragraphNo > 0 ? v.paragraphNo : 0
    let text = 'AI检测到可能违规内容'
    if (excerpt) {
      text = paragraphNo > 0 ? `第${paragraphNo}段「${excerpt.slice(0, 16)}」可能违规` : `「${excerpt.slice(0, 18)}」可能违规`
    }
    if (suggestion) text += `，建议：${suggestion.slice(0, 24)}`
    return { text: text.slice(0, 80), tone: 'warn' }
  }
  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  if (hits.length) return { text: `AI检测到（${hits.slice(0, 2).join('、')}）请注意修改`, tone: 'warn' }
  const msg = String(res.message || '')
  if (msg && /[\u4e00-\u9fa5]/.test(msg)) return { text: msg.slice(0, 80), tone: 'warn' }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

export function formatVideoComplianceInline(res: Record<string, unknown> | null | undefined): ComplianceInlineStatus {
  const billing = String(
    typeof res?.pointsCharged === 'number' && res.pointsCharged > 0 ? ` · 消耗 ${res.pointsCharged} 积分` : '',
  )
  if (!res || res.verdict === 'normal') return { text: `AI检测通过${billing}`.trim(), tone: 'pass' }

  const summary = String(res.summary || res.message || '').trim()
  if (summary && /口播|字幕|画面/.test(summary)) {
    const body = summary.replace(/^可能违规请注意(审核|修改)[：:]\s*/, '')
    return { text: `AI检测到：${body}${billing}`.slice(0, 200), tone: 'warn' }
  }

  const violations = Array.isArray(res.violations) ? res.violations : []
  if (violations.length) {
    const v = (violations[0] || {}) as Record<string, unknown>
    const excerpt = String(v.excerpt || '').trim()
    const suggestion = String(v.suggestion || '').trim()
    const channel =
      v.channel === 'asr' ? '口播' : v.channel === 'subtitle' ? '字幕' : v.channel === 'visual' ? '画面' : ''
    const time = String(v.timeLabel || '').trim()
    let line = excerpt ? `「${excerpt.slice(0, 16)}」` : '可能违规内容'
    if (channel && time && time !== '—') line = `${channel}${time}${line}`
    if (suggestion) {
      const alts = /^「/.test(suggestion) ? suggestion : `「${suggestion}」`
      line += `→${alts.slice(0, 28)}`
    }
    const extra = violations.length > 1 ? ` 等${violations.length}处` : ''
    return { text: `AI检测到：${line}${extra}${billing}`.slice(0, 120), tone: 'warn' }
  }

  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  if (hits.length) return { text: `AI检测到（${hits.slice(0, 2).join('、')}）请注意修改${billing}`.slice(0, 120), tone: 'warn' }
  const msg = String(res.message || res.summary || '')
  if (msg) return { text: `${msg.slice(0, 100)}${billing}`, tone: 'warn' }
  return { text: `AI检测到可能违规内容，请注意修改${billing}`, tone: 'warn' }
}

export async function checkScriptCompliance(payload: Record<string, unknown>) {
  return postCompliance('/api/meoo-mp-recruitment-script-compliance', payload)
}

export async function checkVideoCompliance(payload: Record<string, unknown>) {
  return postCompliance('/api/meoo-mp-recruitment-video-compliance', payload)
}
