import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'

const API_PATHS = ['/api/meoo-mp-recruitment-video-compliance']

export type VideoAiInlineStatus = {
  text: string
  tone: 'checking' | 'pass' | 'warn' | ''
}

export type VideoCompliancePayload = {
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
  videoUrl?: string
  douyinPublishUrl?: string
}

async function postCompliance(body: VideoCompliancePayload) {
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

export function getCheckingInlineStatus(): VideoAiInlineStatus {
  return { text: 'AI检核中', tone: 'checking' }
}

export function formatInlineStatus(res: Record<string, unknown> | null | undefined): VideoAiInlineStatus {
  if (!res || res.verdict === 'normal') {
    return { text: 'AI检测通过', tone: 'pass' }
  }
  const hits = Array.isArray(res.hits)
    ? res.hits.map((h) => String(h).trim()).filter(Boolean)
    : []
  const msg = String(res.message || '')
  const secMatch = msg.match(/(\d+)\s*秒/)
  if (secMatch) {
    return {
      text: `AI检测到（视频${secMatch[1]}秒处出现违禁词）请注意修改`,
      tone: 'warn',
    }
  }
  if (hits.length) {
    const words = hits.slice(0, 2).join('、')
    return { text: `AI检测到（${words}）请注意修改`, tone: 'warn' }
  }
  return { text: 'AI检测到可能违规内容，请注意修改', tone: 'warn' }
}

export async function checkVideoCompliance(payload: VideoCompliancePayload) {
  return postCompliance(payload)
}
