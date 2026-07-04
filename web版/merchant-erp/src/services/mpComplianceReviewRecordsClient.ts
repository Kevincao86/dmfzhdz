import { readMpSessionToken } from '../lib/merchantApiAuth'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'

export type MpComplianceReviewRecordRow = {
  id: string
  mode: 'video' | 'script'
  label: string
  platform: string
  verdict: string
  statusText: string
  statusTone: string
  detail: string
  resultJson: string
  pointsCharged?: number
  createdAt: string
}

async function postMpAuthAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = readMpSessionToken()
  if (!token) {
    throw new Error('请先登录后再使用 AI 审核')
  }
  let lastErr = '审核记录接口不可达'
  for (const url of merchantApiFetchUrls('/api/meoo-ops-mp-auth')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Mp-Session': token,
        },
        body: JSON.stringify({ ...body, sessionToken: token, token }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (res.ok && data.ok !== false) return data
      lastErr = String(data.message || data.error || `HTTP ${res.status}`)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function fetchMpComplianceReviewRecords(): Promise<{
  records: MpComplianceReviewRecordRow[]
  retentionDays: number
}> {
  const data = await postMpAuthAction({ action: 'mp_compliance_review_records_list' })
  const records = Array.isArray(data.records) ? (data.records as MpComplianceReviewRecordRow[]) : []
  return {
    records,
    retentionDays: Math.max(1, Math.floor(Number(data.retentionDays) || 7)),
  }
}

export async function saveMpComplianceReviewRecord(opts: {
  mode: 'video' | 'script'
  label: string
  platform: string
  verdict: string
  statusText: string
  statusTone: string
  detail: string
  resultJson: string
  pointsCharged?: number
  idempotencyKey?: string
}): Promise<void> {
  await postMpAuthAction({
    action: 'mp_compliance_review_record_save',
    mode: opts.mode,
    label: opts.label,
    platform: opts.platform,
    verdict: opts.verdict,
    statusText: opts.statusText,
    statusTone: opts.statusTone,
    detail: opts.detail,
    resultJson: opts.resultJson,
    pointsCharged: opts.pointsCharged,
    idempotencyKey: opts.idempotencyKey,
  })
}
