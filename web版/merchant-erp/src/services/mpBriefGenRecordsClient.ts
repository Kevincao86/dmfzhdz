import { readMpSessionToken, resolveMerchantApiBearer } from '../lib/merchantApiAuth'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import {
  appendErpBriefGenRecord,
  listErpBriefGenRecords,
} from '../lib/viralBriefGenRecordsStorage'

export type MpBriefGenRecordRow = {
  id: string
  orderId: string
  orderTitle: string
  platform: string
  style: string
  outputMode: string
  resultJson: string
  fullMarkdown: string
  createdAt: string
}

async function postMpAuthAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = readMpSessionToken()
  if (!token) {
    throw new Error('请先登录后再使用 Brief 功能')
  }
  let lastErr = 'Brief 记录接口不可达'
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

async function resolveBriefRecordsBackend(): Promise<'mp' | 'erp_local'> {
  if (readMpSessionToken()) return 'mp'
  const auth = await resolveMerchantApiBearer()
  if (auth.source === 'supabase' && auth.token) return 'erp_local'
  if (auth.source === 'mp_session' && auth.token) return 'mp'
  throw new Error('请先登录后再使用 Brief 功能')
}

export async function fetchMpBriefGenRecords(): Promise<{
  records: MpBriefGenRecordRow[]
  retentionDays: number
}> {
  const backend = await resolveBriefRecordsBackend()
  if (backend === 'erp_local') {
    return listErpBriefGenRecords()
  }
  const data = await postMpAuthAction({ action: 'mp_brief_gen_records_list' })
  const records = Array.isArray(data.records) ? (data.records as MpBriefGenRecordRow[]) : []
  return {
    records,
    retentionDays: Math.max(1, Math.floor(Number(data.retentionDays) || 7)),
  }
}

export async function saveMpBriefGenRecord(opts: {
  orderId: string
  orderTitle: string
  platform: string
  style: string
  outputMode: string
  resultJson: string
  fullMarkdown: string
  idempotencyKey?: string
}): Promise<void> {
  const backend = await resolveBriefRecordsBackend()
  if (backend === 'erp_local') {
    appendErpBriefGenRecord(opts)
    return
  }
  await postMpAuthAction({
    action: 'mp_brief_gen_record_save',
    ...opts,
  })
}
