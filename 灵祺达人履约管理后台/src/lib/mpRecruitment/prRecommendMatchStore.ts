/** PR 推荐大厅智能匹配结果缓存：仅新发单/切换匹配招募单时失效 */

const KEY = 'meoo_web_pr_recommend_enriched_v2'

type EnrichedRow = Record<string, unknown>

function readStore(): Record<string, EnrichedRow[]> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as { data?: Record<string, EnrichedRow[]> }
    return j.data && typeof j.data === 'object' ? j.data : {}
  } catch {
    return {}
  }
}

function writeStore(data: Record<string, EnrichedRow[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ data }))
  } catch {
    /* ignore */
  }
}

export function buildOrderSig(
  packs: Array<{ payload?: Record<string, unknown> } | Record<string, unknown>>,
): string {
  return packs
    .map((p) => {
      const payload = (p && typeof p === 'object' && 'payload' in p ? p.payload : p) as
        | Record<string, unknown>
        | undefined
      return `${String(payload?.id || '')}:${String(payload?.updatedAt || payload?.publishedAt || '')}`
    })
    .sort()
    .join('|')
    .slice(0, 220)
}

export function buildMatchCacheKey(board: string, matchOrderId: string, orderSig: string): string {
  return `${board || 'talent'}:${matchOrderId || 'recent'}:${orderSig || ''}`.slice(0, 280)
}

export function readEnrichedRows(cacheKey: string): EnrichedRow[] | null {
  const hit = readStore()[cacheKey]
  return Array.isArray(hit) ? hit : null
}

export function writeEnrichedRows(cacheKey: string, rows: EnrichedRow[]) {
  const store = readStore()
  store[cacheKey] = rows
  writeStore(store)
}
