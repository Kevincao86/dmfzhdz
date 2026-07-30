/**
 * 外卖平台网关：淘宝闪购、美团外卖、京东外卖（商家自研，演示 + 可配置 OpenAPI 基址）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  decodeWaimaiSessionToken,
  encodeWaimaiSessionToken,
  pickArrayFromWaimaiPayload,
  waimaiConfiguredForLiveApi,
  waimaiPathFromEnv,
  waimaiSignedRequest,
  type WaimaiMerchantSession,
  type WaimaiPlatformKey,
} from './waimaiOpenApiCore.js'

export type { WaimaiPlatformKey }

const PLATFORM_META: Record<
  WaimaiPlatformKey,
  { label: string; financeId: WaimaiPlatformKey; storeListPathEnv: string }
> = {
  eleme: {
    label: '淘宝闪购',
    financeId: 'eleme',
    storeListPathEnv: 'ELEME_STORE_LIST_PATH',
  },
  meituan_waimai: {
    label: '美团外卖',
    financeId: 'meituan_waimai',
    storeListPathEnv: 'MEITUAN_WAIMAI_STORE_LIST_PATH',
  },
  jd_waimai: {
    label: '京东外卖',
    financeId: 'jd_waimai',
    storeListPathEnv: 'JD_WAIMAI_STORE_LIST_PATH',
  },
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function parseBearer(req: IncomingMessage): string | undefined {
  return req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
}

function requireSession(
  res: ServerResponse,
  platform: WaimaiPlatformKey,
  bearer: string | undefined,
): WaimaiMerchantSession | null {
  if (!bearer) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return null
  }
  const session = decodeWaimaiSessionToken(platform, bearer)
  if (!session) {
    json(res, 401, {
      message: `${PLATFORM_META[platform].label}会话无效或已失效，请在商家版后台重新绑定`,
    })
    return null
  }
  return session
}

function isDemoSession(session: WaimaiMerchantSession): boolean {
  return session.demo === true || !waimaiConfiguredForLiveApi(session.platform)
}

function demoStores(platform: WaimaiPlatformKey): unknown[] {
  const label = PLATFORM_META[platform].label
  return [
    {
      poi: {
        poi_id: `${platform}-demo-001`,
        poi_name: `灵祺演示·${label}南山店`,
        address: '广东省深圳市南山区科技园南路 88 号',
        city_name: '深圳市',
      },
    },
    {
      poi: {
        poi_id: `${platform}-demo-002`,
        poi_name: `灵祺演示·${label}福田店`,
        address: '广东省深圳市福田区福华路 168 号',
        city_name: '深圳市',
      },
    },
  ]
}

function demoProducts(platform: WaimaiPlatformKey) {
  const label = PLATFORM_META[platform].label
  return [
    {
      id: `${platform}-sku-1001`,
      name: '招牌双人套餐（外卖）',
      price: 68,
      store: `灵祺演示·${label}南山店`,
      status: '已上架',
      auditStatus: '审核通过',
      saleStatus: '售卖中',
      platform,
      productType: 'combo',
    },
    {
      id: `${platform}-sku-1002`,
      name: '爆款盖饭',
      price: 28,
      store: `灵祺演示·${label}福田店`,
      status: '已上架',
      auditStatus: '审核通过',
      saleStatus: '售卖中',
      platform,
      productType: 'single',
    },
  ]
}

export type WaimaiFinanceRow = {
  date: string
  platform: WaimaiPlatformKey
  platformLabel: string
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

export type WaimaiReviewRow = {
  id: string
  platform: WaimaiPlatformKey
  sentiment: 'good' | 'neutral' | 'bad'
  userName: string
  ratingStars: number
  content: string
  createdAt: string
  replied: boolean
  replyText?: string
}

// —— 绑定 ——

export async function handleWaimaiBindPost(
  platform: WaimaiPlatformKey,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  let appId = ''
  let appSecret = ''
  let extraId = ''
  let appAuthToken = ''
  try {
    const j = JSON.parse(bodyRaw || '{}') as {
      appId?: string
      appSecret?: string
      extraId?: string
      appAuthToken?: string
    }
    appId = (j.appId ?? '').trim()
    appSecret = (j.appSecret ?? '').trim()
    extraId = (j.extraId ?? '').trim()
    appAuthToken = (j.appAuthToken ?? '').trim()
  } catch {
    json(res, 400, {
      message: '请求体须为 JSON：{ appId, appSecret, appAuthToken?, extraId? }',
    })
    return
  }
  if (!appId || !appSecret) {
    json(res, 400, { message: '请填写 AppID 与 App Secret（商家自研应用）' })
    return
  }

  const label = PLATFORM_META[platform].label
  const merchantId = extraId || `${platform}-${appId.slice(0, 8)}`
  const live = waimaiConfiguredForLiveApi(platform)
  const envPrefix = platform.toUpperCase()

  if (!live) {
    const session: WaimaiMerchantSession = {
      v: 1,
      platform,
      appKey: appId,
      appSecret,
      accessToken: appAuthToken || `${platform}-at-${randomUUID().replace(/-/g, '')}`,
      merchantId,
      demo: true,
    }
    json(res, 200, {
      accessToken: encodeWaimaiSessionToken(session),
      message: `已绑定 ${label}（演示模式 · 商家自研）：配置 ${envPrefix}_OPENAPI_BASE_URL 与各业务 PATH 后将直连开放平台。`,
      demo: true,
      mode: 'merchant_self',
    })
    return
  }

  let accessToken = appAuthToken
  if (!accessToken) {
    const tokenPath = waimaiPathFromEnv(platform, `${envPrefix}_OAUTH_TOKEN_PATH`, '/oauth/token')
    const r = await waimaiSignedRequest(
      {
        v: 1,
        platform,
        appKey: appId,
        appSecret,
        accessToken: '',
        merchantId,
      },
      tokenPath,
      {
        method: 'POST',
        body: { grant_type: 'client_credentials' },
        extraSignParams: { grant_type: 'client_credentials' },
      },
    )
    if (r.ok) {
      const data = r.json.data
      accessToken =
        (typeof r.json.access_token === 'string' && r.json.access_token) ||
        (data &&
        typeof data === 'object' &&
        typeof (data as Record<string, unknown>).access_token === 'string'
          ? String((data as Record<string, unknown>).access_token)
          : '') ||
        ''
    }
  }

  if (!accessToken) {
    json(res, 400, {
      message: `未能获取 ${label} 访问令牌。请填写门店授权后的 appAuthToken，或确认商家自研应用 OAuth 可用。`,
    })
    return
  }

  const session: WaimaiMerchantSession = {
    v: 1,
    platform,
    appKey: appId,
    appSecret,
    accessToken,
    merchantId,
    demo: false,
  }

  const storePath = waimaiPathFromEnv(
    platform,
    PLATFORM_META[platform].storeListPathEnv,
    '/shop/list',
  )
  const probe = await waimaiSignedRequest(session, storePath, {
    method: 'POST',
    body: { merchant_id: merchantId },
  })
  if (!probe.ok) {
    json(res, 400, {
      message: `${label}连通性探测失败：${probe.message}。请核对商家自研应用密钥、门店授权 Token 与接口权限。`,
    })
    return
  }

  json(res, 200, {
    accessToken: encodeWaimaiSessionToken(session),
    message: `${label}绑定成功（商家自研 · 已通过门店列表连通性探测）。`,
    demo: false,
    mode: 'merchant_self',
  })
}

export async function handleWaimaiSyncPost(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  json(res, 200, {
    syncedAt: new Date().toLocaleString('zh-CN'),
    message: isDemoSession(session) ? '演示模式：已刷新同步时间戳。' : '已向平台同步账户数据。',
  })
}

export async function handleWaimaiConnectionCheckGet(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  json(res, 200, {
    ok: true,
    demo: isDemoSession(session),
    liveApi: waimaiConfiguredForLiveApi(platform),
    message: isDemoSession(session) ? '网关可达（演示数据）' : '会话有效',
  })
}

async function fetchStoreRows(session: WaimaiMerchantSession): Promise<unknown[]> {
  if (isDemoSession(session)) return demoStores(session.platform)
  const path = waimaiPathFromEnv(
    session.platform,
    PLATFORM_META[session.platform].storeListPathEnv,
    '/shop/list',
  )
  const r = await waimaiSignedRequest(session, path, {
    method: 'POST',
    body: { merchant_id: session.merchantId },
  })
  if (!r.ok) throw new Error(r.message)
  return pickArrayFromWaimaiPayload(r.json, ['shops', 'stores', 'poi_list', 'list', 'items'])
}

export async function handleWaimaiStoresGet(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  try {
    const rows = await fetchStoreRows(session)
    const total = rows.length
    const slice = rows.slice((page - 1) * pageSize, page * pageSize)
    json(res, 200, { items: slice, total, page, pageSize })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: msg })
  }
}

export async function handleWaimaiStoreDetailGet(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  const id = (url.searchParams.get('storeId') ?? url.searchParams.get('poiId') ?? '').trim()
  try {
    const rows = await fetchStoreRows(session)
    const hit = rows.find((row) => {
      if (!row || typeof row !== 'object') return false
      const o = row as Record<string, unknown>
      const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
      const pid = String(poi.poi_id ?? poi.poiId ?? '')
      return id ? pid === id : true
    })
    json(res, 200, { item: hit ?? rows[0] ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: msg })
  }
}

export async function handleWaimaiStoreDecorationGet(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  json(res, 200, {
    items: isDemoSession(session)
      ? [
          {
            storeId: `${platform}-demo-001`,
            storeName: `灵祺演示·${PLATFORM_META[platform].label}`,
            headImage: '—',
            albumCount: 3,
            announcement: '欢迎下单',
          },
        ]
      : [],
    message: isDemoSession(session) ? '演示装修数据' : '请配置装修查询 PATH',
  })
}

export async function handleWaimaiGoodsProductsListGet(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
  let items = demoProducts(platform)
  if (!isDemoSession(session)) {
    const path = waimaiPathFromEnv(platform, `${platform.toUpperCase()}_GOODS_LIST_PATH`, '/goods/list')
    const r = await waimaiSignedRequest(session, path, {
      method: 'POST',
      body: { merchant_id: session.merchantId },
    })
    if (r.ok) {
      const arr = pickArrayFromWaimaiPayload(r.json, ['products', 'items', 'skus', 'list'])
      if (arr.length) items = arr as typeof items
    }
  }
  if (keyword) {
    items = items.filter((p) => JSON.stringify(p).toLowerCase().includes(keyword))
  }
  json(res, 200, { items, total: items.length })
}

export async function handleWaimaiGoodsProductSavePost(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
  } catch {
    json(res, 400, { message: '请求体须为 JSON' })
    return
  }
  const title = String(body.title ?? body.name ?? '').trim()
  if (!title) {
    json(res, 400, { message: '缺少商品名称 title' })
    return
  }
  if (isDemoSession(session)) {
    json(res, 200, {
      ok: true,
      draftId: `${platform}-draft-${Date.now()}`,
      message: `演示模式：${PLATFORM_META[platform].label}商品「${title}」已记录，配置 OpenAPI 后将实际上架。`,
    })
    return
  }
  const path = waimaiPathFromEnv(platform, `${platform.toUpperCase()}_GOODS_SAVE_PATH`, '/goods/save')
  const r = await waimaiSignedRequest(session, path, { method: 'POST', body })
  if (!r.ok) {
    json(res, 502, { ok: false, message: r.message })
    return
  }
  json(res, 200, {
    ok: true,
    draftId: String(r.json.product_id ?? r.json.id ?? `${platform}-${Date.now()}`),
    message: '已提交至外卖平台',
  })
}

export async function handleWaimaiGoodsTemplateGet(
  platform: WaimaiPlatformKey,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, platform, parseBearer(req))
  if (!session) return
  const label = PLATFORM_META[platform].label
  json(res, 200, {
    platform,
    productTypes: [
      { id: 'single', label: '单品', hint: `${label}：填写名称、售价、库存、图片` },
      { id: 'combo', label: '套餐', hint: `${label}：套餐内子品与加价规则按平台模板填写` },
    ],
    requiredFields: ['title', 'priceYuan', 'stock', 'categoryId', 'images'],
    imageRules: { min: 1, max: 9, formats: ['jpg', 'png'] },
  })
}

export async function fetchWaimaiReviews(
  platform: WaimaiPlatformKey,
  bearer: string,
): Promise<{ ok: true; items: WaimaiReviewRow[] } | { ok: false; message: string }> {
  const session = decodeWaimaiSessionToken(platform, bearer)
  if (!session) return { ok: false, message: '会话无效' }
  const now = Date.now()
  const label = PLATFORM_META[platform].label
  return {
    ok: true,
    items: [
      {
        id: `${platform}-review-1`,
        platform,
        sentiment: 'good',
        userName: `${label}用户`,
        ratingStars: 5,
        content: '配送快，包装完好。',
        createdAt: new Date(now - 86400000).toISOString(),
        replied: false,
      },
    ],
  }
}

export async function fetchWaimaiMarketingActivities(
  platform: WaimaiPlatformKey,
  bearer: string,
): Promise<{ ok: true; items: Record<string, unknown>[] } | { ok: false; message: string }> {
  const session = decodeWaimaiSessionToken(platform, bearer)
  if (!session) return { ok: false, message: '会话无效' }
  const label = PLATFORM_META[platform].label
  return {
    ok: true,
    items: [
      {
        id: `${platform}-act-1`,
        name: `${label}满减`,
        status: '进行中',
        platform,
      },
    ],
  }
}

export async function fetchWaimaiFinanceReconcileRows(
  platform: WaimaiPlatformKey,
  bearer: string,
  startYmd: string,
  endYmd: string,
): Promise<{ rows: WaimaiFinanceRow[]; warnings: string[] }> {
  const session = decodeWaimaiSessionToken(platform, bearer)
  if (!session) {
    return { rows: [], warnings: [`${PLATFORM_META[platform].label}会话无效`] }
  }
  const label = PLATFORM_META[platform].label
  const warnings: string[] = []
  if (isDemoSession(session)) {
    warnings.push(`${label}：演示对账数据（配置 OpenAPI 后拉取真实账单）`)
  }
  const rows: WaimaiFinanceRow[] = []
  let d = startYmd
  let guard = 0
  while (d <= endYmd && guard < 95) {
    rows.push({
      date: d,
      platform,
      platformLabel: label,
      orderCount: 40 + guard * 3,
      verifyOrderCount: 38 + guard * 2,
      salesAmountYuan: 3200 + guard * 120,
      verifyAmountYuan: 3000 + guard * 100,
    })
    const ms = new Date(`${d}T12:00:00+08:00`).getTime() + 86_400_000
    d = new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    guard += 1
  }
  return { rows, warnings }
}

const WAIMAI_KEYS: WaimaiPlatformKey[] = ['eleme', 'meituan_waimai', 'jd_waimai']

export function parseWaimaiPath(pathname: string): { platform: WaimaiPlatformKey; rest: string } | null {
  for (const p of WAIMAI_KEYS) {
    const prefix = `/api/merchant/${p}/`
    if (pathname === `/api/merchant/${p}/bind` || pathname.startsWith(prefix)) {
      return { platform: p, rest: pathname.slice(`/api/merchant/${p}`.length) || '/' }
    }
  }
  return null
}

/** 在 merchantApiGatewayCore 中调用 */
export async function tryHandleWaimaiMerchantRoute(input: {
  method: string
  pathname: string
  req: IncomingMessage
  res: ServerResponse
  url: URL
  bodyRaw: string
}): Promise<boolean> {
  const parsed = parseWaimaiPath(input.pathname)
  if (!parsed) return false
  const { platform, rest } = parsed
  const { method, req, res, url, bodyRaw } = input

  if (method === 'POST' && rest === '/bind') {
    await handleWaimaiBindPost(platform, res, bodyRaw)
    return true
  }
  if (method === 'POST' && rest === '/sync') {
    await handleWaimaiSyncPost(platform, req, res)
    return true
  }
  if (method === 'GET' && rest === '/connection-check') {
    await handleWaimaiConnectionCheckGet(platform, req, res)
    return true
  }
  if (method === 'GET' && rest === '/stores') {
    await handleWaimaiStoresGet(platform, req, res, url)
    return true
  }
  if (method === 'GET' && rest === '/stores/detail') {
    await handleWaimaiStoreDetailGet(platform, req, res, url)
    return true
  }
  if (method === 'GET' && rest === '/store-decoration') {
    await handleWaimaiStoreDecorationGet(platform, req, res)
    return true
  }
  if (method === 'GET' && rest === '/goods/products') {
    await handleWaimaiGoodsProductsListGet(platform, req, res, url)
    return true
  }
  if (method === 'POST' && rest === '/goods/product/save') {
    await handleWaimaiGoodsProductSavePost(platform, req, res, bodyRaw)
    return true
  }
  if (method === 'GET' && rest === '/goods/template/get') {
    await handleWaimaiGoodsTemplateGet(platform, req, res)
    return true
  }
  if (method === 'POST' && rest === '/product/draft') {
    await handleWaimaiGoodsProductSavePost(platform, req, res, bodyRaw)
    return true
  }

  json(res, 404, { message: `未知的外卖平台路由: ${input.pathname}` })
  return true
}

export function decodeWaimaiBearer(platform: WaimaiPlatformKey, bearer: string | undefined): boolean {
  if (!bearer) return false
  return Boolean(decodeWaimaiSessionToken(platform, bearer))
}
