import { getToken } from './mpSession'
import { mpApiFetchCandidates } from './mpApiBase'
import { getWorkIdentity } from './mpWorkIdentity'

export type TalentCheckRow = { label: string; value: string; source: string }

export type TalentCheckView = {
  nickname: string
  account: string
  followersText: string
  signature: string
  avatarUrl?: string
  direction: string
  recent: string[]
  summary: string
  sales30d?: string
  platform?: 'douyin' | 'xhs'
  engageText?: string
  checkedAt: string
  checkedAtLabel: string
  cached: boolean
  charged: number
  balance: number | null
  rows: TalentCheckRow[]
}

export type TalentCheckStatus = {
  ok: boolean
  error?: string
  message?: string
  member?: boolean
  freeRemaining?: number
  pointsPerCheck?: number
  xhsPointsPerCheck?: number
  pointsBalance?: number
  hint?: string
  view?: TalentCheckView
  records?: TalentCheckView[]
  rows?: { douyinId: string; nickname: string }[]
  truncated?: boolean
  count?: number
  cached?: number
  chargeCount?: number
  pointsRequired?: number
}

export async function postTalentAccountCheck(body: Record<string, unknown>): Promise<TalentCheckStatus> {
  const candidates = mpApiFetchCandidates('/api/meoo-ops-mp-auth')
  if (!candidates.length) throw new Error('未配置查验接口')
  const token = getToken()
  let lastErr = '查验失败'
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i]!
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Mp-Session': token, Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'talent_account_check',
          ...body,
          sessionToken: token,
          token,
          billingRole: getWorkIdentity(),
        }),
      })
      const data = (await res.json()) as TalentCheckStatus
      if (!res.ok && res.status !== 200) {
        const msg = String(data.message || data.error || `http_${res.status}`)
        if (res.status === 404 && i < candidates.length - 1) {
          lastErr = msg
          continue
        }
        throw new Error(msg)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < candidates.length - 1 && /404|not_found/i.test(lastErr)) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}
