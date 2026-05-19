/** 探测 TokenMix 控制台/API 用量信息（无公开文档时多路径尝试） */

export type TokenMixUsageSnapshot = {
  fetchedAt: string
  balance?: number | null
  used?: number | null
  limit?: number | null
  currency?: string
  raw?: Record<string, unknown>
  note?: string
}

export async function probeTokenMixUsage(
  apiKey: string,
  env: Record<string, string>,
): Promise<TokenMixUsageSnapshot> {
  const base = (env.TOKENMIX_BASE_URL ?? 'https://api.tokenmix.ai/v1').trim().replace(/\/$/, '')
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  }
  const paths = [
    '/dashboard/billing',
    '/billing/credit',
    '/user/me',
    '/account',
  ]
  const fetchedAt = new Date().toISOString()

  for (const p of paths) {
    try {
      const r = await fetch(`${base}${p}`, { headers })
      const text = await r.text()
      if (!r.ok) continue
      let j: Record<string, unknown>
      try {
        j = JSON.parse(text) as Record<string, unknown>
      } catch {
        continue
      }
      const balance = pickNum(j, ['balance', 'credit', 'remaining', 'quota'])
      const used = pickNum(j, ['used', 'usage', 'consumed'])
      const limit = pickNum(j, ['limit', 'total', 'quota_total'])
      return {
        fetchedAt,
        balance: balance ?? null,
        used: used ?? null,
        limit: limit ?? null,
        currency: typeof j.currency === 'string' ? j.currency : undefined,
        raw: j,
        note: `来源：GET ${p}`,
      }
    } catch {
      /* try next */
    }
  }

  return {
    fetchedAt,
    note: 'TokenMix 未返回可解析的用量接口；请在 tokenmix.ai 控制台「活动」查看，或稍后重试',
  }
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  }
  const data = obj.data
  if (data && typeof data === 'object') {
    return pickNum(data as Record<string, unknown>, keys)
  }
  return undefined
}
