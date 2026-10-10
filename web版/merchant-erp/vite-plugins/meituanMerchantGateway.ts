/**
 * 美团 OpenAPI 网关：门店、装修、商品、评价、营销活动、财务对账。
 * 参照 douyinMerchantGateway 与现有 ERP 前端约定。未配置 MEITUAN_OPENAPI_BASE_URL 时返回空数据，不签发演示门店。
 * @see https://developer.meituan.com/docs/api
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  decodeMeituanSessionToken,
  encodeMeituanSessionToken,
  meituanConfiguredForLiveApi,
  meituanPathFromEnv,
  meituanSignedRequest,
  pickArrayFromMeituanPayload,
  type MeituanMerchantSession,
} from './meituanOpenApiCore.js'

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
  bearer: string | undefined,
): MeituanMerchantSession | null {
  if (!bearer) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return null
  }
  const session = decodeMeituanSessionToken(bearer)
  if (!session) {
    json(res, 401, { message: '美团会话无效或已失效，请在商家版后台重新绑定' })
    return null
  }
  return session
}

function isDemoSession(session: MeituanMerchantSession): boolean {
  return session.demo === true || !meituanConfiguredForLiveApi()
}

const GROUPBUY_UNAVAILABLE =
  '美团团购未接通开放平台，无法拉取真实门店、商品与评价。'

function groupbuyLive(session: MeituanMerchantSession): boolean {
  return !isDemoSession(session)
}

function poiSearchHay(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
  return [
    poi.poi_id,
    poi.poiId,
    poi.poi_name,
    poi.poiName,
    poi.name,
    poi.address,
    poi.city_name,
    poi.district_name,
  ]
    .filter((x) => x != null)
    .join(' ')
    .toLowerCase()
}

function rowToDecorationItem(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') return { storeId: '-', storeName: '—' }
  const o = row as Record<string, unknown>
  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
  const id = String(poi.poi_id ?? poi.poiId ?? poi.shop_id ?? '')
  const name = String(poi.poi_name ?? poi.poiName ?? poi.name ?? '未命名门店')
  return {
    storeId: id,
    storeName: name,
    headImage: poi.head_img ?? poi.headImage ?? '—',
    albumCount: poi.album_count ?? '—',
    announcement: poi.announcement ?? poi.notice ?? '—',
    tags: poi.tags ?? '—',
    decorationStatus: poi.decoration_status ?? '—',
  }
}

function sentimentFromStars(stars: number): 'good' | 'neutral' | 'bad' {
  if (stars >= 4) return 'good'
  if (stars <= 2) return 'bad'
  return 'neutral'
}

export type MerchantReviewRowMeituan = {
  id: string
  platform: 'meituan'
  sentiment: 'good' | 'neutral' | 'bad'
  userName: string
  ratingStars: number
  content: string
  createdAt: string
  replied: boolean
  replyText?: string
}

export type FinanceReconcileRowPayload = {
  date: string
  platform: 'meituan'
  platformLabel: string
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

// —— 绑定 / 同步 ——

export async function handleMeituanBindPost(
  _req: IncomingMessage,
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
    json(res, 400, {
      message: '请填写商家自研应用的 AppID / developerId 与 App Secret / SignKey',
    })
    return
  }

  const merchantId = extraId || `mt-${appId.slice(0, 8)}`
  const live = meituanConfiguredForLiveApi()

  if (!live) {
    json(res, 400, {
      message:
        '美团团购开放平台未配置（MEITUAN_OPENAPI_BASE_URL）。未接通前不签发演示令牌，也不会返回演示门店。',
    })
    return
  }

  const accessToken = appAuthToken
  if (!accessToken) {
    json(res, 400, {
      message: '请填写门店授权后的 appAuthToken。美团团购按商家自研授权令牌接通。',
    })
    return
  }

  const session: MeituanMerchantSession = {
    v: 1,
    appKey: appId,
    appSecret,
    accessToken,
    merchantId,
    demo: false,
  }

  const storePath = meituanPathFromEnv('MEITUAN_STORE_LIST_PATH', '/poi/list')
  const probe = await meituanSignedRequest(session, storePath, {
    method: 'POST',
    body: { merchant_id: merchantId },
  })
  if (!probe.ok) {
    json(res, 400, {
      message: `美团连通性探测失败：${probe.message}。请核对商家自研应用密钥、门店授权 Token、接口权限与 MEITUAN_STORE_LIST_PATH。`,
    })
    return
  }

  json(res, 200, {
    accessToken: encodeMeituanSessionToken(session),
    message: '美团绑定成功（商家自研 · 已通过门店列表连通性探测）。',
    demo: false,
    mode: 'merchant_self',
  })
}

export async function handleMeituanSyncPost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return
  if (!groupbuyLive(session)) {
    json(res, 400, { message: GROUPBUY_UNAVAILABLE })
    return
  }
  const notes: string[] = []
  let storeCount = 0
  let goodsCount = 0
  try {
    storeCount = (await fetchMeituanStoreRows(session)).length
  } catch (e) {
    notes.push(`门店：${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    const path = meituanPathFromEnv('MEITUAN_GOODS_LIST_PATH', '/deal/query')
    const r = await meituanSignedRequest(session, path, {
      method: 'POST',
      body: { page: 1, page_size: 20, merchant_id: session.merchantId },
    })
    if (!r.ok) notes.push(`商品：${r.message}`)
    else {
      goodsCount = pickArrayFromMeituanPayload(r.json, ['deals', 'products', 'list', 'items']).length
    }
  } catch (e) {
    notes.push(`商品：${e instanceof Error ? e.message : String(e)}`)
  }
  if (storeCount === 0 && goodsCount === 0 && notes.length) {
    json(res, 502, { message: notes.join('；') })
    return
  }
  json(res, 200, {
    syncedAt: new Date().toLocaleString('zh-CN'),
    storeCount,
    goodsCount,
    message: notes.length ? notes.join('；') : '已从美团拉取团购门店与商品。',
  })
}

export async function handleMeituanConnectionCheckGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return
  const live = groupbuyLive(session)
  json(res, 200, {
    ok: live,
    message: live ? '美团团购会话有效。' : GROUPBUY_UNAVAILABLE,
    demo: !live,
    liveApi: meituanConfiguredForLiveApi(),
  })
}

// —— 门店 ——

async function fetchMeituanStoreRows(session: MeituanMerchantSession): Promise<unknown[]> {
  if (!groupbuyLive(session)) throw new Error(GROUPBUY_UNAVAILABLE)

  const path = meituanPathFromEnv('MEITUAN_STORE_LIST_PATH', '/poi/list')
  const r = await meituanSignedRequest(session, path, {
    method: 'POST',
    body: { merchant_id: session.merchantId },
  })
  if (!r.ok) throw new Error(r.message)
  return pickArrayFromMeituanPayload(r.json, [
    'pois',
    'poi_list',
    'shops',
    'list',
    'items',
    'stores',
  ])
}

export async function handleMeituanStoresGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()

  try {
    let rows = await fetchMeituanStoreRows(session)
    if (keyword) rows = rows.filter((row) => poiSearchHay(row).includes(keyword))
    const total = rows.length
    const slice = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    json(res, 200, {
      items: slice,
      total,
      accountName: session.merchantId,
      tabCounts: { claimed: total, claiming: 0 },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `美团门店列表失败：${msg}` })
  }
}

export async function handleMeituanStoreDetailGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return
  const poiId = (url.searchParams.get('poiId') ?? url.searchParams.get('shopId') ?? '').trim()
  if (!poiId) {
    json(res, 400, { message: '缺少 query poiId（美团门店 ID）' })
    return
  }

  try {
    if (!groupbuyLive(session)) {
      json(res, 400, { message: GROUPBUY_UNAVAILABLE })
      return
    }
    const path = meituanPathFromEnv('MEITUAN_STORE_DETAIL_PATH', '/poi/detail')
    const r = await meituanSignedRequest(session, path, {
      method: 'POST',
      body: { poi_id: poiId, shop_id: poiId },
    })
    if (!r.ok) {
      json(res, 502, { message: r.message })
      return
    }
    json(res, 200, { ok: true, upstream: r.json })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `美团门店详情失败：${msg}` })
  }
}

export async function handleMeituanStoreDecorationGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()

  try {
    let rows = await fetchMeituanStoreRows(session)
    {
      const decorPath = process.env.MEITUAN_STORE_DECORATION_PATH?.trim()
      if (decorPath) {
        const r = await meituanSignedRequest(session, decorPath, {
          method: 'POST',
          body: { merchant_id: session.merchantId },
        })
        if (r.ok) {
          const decor = pickArrayFromMeituanPayload(r.json, ['items', 'list', 'decorations'])
          if (decor.length) rows = decor
        }
      }
    }
    if (keyword) rows = rows.filter((row) => poiSearchHay(row).includes(keyword))
    const total = rows.length
    const slice = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    json(res, 200, {
      items: slice.map(rowToDecorationItem),
      total,
      message: '由门店/装修 OpenAPI 聚合；未返回的列显示为「—」。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `美团门店装修列表失败：${msg}` })
  }
}

// —— 商品 ——

function mapMeituanProductRow(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const id = String(o.deal_id ?? o.product_id ?? o.id ?? o.dealId ?? '')
  if (!id) return null
  const name = String(o.deal_title ?? o.title ?? o.name ?? '未命名商品')
  const priceRaw = o.price ?? o.deal_price ?? o.sale_price ?? 0
  const price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw) || 0
  const store = String(o.shop_name ?? o.poi_name ?? o.store_name ?? '—')
  const audit = String(o.audit_status ?? o.status ?? '—')
  const sale = String(o.sale_status ?? o.online_status ?? '—')
  return {
    id,
    name,
    price,
    store,
    status: audit,
    auditStatus: audit,
    saleStatus: sale,
    platform: 'meituan',
  }
}

export async function handleMeituanGoodsProductsListGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return

  const page = Math.max(1, Number(url.searchParams.get('page')) || Number(url.searchParams.get('page_num')) || 1)
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get('page_size')) || Number(url.searchParams.get('pageSize')) || 20),
  )

  try {
    if (!groupbuyLive(session)) {
      json(res, 200, {
        ok: false,
        data: { items: [], total: 0, page, page_size: pageSize },
        message: GROUPBUY_UNAVAILABLE,
      })
      return
    }

    const path = meituanPathFromEnv('MEITUAN_GOODS_LIST_PATH', '/deal/query')
    const r = await meituanSignedRequest(session, path, {
      method: 'POST',
      body: { page, page_size: pageSize, merchant_id: session.merchantId },
    })
    if (!r.ok) {
      json(res, 502, { ok: false, message: r.message })
      return
    }
    const raw = pickArrayFromMeituanPayload(r.json, ['deals', 'products', 'list', 'items'])
    const items = raw.map(mapMeituanProductRow).filter((x): x is Record<string, unknown> => x != null)
    const data = r.json.data
    const total =
      typeof (data as Record<string, unknown> | undefined)?.total === 'number'
        ? Number((data as Record<string, unknown>).total)
        : typeof r.json.total === 'number'
          ? Number(r.json.total)
          : items.length
    json(res, 200, {
      ok: true,
      data: { items, total, page, page_size: pageSize },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { ok: false, message: `美团商品列表失败：${msg}` })
  }
}

export async function handleMeituanGoodsProductSavePost(
  req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return

  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
  } catch {
    json(res, 400, { message: '请求体须为 JSON' })
    return
  }

  if (!groupbuyLive(session)) {
    json(res, 400, { ok: false, message: GROUPBUY_UNAVAILABLE })
    return
  }

  const path = meituanPathFromEnv('MEITUAN_GOODS_SAVE_PATH', '/deal/save')
  const r = await meituanSignedRequest(session, path, { method: 'POST', body })
  if (!r.ok) {
    json(res, 502, { ok: false, message: r.message })
    return
  }
  const data = r.json.data
  const productId =
    (data && typeof data === 'object' && String((data as Record<string, unknown>).deal_id ?? '')) ||
    String(r.json.deal_id ?? r.json.product_id ?? '')
  json(res, 200, {
    ok: true,
    productId: productId || undefined,
    upstream: r.json,
  })
}

// —— 评价 ——

export async function fetchMeituanReviews(
  bearerToken: string,
): Promise<{ ok: true; items: MerchantReviewRowMeituan[] } | { ok: false; message: string }> {
  const session = decodeMeituanSessionToken(bearerToken.trim())
  if (!session) {
    return { ok: false, message: '美团会话无效，请先在商家版后台完成绑定。' }
  }

  if (!groupbuyLive(session)) {
    return { ok: false, message: GROUPBUY_UNAVAILABLE }
  }

  const path = meituanPathFromEnv('MEITUAN_REVIEW_LIST_PATH', '/ugc/comment/query')
  const nowSec = Math.floor(Date.now() / 1000)
  const startSec = nowSec - 90 * 86400
  const r = await meituanSignedRequest(session, path, {
    method: 'POST',
    body: {
      start_time: startSec,
      end_time: nowSec,
      page: 1,
      page_size: 100,
    },
  })
  if (!r.ok) {
    return {
      ok: false,
      message:
        r.message ||
        '评价查询失败（请在美团开放平台申请「评价管理」类能力并配置 MEITUAN_REVIEW_LIST_PATH）',
    }
  }

  const comments = pickArrayFromMeituanPayload(r.json, ['comments', 'reviews', 'list', 'items'])
  const out: MerchantReviewRowMeituan[] = []
  for (const c of comments) {
    if (!c || typeof c !== 'object') continue
    const row = c as Record<string, unknown>
    const id = String(row.comment_id ?? row.review_id ?? row.id ?? '')
    if (!id) continue
    const stars = Number(row.score ?? row.star ?? row.rating ?? 5) || 5
    const content =
      (typeof row.content === 'string' && row.content.trim()) ||
      (typeof row.comment === 'string' && row.comment.trim()) ||
      '（无文字评价）'
    const nick =
      (typeof row.user_name === 'string' && row.user_name.trim()) ||
      (typeof row.nickname === 'string' && row.nickname.trim()) ||
      '美团用户'
    const replyText =
      typeof row.reply_content === 'string'
        ? row.reply_content.trim()
        : typeof row.merchant_reply === 'string'
          ? row.merchant_reply.trim()
          : undefined
    out.push({
      id: `mt:${id}`,
      platform: 'meituan',
      sentiment: sentimentFromStars(stars),
      userName: nick,
      ratingStars: stars,
      content,
      createdAt:
        typeof row.create_time === 'number'
          ? new Date(row.create_time > 1e12 ? row.create_time : row.create_time * 1000).toISOString()
          : typeof row.create_time === 'string'
            ? row.create_time
            : new Date().toISOString(),
      replied: Boolean(row.has_reply ?? row.replied ?? replyText),
      replyText: replyText || undefined,
    })
  }
  return { ok: true, items: out }
}

export function parseMeituanReviewId(reviewId: string): { commentId: string } | null {
  const id = reviewId.trim()
  if (!id) return null
  if (id.startsWith('mt:')) return { commentId: id.slice(3) }
  if (id.startsWith('mt-demo-')) return { commentId: id }
  return { commentId: id }
}

export async function postMeituanCommentReply(
  bearerToken: string,
  reviewId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = decodeMeituanSessionToken(bearerToken.trim())
  if (!session) return { ok: false, message: '美团会话无效。' }

  const parsed = parseMeituanReviewId(reviewId)
  if (!parsed) return { ok: false, message: '评价 ID 无效' }

  if (!groupbuyLive(session) || parsed.commentId.startsWith('mt-demo-')) {
    return { ok: false, message: GROUPBUY_UNAVAILABLE }
  }

  const path = meituanPathFromEnv('MEITUAN_REVIEW_REPLY_PATH', '/ugc/comment/reply')
  const r = await meituanSignedRequest(session, path, {
    method: 'POST',
    body: { comment_id: parsed.commentId, reply_content: text },
  })
  if (!r.ok) return { ok: false, message: r.message }
  return { ok: true }
}

// —— 营销活动 ——

export async function fetchMeituanMarketingActivities(
  bearer: string,
  url: URL,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = decodeMeituanSessionToken(bearer)
  if (!session) {
    return { status: 401, body: { ok: false, message: '缺少有效美团 Bearer 会话' } }
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size')) || 20))

  if (!groupbuyLive(session)) {
    return {
      status: 200,
      body: {
        ok: false,
        platform: 'meituan',
        items: [],
        total: 0,
        message: GROUPBUY_UNAVAILABLE,
      },
    }
  }

  const path = meituanPathFromEnv(
    'MEITUAN_MARKETING_ACTIVITY_QUERY_PATH',
    '/marketing/activity/query',
  )
  const r = await meituanSignedRequest(session, path, {
    method: 'POST',
    body: { page, page_size: pageSize },
  })
  if (!r.ok) {
    return {
      status: 502,
      body: { ok: false, platform: 'meituan', message: r.message },
    }
  }
  const items = pickArrayFromMeituanPayload(r.json, ['activities', 'list', 'items'])
  const data = r.json.data as Record<string, unknown> | undefined
  const total =
    typeof data?.total === 'number' ? data.total : typeof r.json.total === 'number' ? r.json.total : items.length
  return {
    status: 200,
    body: {
      ok: true,
      platform: 'meituan',
      items,
      total,
      syncedAt: new Date().toISOString(),
    },
  }
}

// —— 财务对账 ——

function addCalendarDaysShanghai(ymd: string, delta: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + delta * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function enumerateYmdInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = []
  let cur = startYmd
  while (cur <= endYmd) {
    out.push(cur)
    cur = addCalendarDaysShanghai(cur, 1)
    if (out.length > 120) break
  }
  return out
}

export async function fetchMeituanFinanceReconcileRows(
  bearerToken: string,
  startYmd: string,
  endYmd: string,
): Promise<{ rows: FinanceReconcileRowPayload[]; warnings: string[] }> {
  const warnings: string[] = []
  const session = decodeMeituanSessionToken(bearerToken.trim())
  if (!session) {
    warnings.push('当前 Bearer 非美团绑定会话，无法拉取美团对账。')
    return { rows: [], warnings }
  }

  if (!groupbuyLive(session)) {
    warnings.push(GROUPBUY_UNAVAILABLE)
    return { rows: [], warnings }
  }

  const path = meituanPathFromEnv('MEITUAN_FINANCE_PATH', '/bill/daily/summary')
  const r = await meituanSignedRequest(session, path, {
    method: 'POST',
    body: { start_date: startYmd, end_date: endYmd, merchant_id: session.merchantId },
  })
  if (!r.ok) {
    warnings.push(r.message || '美团财务对账接口调用失败')
    return { rows: [], warnings }
  }

  const bills = pickArrayFromMeituanPayload(r.json, ['bills', 'rows', 'list', 'daily', 'items'])
  const rows: FinanceReconcileRowPayload[] = []
  if (bills.length) {
    for (const b of bills) {
      if (!b || typeof b !== 'object') continue
      const o = b as Record<string, unknown>
      const date = String(o.date ?? o.bill_date ?? o.day ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      rows.push({
        date,
        platform: 'meituan',
        platformLabel: '美团点评',
        orderCount: Number(o.order_count ?? o.orderCount ?? 0) || 0,
        verifyOrderCount: Number(o.verify_count ?? o.verifyOrderCount ?? 0) || 0,
        salesAmountYuan: Number(o.sales_amount ?? o.salesAmountYuan ?? 0) || 0,
        verifyAmountYuan: Number(o.verify_amount ?? o.verifyAmountYuan ?? 0) || 0,
      })
    }
  } else {
    warnings.push('美团对账接口未返回按日明细，请核对 MEITUAN_FINANCE_PATH 与业务包权限。')
  }
  return { rows, warnings }
}
