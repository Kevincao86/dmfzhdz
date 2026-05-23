/**
 * /api/merchant/* 路由核心：供 Vite 中间件与 Vercel Serverless 共用。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  handleDouyinBindPost,
  handleDouyinBrandsGet,
  handleDouyinGoodsCategoryGet,
  handleDouyinGoodsImageUploadPost,
  handleDouyinGoodsIndustryScopeGet,
  handleDouyinGoodsProductDraftQueryGet,
  handleDouyinGoodsProductGetGet,
  handleDouyinGoodsProductOnlineQueryGet,
  handleDouyinGoodsProductOperatePost,
  handleDouyinGoodsProductPullSyncPost,
  handleDouyinGoodsProductsListGet,
  handleDouyinGoodsProductSavePost,
  handleDouyinGoodsProductTypesGet,
  handleDouyinGoodsTemplateGetGet,
  handleDouyinPoiClaimPost,
  handleDouyinStoreDecorationGet,
  handleDouyinStoreDetailGet,
  handleDouyinStoresGet,
  fetchDouyinAkteReviews,
  parseDouyinReviewCompositeId,
  postDouyinAkteCommentReply,
} from './douyinMerchantGateway.js'
import {
  handleKuaishouBindPost,
  handleKuaishouBrandsGet,
  handleKuaishouGoodsCategoryGet,
  handleKuaishouGoodsImageUploadPost,
  handleKuaishouGoodsIndustryScopeGet,
  handleKuaishouGoodsProductDraftQueryGet,
  handleKuaishouGoodsProductGetGet,
  handleKuaishouGoodsProductOnlineQueryGet,
  handleKuaishouGoodsProductOperatePost,
  handleKuaishouGoodsProductPullSyncPost,
  handleKuaishouGoodsProductsListGet,
  handleKuaishouGoodsProductSavePost,
  handleKuaishouGoodsProductTypesGet,
  handleKuaishouGoodsTemplateGetGet,
  handleKuaishouPoiClaimPost,
  handleKuaishouStoreDecorationGet,
  handleKuaishouStoreDetailGet,
  handleKuaishouStoresGet,
  fetchKuaishouAkteReviews,
  parseKuaishouReviewCompositeId,
  postKuaishouAkteCommentReply,
} from './kuaishouMerchantGateway.js'
import { decodeMeituanSessionToken } from './meituanOpenApiCore.js'
import {
  fetchMeituanReviews,
  handleMeituanBindPost,
  handleMeituanConnectionCheckGet,
  handleMeituanGoodsProductSavePost,
  handleMeituanGoodsProductsListGet,
  handleMeituanStoreDecorationGet,
  handleMeituanStoreDetailGet,
  handleMeituanStoresGet,
  handleMeituanSyncPost,
  parseMeituanReviewId,
  postMeituanCommentReply,
} from './meituanMerchantGateway.js'
import { handleFinanceReconcileGet } from './financeReconcileGateway.js'
import {
  generateGrossMarginSuggestionByAi,
  generateReviewReplyByDoubao,
  handleDouyinGoodsAiAssist,
  type MerchantAiEnv,
} from './merchantAiUpstream.js'
import { handleMerchantAiVideoRoutes } from './merchantVideoAiGateway.js'
import { handleMarketingActivitiesListGet } from './marketingActivitiesGateway.js'
import { handleLocalPromotionRoutes } from './localPromotionGateway.js'
import { handleXhsCommercialRoutes } from './xhsCommercialGateway.js'
import { decodeXhsSessionToken } from './xhsOpenApiCore.js'
import {
  fetchXhsReviews,
  handleXhsBindPost,
  handleXhsConnectionCheckGet,
  handleXhsGoodsProductSavePost,
  handleXhsGoodsProductsListGet,
  handleXhsStoreDecorationGet,
  handleXhsStoreDetailGet,
  handleXhsStoresGet,
  handleXhsSyncPost,
  parseXhsReviewId,
  postXhsCommentReply,
} from './xhsMerchantGateway.js'
import {
  decodeWaimaiBearer,
  fetchWaimaiReviews,
  tryHandleWaimaiMerchantRoute,
  type WaimaiPlatformKey,
} from './waimaiMerchantGateway.js'
import {
  handleMerchantDashboardSummaryGet,
  handleMerchantHomeExtraStatsGet,
} from './merchantDashboardGateway.js'

type ReviewPlatformApi = 'douyin' | 'kuaishou' | 'meituan' | 'xhs' | WaimaiPlatformKey
type ReviewSentiment = 'good' | 'neutral' | 'bad'
type ReviewRow = {
  id: string
  platform: ReviewPlatformApi
  sentiment: ReviewSentiment
  userName: string
  ratingStars: number
  content: string
  createdAt: string
  replied: boolean
  replyText?: string
}

const REVIEW_PLATFORM_LABELS: Record<ReviewPlatformApi, string> = {
  douyin: '抖音来客',
  kuaishou: '快手团购',
  meituan: '美团点评',
  xhs: '小红书',
  eleme: '淘宝闪购',
  meituan_waimai: '美团外卖',
  jd_waimai: '京东外卖',
}

const reviewsStoreState: Record<ReviewPlatformApi, ReviewRow[]> = {
  douyin: [],
  kuaishou: [],
  meituan: [],
  xhs: [],
  eleme: [],
  meituan_waimai: [],
  jd_waimai: [],
}

const reviewsProductState: Record<ReviewPlatformApi, ReviewRow[]> = {
  douyin: [],
  kuaishou: [],
  meituan: [],
  xhs: [],
  eleme: [],
  meituan_waimai: [],
  jd_waimai: [],
}

const reviewsSyncedAt: Partial<Record<ReviewPlatformApi, string>> = {}
const reviewsProductSyncedAt: Partial<Record<ReviewPlatformApi, string>> = {}

function reviewStateBucket(kind: 'store' | 'product'): Record<ReviewPlatformApi, ReviewRow[]> {
  return kind === 'product' ? reviewsProductState : reviewsStoreState
}

function reviewSyncedAtKey(kind: 'store' | 'product', platform: ReviewPlatformApi): string | undefined {
  return kind === 'product' ? reviewsProductSyncedAt[platform] : reviewsSyncedAt[platform]
}

function findReviewRow(platform: ReviewPlatformApi, reviewId: string): ReviewRow | undefined {
  return (
    reviewsStoreState[platform].find((r) => r.id === reviewId) ??
    reviewsProductState[platform].find((r) => r.id === reviewId)
  )
}

type ReviewSyncOpts = {
  kind?: 'store' | 'product'
  poiId?: string
  productId?: string
  poiIds?: string[]
  productIds?: string[]
}

async function syncOneReviewPlatform(
  p: ReviewPlatformApi,
  bearer: string | null,
  opts?: ReviewSyncOpts,
): Promise<
  { ok: true; message: string; items?: ReviewRow[]; syncedAt: string } | { ok: false; message: string }
> {
  const kind = opts?.kind ?? 'store'
  const syncedAt = new Date().toISOString()
  if (p === 'douyin') {
    if (!bearer?.trim()) {
      return { ok: false, message: '请先绑定抖音来客后再同步评价。' }
    }
    const r = await fetchDouyinAkteReviews(bearer.trim(), {
      kind,
      poiId: opts?.poiId,
      productId: opts?.productId,
      poiIds: opts?.poiIds,
      productIds: opts?.productIds,
    })
    if (r.ok === false) return { ok: false, message: r.message }
    if (kind === 'product') {
      reviewsProductState.douyin = r.items as ReviewRow[]
      reviewsProductSyncedAt.douyin = syncedAt
    } else {
      reviewsStoreState.douyin = r.items as ReviewRow[]
      reviewsSyncedAt.douyin = syncedAt
    }
    return {
      ok: true,
      message: `抖音来客：已同步 ${r.items.length} 条${kind === 'product' ? '商品' : '门店'}评价（近 90 天）。`,
      items: r.items as ReviewRow[],
      syncedAt,
    }
  }

  if (p === 'kuaishou') {
    if (!bearer?.trim()) {
      return { ok: false, message: '请先绑定快手团购后再同步评价。' }
    }
    const r = await fetchKuaishouAkteReviews(bearer.trim(), {
      kind,
      poiId: opts?.poiId,
      productId: opts?.productId,
      poiIds: opts?.poiIds,
      productIds: opts?.productIds,
    })
    if (r.ok === false) return { ok: false, message: r.message }
    if (kind === 'product') {
      reviewsProductState.kuaishou = r.items as ReviewRow[]
      reviewsProductSyncedAt.kuaishou = syncedAt
    } else {
      reviewsStoreState.kuaishou = r.items as ReviewRow[]
      reviewsSyncedAt.kuaishou = syncedAt
    }
    return {
      ok: true,
      message: `快手团购：已同步 ${r.items.length} 条${kind === 'product' ? '商品' : '门店'}评价（近 90 天）。`,
      items: r.items as ReviewRow[],
      syncedAt,
    }
  }
  if (p === 'meituan') {
    if (!bearer?.trim()) {
      return { ok: false, message: '请先绑定美团后再同步评价。' }
    }
    const r = await fetchMeituanReviews(bearer.trim())
    if (r.ok === false) return { ok: false, message: r.message }
    reviewsStoreState.meituan = r.items as ReviewRow[]
    reviewsSyncedAt.meituan = syncedAt
    return {
      ok: true,
      message: `美团：已同步 ${r.items.length} 条评价（近 90 天，需开放平台评价管理能力）。`,
      items: r.items as ReviewRow[],
      syncedAt,
    }
  }
  if (p === 'xhs') {
    if (!bearer?.trim()) {
      return { ok: false, message: '请先绑定小红书后再同步评价。' }
    }
    const r = await fetchXhsReviews(bearer.trim())
    if (r.ok === false) return { ok: false, message: r.message }
    reviewsStoreState.xhs = r.items as ReviewRow[]
    reviewsSyncedAt.xhs = syncedAt
    return {
      ok: true,
      message: `小红书：已同步 ${r.items.length} 条评价（近 90 天）。`,
      items: r.items as ReviewRow[],
      syncedAt,
    }
  }
  if (p === 'eleme' || p === 'meituan_waimai' || p === 'jd_waimai') {
    if (!bearer?.trim()) {
      return { ok: false, message: `请先绑定${REVIEW_PLATFORM_LABELS[p]}后再同步评价。` }
    }
    const r = await fetchWaimaiReviews(p, bearer.trim())
    if (r.ok === false) return { ok: false, message: r.message }
    reviewsStoreState[p] = r.items as ReviewRow[]
    reviewsSyncedAt[p] = syncedAt
    return {
      ok: true,
      message: `${REVIEW_PLATFORM_LABELS[p]}：已同步 ${r.items.length} 条评价。`,
      items: r.items as ReviewRow[],
      syncedAt,
    }
  }
  return { ok: false, message: '未知平台' }
}


export type MerchantApiGatewayContext = {
  method: string
  pathname: string
  url: URL
  req: IncomingMessage
  res: ServerResponse
  env: Record<string, string>
  viteRoot: string
  bodyReader: () => Promise<string>
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function bearerToken(req: IncomingMessage): string | null {
  const h = req.headers.authorization
  if (!h || typeof h !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  const t = m?.[1]?.trim()
  return t || null
}

function headerBearerToken(req: IncomingMessage, headerName: string): string | null {
  const raw = req.headers[headerName]
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || typeof v !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(v.trim())
  return m?.[1]?.trim() || null
}

function reviewPlatformBearer(req: IncomingMessage, platform: ReviewPlatformApi): string | null {
  if (platform === 'douyin') {
    return headerBearerToken(req, 'x-meoo-douyin-token') ?? bearerToken(req)
  }
  if (platform === 'kuaishou') {
    return headerBearerToken(req, 'x-meoo-kuaishou-token') ?? bearerToken(req)
  }
  if (platform === 'meituan') {
    const mt = headerBearerToken(req, 'x-meoo-meituan-token')
    if (mt) return mt
    const auth = bearerToken(req)
    if (auth && decodeMeituanSessionToken(auth)) return auth
    return null
  }
  if (platform === 'xhs') {
    const xh = headerBearerToken(req, 'x-meoo-xhs-token')
    if (xh) return xh
    const auth = bearerToken(req)
    if (auth && decodeXhsSessionToken(auth)) return auth
    return null
  }
  if (platform === 'eleme' || platform === 'meituan_waimai' || platform === 'jd_waimai') {
    const header =
      platform === 'eleme'
        ? 'x-meoo-eleme-token'
        : platform === 'meituan_waimai'
          ? 'x-meoo-meituan-waimai-token'
          : 'x-meoo-jd-waimai-token'
    const tok = headerBearerToken(req, header)
    if (tok) return tok
    const auth = bearerToken(req)
    if (auth && decodeWaimaiBearer(platform, auth)) return auth
    return null
  }
  return bearerToken(req)
}

function isReviewPlatformApi(s: string): s is ReviewPlatformApi {
  return (
    s === 'douyin' ||
    s === 'kuaishou' ||
    s === 'meituan' ||
    s === 'xhs' ||
    s === 'eleme' ||
    s === 'meituan_waimai' ||
    s === 'jd_waimai'
  )
}

export async function handleMerchantApiGatewayCore(ctx: MerchantApiGatewayContext): Promise<boolean> {
  const { method, pathname, url, req, res, env, viteRoot, bodyReader } = ctx
  try {

      if (pathname.startsWith('/api/merchant/ai/video/')) {
        let bodyRawVideo = ''
        if (method === 'POST') bodyRawVideo = await bodyReader()
        const videoDone = await handleMerchantAiVideoRoutes({
          method,
          pathname,
          searchParams: url.searchParams,
          res,
          req,
          bodyRaw: bodyRawVideo,
          viteRoot,
          env: env as MerchantAiEnv,
        })
        if (videoDone) return true
      }

      if (pathname.startsWith('/api/merchant/eleme/') ||
        pathname.startsWith('/api/merchant/meituan_waimai/') ||
        pathname.startsWith('/api/merchant/jd_waimai/') ||
        pathname === '/api/merchant/eleme/bind' ||
        pathname === '/api/merchant/meituan_waimai/bind' ||
        pathname === '/api/merchant/jd_waimai/bind') {
        let bodyWaimai = ''
        if (method === 'POST') bodyWaimai = await bodyReader()
        const waimaiDone = await tryHandleWaimaiMerchantRoute({
          method,
          pathname,
          req,
          res,
          url,
          bodyRaw: bodyWaimai,
        })
        if (waimaiDone) return true
      }

      if (method === 'GET' && pathname === '/api/merchant/marketing/activities') {
        await handleMarketingActivitiesListGet(req, res, url)
        return true
      }

      if (pathname.startsWith('/api/merchant/local-promotion/')) {
        let bodyRawLp = ''
        if (method === 'POST') bodyRawLp = await bodyReader()
        const lpDone = await handleLocalPromotionRoutes(
          method,
          pathname,
          url,
          res,
          bodyRawLp,
          env as MerchantAiEnv,
        )
        if (lpDone) return true
      }

      if (
        pathname.startsWith('/api/merchant/xhs-commercial/') ||
        pathname.startsWith('/api/merchant/xhs-juguang/') ||
        pathname.startsWith('/api/merchant/xhs-zhongxiaocao/')
      ) {
        let bodyRawXhsAd = ''
        if (method === 'POST') bodyRawXhsAd = await bodyReader()
        const xhsAdDone = await handleXhsCommercialRoutes(
          method,
          pathname,
          url,
          res,
          bodyRawXhsAd,
          env as MerchantAiEnv,
        )
        if (xhsAdDone) return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/bind') {
        const bodyRaw = await bodyReader()
        await handleDouyinBindPost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/stores/detail') {
        await handleDouyinStoreDetailGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/stores') {
        await handleDouyinStoresGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/brands') {
        await handleDouyinBrandsGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/stores/poi/claim') {
        const bodyRaw = await bodyReader()
        await handleDouyinPoiClaimPost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/store-decoration') {
        await handleDouyinStoreDecorationGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/industry-scope') {
        await handleDouyinGoodsIndustryScopeGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/category/get') {
        await handleDouyinGoodsCategoryGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/product/online/query') {
        await handleDouyinGoodsProductOnlineQueryGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/product/draft/query') {
        await handleDouyinGoodsProductDraftQueryGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/goods/image/upload') {
        const bodyRaw = await bodyReader()
        await handleDouyinGoodsImageUploadPost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/product-types') {
        await handleDouyinGoodsProductTypesGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/template/get') {
        await handleDouyinGoodsTemplateGetGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/goods/ai/assist') {
        const bodyRaw = await bodyReader()
        let body: Record<string, unknown> = {}
        try {
          body = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
        } catch {
          json(res, 400, { ok: false, message: '请求体须为 JSON' })
          return true
        }
        await handleDouyinGoodsAiAssist(res, body, env)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/products') {
        await handleDouyinGoodsProductsListGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/douyin/goods/product/get') {
        await handleDouyinGoodsProductGetGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/goods/product/sync') {
        const bodyRaw = await bodyReader()
        await handleDouyinGoodsProductPullSyncPost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/goods/product/operate') {
        const bodyRaw = await bodyReader()
        await handleDouyinGoodsProductOperatePost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/douyin/goods/product/save') {
        const bodyRaw = await bodyReader()
        await handleDouyinGoodsProductSavePost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/bind') {
        const bodyRaw = await bodyReader()
        await handleKuaishouBindPost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/stores/detail') {
        await handleKuaishouStoreDetailGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/stores') {
        await handleKuaishouStoresGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/brands') {
        await handleKuaishouBrandsGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/stores/poi/claim') {
        const bodyRaw = await bodyReader()
        await handleKuaishouPoiClaimPost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/store-decoration') {
        await handleKuaishouStoreDecorationGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/industry-scope') {
        await handleKuaishouGoodsIndustryScopeGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/category/get') {
        await handleKuaishouGoodsCategoryGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/product/online/query') {
        await handleKuaishouGoodsProductOnlineQueryGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/product/draft/query') {
        await handleKuaishouGoodsProductDraftQueryGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/goods/image/upload') {
        const bodyRaw = await bodyReader()
        await handleKuaishouGoodsImageUploadPost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/product-types') {
        await handleKuaishouGoodsProductTypesGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/template/get') {
        await handleKuaishouGoodsTemplateGetGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/goods/ai/assist') {
        const bodyRaw = await bodyReader()
        let body: Record<string, unknown> = {}
        try {
          body = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
        } catch {
          json(res, 400, { ok: false, message: '请求体须为 JSON' })
          return true
        }
        await handleDouyinGoodsAiAssist(res, body, env)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/products') {
        await handleKuaishouGoodsProductsListGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/kuaishou/goods/product/get') {
        await handleKuaishouGoodsProductGetGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/goods/product/sync') {
        const bodyRaw = await bodyReader()
        await handleKuaishouGoodsProductPullSyncPost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/goods/product/operate') {
        const bodyRaw = await bodyReader()
        await handleKuaishouGoodsProductOperatePost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/kuaishou/goods/product/save') {
        const bodyRaw = await bodyReader()
        await handleKuaishouGoodsProductSavePost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/meituan/goods/products') {
        await handleMeituanGoodsProductsListGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/meituan/goods/product/save') {
        const bodyRaw = await bodyReader()
        await handleMeituanGoodsProductSavePost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/meituan/stores/detail') {
        await handleMeituanStoreDetailGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/meituan/stores') {
        await handleMeituanStoresGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/meituan/store-decoration') {
        await handleMeituanStoreDecorationGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/goods/products') {
        await handleXhsGoodsProductsListGet(req, res, url)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/xhs/goods/product/save') {
        const bodyRaw = await bodyReader()
        await handleXhsGoodsProductSavePost(req, res, bodyRaw)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/stores/detail') {
        await handleXhsStoreDetailGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/stores') {
        await handleXhsStoresGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/store-decoration') {
        await handleXhsStoreDecorationGet(req, res, url)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/meituan/connection-check') {
        await handleMeituanConnectionCheckGet(req, res)
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/connection-check') {
        await handleXhsConnectionCheckGet(req, res)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/meituan/bind') {
        const bodyRaw = await bodyReader()
        await handleMeituanBindPost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/meituan/sync') {
        await bodyReader()
        await handleMeituanSyncPost(req, res)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/xhs/bind') {
        const bodyRaw = await bodyReader()
        await handleXhsBindPost(req, res, bodyRaw)
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/xhs/sync') {
        await bodyReader()
        await handleXhsSyncPost(req, res)
        return true
      }

      /**
       * 财务对账台：GET /api/merchant/finance/reconcile?days=14 或 ?startDate=&endDate=
       * 抖音来客走开放平台真实订单查询；美团/小红书待接开放平台。
       */
      if (method === 'GET' && pathname === '/api/merchant/finance/reconcile') {
        await handleFinanceReconcileGet(req, res, url)
        return true
      }

      const dashMatch = /^\/api\/merchant\/(douyin|meituan|xhs)\/dashboard\/summary$/.exec(pathname)
      if (method === 'GET' && dashMatch) {
        await handleMerchantDashboardSummaryGet(
          req,
          res,
          url,
          dashMatch[1] as 'douyin' | 'meituan' | 'xhs',
        )
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/home/extra-stats') {
        await handleMerchantHomeExtraStatsGet(req, res)
        return true
      }

      /**
       * 门店毛利建议：本地优先调用豆包 / 通义千问生成三平台参考毛利率；无 Key 时用中性预设文案（不含「演示」类措辞）。
       */
      if (method === 'GET' && pathname === '/api/merchant/store/gross-margin-advisor') {
        const categoryId = (url.searchParams.get('categoryId') ?? '').trim()
        const industryPathParam = (url.searchParams.get('industryPath') ?? '').trim()
        const industryCode = (url.searchParams.get('industryCode') ?? '').trim()
        const fallbackNote =
          '全网综合毛利率口径：聚合公开行业报告与平台团购类目的常见区间作估算，仅供参考；未接入大模型时由网关返回与类目匹配的预设区间，生产环境可叠加门店认证类目与经营数据。'

        type Row = {
          industryName: string
          industryPath: string
          industryCode: string
          suggestedPercent: { douyin: number; meituan: number; xhs: number }
        }

        const presets: Record<string, Row> = {
          '': {
            industryName: '餐饮',
            industryPath: '餐饮 > 火锅/汤锅',
            industryCode: 'life_food_hotpot',
            suggestedPercent: { douyin: 42, meituan: 40, xhs: 39 },
          },
          life_food_hotpot: {
            industryName: '餐饮',
            industryPath: '餐饮 > 火锅/汤锅',
            industryCode: 'life_food_hotpot',
            suggestedPercent: { douyin: 42, meituan: 40, xhs: 39 },
          },
          life_food_bbq: {
            industryName: '餐饮',
            industryPath: '餐饮 > 烧烤',
            industryCode: 'life_food_bbq',
            suggestedPercent: { douyin: 40, meituan: 38, xhs: 37 },
          },
          life_food_fast: {
            industryName: '餐饮',
            industryPath: '餐饮 > 快餐小吃',
            industryCode: 'life_food_fast',
            suggestedPercent: { douyin: 35, meituan: 33, xhs: 32 },
          },
          life_beauty_hair: {
            industryName: '丽人',
            industryPath: '丽人 > 美发',
            industryCode: 'life_beauty_hair',
            suggestedPercent: { douyin: 55, meituan: 52, xhs: 54 },
          },
          life_beauty_nail: {
            industryName: '丽人',
            industryPath: '丽人 > 美甲美睫',
            industryCode: 'life_beauty_nail',
            suggestedPercent: { douyin: 58, meituan: 55, xhs: 57 },
          },
          life_leisure_ktv: {
            industryName: '休闲娱乐',
            industryPath: '休闲娱乐 > KTV',
            industryCode: 'life_leisure_ktv',
            suggestedPercent: { douyin: 48, meituan: 45, xhs: 46 },
          },
          life_sport_gym: {
            industryName: '运动健身',
            industryPath: '运动健身 > 健身房',
            industryCode: 'life_sport_gym',
            suggestedPercent: { douyin: 50, meituan: 48, xhs: 49 },
          },
        }
        let row: Row = presets[industryCode] ?? presets['']
        if (categoryId) {
          const mockLeafAdvisor: Record<
            string,
            { industryPath: string; suggestedPercent: { douyin: number; meituan: number; xhs: number } }
          > = {
            l3_supermarket_voucher: {
              industryPath: '购物 > 商超便利 > 商超代金券',
              suggestedPercent: { douyin: 32, meituan: 30, xhs: 31 },
            },
            l3_supermarket_pkg: {
              industryPath: '购物 > 商超便利 > 到店自提套餐',
              suggestedPercent: { douyin: 33, meituan: 31, xhs: 32 },
            },
            l3_dept_giftcard: {
              industryPath: '购物 > 百货零售 > 礼品卡/提货券',
              suggestedPercent: { douyin: 30, meituan: 28, xhs: 29 },
            },
            l3_lang_trial: {
              industryPath: '学习培训 > 语言培训 > 体验课',
              suggestedPercent: { douyin: 52, meituan: 50, xhs: 51 },
            },
            l3_vocational_intro: {
              industryPath: '学习培训 > 职业技能 > 入门课包',
              suggestedPercent: { douyin: 48, meituan: 46, xhs: 47 },
            },
            l3_pet_bath: {
              industryPath: '宠物 > 宠物服务 > 洗护套餐',
              suggestedPercent: { douyin: 45, meituan: 43, xhs: 44 },
            },
            l3_pet_snack: {
              industryPath: '宠物 > 宠物商品 > 零食礼包',
              suggestedPercent: { douyin: 36, meituan: 34, xhs: 35 },
            },
            l3_skin_care: {
              industryPath: '医疗医美 > 轻医美 > 皮肤护理',
              suggestedPercent: { douyin: 58, meituan: 55, xhs: 56 },
            },
          }
          const hit = mockLeafAdvisor[categoryId]
          if (hit) {
            const path = industryPathParam || hit.industryPath
            const nameHead = path.split('>')[0]?.trim() || '本地生活'
            row = {
              industryName: nameHead,
              industryPath: path,
              industryCode: categoryId.slice(0, 48),
              suggestedPercent: hit.suggestedPercent,
            }
          } else {
            let h = 0
            for (let i = 0; i < categoryId.length; i++) {
              h = (h + categoryId.charCodeAt(i) * (i + 1)) % 251
            }
            const d = 34 + (h % 14)
            const m = Math.max(28, d - 2)
            const x = Math.max(27, m - 1)
            const path =
              industryPathParam ||
              `抖音来客类目（${categoryId.length > 12 ? `${categoryId.slice(0, 10)}…` : categoryId}）`
            const nameHead = path.split('>')[0]?.trim() || '本地生活'
            row = {
              industryName: nameHead,
              industryPath: path,
              industryCode: categoryId.slice(0, 48),
              suggestedPercent: {
                douyin: Math.min(92, Math.max(28, d)),
                meituan: Math.min(90, Math.max(26, m)),
                xhs: Math.min(89, Math.max(25, x)),
              },
            }
          }
        }

        const pathForAi = (industryPathParam || row.industryPath).trim()
        const aiEnv = env as MerchantAiEnv
        const aiPack = await generateGrossMarginSuggestionByAi(aiEnv, {
          industryPath: pathForAi,
          industryName: row.industryName,
        })

        if (aiPack) {
          json(res, 200, {
            ok: true,
            data: {
              industryName: row.industryName,
              industryPath: pathForAi,
              industryCode: row.industryCode,
              suggestedPercent: aiPack.suggestedPercent,
              benchmarkNote: aiPack.benchmarkNote,
              dataSource: aiPack.modelVendor === 'doubao' ? '豆包大模型' : '通义千问大模型',
              fetchedAt: new Date().toISOString(),
            },
          })
          return true
        }

        json(res, 200, {
          ok: true,
          data: {
            ...row,
            industryPath: pathForAi,
            benchmarkNote: fallbackNote,
            dataSource:
              '预设区间（在服务端 .env 配置 MERCHANT_AI_DOUBAO_KEY 或 MERCHANT_AI_QWEN_KEY 后启用豆包/通义千问生成建议）',
            fetchedAt: new Date().toISOString(),
          },
        })
        return true
      }

      /**
       * 评论管理：列表 / 同步 / 人工回复 / 差评豆包话术（生产由网关代理各平台评价查询与回复 OpenAPI）。
       */
      if (method === 'GET' && pathname === '/api/merchant/reviews') {
        const platform = (url.searchParams.get('platform') ?? 'douyin').trim() as ReviewPlatformApi
        const sentiment = (url.searchParams.get('sentiment') ?? 'all').trim()
        const replyStatus = (url.searchParams.get('replyStatus') ?? 'all').trim()
        const kindRaw = (url.searchParams.get('kind') ?? 'store').trim()
        const kind: 'store' | 'product' = kindRaw === 'product' ? 'product' : 'store'
        const poiId = (url.searchParams.get('poiId') ?? '').trim()
        const productId = (url.searchParams.get('productId') ?? '').trim()
        if (!isReviewPlatformApi(platform)) {
          json(res, 400, {
            message:
              'Query platform 须为 douyin | meituan | xhs | eleme | meituan_waimai | jd_waimai',
          })
          return true
        }
        const bucket = reviewStateBucket(kind)
        const bearer = reviewPlatformBearer(req, platform)
        /** 列表 GET 不实时打平台 OpenAPI（Serverless 易触发抖音限频）；请用 POST /reviews/sync 拉取 */
        void bearer
        let rows = [...bucket[platform]]
        if (poiId) {
          rows = rows.filter((r) => String((r as { poiId?: string }).poiId ?? '') === poiId)
        }
        if (productId) {
          rows = rows.filter((r) => String((r as { productId?: string }).productId ?? '') === productId)
        }
        if (sentiment === 'good') rows = rows.filter((r) => r.sentiment === 'good')
        else if (sentiment === 'neutral') rows = rows.filter((r) => r.sentiment === 'neutral')
        else if (sentiment === 'bad') rows = rows.filter((r) => r.sentiment === 'bad')
        else if (sentiment !== 'all') {
          json(res, 400, { message: 'Query sentiment 须为 all | good | neutral | bad' })
          return true
        }
        const stats = {
          total: rows.length,
          replied: rows.filter((r) => r.replied).length,
          unreplied: rows.filter((r) => !r.replied).length,
        }
        if (replyStatus === 'replied') rows = rows.filter((r) => r.replied)
        else if (replyStatus === 'unreplied') rows = rows.filter((r) => !r.replied)
        else if (replyStatus !== 'all') {
          json(res, 400, { message: 'Query replyStatus 须为 all | replied | unreplied' })
          return true
        }
        json(res, 200, {
          ok: true,
          items: rows,
          stats,
          syncedAt: reviewSyncedAtKey(kind, platform),
        })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/reviews/sync') {
        const bodyRaw = await bodyReader()
        let scope: ReviewPlatformApi | 'all' = 'all'
        let syncOpts: ReviewSyncOpts = { kind: 'store' }
        try {
          const j = JSON.parse(bodyRaw || '{}') as {
            platform?: string
            kind?: string
            poiId?: string
            productId?: string
            poiIds?: string[]
            productIds?: string[]
          }
          if (j.platform && isReviewPlatformApi(j.platform)) scope = j.platform
          if (j.kind === 'product') syncOpts.kind = 'product'
          if (typeof j.poiId === 'string' && j.poiId.trim()) syncOpts.poiId = j.poiId.trim()
          if (typeof j.productId === 'string' && j.productId.trim())
            syncOpts.productId = j.productId.trim()
          if (Array.isArray(j.poiIds)) {
            syncOpts.poiIds = j.poiIds.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 120)
          }
          if (Array.isArray(j.productIds)) {
            syncOpts.productIds = j.productIds
              .map((x) => String(x ?? '').trim())
              .filter(Boolean)
              .slice(0, 120)
          }
        } catch {
          json(res, 400, { message: '请求体须为 JSON' })
          return true
        }
        const parts: string[] = []
        let syncedItems: ReviewRow[] | undefined
        let syncedAt = new Date().toISOString()
        if (scope === 'all') {
          for (const pl of [
            'douyin',
            'meituan',
            'xhs',
            'eleme',
            'meituan_waimai',
            'jd_waimai',
          ] as const) {
            const r = await syncOneReviewPlatform(pl, reviewPlatformBearer(req, pl), syncOpts)
            if (r.ok === false && pl === 'douyin') {
              json(res, 502, { ok: false, message: r.message })
              return true
            }
            if (r.ok === true) {
              parts.push(r.message)
              if (pl === 'douyin') {
                syncedItems = r.items
                syncedAt = r.syncedAt
              }
            }
          }
        } else {
          const r = await syncOneReviewPlatform(scope, reviewPlatformBearer(req, scope), syncOpts)
          if (r.ok === false) {
            json(res, 502, { ok: false, message: r.message })
            return true
          }
          parts.push(r.message)
          syncedItems = r.items
          syncedAt = r.syncedAt
        }
        json(res, 200, {
          ok: true,
          syncedAt,
          message: parts.join(' '),
          items: syncedItems,
        })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/reviews/reply') {
        const bodyRaw = await bodyReader()
        let platform: ReviewPlatformApi
        let reviewId: string
        let content: string
        try {
          const j = JSON.parse(bodyRaw || '{}') as {
            platform?: string
            reviewId?: string
            content?: string
          }
          if (!isReviewPlatformApi(j.platform ?? '')) {
            json(res, 400, {
              message:
                'platform 须为 douyin | meituan | xhs | eleme | meituan_waimai | jd_waimai',
            })
            return true
          }
          platform = j.platform as ReviewPlatformApi
          reviewId = typeof j.reviewId === 'string' ? j.reviewId : ''
          content = typeof j.content === 'string' ? j.content.trim() : ''
        } catch {
          json(res, 400, { message: '请求体须为 JSON：{ platform, reviewId, content }' })
          return true
        }
        if (!reviewId || !content) {
          json(res, 400, { message: '缺少 reviewId 或 content' })
          return true
        }
        if (platform === 'douyin') {
          const tok = bearerToken(req)
          if (!tok) {
            json(res, 401, { message: '请先绑定抖音来客后再回复评价。' })
            return true
          }
          const parsed = parseDouyinReviewCompositeId(reviewId)
          if (!parsed) {
            json(res, 400, { message: '评价 ID 无效，请重新同步列表。' })
            return true
          }
          const pr = await postDouyinAkteCommentReply(tok, parsed.poiId, parsed.rateId, content)
          if (pr.ok === false) {
            json(res, 502, { ok: false, message: pr.message })
            return true
          }
          const row = findReviewRow('douyin', reviewId)
          if (row) {
            row.replied = true
            row.replyText = content
            json(res, 200, { ok: true, item: row })
            return true
          }
          json(res, 200, {
            ok: true,
            item: {
              id: reviewId,
              platform: 'douyin',
              sentiment: 'good',
              userName: '',
              ratingStars: 0,
              content: '',
              createdAt: new Date().toISOString(),
              replied: true,
              replyText: content,
            },
          })
          return true
        }
        if (platform === 'kuaishou') {
          const tok = reviewPlatformBearer(req, 'kuaishou')
          if (!tok) {
            json(res, 401, { message: '请先绑定快手团购后再回复评价。' })
            return true
          }
          const parsed = parseKuaishouReviewCompositeId(reviewId)
          if (!parsed) {
            json(res, 400, { message: '评价 ID 无效，请重新同步列表。' })
            return true
          }
          const pr = await postKuaishouAkteCommentReply(tok, parsed.poiId, parsed.rateId, content)
          if (pr.ok === false) {
            json(res, 502, { ok: false, message: pr.message })
            return true
          }
          const row = findReviewRow('kuaishou', reviewId)
          if (row) {
            row.replied = true
            row.replyText = content
            json(res, 200, { ok: true, item: row })
            return true
          }
          json(res, 200, {
            ok: true,
            item: {
              id: reviewId,
              platform: 'kuaishou',
              sentiment: 'good',
              userName: '',
              ratingStars: 0,
              content: '',
              createdAt: new Date().toISOString(),
              replied: true,
              replyText: content,
            },
          })
          return true
        }
        if (platform === 'meituan') {
          const tok = reviewPlatformBearer(req, 'meituan')
          if (!tok) {
            json(res, 401, { message: '请先绑定美团后再回复评价。' })
            return true
          }
          if (!parseMeituanReviewId(reviewId)) {
            json(res, 400, { message: '评价 ID 无效，请重新同步列表。' })
            return true
          }
          const pr = await postMeituanCommentReply(tok, reviewId, content)
          if (pr.ok === false) {
            json(res, 502, { ok: false, message: pr.message })
            return true
          }
          const row = findReviewRow('meituan', reviewId)
          if (row) {
            row.replied = true
            row.replyText = content
            json(res, 200, { ok: true, item: row })
            return true
          }
          json(res, 200, {
            ok: true,
            item: {
              id: reviewId,
              platform: 'meituan',
              sentiment: 'good',
              userName: '',
              ratingStars: 0,
              content: '',
              createdAt: new Date().toISOString(),
              replied: true,
              replyText: content,
            },
          })
          return true
        }
        if (platform === 'xhs') {
          const tok = reviewPlatformBearer(req, 'xhs')
          if (!tok) {
            json(res, 401, { message: '请先绑定小红书后再回复评价。' })
            return true
          }
          if (!parseXhsReviewId(reviewId)) {
            json(res, 400, { message: '评价 ID 无效，请重新同步列表。' })
            return true
          }
          const pr = await postXhsCommentReply(tok, reviewId, content)
          if (pr.ok === false) {
            json(res, 502, { ok: false, message: pr.message })
            return true
          }
          const row = findReviewRow('xhs', reviewId)
          if (row) {
            row.replied = true
            row.replyText = content
            json(res, 200, { ok: true, item: row })
            return true
          }
          json(res, 200, {
            ok: true,
            item: {
              id: reviewId,
              platform: 'xhs',
              sentiment: 'good',
              userName: '',
              ratingStars: 0,
              content: '',
              createdAt: new Date().toISOString(),
              replied: true,
              replyText: content,
            },
          })
          return true
        }
        if (platform === 'eleme' || platform === 'meituan_waimai' || platform === 'jd_waimai') {
          const row = findReviewRow(platform, reviewId)
          if (row) {
            row.replied = true
            row.replyText = content
            json(res, 200, { ok: true, item: row })
            return true
          }
          json(res, 200, {
            ok: true,
            item: {
              id: reviewId,
              platform,
              sentiment: 'good',
              userName: '',
              ratingStars: 0,
              content: '',
              createdAt: new Date().toISOString(),
              replied: true,
              replyText: content,
            },
          })
          return true
        }
        json(res, 400, { message: '未知评价平台' })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/reviews/ai-suggest') {
        const bodyRaw = await bodyReader()
        let platform: ReviewPlatformApi
        let reviewId: string
        try {
          const j = JSON.parse(bodyRaw || '{}') as { platform?: string; reviewId?: string }
          if (!isReviewPlatformApi(j.platform ?? '')) {
            json(res, 400, {
              message:
                'platform 须为 douyin | meituan | xhs | eleme | meituan_waimai | jd_waimai',
            })
            return true
          }
          platform = j.platform as ReviewPlatformApi
          reviewId = typeof j.reviewId === 'string' ? j.reviewId : ''
        } catch {
          json(res, 400, { message: '请求体须为 JSON：{ platform, reviewId }' })
          return true
        }
        if (!reviewId) {
          json(res, 400, { message: '缺少 reviewId' })
          return true
        }
        const row = findReviewRow(platform, reviewId)
        if (!row) {
          json(res, 404, { message: '未找到该评价' })
          return true
        }
        const aiEnv = env as MerchantAiEnv
        const aiRes = await generateReviewReplyByDoubao(aiEnv, {
          platformLabel: REVIEW_PLATFORM_LABELS[platform],
          userName: row.userName,
          reviewText: row.content,
          ratingStars: row.ratingStars,
          sentiment: row.sentiment,
        })
        if (aiRes.ok === false) {
          json(res, 502, { ok: false, message: aiRes.message })
          return true
        }
        json(res, 200, { ok: true, suggestion: aiRes.text })
        return true
      }

      const draftMatch = /^\/api\/merchant\/(douyin|meituan|xhs)\/product\/draft$/.exec(pathname)
      if (method === 'POST' && draftMatch) {
        await bodyReader()
        const plat = draftMatch[1]
        json(res, 200, {
          ok: true,
          draftId: `${plat}-draft-${Date.now()}`,
          message:
            '本地为占位响应：部署时请由网关代理各平台「创建商品」OpenAPI，并返回平台侧商品/草稿 ID。',
        })
        return true
      }

      return false
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 500, { message: msg || 'merchant api gateway error' })
    return true
  }
}
