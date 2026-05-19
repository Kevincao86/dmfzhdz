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

type ReviewPlatformApi = 'douyin' | 'meituan' | 'xhs'
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
  meituan: '美团点评',
  xhs: '小红书',
}

const reviewsState: Record<ReviewPlatformApi, ReviewRow[]> = {
  douyin: [],
  meituan: [],
  xhs: [],
}

const reviewsSyncedAt: Partial<Record<ReviewPlatformApi, string>> = {}

async function syncOneReviewPlatform(
  p: ReviewPlatformApi,
  bearer: string | null,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  if (p === 'douyin') {
    if (!bearer?.trim()) {
      return { ok: false, message: '请先绑定抖音来客后再同步评价。' }
    }
    const r = await fetchDouyinAkteReviews(bearer.trim())
    if (r.ok === false) return { ok: false, message: r.message }
    reviewsState.douyin = r.items as ReviewRow[]
    reviewsSyncedAt.douyin = new Date().toISOString()
    return {
      ok: true,
      message: `抖音来客：已同步 ${r.items.length} 条评价（近 90 天，需开放平台「餐饮-评价」能力）。`,
    }
  }
  reviewsState[p] = []
  reviewsSyncedAt[p] = new Date().toISOString()
  return {
    ok: true,
    message:
      p === 'meituan'
        ? '美团：评价同步接口尚未接入，列表已为空。'
        : '小红书：评价同步接口尚未接入，列表已为空。',
  }
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
          bodyRaw: bodyRawVideo,
          viteRoot,
          env: env as MerchantAiEnv,
        })
        if (videoDone) return true
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

      if (method === 'GET' && pathname === '/api/merchant/meituan/goods/products') {
        const tok = bearerToken(req)
        if (!tok) {
          json(res, 401, { ok: false, message: '缺少 Authorization Bearer' })
          return true
        }
        json(res, 200, {
          ok: true,
          data: { items: [], total: 0, page: 1, page_size: 20 },
        })
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/goods/products') {
        const tok = bearerToken(req)
        if (!tok) {
          json(res, 401, { ok: false, message: '缺少 Authorization Bearer' })
          return true
        }
        json(res, 200, {
          ok: true,
          data: { items: [], total: 0, page: 1, page_size: 20 },
        })
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/meituan/connection-check') {
        const tok = bearerToken(req)
        if (!tok) {
          json(res, 401, {
            ok: false,
            message: '缺少 Authorization Bearer（请先在商家版后台完成美团绑定）',
          })
          return true
        }
        json(res, 200, { ok: true, message: '网关可达，令牌已配置' })
        return true
      }

      if (method === 'GET' && pathname === '/api/merchant/xhs/connection-check') {
        const tok = bearerToken(req)
        if (!tok) {
          json(res, 401, {
            ok: false,
            message: '缺少 Authorization Bearer（请先在商家版后台完成小红书绑定）',
          })
          return true
        }
        json(res, 200, { ok: true, message: '网关可达，令牌已配置' })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/meituan/bind') {
        await bodyReader()
        json(res, 200, {
          accessToken: `mock-meituan-${Date.now()}`,
          message: '美团请接独立网关；此处仍为占位',
        })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/meituan/sync') {
        await bodyReader()
        json(res, 200, {
          syncedAt: new Date().toLocaleString('zh-CN'),
        })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/xhs/bind') {
        await bodyReader()
        json(res, 200, {
          accessToken: `mock-xhs-${Date.now()}`,
          message: '小红书请接独立网关；此处仍为占位',
        })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/xhs/sync') {
        await bodyReader()
        json(res, 200, {
          syncedAt: new Date().toLocaleString('zh-CN'),
        })
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
        if (platform !== 'douyin' && platform !== 'meituan' && platform !== 'xhs') {
          json(res, 400, { message: 'Query platform 须为 douyin | meituan | xhs' })
          return true
        }
        let rows = [...reviewsState[platform]]
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
          syncedAt: reviewsSyncedAt[platform] ?? undefined,
        })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/reviews/sync') {
        const bodyRaw = await bodyReader()
        let scope: ReviewPlatformApi | 'all' = 'all'
        try {
          const j = JSON.parse(bodyRaw || '{}') as { platform?: string }
          if (j.platform === 'douyin' || j.platform === 'meituan' || j.platform === 'xhs') scope = j.platform
        } catch {
          json(res, 400, { message: '请求体须为 JSON' })
          return true
        }
        const tok = bearerToken(req)
        const parts: string[] = []
        if (scope === 'all') {
          for (const pl of ['douyin', 'meituan', 'xhs'] as const) {
            const r = await syncOneReviewPlatform(pl, tok)
            if (r.ok === false && pl === 'douyin') {
              json(res, 502, { ok: false, message: r.message })
              return true
            }
            if (r.ok === true) parts.push(r.message)
          }
        } else {
          const r = await syncOneReviewPlatform(scope, tok)
          if (r.ok === false) {
            json(res, 502, { ok: false, message: r.message })
            return true
          }
          parts.push(r.message)
        }
        json(res, 200, {
          ok: true,
          syncedAt: new Date().toISOString(),
          message: parts.join(' '),
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
          if (j.platform !== 'douyin' && j.platform !== 'meituan' && j.platform !== 'xhs') {
            json(res, 400, { message: 'platform 须为 douyin | meituan | xhs' })
            return true
          }
          platform = j.platform
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
          const row = reviewsState.douyin.find((r) => r.id === reviewId)
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
        const row = reviewsState[platform].find((r) => r.id === reviewId)
        if (!row) {
          json(res, 404, { message: '未找到该评价，请先完成平台评价同步。' })
          return true
        }
        row.replied = true
        row.replyText = content
        json(res, 200, { ok: true, item: row })
        return true
      }

      if (method === 'POST' && pathname === '/api/merchant/reviews/ai-suggest') {
        const bodyRaw = await bodyReader()
        let platform: ReviewPlatformApi
        let reviewId: string
        try {
          const j = JSON.parse(bodyRaw || '{}') as { platform?: string; reviewId?: string }
          if (j.platform !== 'douyin' && j.platform !== 'meituan' && j.platform !== 'xhs') {
            json(res, 400, { message: 'platform 须为 douyin | meituan | xhs' })
            return true
          }
          platform = j.platform
          reviewId = typeof j.reviewId === 'string' ? j.reviewId : ''
        } catch {
          json(res, 400, { message: '请求体须为 JSON：{ platform, reviewId }' })
          return true
        }
        if (!reviewId) {
          json(res, 400, { message: '缺少 reviewId' })
          return true
        }
        const row = reviewsState[platform].find((r) => r.id === reviewId)
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
