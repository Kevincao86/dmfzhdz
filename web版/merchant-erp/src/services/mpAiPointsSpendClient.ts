import { readMpSessionToken } from '../lib/merchantApiAuth'
import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'

export type MpBriefPointsSpendResult = {
  pointsCharged: number
  balance: number
  already: boolean
}

async function postMpAuthAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = readMpSessionToken()
  if (!token) {
    throw new Error('请先登录后再使用 AI 功能')
  }
  let lastErr = '积分接口不可达'
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

/** 爆款 Brief / 文稿生成成功后扣减积分（5 积分/篇） */
export async function spendMpBriefPoints(opts?: {
  idempotencyKey?: string
  note?: string
}): Promise<MpBriefPointsSpendResult | null> {
  const token = readMpSessionToken()
  if (!token) return null
  const data = await postMpAuthAction({
    action: 'mp_ai_points_spend',
    kind: 'brief',
    idempotencyKey: opts?.idempotencyKey?.trim() || undefined,
    note: opts?.note?.trim() || undefined,
  })
  return {
    pointsCharged: Math.max(0, Math.floor(Number(data.pointsCharged) || 0)),
    balance: Math.max(0, Math.floor(Number(data.mpAiPointsBalance) || 0)),
    already: data.already === true,
  }
}
