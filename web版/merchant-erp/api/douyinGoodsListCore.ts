/**
 * 抖音来客商品列表 — 严格对齐开放平台文档
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/goods/online.query
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/query (draft)
 *
 * 分页：请求参数 cursor；响应 data.next_cursor + data.has_more
 * 创建方：goods_creator_type 0=服务商/开发者 1=商家(account_id)在来客创建
 * 全量：goods_query_type 2=自研商家 3=服务商（生效时 goods_creator_type 不生效）
 */

import {
  douyinOpenApiUrl,
  douyinServerFetch,
  fetchGoodlifeWithOfficialFallback,
  parseDouyinOpenApiEnvelope,
  stringifyDouyinOpenApiInt64,
} from './douyinOpenApiBase.js'

export type DouyinGoodsListRow = {
  id: string
  name: string
  price: number
  store: string
  poi_ids?: string[]
  /** 商品头图（来自 attr_key_value_map.image_list 等） */
  head_image_url?: string
  status: string
  audit_status: string
  sale_status: string
  platform: string
  source: 'online' | 'draft'
}

function parseImageListAttrJson(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return []
    const out: string[] = []
    for (const x of j) {
      if (typeof x === 'string' && /^https?:\/\//i.test(x)) {
        out.push(x)
        continue
      }
      if (x && typeof x === 'object') {
        const u = String((x as Record<string, unknown>).url ?? '').trim()
        if (/^https?:\/\//i.test(u)) out.push(u)
      }
    }
    return out
  } catch {
    return []
  }
}

function headImageFromGoodlifeProduct(product: Record<string, unknown>): string | undefined {
  const attrMap =
    product.attr_key_value_map &&
    typeof product.attr_key_value_map === 'object' &&
    !Array.isArray(product.attr_key_value_map)
      ? (product.attr_key_value_map as Record<string, unknown>)
      : {}
  const imageUrls = [
    ...parseImageListAttrJson(attrMap.image_list),
    ...parseImageListAttrJson(attrMap.image_1v1_list),
    ...parseImageListAttrJson(attrMap.detail_image_list),
  ]
  const direct = String(product.head_image_url ?? product.head_image ?? '').trim()
  if (/^https?:\/\//i.test(direct)) return direct
  const first = imageUrls.find((u) => /^https?:\/\//i.test(u))
  return first || undefined
}

export type DouyinGoodsListPullResult = {
  items: DouyinGoodsListRow[]
  warnings: string[]
}

const ONLINE_PATH = '/goodlife/v1/goods/product/online/query/' as const
const DRAFT_PATH = '/goodlife/v1/goods/product/draft/query/' as const

function parseEnvelopeDataError(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const data = j.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>
    const code = Number(d.error_code)
    if (Number.isFinite(code) && code !== 0) {
      return { ok: false, msg: String(d.description ?? `抖音 error_code=${code}`) }
    }
  }
  const rootCode = Number(j.error_code)
  if (Number.isFinite(rootCode) && rootCode !== 0) {
    return { ok: false, msg: String(j.description ?? j.msg ?? `抖音根 error_code=${rootCode}`) }
  }
  return { ok: true }
}

function extractProducts(j: Record<string, unknown>): unknown[] {
  const inner = j.data as Record<string, unknown> | undefined
  const arr = (inner?.products ?? inner?.product_list ?? j.products) as unknown
  return Array.isArray(arr) ? arr : []
}

function amountToYuan(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0
  if (v >= 100 && v < 1e12) return Math.round(v) / 100
  if (v > 0 && v < 1e6) return Math.round(v)
  return 0
}

function onlineStatusLabel(n: number | undefined): string {
  if (n === 2 || n === 3) return '已下架'
  if (n === 1) return '上架中'
  return '未上架'
}

function draftStatusLabel(n: number | undefined): string {
  switch (n) {
    case 10:
      return '审核中'
    case 12:
      return '已驳回'
    case 1:
      return '审核通过'
    default:
      return '草稿'
  }
}

function formatStoreFromPois(poiNames: string[], poiCount: number, accountName: string): string {
  const uniq = [...new Set(poiNames.map((n) => n.trim()).filter(Boolean))]
  if (uniq.length === 1) return uniq[0]!
  if (uniq.length > 1) {
    if (uniq.length <= 3) return uniq.join('、')
    return `${uniq.slice(0, 2).join('、')} 等 ${uniq.length} 家门店`
  }
  if (poiCount > 0) return `${poiCount} 家门店`
  const acct = accountName.trim()
  return acct || '—'
}

function rowToListItem(row: Record<string, unknown>, source: 'online' | 'draft'): DouyinGoodsListRow | null {
  const product =
    row.product && typeof row.product === 'object'
      ? (row.product as Record<string, unknown>)
      : row
  const id = String(product.product_id ?? product.id ?? row.product_id ?? '').trim()
  const name = String(product.product_name ?? product.name ?? '').trim()
  if (!id || !name) return null

  const sku =
    row.sku && typeof row.sku === 'object' ? (row.sku as Record<string, unknown>) : null
  const skus = Array.isArray(row.skus) ? row.skus : []
  const firstSku =
    (skus[0] && typeof skus[0] === 'object' ? (skus[0] as Record<string, unknown>) : null) ?? sku
  const price = firstSku
    ? amountToYuan(firstSku.actual_amount) || amountToYuan(firstSku.origin_amount)
    : 0

  const poisRaw = product.pois
  const poi_ids: string[] = []
  const poi_names: string[] = []
  if (Array.isArray(poisRaw)) {
    for (const p of poisRaw) {
      if (!p || typeof p !== 'object') continue
      const o = p as Record<string, unknown>
      const pid = stringifyDouyinOpenApiInt64(o.poi_id ?? o.id ?? o.supplier_ext_id)
      if (pid) poi_ids.push(pid)
      const pname = String(o.poi_name ?? o.name ?? '').trim()
      if (pname) poi_names.push(pname)
    }
  }
  const store = formatStoreFromPois(poi_names, poi_ids.length, String(product.account_name ?? ''))

  const online_status =
    typeof row.online_status === 'number'
      ? row.online_status
      : typeof product.online_status === 'number'
        ? product.online_status
        : undefined
  const draft_status =
    typeof row.draft_status === 'number'
      ? row.draft_status
      : typeof product.draft_status === 'number'
        ? product.draft_status
        : undefined

  const audit_status = source === 'draft' ? draftStatusLabel(draft_status) : '审核通过'
  const sale_status = source === 'online' ? onlineStatusLabel(online_status) : '未上架'
  const head_image_url = headImageFromGoodlifeProduct(product)

  return {
    id,
    name,
    price,
    store,
    poi_ids: poi_ids.length ? poi_ids : undefined,
    ...(head_image_url ? { head_image_url } : {}),
    status: audit_status,
    audit_status,
    sale_status,
    platform: '抖音来客',
    source,
  }
}

function mergeRows(a: DouyinGoodsListRow, b: DouyinGoodsListRow): DouyinGoodsListRow {
  const poi_ids = [...new Set([...(a.poi_ids ?? []), ...(b.poi_ids ?? [])])]
  const hasOnline = a.source === 'online' || b.source === 'online'
  const head_image_url = b.head_image_url || a.head_image_url
  return {
    id: a.id,
    name: b.name || a.name,
    price: b.price > 0 ? b.price : a.price,
    store: b.store !== '—' ? b.store : a.store,
    poi_ids: poi_ids.length ? poi_ids : undefined,
    ...(head_image_url ? { head_image_url } : {}),
    audit_status: a.source === 'draft' ? a.audit_status : b.audit_status || a.audit_status,
    sale_status: hasOnline
      ? b.source === 'online'
        ? b.sale_status
        : a.sale_status
      : a.sale_status,
    status: a.audit_status,
    platform: '抖音来客',
    source: hasOnline ? 'online' : a.source === 'draft' || b.source === 'draft' ? 'draft' : a.source,
  }
}

type QueryPageResult = {
  products: unknown[]
  next_cursor: string
  has_more: boolean
  err?: string
}

async function queryGoodlifePage(
  accountId: string,
  accessToken: string,
  path: typeof ONLINE_PATH | typeof DRAFT_PATH,
  params: Record<string, string>,
  cursor: string,
): Promise<QueryPageResult> {
  const u = new URL(douyinOpenApiUrl(path))
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('count', '50')
  if (cursor) u.searchParams.set('cursor', cursor)
  for (const [k, v] of Object.entries(params)) {
    if (v !== '') u.searchParams.set(k, v)
  }

  const apiLabel = path.includes('draft') ? 'goods/draft.query' : 'goods/online.query'
  let status: number
  let raw: string
  try {
    const fetched = await fetchGoodlifeWithOfficialFallback(douyinServerFetch, u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    status = fetched.status
    raw = fetched.raw
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { products: [], next_cursor: '', has_more: false, err: msg }
  }
  let j: Record<string, unknown>
  try {
    j = parseDouyinOpenApiEnvelope(raw, apiLabel)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { products: [], next_cursor: '', has_more: false, err: msg }
  }
  const dataErr = parseEnvelopeDataError(j)
  if (status < 200 || status >= 300 || !dataErr.ok) {
    return {
      products: [],
      next_cursor: '',
      has_more: false,
      err: dataErr.msg || `HTTP ${status}`,
    }
  }
  const inner = j.data as Record<string, unknown> | undefined
  const products = extractProducts(j)
  /** 官方字段为 cursor；next_cursor 为部分环境别名，须 cursor 优先否则只拉首页 */
  const next_cursor = String(inner?.cursor ?? inner?.next_cursor ?? '').trim()
  const has_more = inner?.has_more === true
  return { products, next_cursor, has_more }
}

async function paginateVariant(
  accountId: string,
  accessToken: string,
  path: typeof ONLINE_PATH | typeof DRAFT_PATH,
  baseParams: Record<string, string>,
  source: 'online' | 'draft',
  map: Map<string, DouyinGoodsListRow>,
  warnings: string[],
  label: string,
): Promise<void> {
  let cursor = ''
  for (let page = 0; page < 40; page++) {
    const { products, next_cursor, has_more, err } = await queryGoodlifePage(
      accountId,
      accessToken,
      path,
      baseParams,
      cursor,
    )
    if (err && products.length === 0 && page === 0) {
      warnings.push(`${label}：${err}`)
    }
    if (page === 0 && products.length > 0) {
      let parsed = 0
      for (const p of products) {
        if (!p || typeof p !== 'object') continue
        if (rowToListItem(p as Record<string, unknown>, source)) parsed++
      }
      if (parsed === 0) {
        warnings.push(`${label}：OpenAPI 返回 ${products.length} 条但未解析出商品 ID/名称，请检查 account_id 或联系技术支持`)
      }
    }
    for (const p of products) {
      if (!p || typeof p !== 'object') continue
      const item = rowToListItem(p as Record<string, unknown>, source)
      if (!item) continue
      const prev = map.get(item.id)
      map.set(item.id, prev ? mergeRows(prev, item) : item)
    }
    const gotFullPage = products.length >= 50
    if (!has_more && !gotFullPage) break
    if (!next_cursor || next_cursor === cursor) break
    cursor = next_cursor
  }
}

function buildGoodsListEmptyHint(warnings: string[]): string[] {
  if (warnings.length) return warnings
  return [
    '线上无商品。若来客后台已有团购/代金券，请确认：① 开放平台已开通 life.capacity.goods.query；② 绑定 account_id 与来客账号一致；③ Scope 通过后于「系统设置」解绑并重新绑定以刷新 token。',
  ]
}

/**
 * 按抖音文档拉取 account_id 下全部线上 + 草稿商品（去重合并）。
 */
export async function pullDouyinGoodsList(
  accountId: string,
  accessToken: string,
): Promise<DouyinGoodsListPullResult> {
  const warnings: string[] = []
  const map = new Map<string, DouyinGoodsListRow>()
  const aid = accountId.trim()
  if (!aid) {
    return { items: [], warnings: ['缺少 account_id，请重新绑定抖音来客'] }
  }

  /** 自研商家：先 goods_query_type=2/3；无结果再 goods_creator_type（与 dac9e4e0 前网关逻辑一致，避免多 variant 触发限流） */
  for (const gqt of ['2', '3'] as const) {
    await paginateVariant(
      aid,
      accessToken,
      ONLINE_PATH,
      { goods_query_type: gqt },
      'online',
      map,
      warnings,
      `自研全量(goods_query_type=${gqt})`,
    )
  }
  if (map.size === 0) {
    await paginateVariant(
      aid,
      accessToken,
      ONLINE_PATH,
      { goods_creator_type: '1' },
      'online',
      map,
      warnings,
      '来客商家商品(goods_creator_type=1)',
    )
    await paginateVariant(
      aid,
      accessToken,
      ONLINE_PATH,
      { goods_creator_type: '0' },
      'online',
      map,
      warnings,
      'OpenAPI商品(goods_creator_type=0)',
    )
  }

  await paginateVariant(
    aid,
    accessToken,
    DRAFT_PATH,
    {},
    'draft',
    map,
    warnings,
    '草稿商品',
  )
  for (const st of ['10', '12', '1'] as const) {
    await paginateVariant(
      aid,
      accessToken,
      DRAFT_PATH,
      { status: st },
      'draft',
      map,
      warnings,
      `草稿(status=${st})`,
    )
  }

  const outWarnings = map.size === 0 ? buildGoodsListEmptyHint(warnings) : warnings
  return { items: Array.from(map.values()), warnings: outWarnings }
}

/** 用 shop.query 门店名称补全商品列表「门店」列（poi_ids 有值但 OpenAPI 未带 poi_name 时） */
export function enrichDouyinGoodsListWithPoiNames(
  items: DouyinGoodsListRow[],
  poiNameById: Record<string, string>,
): void {
  for (const item of items) {
    if (!item.poi_ids?.length) continue
    const names = item.poi_ids
      .map((id) => poiNameById[id]?.trim())
      .filter((n): n is string => Boolean(n))
    if (names.length) {
      item.store = formatStoreFromPois(names, item.poi_ids.length, item.store)
    }
  }
}
