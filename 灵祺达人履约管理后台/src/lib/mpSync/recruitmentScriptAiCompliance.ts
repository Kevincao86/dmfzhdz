import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { formatScriptComplianceInline, type VideoAiInlineStatus } from './complianceInlineStatusFormat'

const API_PATHS = ['/api/meoo-mp-recruitment-script-compliance']

export type ScriptAiInlineStatus = VideoAiInlineStatus

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
  return formatScriptComplianceInline(res)
}

export async function checkScriptCompliance(payload: ScriptCompliancePayload) {
  return postCompliance(payload)
}
