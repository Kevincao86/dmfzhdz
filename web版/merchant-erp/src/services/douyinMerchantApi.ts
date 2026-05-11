/**
 * 抖音来客商家版 — 与后端约定的绑定、门店同步接口。
 *
 * 门店列表须由后端代理抖音官方「查询门店信息」接口（与来客认领门店一致），勿在前端直连抖音。
 * 官方文档：https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query
 * 接口：GET https://open.douyin.com/goodlife/v1/shop/poi/query/
 * 权限 scope：life.capacity.shop
 * 请求头：access-token（Client Token）、content-type: application/json；可选 Rpc-Transit-Life-Account（来客商户根账户 ID）
 * Query：account_id（本地生活商家账户 ID，与绑定时的 merchantId / 来客「账户 ID」一致）、page（从 1 起）、size（1–50）、relation_type 等
 * 响应：data.pois[]（含 poi.poi_id、poi.poi_name、poi.address 等）、data.total
 *
 * 门店品牌列表：GET /api/merchant/douyin/brands → 代理 goodlife/v2/shop/brand/query/（与来客「门店品牌」一致，非门店名称）
 *
 * 部署：绑定依次尝试 `POST /api/meoo-douyin-bind`、`/api/douyin-bind`、`/api/merchant/douyin/bind`（避免单一路由打包/网关异常）。
 * 生产须配置 MERCHANT_DOUYIN_SESSION_SECRET。
 * 若网关部署在其他域名，设置 VITE_MERCHANT_API_BASE_URL（不以 / 结尾）；未设置则走同源。
 */

import { extractLifeBrandStructName } from '../lib/douyinLifeBrandExtract'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

/** 浏览器 → 同源绑定接口；服务端再调抖音（服务端约 25s 超时），此处略放宽避免永久挂起 */
const DOUYIN_BIND_CLIENT_TIMEOUT_MS = 70_000

export const DOUYIN_SHOP_POI_QUERY_DOC =
  'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query'

export type DouyinBindPayload = {
  appId: string
  appSecret: string
  merchantId: string
}

export type DouyinBindResult =
  | { ok: true; accessToken: string; accountName?: string; message?: string }
  | { ok: false; message: string }

export type DouyinStoreRow = {
  id: string
  name: string
  address?: string
  city?: string
  status?: string
  updatedAt?: string
  /** 认领状态等，与网关从抖音来客门店/认领接口映射的字段对齐 */
  claimStatus?: string
  /** 营业状态文案，如「正常营业」 */
  businessStatus?: string
  businessHours?: string
  phone?: string
  /** 门店头图 / 外显图（与 POI 返回 head_image_url 等对齐） */
  avatarUrl?: string
  organization?: string
  /** 省市区层级展示 */
  addressHierarchy?: string
  /** 门店公告（若 POI 返回） */
  announcement?: string
  /**
   * 来客「门店品牌」展示名：优先 Brand / brand 结构体（含 brand_id 的包络）、brand_name、poi_ext 等；
   * 非 poi_name；不含 organization、root_account（执照主体）。
   */
  brandName?: string
}

export type StoreTabCounts = { claimed: number; claiming: number }

export type DouyinStoresResult =
  | {
      ok: true
      items: DouyinStoreRow[]
      total: number
      accountName?: string
      /** 已认领 / 认领中 数量，由网关聚合抖音认领相关接口后返回 */
      tabCounts?: StoreTabCounts
      /** 网关返回：抖音侧 relation_type 部分失败时的可读摘要 */
      relationWarnings?: string[]
      /** 网关返回：列表为空时的排查说明 */
      emptyHint?: string
    }
  | { ok: false; message: string }

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export async function postDouyinBind(
  payload: DouyinBindPayload,
): Promise<DouyinBindResult> {
  const body = JSON.stringify({
    appId: payload.appId,
    appSecret: payload.appSecret,
    merchantId: payload.merchantId,
  })

  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), DOUYIN_BIND_CLIENT_TIMEOUT_MS)
  const clearBindTimer = () => clearTimeout(timeoutId)

  const bindPaths = ['/api/meoo-douyin-bind', '/api/douyin-bind', '/api/merchant/douyin/bind'] as const

  try {
    let res: Response | null = null
    let rawText = ''
    for (const p of bindPaths) {
      const r = await fetch(url(p), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      })
      const text = await r.text()
      if (r.ok) {
        res = r
        rawText = text
        break
      }
      let parsed: Record<string, unknown> = {}
      try {
        parsed = (JSON.parse(text || '{}') as Record<string, unknown>) ?? {}
      } catch {
        parsed = {}
      }
      const apiMsg = typeof parsed.message === 'string' ? parsed.message : ''
      const infraFail =
        r.status === 404 ||
        (!apiMsg &&
          (/FUNCTION_INVOCATION_FAILED|A server error has occurred/i.test(text) ||
            text.trim().startsWith('<!') ||
            text.trim().startsWith('<html')))
      if (infraFail) continue
      res = r
      rawText = text
      break
    }
    if (!res) {
      return {
        ok: false,
        message:
          '绑定服务不可用（多条路径均失败）。请确认 Vercel 已部署最新代码且 Functions 正常；也可稍后在 Vercel Logs 中查看报错。',
      }
    }
    let data: Record<string, unknown> = {}
    try {
      data = (JSON.parse(rawText || '{}') as Record<string, unknown>) ?? {}
    } catch {
      /* 非 JSON（常为 Vercel/HTML 报错页） */
    }
    if (!res.ok) {
      const errObj = data.error && typeof data.error === 'object' ? (data.error as Record<string, unknown>) : null
      const nestedMsg =
        typeof errObj?.message === 'string'
          ? errObj.message
          : typeof data.detail === 'string'
            ? data.detail
            : undefined
      const msg =
        (typeof data.message === 'string' && data.message) ||
        nestedMsg ||
        (typeof data.error === 'string' && data.error) ||
        rawText.trim().slice(0, 320) ||
        `HTTP ${res.status}`
      return { ok: false, message: msg }
    }
    const token = data.accessToken ?? data.token
    if (typeof token !== 'string' || !token) {
      return {
        ok: false,
        message:
          '绑定接口未返回 accessToken（或 token），请后端按约定返回 JSON：{ "accessToken": "..." }',
      }
    }
    const accountName =
      (typeof data.accountName === 'string' && data.accountName) ||
      (typeof data.merchantName === 'string' && data.merchantName) ||
      undefined
    return {
      ok: true,
      accessToken: token,
      accountName,
      message: typeof data.message === 'string' ? data.message : undefined,
    }
  } catch (e) {
    const aborted =
      (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError')
    if (aborted) {
      return {
        ok: false,
        message: `绑定请求超时（${Math.round(DOUYIN_BIND_CLIENT_TIMEOUT_MS / 1000)} 秒）。请检查网络或稍后重试；部署在海外时请将 Functions 区域调至离大陆更近的节点（如东京 hnd1）。`,
      }
    }
    const msg =
      e instanceof TypeError
        ? '无法连接绑定服务：请确认已在本机启动商家 ERP（npm run dev），且页面地址与开发服务器一致（勿混用 localhost 与 127.0.0.1）。'
        : e instanceof Error
          ? e.message
          : String(e)
    return { ok: false, message: msg }
  } finally {
    clearBindTimer()
  }
}

export async function getDouyinStores(params: {
  accessToken: string
  page: number
  pageSize: number
  keyword?: string
  /** 本地生活商家账户 ID（来客「账户 ID」），对应抖音 account_id */
  merchantId?: string
  /** 已认领 / 认领中，须与网关分页一致（勿仅在当前页前端过滤） */
  claimScope?: 'claimed' | 'claiming'
  /** 账户与门店关系：认领 0 / 关联 1 / 挂靠 2 / 全部（网关合并去重） */
  relationType?: '0' | '1' | '2' | 'all'
  /** 为 true 时通知网关丢弃 POI 缓存并重新拉取抖音 */
  refresh?: boolean
  /** 省 / 市 / 区关键词，匹配地址聚合字段 */
  provinceCity?: string
  /** 认领/审核细分筛选（网关对 POI 状态文案匹配） */
  claimStatusFilter?:
    | 'all'
    | 'store_auditing'
    | 'store_audit_fail'
    | 'pending_qual'
    | 'reviewing'
  /** 营业状态：open | rest | closed */
  businessStatusFilter?: 'all' | 'open' | 'rest' | 'closed'
  /** 门店品牌关键词 */
  storeBrand?: string
}): Promise<DouyinStoresResult> {
  const q = new URLSearchParams({
    page: String(params.page),
    pageSize: String(Math.min(100, Math.max(1, params.pageSize))),
  })
  const kw = params.keyword?.trim()
  if (kw) q.set('keyword', kw)
  const mid = params.merchantId?.trim()
  if (mid) q.set('merchantId', mid)
  if (params.claimScope === 'claiming' || params.claimScope === 'claimed') {
    q.set('claimScope', params.claimScope)
  }
  const rt =
    params.relationType != null && String(params.relationType).trim() !== ''
      ? String(params.relationType).trim()
      : 'all'
  q.set('relationType', rt || 'all')
  if (params.refresh) q.set('sync', '1')
  const pc = params.provinceCity?.trim()
  if (pc) q.set('provinceCity', pc)
  if (params.claimStatusFilter && params.claimStatusFilter !== 'all') {
    q.set('claimStatusFilter', params.claimStatusFilter)
  }
  if (params.businessStatusFilter && params.businessStatusFilter !== 'all') {
    q.set('businessStatusFilter', params.businessStatusFilter)
  }
  const brand = params.storeBrand?.trim()
  if (brand) q.set('storeBrand', brand)
  /* 后端应将 merchantId 映射为抖音 account_id，并代理 GET goodlife/v1/shop/poi/query/。
   * 官方单次 size 最大 50：若账户门店数＞50，须循环翻页直至取完再合并为 ERP 的 items/total，并返回 accountName（或由各条 poi.account.root_account.account_name 解析）。 */

  const res = await fetch(url(`/api/merchant/douyin/stores?${q}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: 'application/json',
    },
  })

  const rawText = await res.text()
  const ct = res.headers.get('content-type') ?? ''
  const trimmed = rawText.trimStart()
  const looksHtml = trimmed.startsWith('<') || /text\/html/i.test(ct)
  if (res.ok && looksHtml) {
    return {
      ok: false,
      message:
        '门店接口返回了 HTML 而非 JSON（常见于部署将 /api 请求交给了 SPA）。请确认 Vercel 已识别 api/merchant Functions，且未错误重写 /api/*。',
    }
  }

  let data: Record<string, unknown> = {}
  try {
    data = (JSON.parse(rawText || '{}') as Record<string, unknown>) ?? {}
  } catch {
    data = {}
  }

  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      `HTTP ${res.status}`
    return { ok: false, message: msg }
  }

  return { ok: true, ...adaptMerchantStoresPayload(data) }
}

export type DouyinMerchantBrandRow = {
  brandId: string
  brandName: string
}

function pickBrandIdFromObject(o: Record<string, unknown>): string {
  const v = o.brand_id ?? o.brandId ?? o.id ?? o.poi_brand_id ?? o.life_brand_id
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  if (typeof v === 'string' && v.trim()) return v.trim()
  return ''
}

function pickBrandNameFromObject(o: Record<string, unknown>): string {
  const v =
    o.brand_name ??
    o.brandName ??
    o.name ??
    o.title ??
    o.display_name ??
    o.brand_display_name
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

function normalizeMerchantBrandRow(row: unknown): DouyinMerchantBrandRow | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const nest = o.Brand ?? o.brand
  if (nest && typeof nest === 'object' && !Array.isArray(nest)) {
    const b = nest as Record<string, unknown>
    const brandId = pickBrandIdFromObject(b)
    const brandName = pickBrandNameFromObject(b)
    if (brandName) return { brandId: brandId || brandName, brandName }
  }
  const brandId = pickBrandIdFromObject(o)
  const brandName = pickBrandNameFromObject(o)
  if (!brandName) return null
  return { brandId: brandId || brandName, brandName }
}

function extractMerchantBrandRowArray(inner: Record<string, unknown>): unknown[] {
  const keys = [
    'brands',
    'brand_list',
    'items',
    'list',
    'records',
    'merchant_brands',
    'brand_infos',
    'brands_info',
    'data_list',
  ]
  for (const k of keys) {
    const v = inner[k]
    if (Array.isArray(v)) return v
  }
  return []
}

function douyinBrandDataErrorMessage(d: Record<string, unknown>): string | undefined {
  const c = d.error_code
  if (typeof c === 'number' && c !== 0) {
    return typeof d.description === 'string' ? d.description : `抖音业务错误 ${c}`
  }
  return undefined
}

function parseDouyinMerchantBrandResponse(raw: Record<string, unknown>): {
  rows: unknown[]
  total: number
  errorMessage?: string
} {
  let layer =
    raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : raw
  let err = douyinBrandDataErrorMessage(layer)
  if (err) return { rows: [], total: 0, errorMessage: err }
  let rows = extractMerchantBrandRowArray(layer)
  if (
    !rows.length &&
    layer.data &&
    typeof layer.data === 'object' &&
    !Array.isArray(layer.data)
  ) {
    const inner = layer.data as Record<string, unknown>
    err = douyinBrandDataErrorMessage(inner)
    if (err) return { rows: [], total: 0, errorMessage: err }
    rows = extractMerchantBrandRowArray(inner)
    layer = inner
  }
  const total =
    typeof layer.total === 'number'
      ? layer.total
      : typeof layer.total_count === 'number'
        ? layer.total_count
        : typeof layer.count === 'number'
          ? layer.count
          : rows.length
  return { rows, total }
}

/** 单页：GET /api/merchant/douyin/brands → goodlife/v2/shop/brand/query/ */
export async function getDouyinMerchantBrands(params: {
  accessToken: string
  merchantId?: string
  page?: number
  pageSize?: number
  keyword?: string
}): Promise<
  { ok: true; items: DouyinMerchantBrandRow[]; total: number } | { ok: false; message: string }
> {
  const q = new URLSearchParams()
  q.set('page', String(Math.max(1, params.page ?? 1)))
  q.set('pageSize', String(Math.min(50, Math.max(1, params.pageSize ?? 50))))
  const kw = params.keyword?.trim()
  if (kw) q.set('keyword', kw)
  const mid = params.merchantId?.trim()
  if (mid) q.set('merchantId', mid)

  const res = await fetch(url(`/api/merchant/douyin/brands?${q}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: 'application/json',
    },
  })
  let raw: Record<string, unknown> = {}
  try {
    raw = (await res.json()) as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof raw.message === 'string' && raw.message) ||
      (typeof raw.error === 'string' && raw.error) ||
      `HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const parsed = parseDouyinMerchantBrandResponse(raw)
  if (parsed.errorMessage) return { ok: false, message: parsed.errorMessage }
  const items: DouyinMerchantBrandRow[] = []
  for (const row of parsed.rows) {
    const n = normalizeMerchantBrandRow(row)
    if (n) items.push(n)
  }
  return { ok: true, items, total: parsed.total }
}

/** 分页拉取并去重（按 brandId），用于运营 AI 品牌下拉 */
export async function fetchDouyinMerchantBrandOptions(params: {
  accessToken: string
  merchantId?: string
  maxPages?: number
}): Promise<{ ok: true; items: DouyinMerchantBrandRow[] } | { ok: false; message: string }> {
  const pageSize = 50
  const maxPages = params.maxPages ?? 20
  const seen = new Set<string>()
  const out: DouyinMerchantBrandRow[] = []

  for (let page = 1; page <= maxPages; page++) {
    const r = await getDouyinMerchantBrands({
      accessToken: params.accessToken,
      merchantId: params.merchantId,
      page,
      pageSize,
    })
    if (!r.ok) return r
    for (const it of r.items) {
      const k = it.brandId.trim().toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      out.push(it)
    }
    if (r.items.length < pageSize || out.length >= r.total) break
  }

  out.sort((a, b) => a.brandName.localeCompare(b.brandName, 'zh-Hans-CN'))
  return { ok: true, items: out }
}

export type DouyinStoreDetailResult =
  | (Extract<DouyinStoresResult, { ok: true }> & {
      /** 抖音 goodlife/v1/poi/cert/info 完整包络（与 data 并列） */
      certInfo?: Record<string, unknown>
      certInfoError?: string
      /** 抖音 goodlife/v1/poi/task/query 完整包络 */
      taskQuery?: Record<string, unknown>
      taskQueryError?: string
    })
  | Extract<DouyinStoresResult, { ok: false }>

/** 单店：GET /api/merchant/douyin/stores/detail?poiId= &taskIds=（可选，逗号分隔异步任务 ID） */
export async function getDouyinStoreDetail(params: {
  accessToken: string
  poiId: string
  /** 查询 poi.update / poi.claim 等异步任务结果，见 task.query 文档 */
  taskIds?: string
}): Promise<DouyinStoreDetailResult> {
  const q = new URLSearchParams({ poiId: params.poiId.trim() })
  const tid = params.taskIds?.trim()
  if (tid) q.set('taskIds', tid)
  const res = await fetch(url(`/api/merchant/douyin/stores/detail?${q}`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: 'application/json',
    },
  })
  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.error === 'string' && data.error) ||
      `HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const base = adaptMerchantStoresPayload(data)
  const certInfo =
    data.certInfo && typeof data.certInfo === 'object'
      ? (data.certInfo as Record<string, unknown>)
      : undefined
  const certInfoError = typeof data.certInfoError === 'string' ? data.certInfoError : undefined
  const taskQuery =
    data.taskQuery && typeof data.taskQuery === 'object'
      ? (data.taskQuery as Record<string, unknown>)
      : undefined
  const taskQueryError = typeof data.taskQueryError === 'string' ? data.taskQueryError : undefined
  return {
    ok: true,
    ...base,
    ...(certInfo ? { certInfo } : {}),
    ...(certInfoError ? { certInfoError } : {}),
    ...(taskQuery && Object.keys(taskQuery).length ? { taskQuery } : {}),
    ...(taskQueryError ? { taskQueryError } : {}),
  }
}

export type DouyinPoiClaimResult =
  | { ok: true; status: number; bodyText: string }
  | { ok: false; message: string }

/**
 * 代理 POST goodlife/v1/poi/poi/claim/，请求体须与官方一致（含 datas 等）。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/poi.claim
 */
export async function postDouyinPoiClaim(params: {
  accessToken: string
  body: Record<string, unknown>
}): Promise<DouyinPoiClaimResult> {
  try {
    const res = await fetch(url('/api/merchant/douyin/stores/poi/claim'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params.body),
    })
    const bodyText = await res.text()
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = JSON.parse(bodyText) as { message?: string; data?: { description?: string } }
        msg = j.message ?? j.data?.description ?? msg
      } catch {
        if (bodyText) msg = bodyText.slice(0, 200)
      }
      return { ok: false, message: msg }
    }
    return { ok: true, status: res.status, bodyText }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '网络错误' }
  }
}

/**
 * 将网关返回的门店列表 JSON 规范化为统一结构。
 * 美团/小红书门店管理、认领列表接口经后端代理后，建议返回与本项目抖音门店列表相同字段约定。
 */
export function adaptMerchantStoresPayload(data: Record<string, unknown>): {
  items: DouyinStoreRow[]
  total: number
  accountName?: string
  tabCounts?: StoreTabCounts
  relationWarnings?: string[]
  emptyHint?: string
} {
  const { rows: rawRows, total: parsedTotal } = extractStoreRowsPayload(data)
  const items: DouyinStoreRow[] = rawRows.map((row) => normalizeStoreRow(row))
  const total =
    typeof parsedTotal === 'number'
      ? parsedTotal
      : typeof data.total === 'number'
        ? data.total
        : typeof data.totalCount === 'number'
          ? data.totalCount
          : items.length

  const accountName = extractAccountNameFromStoresPayload(data, rawRows)
  const tabCounts = extractTabCounts(data)

  const relationWarnings = Array.isArray(data.relationWarnings)
    ? data.relationWarnings.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : undefined
  const emptyHint = typeof data.emptyHint === 'string' && data.emptyHint.trim() ? data.emptyHint.trim() : undefined

  return {
    items,
    total,
    accountName,
    tabCounts,
    relationWarnings: relationWarnings?.length ? relationWarnings : undefined,
    emptyHint,
  }
}

/**
 * 分页拉取抖音来客「已认领」门店（relation 全量由网关合并），用于 GEO 按账户或品牌聚合。
 */
export async function fetchAllDouyinClaimedStoresPages(params: {
  accessToken: string
  merchantId?: string
  storeBrand?: string
  keyword?: string
  pageSize?: number
  maxPages?: number
}): Promise<
  | { ok: true; items: DouyinStoreRow[]; total: number; accountName?: string; tabCounts?: StoreTabCounts }
  | { ok: false; message: string }
> {
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 50))
  const maxPages = Math.min(60, Math.max(1, params.maxPages ?? 40))
  const items: DouyinStoreRow[] = []
  let total = 0
  let accountName: string | undefined
  let tabCounts: StoreTabCounts | undefined

  for (let page = 1; page <= maxPages; page++) {
    const r = await getDouyinStores({
      accessToken: params.accessToken,
      merchantId: params.merchantId,
      page,
      pageSize,
      claimScope: 'claimed',
      relationType: 'all',
      storeBrand: params.storeBrand?.trim() || undefined,
      keyword: params.keyword?.trim() || undefined,
    })
    if (!r.ok) return r
    total = r.total
    accountName = r.accountName ?? accountName
    tabCounts = r.tabCounts ?? tabCounts
    items.push(...r.items)
    if (items.length >= total || r.items.length < pageSize) break
  }

  return { ok: true, items, total, accountName, tabCounts }
}

/** 与抖音 data.pois[].account.root_account.account_name 或网关顶层 accountName 对齐 */
function extractAccountNameFromStoresPayload(
  data: Record<string, unknown>,
  rawRows: unknown[],
): string | undefined {
  const top =
    (typeof data.accountName === 'string' && data.accountName.trim()) ||
    (typeof data.merchantAccountName === 'string' && data.merchantAccountName.trim()) ||
    ''
  if (top) return top
  for (const row of rawRows) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const acc =
      o.account && typeof o.account === 'object'
        ? (o.account as Record<string, unknown>)
        : null
    const root =
      acc?.root_account && typeof acc.root_account === 'object'
        ? (acc.root_account as Record<string, unknown>)
        : null
    const n = root?.account_name
    if (typeof n === 'string' && n.trim()) return n.trim()
  }
  return undefined
}

/** 兼容 ERP 扁平列表与抖音官方 data.pois 结构 */
function extractStoreRowsPayload(data: Record<string, unknown>): {
  rows: unknown[]
  total?: number
} {
  if (Array.isArray(data.items)) return { rows: data.items, total: num(data.total) }
  if (Array.isArray(data.list)) return { rows: data.list, total: num(data.totalCount) }
  if (Array.isArray(data.pois)) return { rows: data.pois, total: num(data.total) }

  const inner = data.data
  if (inner && typeof inner === 'object') {
    const d = inner as Record<string, unknown>
    if (Array.isArray(d.pois)) {
      return { rows: d.pois, total: num(d.total) }
    }
    if (Array.isArray(d.items)) {
      return { rows: d.items, total: num(d.total) }
    }
  }
  const rawData = data.data
  if (Array.isArray(rawData)) return { rows: rawData, total: num(data.total) }

  return { rows: [], total: 0 }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined
}

function extractTabCounts(data: Record<string, unknown>): StoreTabCounts | undefined {
  const direct = data.tabCounts
  if (direct && typeof direct === 'object') {
    const o = direct as Record<string, unknown>
    const claimed = num(o.claimed) ?? num(o.claimedCount) ?? num(o.claimed_total)
    const claiming = num(o.claiming) ?? num(o.claimingCount) ?? num(o.claiming_total)
    if (claimed != null && claiming != null) return { claimed, claiming }
  }
  const inner = data.data
  if (inner && typeof inner === 'object') {
    return extractTabCounts(inner as Record<string, unknown>)
  }
  return undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** 抖音 POI 常见 open_time：周内多段字符串数组 */
function formatOpenTime(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (Array.isArray(v)) {
    const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const parts: string[] = []
    v.forEach((slot, i) => {
      const s = typeof slot === 'string' ? slot.trim() : ''
      if (s) parts.push(`${dayLabels[i] ?? `周${i + 1}`} ${s}`)
    })
    return parts.length ? parts.join('；') : undefined
  }
  return undefined
}

function nestStr(obj: Record<string, unknown> | null, path: string[]): string | undefined {
  let cur: unknown = obj
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  if (typeof cur === 'string') return cur.trim() || undefined
  if (typeof cur === 'number' && !Number.isNaN(cur)) return String(cur)
  return undefined
}

/** 从常见嵌套结构中再取一层营业电话（抖音各版本 POI 字段差异大） */
function extraPhonesFromPoi(poi: Record<string, unknown>, ext: Record<string, unknown> | null): string | undefined {
  const candidates = [
    str(poi.bond_phone),
    str(poi.virtual_phone),
    str(poi.shop_phone),
    str(poi.store_phone),
    str(poi.service_phone),
    str(poi.service_phone_number),
    str(poi.display_phone),
    str(poi.real_phone),
    str(poi.contact_phone),
    str(poi.contact_tel),
    nestStr(poi, ['contact', 'phone']),
    nestStr(poi, ['contact', 'telephone']),
    nestStr(poi, ['shop_contact', 'phone']),
    nestStr(poi, ['base', 'contact_phone']),
    nestStr(poi, ['base', 'contact_tel']),
    nestStr(poi, ['store', 'phone']),
    nestStr(poi, ['poi_base', 'tel']),
    nestStr(poi, ['poi_base', 'contact_phone']),
    nestStr(poi, ['attr', 'contact_phone']),
    nestStr(poi, ['attributes', 'contact_phone']),
    nestStr(poi, ['life_account_store', 'contact_phone']),
    ext ? nestStr(ext, ['contact', 'phone']) : undefined,
    ext ? str(ext.service_phone) : undefined,
    ext ? str(ext.contact_phone) : undefined,
  ]
  const hit = candidates.find((x) => x && x.length >= 6)
  if (hit) return hit
  for (const x of candidates) {
    if (!x || x.length < 11) continue
    const m = extractIsolatedMobiles(x.replace(/\s|-/g, ''))
    if (m[0]) return m[0]
  }
  return undefined
}

function formatOpenTimeObject(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined
  try {
    const s = JSON.stringify(v)
    return s.length > 400 ? `${s.slice(0, 400)}…` : s
  } catch {
    return undefined
  }
}

/** open_times 常为按周几索引的 map：{ "1": ["09:00-21:00"], ... } */
function formatOpenTimesMap(v: unknown): string | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Record<string, unknown>
  const dayNames: Record<string, string> = {
    '0': '周日',
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六',
    '7': '周日',
  }
  const parts: string[] = []
  for (const [k, val] of Object.entries(o)) {
    const label = dayNames[k] ?? `周次${k}`
    if (Array.isArray(val)) {
      const slots = val
        .map((x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : ''))
        .filter(Boolean)
      if (slots.length) parts.push(`${label} ${slots.join('、')}`)
    } else if (typeof val === 'string' && val.trim()) {
      parts.push(`${label} ${val.trim()}`)
    }
  }
  return parts.length ? parts.join('；') : undefined
}

/** poi.update 文档中的 open_times_v2：{ start_time, end_time, weeks: number[] }[] */
function formatOpenTimesV2(v: unknown): string | undefined {
  if (!Array.isArray(v)) return undefined
  const parts: string[] = []
  for (const slot of v) {
    if (!slot || typeof slot !== 'object') continue
    const s = slot as Record<string, unknown>
    const st = str(s.start_time as string) ?? str(s.start as string)
    const et = str(s.end_time as string) ?? str(s.end as string)
    const weeks = s.weeks
    let w = '全周'
    if (Array.isArray(weeks) && weeks.length) {
      w = weeks.map((d) => `周${d}`).join('、')
    }
    if (st && et) parts.push(`${w} ${st}-${et}`)
    else if (st || et) parts.push(`${w} ${st ?? ''}${et ?? ''}`)
  }
  return parts.length ? parts.join('；') : undefined
}

/** 从文本中提取 11 位大陆手机号，且两侧不能为数字（避免命中 poi_id 片段） */
function extractIsolatedMobiles(text: string): string[] {
  const out: string[] = []
  const re = /1[3-9]\d{9}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const i = m.index
    const before = i > 0 ? text[i - 1] : ''
    const after = text[i + 11]
    if (!/\d/.test(before) && !/\d/.test(after ?? '')) out.push(m[0])
  }
  return out
}

function collectMobilesFromTree(node: unknown, depth: number, out: Set<string>): void {
  if (depth > 12 || node == null) return
  if (typeof node === 'string') {
    for (const x of extractIsolatedMobiles(node)) out.add(x)
    return
  }
  if (typeof node === 'number' && Number.isFinite(node)) {
    const s = String(Math.trunc(node))
    if (s.length === 11) for (const x of extractIsolatedMobiles(s)) out.add(x)
    return
  }
  if (Array.isArray(node)) {
    for (const x of node) collectMobilesFromTree(x, depth + 1, out)
    return
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const kl = k.toLowerCase()
      if (
        /phone|tel|mobile|cell|contact|call|hotline|service|virtual|bond|座机/.test(kl) &&
        (typeof v === 'string' || typeof v === 'number')
      ) {
        const raw = typeof v === 'string' ? v.trim() : String(v)
        for (const x of extractIsolatedMobiles(raw.replace(/\s|-/g, ''))) out.add(x)
      }
      collectMobilesFromTree(v, depth + 1, out)
    }
  }
}

/** 当顶层字段未给电话时，在 poi / poi_ext 子树中搜手机号与带 phone 语义的键 */
function pickPhoneFromPoiDeep(poi: Record<string, unknown>, ext: Record<string, unknown> | null): string | undefined {
  const found = new Set<string>()
  collectMobilesFromTree(poi, 0, found)
  if (ext) collectMobilesFromTree(ext, 0, found)
  for (const x of found) return x
  return undefined
}

function stringifyBizCode(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v)
  return undefined
}

function firstFromTelList(poi: Record<string, unknown>): string | undefined {
  const tl =
    poi.tel_list ??
    poi.phone_list ??
    poi.contact_phones ??
    poi.phones ??
    poi.contact_phone_list ??
    poi.telephone_list ??
    poi.encrypted_tel_list
  if (!Array.isArray(tl)) return undefined
  for (const item of tl) {
    if (typeof item === 'string' && item.trim()) return item.trim()
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const n = str(o.phone ?? o.number ?? o.tel ?? o.mobile ?? o.contact_phone)
      if (n) return n
    }
  }
  return undefined
}

function firstImageFromAlbum(poi: Record<string, unknown>): string | undefined {
  const al = poi.photos ?? poi.images ?? poi.poi_photos ?? poi.album ?? poi.pic_list
  if (!Array.isArray(al) || al.length === 0) return undefined
  const x = al[0]
  if (typeof x === 'string') return str(x)
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    return str(o.url ?? o.uri ?? o.image_url ?? o.thumb_url ?? o.cover_url)
  }
  return undefined
}

function pickAvatarFromPoi(poi: Record<string, unknown>): string | undefined {
  return (
    str(
      poi.head_image_url ??
        poi.head_image ??
        poi.cover_url ??
        poi.avatar_url ??
        poi.icon_url ??
        poi.image_url ??
        poi.display_image ??
        poi.thumbnail ??
        poi.thumbnail_url,
    ) ?? firstImageFromAlbum(poi)
  )
}

/** 抖音 goodlife/v1/shop/poi/query：门店挂靠账户名，多为来客侧对客品牌（如「魔楽斑马」），非 root_account 执照主体 */
function extractPoiAccountBrandName(obj: Record<string, unknown>): string | undefined {
  const acc =
    obj.account && typeof obj.account === 'object'
      ? (obj.account as Record<string, unknown>)
      : null
  if (acc?.poi_account && typeof acc.poi_account === 'object') {
    const n = str((acc.poi_account as Record<string, unknown>).account_name)
    if (n) return n
  }
  if (obj.poi_account && typeof obj.poi_account === 'object') {
    return str((obj.poi_account as Record<string, unknown>).account_name)
  }
  return undefined
}

function brandNameFromPoiExt(ext: Record<string, unknown> | null): string | undefined {
  if (!ext) return undefined
  const fromStruct = extractLifeBrandStructName(ext)
  if (fromStruct) return fromStruct
  return str(
    ext.brand_name ??
      ext.brandName ??
      ext.poi_brand ??
      ext.merchant_brand ??
      ext.store_brand ??
      ext.store_brand_name,
  )
}

/** 与开放平台门店查询结构对齐：优先 Brand / brand 结构体（来客「门店品牌」），勿用 poi.organization / root_account */
function resolveStoreRowBrandName(
  o: Record<string, unknown>,
  poi: Record<string, unknown> | null,
  ext: Record<string, unknown> | null,
): string | undefined {
  const fromRowBrand = extractLifeBrandStructName(o)
  const fromPoiBrand = poi ? extractLifeBrandStructName(poi) : undefined

  const fromPoiFlat = poi
    ? str(
        poi.brand_name ??
          poi.brandName ??
          poi.poi_brand ??
          poi.merchant_brand ??
          (typeof poi.brand === 'string' ? poi.brand : undefined),
      ) ?? nestStr(poi, ['life_account_store', 'account_name'])
    : undefined
  const fromExt = brandNameFromPoiExt(ext)
  const fromPoiAccount = extractPoiAccountBrandName(o)
  const chain = poi ? str(poi.chain_name) : str(o.chain_name)
  const fromTop = str(
    o.brand_name ??
      o.brandName ??
      o.poi_brand ??
      o.merchant_brand ??
      (typeof o.brand === 'string' ? o.brand : undefined) ??
      o.chain_name,
  )

  return (
    fromRowBrand ??
    fromPoiBrand ??
    fromPoiFlat ??
    fromExt ??
    fromPoiAccount ??
    chain ??
    fromTop
  )
}

function normalizeStoreRow(row: unknown): DouyinStoreRow {
  if (!row || typeof row !== 'object') {
    return { id: '-', name: '（无效数据）' }
  }
  const o = row as Record<string, unknown>

  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : null
  if (poi) {
    const id = String(poi.poi_id ?? poi.poiId ?? '')
    const name = String(poi.poi_name ?? poi.poiName ?? '未命名门店')
    const ext =
      poi.poi_ext && typeof poi.poi_ext === 'object'
        ? (poi.poi_ext as Record<string, unknown>)
        : null
    const phone =
      str(
        poi.contact_phone ??
          poi.phone ??
          poi.telephone ??
          poi.tel ??
          poi.contact_tel ??
          poi.mobile ??
          o.phone ??
          o.telephone,
      ) ??
      str(ext?.phone ?? ext?.contact_phone ?? ext?.telephone) ??
      firstFromTelList(poi) ??
      extraPhonesFromPoi(poi, ext) ??
      pickPhoneFromPoiDeep(poi, ext)
    const businessHours =
      str(
        poi.open_time_desc ??
          poi.business_hours ??
          poi.opening_hours ??
          poi.business_time_desc ??
          poi.week_open_time_desc ??
          poi.trade_time_desc ??
          poi.open_time_text ??
          poi.trade_time ??
          poi.business_time ??
          o.businessHours,
      ) ??
      formatOpenTimesV2(poi.open_times_v2) ??
      formatOpenTimesMap(poi.open_times) ??
      formatOpenTime(poi.open_time) ??
      formatOpenTime(poi.opening_hours_struct) ??
      formatOpenTime(poi.week_open_time) ??
      formatOpenTime(poi.business_time_list) ??
      formatOpenTimeObject(poi.open_time_struct)

    const businessStatus =
      str(
        poi.business_status ??
          poi.open_status_desc ??
          poi.business_status_desc ??
          poi.status_desc ??
          poi.trade_status_desc ??
          o.businessStatus,
      ) ??
      stringifyBizCode(poi.open_status) ??
      stringifyBizCode(poi.trade_status) ??
      stringifyBizCode(poi.business_status_code)

    const brandName = resolveStoreRowBrandName(o, poi, ext)

    return {
      id: id || '-',
      name,
      address: str(poi.address),
      city: str(poi.city),
      status: str(poi.status),
      updatedAt: str(poi.updatedAt),
      claimStatus: str(
        poi.claim_status ?? poi.claimStatus ?? o.claimStatus ?? o.claim_status ?? poi.audit_status,
      ),
      businessStatus,
      businessHours,
      phone,
      avatarUrl: pickAvatarFromPoi(poi),
      organization: str(
        o.organization ??
          o.belong_org ??
          o.org_name ??
          str(poi.organization) ??
          extractRootAccountName(o) ??
          extractRootAccountName(poi),
      ),
      brandName,
      addressHierarchy: str(
        poi.address_all ?? poi.region_name ?? poi.full_address ?? o.addressHierarchy,
      ),
      announcement: str(poi.announcement ?? poi.notice ?? poi.bulletin ?? poi.official_notice),
    }
  }

  const id = String(o.id ?? o.shopId ?? o.poiId ?? o.storeId ?? o.poi_id ?? '')
  const name = String(
    o.name ?? o.shopName ?? o.storeName ?? o.poi_name ?? '未命名门店',
  )
  return {
    id: id || '-',
    name,
    address: str(o.address),
    city: str(o.city),
    status: str(o.status),
    updatedAt: str(o.updatedAt),
    claimStatus: str(o.claimStatus ?? o.claim_status),
    businessStatus:
      str(
        o.businessStatus ??
          o.business_status ??
          o.open_status_desc ??
          o.business_status_desc ??
          o.status_desc,
      ) ??
      stringifyBizCode(o.open_status) ??
      stringifyBizCode(o.trade_status),
    businessHours:
      str(
        o.businessHours ??
          o.business_hours ??
          o.open_time_desc ??
          o.trade_time ??
          o.business_time,
      ) ??
      formatOpenTimesV2(o.open_times_v2) ??
      formatOpenTimesMap(o.open_times) ??
      formatOpenTime(o.open_time) ??
      formatOpenTime(o.opening_hours_struct) ??
      formatOpenTimeObject(o.open_time_struct),
    phone:
      str(o.phone ?? o.telephone ?? o.contact_phone ?? o.contact_tel) ??
      firstFromTelList(o) ??
      extraPhonesFromPoi(o, null) ??
      pickPhoneFromPoiDeep(o, null),
    avatarUrl: pickAvatarFromPoi(o),
    organization: str(o.organization ?? o.belong_org ?? extractRootAccountName(o)),
    brandName: resolveStoreRowBrandName(o, null, null),
    addressHierarchy: str(o.addressHierarchy ?? o.address_all ?? o.full_address),
    announcement: str(o.announcement ?? o.notice),
  }
}

function extractRootAccountName(obj: Record<string, unknown>): string | undefined {
  const nameFrom = (x: unknown): string | undefined =>
    x && typeof x === 'object' ? str((x as Record<string, unknown>).account_name) : undefined

  const acc =
    obj.account && typeof obj.account === 'object'
      ? (obj.account as Record<string, unknown>)
      : null

  return (
    nameFrom(acc?.root_account) ??
    nameFrom(acc?.parent_account) ??
    nameFrom(acc?.poi_account) ??
    nameFrom(obj.root_account) ??
    nameFrom(obj.parent_account)
  )
}
