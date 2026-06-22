import { readMerchantSession } from './merchantSession'
import { getDouyinStores } from '../services/douyinMerchantApi'
import { merchantApiFetchUrlCandidates } from '../services/douyinProductApi'

/** 比较抖音 poi_id（兼容 JSON Int64 精度丢失导致末位不一致） */
export function douyinPoiIdsMatch(a: unknown, b: unknown): boolean {
  const sa = String(a ?? '').trim()
  const sb = String(b ?? '').trim()
  if (!sa || !sb) return false
  if (sa === sb) return true
  if (sa.length >= 16 && sb.length >= 16 && sa.slice(0, 15) === sb.slice(0, 15)) return true
  return false
}

function readDouyinToken() {
  return readMerchantSession('meoo_douyin_merchant_token')
}

function readDouyinMerchantId() {
  return readMerchantSession('meoo_douyin_merchant_id')
}

/** 分页拉取全部抖音门店 poi_id（与门店选择弹窗同源接口） */
export async function fetchAllDouyinPoiIds(): Promise<
  { ok: true; ids: string[] } | { ok: false; message: string }
> {
  const tok = readDouyinToken()
  if (!tok) return { ok: false, message: '请先绑定抖音来客' }
  const merchantId = readDouyinMerchantId() ?? undefined
  const ids: string[] = []
  const pageSize = 50
  for (let page = 1; page <= 40; page += 1) {
    const r = await getDouyinStores({
      accessToken: tok,
      page,
      pageSize,
      merchantId,
      relationType: 'all',
    })
    if (!r.ok) return { ok: false, message: r.message }
    for (const s of r.items) {
      if (s.id) ids.push(s.id)
    }
    if (r.items.length < pageSize || (r.total > 0 && ids.length >= r.total)) break
  }
  return { ok: true, ids: [...new Set(ids)] }
}

export type DouyinOnlineProductRow = { id: string; name: string }

function parseOnlineProductRow(raw: unknown): DouyinOnlineProductRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const prod =
    o.product && typeof o.product === 'object' ? (o.product as Record<string, unknown>) : o
  const id = String(prod.product_id ?? prod.id ?? '').trim()
  const name = String(prod.product_name ?? prod.name ?? id).trim()
  if (!id) return null
  return { id, name: name || id }
}

/** 拉取全部在线团购商品 ID（评价同步用） */
export async function fetchAllDouyinOnlineProducts(): Promise<
  { ok: true; items: DouyinOnlineProductRow[] } | { ok: false; message: string }
> {
  const tok = readDouyinToken()
  if (!tok) return { ok: false, message: '请先绑定抖音来客' }
  const items: DouyinOnlineProductRow[] = []
  let cursor = ''
  for (let page = 0; page < 40; page += 1) {
    const q = new URLSearchParams({ count: '50' })
    if (cursor) q.set('cursor', cursor)
    let batch: unknown[] | null = null
    let nextCursor = ''
    let hasMore = false
    for (const target of merchantApiFetchUrlCandidates([
      `/api/meoo-douyin-goods-product-online-query?${q}`,
      `/api/merchant/douyin/goods/product/online/query?${q}`,
    ])) {
      try {
        const r = await fetch(target, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${tok}`,
          },
        })
        if (!r.ok) continue
        const data = (await r.json()) as Record<string, unknown>
        const inner =
          data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data
        const products = (inner.products ?? inner.product_list ?? inner.items) as unknown
        if (!Array.isArray(products)) continue
        batch = products
        hasMore = inner.has_more === true
        nextCursor = String(inner.cursor ?? inner.next_cursor ?? '').trim()
        break
      } catch {
        /* try next */
      }
    }
    if (!batch?.length) break
    for (const raw of batch) {
      const row = parseOnlineProductRow(raw)
      if (row) items.push(row)
    }
    if (!hasMore || !nextCursor || nextCursor === cursor) break
    cursor = nextCursor
  }
  const seen = new Set<string>()
  const deduped = items.filter((x) => {
    if (seen.has(x.id)) return false
    seen.add(x.id)
    return true
  })
  return { ok: true, items: deduped }
}

export async function fetchAllDouyinOnlineProductIds(): Promise<
  { ok: true; ids: string[] } | { ok: false; message: string }
> {
  const r = await fetchAllDouyinOnlineProducts()
  if (!r.ok) return r
  return { ok: true, ids: r.items.map((x) => x.id) }
}
