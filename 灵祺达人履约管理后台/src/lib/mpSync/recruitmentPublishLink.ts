import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'

async function postPublishLink(path: string, body: Record<string, unknown>) {
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
    throw new Error(String(data.message || data.detail || data.error || `http_${res.status}`))
  }
  return data
}

export async function submitVisitPublishLink(
  mpOrderId: string,
  applicantId: string,
  publishUrl: string,
): Promise<{ ok?: boolean; message?: string }> {
  return postPublishLink('/api/meoo-ops-mp-recruitment-publish-link-submit', {
    mpOrderId,
    applicantId,
    publishUrl,
    douyinPublishUrl: publishUrl,
  }) as Promise<{ ok?: boolean; message?: string }>
}

export type PublishLinkBatchVerifyResult = {
  ok?: boolean
  message?: string
  checked?: number
  passed?: number
  failed?: number
  items?: Array<{ applicantId: string; name: string; passed: boolean; note: string }>
}

export async function batchVerifyPublishLinks(
  mpOrderId: string,
  applicantIds?: string[],
): Promise<PublishLinkBatchVerifyResult> {
  const body: Record<string, unknown> = { mpOrderId }
  if (Array.isArray(applicantIds) && applicantIds.length) body.applicantIds = applicantIds
  const data = await postPublishLink('/api/meoo-ops-mp-recruitment-publish-link-batch-verify', body)
  return data as PublishLinkBatchVerifyResult
}

export function publishLinkPlaceholder(platform?: string): string {
  const p = String(platform || '抖音').trim()
  if (p.includes('红')) return '粘贴小红书「分享」复制的整段文案或作品链接'
  if (p.includes('抖')) return '粘贴抖音分享口令或作品链接'
  return '粘贴平台作品分享链接'
}
