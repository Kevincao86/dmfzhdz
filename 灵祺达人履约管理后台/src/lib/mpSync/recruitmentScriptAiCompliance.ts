import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'

const API_PATHS = ['/api/meoo-mp-recruitment-script-compliance']

export type ScriptAiInlineStatus = {
  text: string
  tone: 'checking' | 'pass' | 'warn' | ''
}

export type ScriptCompliancePayload = {
  mpOrderId: string
  applicantId: string
  platform?: string
  orderTitle?: string
  recruitmentInfo?: string
  merchantRequirements?: string
  taskDetail?: string
  category?: string
  region?: string
  applicantName?: string
  scriptUrl?: string
  scriptLinkUrl?: string
  scriptText?: string
}

async function postCompliance(body: ScriptCompliancePayload) {
  let lastErr = 'request_failed'
  for (const path of API_PATHS) {
    try {
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
        },
        body: JSON.stringify(body),
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

export function getCheckingInlineStatus(): ScriptAiInlineStatus {
  return { text: 'AI检核中', tone: 'checking' }
}

export function formatInlineStatus(res: Record<string, unknown> | null | undefined): ScriptAiInlineStatus {
  if (!res || res.verdict === 'normal') {
    return { text: 'AI检测通过', tone: 'pass' }
  }
  const violations = Array.isArray(res.violations)
    ? (res.violations as Array<Record<string, unknown>>)
    : []
  if (violations.length) {
    const v = violations[0] || {}
    const excerpt = String(v.excerpt || '').trim()
    const suggestion = String(v.suggestion || '').trim()
    const rule = String(v.rule || '').trim()
    let text = 'AI检测到可能违规内容'
    if (excerpt) text = `「${excerpt.slice(0, 18)}」可能违规`
    if (suggestion) text += `，建议：${suggestion.slice(0, 28)}`
    else if (rule) text += `（${rule.slice(0, 20)}）`
    return { text: text.slice(0, 48), tone: 'warn' }
  }
  const hits = Array.isArray(res.hits) ? res.hits.map((h) => String(h).trim()).filter(Boolean) : []
  const msg = String(res.message || '')
  if (hits.length) {
    const words = hits.slice(0, 2).join('、')
    return { text: `AI检测到（${words}）请注意修改`, tone: 'warn' }
  }
  if (msg && /[\u4e00-\u9fa5]/.test(msg)) {
    return { text: msg.slice(0, 48), tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

export async function checkScriptCompliance(payload: ScriptCompliancePayload) {
  return postCompliance(payload)
}
