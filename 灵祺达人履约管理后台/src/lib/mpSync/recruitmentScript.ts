import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { clearMpRegistryCache } from '../mpApi'

async function postMp(paths: string[], body: Record<string, unknown>) {
  let lastErr = 'request_failed'
  for (const path of paths) {
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

export function scriptStatusLabel(status?: string): string {
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回待重新提交'
  if (status === 'pending') return '待审核'
  if (status === 'draft') return '待达人提交'
  return ''
}

export function isApplicantScriptVisibleOnPrReview(a: Record<string, unknown> | null | undefined): boolean {
  if (!a) return false
  const status = String(a.scriptStatus || '').trim()
  if (status === 'draft') return false
  if (status === 'rejected') return true
  const url = String(a.scriptUrl || a.scriptLinkUrl || '').trim()
  return !!url
}

export function submitCountLabel(count?: number): string {
  const n = Math.max(1, Number(count || 0) || 1)
  return `第 ${n} 次提交`
}

export async function reviewRecruitmentScript(
  mpOrderId: string,
  applicantId: string,
  action: 'pass' | 'reject',
  rejectReason?: string,
) {
  const data = await postMp(['/api/meoo-ops-mp-recruitment-script-review'], {
    mpOrderId,
    applicantId,
    action,
    rejectReason: action === 'reject' ? String(rejectReason || '').trim() : undefined,
  })
  clearMpRegistryCache()
  return data
}

export async function readScriptTextForAi(scriptUrl?: string, scriptLinkUrl?: string): Promise<string> {
  const link = String(scriptLinkUrl || '').trim()
  if (link) return ''
  const url = String(scriptUrl || '').trim()
  if (!url) return ''
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const text = await res.text()
    return text.slice(0, 12000)
  } catch {
    return ''
  }
}
