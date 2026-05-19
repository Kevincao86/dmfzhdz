/**
 * 小红书 OpenAPI 网关：门店、装修、商品、评价、营销活动、财务对账。
 * 参照 douyinMerchantGateway 与现有 ERP 前端约定；未配置 XHS_OPENAPI_BASE_URL 时返回演示数据便于联调 UI。
 * @see https://school.xiaohongshu.com/en/open/product/product-detail.html
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  decodeXhsSessionToken,
  encodeXhsSessionToken,
  xhsConfiguredForLiveApi,
  xhsPathFromEnv,
  xhsSignedRequest,
  pickArrayFromXhsPayload,
  type XhsMerchantSession,
} from './xhsOpenApiCore.js'

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
): XhsMerchantSession | null {
  if (!bearer) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return null
  }
  const session = decodeXhsSessionToken(bearer)
  if (!session) {
    json(res, 401, { message: '小红书会话无效或已失效，请在商家版后台重新绑定' })
    return null
  }
  return session
}

function isDemoSession(session: XhsMerchantSession): boolean {
  return session.demo === true || !xhsConfiguredForLiveApi()
}

// —— 演示数据（未接正式 OpenAPI 基址时）——

const DEMO_STORES: unknown[] = [
  {
    poi: {
      poi_id: 'xhs-demo-001',
      poi_name: '墨典演示门店·南山店',
      address: '广东省深圳市南山区科技园南路 88 号',
      city_name: '深圳市',
      district_name: '南山区',
      contact_phone: '0755-88880001',
      open_time_desc: '周一至周日 10:00-22:00',
    },
  },
  {
    poi: {
      poi_id: 'xhs-demo-002',
      poi_name: '墨典演示门店·福田店',
      address: '广东省深圳市福田区福华路 168 号',
      city_name: '深圳市',
      district_name: '福田区',
      contact_phone: '0755-88880002',
      open_time_desc: '周一至周日 09:30-21:30',
    },
  },
]

const DEMO_PRODUCTS = [
  {
    id: 'xhs-item-1001',
    name: '双人招牌套餐',
    price: 128,
    store: '墨典演示门店·南山店',
    status: '已上架',
    auditStatus: '审核通过',
    saleStatus: '售卖中',
    platform: 'xhs',
  },
  {
    id: 'xhs-item-1002',
    name: '100 元代金券',
    price: 88,
    store: '墨典演示门店·福田店',
    status: '已上架',
    auditStatus: '审核通过',
    saleStatus: '售卖中',
    platform: 'xhs',
  },
]

function demoReviews(): MerchantReviewRowXhs[] {
  const now = Date.now()
  return [
    {
      id: 'xhs-demo-review-1',
      platform: 'xhs',
      sentiment: 'good',
      userName: '小红书用户A',
      ratingStars: 5,
      content: '味道不错，服务热情，会再来。',
      createdAt: new Date(now - 2 * 86400000).toISOString(),
      replied: false,
    },
    {
      id: 'xhs-demo-review-2',
      platform: 'xhs',
      sentiment: 'neutral',
      userName: '小红书用户B',
      ratingStars: 3,
      content: '上菜稍慢，整体还可以。',
      createdAt: new Date(now - 5 * 86400000).toISOString(),
      replied: true,
      replyText: '感谢您的反馈，我们会加强出餐效率。',
    },
  ]
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

export type MerchantReviewRowXhs = {
  id: string
  platform: 'xhs'
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
  platform: 'xhs'
  platformLabel: string
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

// —— 绑定 / 同步 ——

export async function handleXhsBindPost(
  _req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  let appId = ''
  let appSecret = ''
  let extraId = ''
  try {
    const j = JSON.parse(bodyRaw || '{}') as {
      appId?: string
      appSecret?: string
      extraId?: string
    }
    appId = (j.appId ?? '').trim()
    appSecret = (j.appSecret ?? '').trim()
    extraId = (j.extraId ?? '').trim()
  } catch {
    json(res, 400, { message: '请求体须为 JSON：{ appId, appSecret, extraId? }' })
    return
  }
  if (!appId || !appSecret) {
    json(res, 400, { message: '请填写 AppID 与 App Secret' })
    return
  }

  const merchantId = extraId || `mt-${appId.slice(0, 8)}`
  let accessToken = `xhs-at-${randomUUID().replace(/-/g, '')}`
  let demo = !xhsConfiguredForLiveApi()

  if (xhsConfiguredForLiveApi()) {
    const tokenPath = xhsPathFromEnv('XHS_OAUTH_TOKEN_PATH', '/oauth/token')
    const r = await xhsSignedRequest(
      {
        v: 1,
        appKey: appId,
        appSecret,
        accessToken: '',
        merchantId,
      },
      tokenPath,
      {
        method: 'POST',
        body: {
          grant_type: 'client_credentials',
          developer_id: extraId || undefined,
        },
        extraSignParams: { grant_type: 'client_credentials' },
      },
    )
    if (r.ok) {
      const data = r.json.data
      const tok =
        (typeof r.json.access_token === 'string' && r.json.access_token) ||
        (data && typeof data === 'object' && typeof (data as Record<string, unknown>).access_token === 'string'
          ? String((data as Record<string, unknown>).access_token)
          : '') ||
        (typeof r.json.session === 'string' && r.json.session) ||
        ''
      if (tok) {
        accessToken = tok
        demo = false
      }
    }
    if (demo) {
      accessToken = `xhs-live-${randomUUID().replace(/-/g, '')}`
    }
  }

  const session: XhsMerchantSession = {
    v: 1,
    appKey: appId,
    appSecret,
    accessToken,
    merchantId,
    demo,
  }

  const token = encodeXhsSessionToken(session)
  json(res, 200, {
    accessToken: token,
    message: demo
      ? '已绑定（演示模式）：配置 XHS_OPENAPI_BASE_URL 与各业务 PATH 后将直连小红书 OpenAPI。'
      : '小红书绑定成功，请使用返回的 accessToken 作为 Bearer 调用网关。',
    demo,
  })
}

export async function handleXhsSyncPost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return
  json(res, 200, {
    syncedAt: new Date().toLocaleString('zh-CN'),
    message: isDemoSession(session)
      ? '演示模式：已刷新本地缓存时间戳。'
      : '已向小红书同步账户数据（门店/商品/评价等按各模块调用时拉取）。',
  })
}

export async function handleXhsConnectionCheckGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return
  json(res, 200, {
    ok: true,
    message: isDemoSession(session)
      ? '网关可达（演示数据）；生产请配置 XHS_OPENAPI_BASE_URL。'
      : '网关可达，小红书会话有效。',
    demo: isDemoSession(session),
    liveApi: xhsConfiguredForLiveApi(),
  })
}

// —— 门店 ——

async function fetchXhsStoreRows(session: XhsMerchantSession): Promise<unknown[]> {
  if (isDemoSession(session)) return [...DEMO_STORES]

  const path = xhsPathFromEnv('XHS_STORE_LIST_PATH', '/poi/list')
  const r = await xhsSignedRequest(session, path, {
    method: 'POST',
    body: { merchant_id: session.merchantId },
  })
  if (!r.ok) throw new Error(r.message)
  return pickArrayFromXhsPayload(r.json, [
    'pois',
    'poi_list',
    'shops',
    'list',
    'items',
    'stores',
  ])
}

export async function handleXhsStoresGet(
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
    let rows = await fetchXhsStoreRows(session)
    if (keyword) rows = rows.filter((row) => poiSearchHay(row).includes(keyword))
    const total = rows.length
    const slice = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    json(res, 200, {
      items: slice,
      total,
      accountName: isDemoSession(session) ? '墨典演示商户' : session.merchantId,
      tabCounts: { claimed: total, claiming: 0 },
      emptyHint: isDemoSession(session)
        ? '当前为演示门店；在小红书技术服务合作中心申请门店查询能力并配置 XHS_OPENAPI_BASE_URL、XHS_STORE_LIST_PATH 后返回真实数据。'
        : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `小红书门店列表失败：${msg}` })
  }
}

export async function handleXhsStoreDetailGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const session = requireSession(res, parseBearer(req))
  if (!session) return
  const poiId = (url.searchParams.get('poiId') ?? url.searchParams.get('shopId') ?? '').trim()
  if (!poiId) {
    json(res, 400, { message: '缺少 query poiId（小红书门店 ID）' })
    return
  }

  try {
    if (isDemoSession(session)) {
      const hit = DEMO_STORES.find((row) => {
        const o = row as Record<string, unknown>
        const poi = o.poi as Record<string, unknown>
        return String(poi?.poi_id) === poiId
      })
      json(res, 200, { ok: true, poi: hit ?? { poi: { poi_id: poiId, poi_name: '演示门店' } } })
      return
    }
    const path = xhsPathFromEnv('XHS_STORE_DETAIL_PATH', '/poi/detail')
    const r = await xhsSignedRequest(session, path, {
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
    json(res, 502, { message: `小红书门店详情失败：${msg}` })
  }
}

export async function handleXhsStoreDecorationGet(
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
    let rows = await fetchXhsStoreRows(session)
    if (!isDemoSession(session)) {
      const decorPath = process.env.XHS_STORE_DECORATION_PATH?.trim()
      if (decorPath) {
        const r = await xhsSignedRequest(session, decorPath, {
          method: 'POST',
          body: { merchant_id: session.merchantId },
        })
        if (r.ok) {
          const decor = pickArrayFromXhsPayload(r.json, ['items', 'list', 'decorations'])
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
      message: isDemoSession(session)
        ? '演示模式：装修字段由门店基础信息映射；配置 XHS_STORE_DECORATION_PATH 可拉取独立装修接口。'
        : '由门店/装修 OpenAPI 聚合；未返回的列显示为「—」。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `小红书门店装修列表失败：${msg}` })
  }
}

// —— 商品 ——

function mapXhsProductRow(row: unknown): Record<string, unknown> | null {
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
    platform: 'xhs',
  }
}

export async function handleXhsGoodsProductsListGet(
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
    if (isDemoSession(session)) {
      json(res, 200, {
        ok: true,
        data: {
          items: DEMO_PRODUCTS,
          total: DEMO_PRODUCTS.length,
          page,
          page_size: pageSize,
        },
        message: '演示商品；配置 XHS_OPENAPI_BASE_URL 与 XHS_GOODS_LIST_PATH 后返回线上团购/套餐。',
      })
      return
    }

    const path = xhsPathFromEnv('XHS_GOODS_LIST_PATH', '/ark/open_api/v1/items')
    const r = await xhsSignedRequest(session, path, {
      method: 'POST',
      body: { page, page_size: pageSize, merchant_id: session.merchantId },
    })
    if (!r.ok) {
      json(res, 502, { ok: false, message: r.message })
      return
    }
    const raw = pickArrayFromXhsPayload(r.json, ['deals', 'products', 'list', 'items'])
    const items = raw.map(mapXhsProductRow).filter((x): x is Record<string, unknown> => x != null)
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
    json(res, 502, { ok: false, message: `小红书商品列表失败：${msg}` })
  }
}

export async function handleXhsGoodsProductSavePost(
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

  if (isDemoSession(session)) {
    json(res, 200, {
      ok: true,
      productId: `mt-draft-${randomUUID().slice(0, 8)}`,
      message: '演示模式：商品已记为草稿；配置 OpenAPI 后写入小红书团购/套餐创建接口。',
    })
    return
  }

  const path = xhsPathFromEnv('XHS_GOODS_SAVE_PATH', '/deal/save')
  const r = await xhsSignedRequest(session, path, { method: 'POST', body })
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

export async function fetchXhsReviews(
  bearerToken: string,
): Promise<{ ok: true; items: MerchantReviewRowXhs[] } | { ok: false; message: string }> {
  const session = decodeXhsSessionToken(bearerToken.trim())
  if (!session) {
    return { ok: false, message: '小红书会话无效，请先在商家版后台完成绑定。' }
  }

  if (isDemoSession(session)) {
    return { ok: true, items: demoReviews() }
  }

  const path = xhsPathFromEnv('XHS_REVIEW_LIST_PATH', '/ugc/comment/query')
  const nowSec = Math.floor(Date.now() / 1000)
  const startSec = nowSec - 90 * 86400
  const r = await xhsSignedRequest(session, path, {
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
        '评价查询失败（请在小红书开放平台申请「评价管理」类能力并配置 XHS_REVIEW_LIST_PATH）',
    }
  }

  const comments = pickArrayFromXhsPayload(r.json, ['comments', 'reviews', 'list', 'items'])
  const out: MerchantReviewRowXhs[] = []
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
      '小红书用户'
    const replyText =
      typeof row.reply_content === 'string'
        ? row.reply_content.trim()
        : typeof row.merchant_reply === 'string'
          ? row.merchant_reply.trim()
          : undefined
    out.push({
      id: `xhs:${id}`,
      platform: 'xhs',
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

export function parseXhsReviewId(reviewId: string): { commentId: string } | null {
  const id = reviewId.trim()
  if (!id) return null
  if (id.startsWith('xhs:')) return { commentId: id.slice(3) }
  if (id.startsWith('xhs-demo-')) return { commentId: id }
  return { commentId: id }
}

export async function postXhsCommentReply(
  bearerToken: string,
  reviewId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = decodeXhsSessionToken(bearerToken.trim())
  if (!session) return { ok: false, message: '小红书会话无效。' }

  const parsed = parseXhsReviewId(reviewId)
  if (!parsed) return { ok: false, message: '评价 ID 无效' }

  if (isDemoSession(session) || parsed.commentId.startsWith('xhs-demo-')) {
    return { ok: true }
  }

  const path = xhsPathFromEnv('XHS_REVIEW_REPLY_PATH', '/ugc/comment/reply')
  const r = await xhsSignedRequest(session, path, {
    method: 'POST',
    body: { comment_id: parsed.commentId, reply_content: text },
  })
  if (!r.ok) return { ok: false, message: r.message }
  return { ok: true }
}

// —— 营销活动 ——

export async function fetchXhsMarketingActivities(
  bearer: string,
  url: URL,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const session = decodeXhsSessionToken(bearer)
  if (!session) {
    return { status: 401, body: { ok: false, message: '缺少有效小红书 Bearer 会话' } }
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size')) || 20))

  if (isDemoSession(session)) {
    return {
      status: 200,
      body: {
        ok: true,
        platform: 'xhs',
        items: [
          {
            id: 'mt-act-demo-1',
            title: '春季招商活动（演示）',
            status: '报名中',
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 14 * 86400000).toISOString(),
          },
        ],
        total: 1,
        syncedAt: new Date().toISOString(),
        upstreamNote:
          '演示数据。正式环境请配置 XHS_OPENAPI_BASE_URL 与 XHS_MARKETING_ACTIVITY_QUERY_PATH。',
      },
    }
  }

  const path = xhsPathFromEnv(
    'XHS_MARKETING_ACTIVITY_QUERY_PATH',
    '/marketing/activity/query',
  )
  const r = await xhsSignedRequest(session, path, {
    method: 'POST',
    body: { page, page_size: pageSize },
  })
  if (!r.ok) {
    return {
      status: 502,
      body: { ok: false, platform: 'xhs', message: r.message },
    }
  }
  const items = pickArrayFromXhsPayload(r.json, ['activities', 'list', 'items'])
  const data = r.json.data as Record<string, unknown> | undefined
  const total =
    typeof data?.total === 'number' ? data.total : typeof r.json.total === 'number' ? r.json.total : items.length
  return {
    status: 200,
    body: {
      ok: true,
      platform: 'xhs',
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

export async function fetchXhsFinanceReconcileRows(
  bearerToken: string,
  startYmd: string,
  endYmd: string,
): Promise<{ rows: FinanceReconcileRowPayload[]; warnings: string[] }> {
  const warnings: string[] = []
  const session = decodeXhsSessionToken(bearerToken.trim())
  if (!session) {
    warnings.push('当前 Bearer 非小红书绑定会话，无法拉取小红书对账。')
    return { rows: [], warnings }
  }

  if (isDemoSession(session)) {
    const rows: FinanceReconcileRowPayload[] = []
    for (const date of enumerateYmdInclusive(startYmd, endYmd)) {
      const seed = date.split('-').reduce((a, b) => a + Number(b), 0)
      rows.push({
        date,
        platform: 'xhs',
        platformLabel: '小红书',
        orderCount: 8 + (seed % 12),
        verifyOrderCount: 6 + (seed % 10),
        salesAmountYuan: 1200 + (seed % 500),
        verifyAmountYuan: 980 + (seed % 400),
      })
    }
    warnings.push('小红书对账为演示数据；配置 XHS_FINANCE_PATH 后返回真实账单汇总。')
    return { rows, warnings }
  }

  const path = xhsPathFromEnv('XHS_FINANCE_PATH', '/bill/daily/summary')
  const r = await xhsSignedRequest(session, path, {
    method: 'POST',
    body: { start_date: startYmd, end_date: endYmd, merchant_id: session.merchantId },
  })
  if (!r.ok) {
    warnings.push(r.message || '小红书财务对账接口调用失败')
    return { rows: [], warnings }
  }

  const bills = pickArrayFromXhsPayload(r.json, ['bills', 'rows', 'list', 'daily', 'items'])
  const rows: FinanceReconcileRowPayload[] = []
  if (bills.length) {
    for (const b of bills) {
      if (!b || typeof b !== 'object') continue
      const o = b as Record<string, unknown>
      const date = String(o.date ?? o.bill_date ?? o.day ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      rows.push({
        date,
        platform: 'xhs',
        platformLabel: '小红书',
        orderCount: Number(o.order_count ?? o.orderCount ?? 0) || 0,
        verifyOrderCount: Number(o.verify_count ?? o.verifyOrderCount ?? 0) || 0,
        salesAmountYuan: Number(o.sales_amount ?? o.salesAmountYuan ?? 0) || 0,
        verifyAmountYuan: Number(o.verify_amount ?? o.verifyAmountYuan ?? 0) || 0,
      })
    }
  } else {
    warnings.push('小红书对账接口未返回按日明细，请核对 XHS_FINANCE_PATH 与业务包权限。')
  }
  return { rows, warnings }
}
