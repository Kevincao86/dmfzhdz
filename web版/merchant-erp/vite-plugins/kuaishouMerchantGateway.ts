/**
 * 开发环境：将 ERP 的 /api/merchant/douyin/* 直连快手生活服务开放平台（真实数据，无演示门店）。
 * 依赖 Node 18+ fetch；凭证仅存于本机 dev server 内存，不写入前端 bundle。
 *
 * 门店列表：GET https://open.kwailocallife.com/goodlife/v1/shop/poi/query/
 * 门店品牌（来客「门店品牌」）：GET https://open.kwailocallife.com/goodlife/v2/shop/brand/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query
 *
 * 门店亮照/认领：POST https://open.kwailocallife.com/goodlife/v1/poi/poi/claim/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/poi.claim
 *
 * SDK 总览（Java / Node / Go）：https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/sdk-overview
 *
 * Client Token：POST https://open.kwailocallife.com/oauth/client_token/
 *
 * 商品类目：GET https://open.kwailocallife.com/goodlife/v1/goods/category/get/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/category.get
 *
 * 商品线上列表（模糊搜品名，套餐单品匹配）：GET https://open.kwailocallife.com/goodlife/v1/goods/product/online/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query
 *
 * 商品草稿列表（创建/审核中商品，可与线上结果合并）：GET https://open.kwailocallife.com/goodlife/v1/goods/product/draft/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/query
 *
 * 门店资质：GET https://open.kwailocallife.com/goodlife/v1/poi/cert/info/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/store-qualification-info
 *
 * 异步任务结果：GET https://open.kwailocallife.com/goodlife/v1/poi/task/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/task.query
 *
 * 门店基础信息更新（异步）：POST goodlife/v1/poi/poi/update/ — 生产后端按需代理。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/poi.update
 *
 * 能力授权与门店绑定：见快手「auth_with_bind」文档（生产网关实现）。
 *
 * 出口 IP 需固定时：在部署环境设置 `KUAISHOU_OPENAPI_BASE_URL` 为自建反代根（如 `http://<EIP>/douyin`），路径仍与官方一致。
 * 配置非官方基址后，goodlife 与 OAuth（未单独设 KUAISHOU_OPENAPI_OAUTH_BASE_URL 时）**默认不再回落** open.kwailocallife.com，避免出口 IP 与白名单不一致；排障可临时设 `KUAISHOU_OPENAPI_GOODLIFE_OFFICIAL_FALLBACK=1`。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import {
  kuaishouOpenApiUrl,
  kuaishouServerFetch,
  exchangeKuaishouClientToken,
  extractPoisFromShopQueryData,
  fetchGoodlifeWithOfficialFallback,
  invalidateKuaishouMerchantClientTokenCache,
  isLikelyKuaishouClientTokenExpiredBizError,
  parseKuaishouJson,
  parseKuaishouOpenApiEnvelope,
} from '../api/kuaishouOpenApiBase.js'
import { runKuaishouMerchantBind } from '../api/kuaishou-bind.js'
import { extractLifeBrandStructName } from '../src/lib/douyinLifeBrandExtract.js'
import {
  attrKeyIsDouyinDescription,
} from '../src/lib/douyinDescriptionNormalize.js'
import {
  applyDouyinProductDescriptionAttrs,
  describeDouyinDescriptionAttrForLog,
  isDouyinDescriptionAttrUnused,
  validateDouyinDescriptionAttrForSave,
} from '../src/lib/douyinProductDescriptionAttrs.js'
import {
  finalizeDouyinProductAttrsByTemplate,
  isDouyinNoteRichTextJsonString,
} from '../src/lib/douyinNoteRichTextFormat.js'
import {
  attrKeyIsDouyinSubTitle,
  buildDouyinSubTitleFromTradeRules,
  extractDouyinSubTitleTradeContextFromErp,
  finalizeDouyinSubTitleInProductAttrs,
} from '../src/lib/douyinSubTitleNormalize.js'
import {
  applyDouyinProductDiyNameStrategy,
  attrKeyIsDouyinPlatformUnifiedDescription,
  attrKeyIsDouyinProductDiyName,
  buildDouyinVoucherDaiCoreName,
  describeDouyinProductDiyNameForLog,
  finalizeDouyinVoucherNameAttrsInProductMap,
  isDouyinProductDiyNameBizError,
  normalizeDouyinVoucherProductTitle,
  type DouyinProductDiyNameApplyStrategy,
} from '../src/lib/douyinProductDiyNameFormat.js'
import {
  douyinAppointmentJson,
  douyinCanNoUseDateJson,
  douyinLimitUseRuleJson,
  douyinUseDateJson,
  douyinUseTimeJson,
  normalizeDouyinShowChannelValue,
  normalizeGoodlifeProductTopLevelTimes,
  applyErpExtendedRulesToGoodlifeSave,
  sanitizeDouyinTradeRuleProductAttrs,
  toDouyinUnixSeconds,
} from '../src/lib/douyinTradeRuleAttrNormalize.js'
import {
  type KuaishouMerchantSession,
  kuaishouMerchantDevSessions,
  openKuaishouSessionCredentials,
} from '../api/merchant/kuaishou/bindShared.js'
import { mockDouyinProductStore } from './mockDouyinProductStore.js'
import { createClient } from '@supabase/supabase-js'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from './merchantSupabaseAdminEnv.js'

export { runKuaishouMerchantBind }

/** 绑定链路若 hang 住，Vercel 会以 FUNCTION_INVOCATION_FAILED 结束；对快手出口强制限时 */
const KUAISHOU_FETCH_TIMEOUT_MS = 25_000

/** 商品保存：template/get + 组装 与 product/save 分阶段限时，避免共用一个 55s 导致 save 未发出、Vercel 无完整日志 */
function douyinGoodsSaveBuildBudgetMs(): number {
  const raw = process.env.KUAISHOU_GOODS_BUILD_TIMEOUT_MS?.trim()
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(n) && n >= 8000 && n <= 90_000) return n
  return 38_000
}

/** POST goodlife/v1/goods/product/save/ 单独预算（与中继「是否收到 save」对照） */
function douyinGoodsSavePostBudgetMs(): number {
  const raw = process.env.KUAISHOU_GOODS_SAVE_POST_TIMEOUT_MS?.trim()
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(n) && n >= 12_000 && n <= 180_000) return n
  const legacy = process.env.KUAISHOU_GOODS_HTTP_TIMEOUT_MS?.trim()
  const leg = legacy ? Number.parseInt(legacy, 10) : Number.NaN
  if (Number.isFinite(leg) && leg >= 12_000 && leg <= 180_000) return leg
  return 75_000
}

/** 同一实例内缓存 template/get，减少保存草稿/提交审核连续点击时的串行耗时 */
type TemplateAttrsBundle = {
  productAttrs: Record<string, unknown>[]
  skuAttrs: Record<string, unknown>[]
  /** template.get 实际命中的 goodlife product_type（代金券常为 11，ERP UI 为 2） */
  resolvedProductType?: number
  resolvedOpenBizType?: number
}

const templateAttrsBundleCache = new Map<string, { expiresAt: number; bundle: TemplateAttrsBundle }>()

function templateAttrsBundleCacheTtlMs(): number {
  const raw = process.env.MERCHANT_KUAISHOU_TEMPLATE_CACHE_MS?.trim()
  if (raw === '0') return 0
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(n) && n >= 0 && n <= 3_600_000) return n
  return 600_000
}

function templateAttrsBundleCacheKey(accountId: string, categoryId: string, productType: number): string {
  /** v5：template/get 仅返回 spu_attrs 时合并进 product；空模板时用文档标准 key 合成 */
  return `${accountId}\t${categoryId}\t${productType}\tv6tpl`
}

function douyinFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return kuaishouServerFetch(input, {
    ...init,
    signal: AbortSignal.timeout(KUAISHOU_FETCH_TIMEOUT_MS),
  })
}

export type MerchantReviewRowDouyin = {
  id: string
  platform: 'kuaishou'
  sentiment: 'good' | 'neutral' | 'bad'
  userName: string
  ratingStars: number
  content: string
  createdAt: string
  replied: boolean
  replyText?: string
  reviewKind?: 'store' | 'product'
  poiId?: string
  poiName?: string
  productId?: string
  productName?: string
}

export type KuaishouAkteReviewFetchOpts = {
  kind?: 'store' | 'product' | 'all'
  poiId?: string
  productId?: string
  /** 客户端传入的 poi_id 列表（同步全部门店时优先使用，避免服务端 POI 缓存未命中） */
  poiIds?: string[]
  productIds?: string[]
}

/** 同一 Lambda 实例内缓存解密后的会话，减少重复申请 client_token */
const sealedSessionRuntimeCache = new Map<string, KuaishouMerchantSession>()

function resolveSession(authToken: string): KuaishouMerchantSession | undefined {
  const t = authToken.trim()
  if (!t) return undefined
  const mem = kuaishouMerchantDevSessions.get(t)
  if (mem) return mem
  let cached = sealedSessionRuntimeCache.get(t)
  if (cached) return cached
  const opened = openKuaishouSessionCredentials(t)
  if (!opened) return undefined
  cached = {
    clientKey: opened.clientKey,
    clientSecret: opened.clientSecret,
    merchantId: opened.merchantId,
    douyinToken: '',
    douyinExpiresAtMs: 0,
  }
  sealedSessionRuntimeCache.set(t, cached)
  return cached
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** 快手部分字段以字符串形式返回 error_code，仅用 number 判断会漏掉业务失败 */
function numericErrorCode(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function getDataError(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const rootCode = numericErrorCode(j.error_code)
  if (rootCode !== undefined && rootCode !== 0) {
    return { ok: false, msg: String(j.description ?? j.msg ?? `快手根 error_code=${rootCode}`) }
  }
  const mes = typeof j.message === 'string' ? j.message.trim().toLowerCase() : ''
  if (mes === 'error' || mes === 'fail' || mes === 'failed') {
    const data = j.data
    const d =
      data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined
    return {
      ok: false,
      msg: String(d?.description ?? j.description ?? j.msg ?? '快手接口返回失败'),
    }
  }
  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const code = numericErrorCode(d.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(d.description ?? `快手 error_code=${code}`) }
    }
  }
  const extra = j.extra
  if (extra && typeof extra === 'object') {
    const e = extra as Record<string, unknown>
    const code = numericErrorCode(e.error_code)
    if (code !== undefined && code !== 0) {
      const sub =
        typeof e.sub_description === 'string' && e.sub_description.trim()
          ? e.sub_description.trim()
          : ''
      const desc =
        typeof e.description === 'string' && e.description.trim() ? e.description.trim() : ''
      return {
        ok: false,
        msg: sub || desc || `快手 extra error_code=${code}`,
      }
    }
  }
  return { ok: true }
}

async function fetchKuaishouClientToken(
  clientKey: string,
  clientSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  return exchangeKuaishouClientToken(clientKey, clientSecret, douyinFetch)
}

async function ensureKuaishouToken(s: KuaishouMerchantSession): Promise<string> {
  const skew = 120_000
  if (s.douyinToken && Date.now() < s.douyinExpiresAtMs - skew) {
    return s.douyinToken
  }
  const { token, expiresIn } = await fetchKuaishouClientToken(s.clientKey, s.clientSecret)
  s.douyinToken = token
  s.douyinExpiresAtMs = Date.now() + Math.max(300, expiresIn) * 1000
  return token
}

/** 快手侧偶发提前失效 client_token：清空缓存、重领 token 后重试一次 goodlife 请求 */
async function withKuaishouClientTokenRetry<T>(
  session: KuaishouMerchantSession,
  opts: { sessionKey?: string },
  op: (accessToken: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureKuaishouToken(session)
    try {
      return await op(token)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt === 0 && isLikelyKuaishouClientTokenExpiredBizError(msg)) {
        invalidateKuaishouMerchantClientTokenCache(session)
        if (opts.sessionKey) clearSessionPoiCache(opts.sessionKey)
        continue
      }
      throw e
    }
  }
  throw new Error('withKuaishouClientTokenRetry: exhausted retries')
}

async function shopPoiQueryPage(
  accountId: string,
  accessToken: string,
  page: number,
  size: number,
  /** 0 认领 / 1 关联 / 2 挂靠；不传则走平台默认（认领） */
  relationType?: 0 | 1 | 2,
): Promise<Record<string, unknown>> {
  const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/shop/poi/query/'))
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('page', String(Math.max(1, page)))
  u.searchParams.set('size', String(Math.min(50, Math.max(1, size))))
  if (relationType !== undefined) {
    u.searchParams.set('relation_type', String(relationType))
  }

  const { status, raw } = await fetchGoodlifeWithOfficialFallback(douyinFetch, u.toString(), {
    method: 'GET',
    headers: {
      'access-token': accessToken,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  if (status < 200 || status >= 300) {
    throw new Error(`shop/query HTTP ${status}：${raw.slice(0, 400)}`)
  }
  const j = parseKuaishouOpenApiEnvelope(raw, 'shop/query')
  const err = getDataError(j)
  if (!err.ok) throw new Error(err.msg ?? 'shop/query 业务错误')
  return j
}

/** 单店：仅传 poi_id（与文档一致；account_id 与 poi_id 同时传时 account_id 优先，故勿同时传 account_id） */
async function shopPoiQuerySinglePoi(
  poiId: string,
  accountId: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/shop/poi/query/'))
  u.searchParams.set('poi_id', poiId.trim())
  u.searchParams.set('page', '1')
  u.searchParams.set('size', '20')
  const { status, raw } = await fetchGoodlifeWithOfficialFallback(douyinFetch, u.toString(), {
    method: 'GET',
    headers: {
      'access-token': accessToken,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  if (status < 200 || status >= 300) {
    throw new Error(`shop/query(poi_id) HTTP ${status}：${raw.slice(0, 400)}`)
  }
  const j = parseKuaishouOpenApiEnvelope(raw, 'shop/query(poi_id)')
  const err = getDataError(j)
  if (!err.ok) throw new Error(err.msg ?? 'shop/query(poi_id) 业务错误')
  return j
}

/** 查询门店资质信息；权限 life.capacity.shop，与 shop.query 同会话 */
async function poiCertInfoGet(
  poiId: string,
  merchantLifeAccountId: string,
  accessToken: string,
  rpcTransitAccount: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
  const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/poi/cert/info/'))
  u.searchParams.set('merchant_life_account_id', merchantLifeAccountId.trim())
  u.searchParams.set('poi_id', poiId.trim())
  try {
    const res = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': rpcTransitAccount,
      },
    })
    const raw = await res.text()
    const j = parseKuaishouJson(raw) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, message: `cert/info HTTP ${res.status}：${raw.slice(0, 400)}` }
    }
    const err = getDataError(j)
    if (!err.ok) return { ok: false, message: err.msg ?? 'cert/info 业务错误' }
    return { ok: true, body: j }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}

/** 查询门店异步任务结果；权限 life.capacity.poi.task.query */
async function poiTaskQueryGet(
  taskIds: string[],
  accessToken: string,
  rpcTransitAccount: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
  const ids = taskIds.map((t) => t.trim()).filter(Boolean)
  if (ids.length === 0) return { ok: true, body: {} }
  const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/poi/task/query/'))
  u.searchParams.set('task_ids', JSON.stringify(ids))
  try {
    const res = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': rpcTransitAccount,
      },
    })
    const raw = await res.text()
    const j = parseKuaishouJson(raw) as Record<string, unknown>
    if (!res.ok) {
      return { ok: false, message: `task/query HTTP ${res.status}：${raw.slice(0, 400)}` }
    }
    const err = getDataError(j)
    if (!err.ok) return { ok: false, message: err.msg ?? 'task/query 业务错误' }
    return { ok: true, body: j }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}

function accountNameFromPois(pois: unknown[]): string | undefined {
  for (const row of pois) {
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
    const r2 =
      o.root_account && typeof o.root_account === 'object'
        ? (o.root_account as Record<string, unknown>)
        : null
    const n2 = r2?.account_name
    if (typeof n2 === 'string' && n2.trim()) return n2.trim()
  }
  return undefined
}

function poiSearchHay(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
  const id = String(poi.poi_id ?? poi.poiId ?? o.poi_id ?? o.poiId ?? '')
  const third = String(poi.third_id ?? o.third_id ?? '')
  const name = String(poi.poi_name ?? poi.name ?? '')
  const addr = String(poi.address ?? '')
  const city = String(poi.city ?? '')
  const remark = String(poi.remark ?? poi.remark_name ?? poi.note_name ?? poi.alias ?? '')
  const org = String(
    (typeof o.organization === 'string' && o.organization) ||
      (typeof poi.organization === 'string' && poi.organization) ||
      '',
  )
  return `${id} ${third} ${name} ${addr} ${city} ${remark} ${org}`.toLowerCase()
}

function extractRowPoiId(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const poi =
    o.poi && typeof o.poi === 'object' && !Array.isArray(o.poi)
      ? (o.poi as Record<string, unknown>)
      : null
  const fromNested = poi
    ? String(poi.poi_id ?? poi.poiId ?? poi.id ?? '').trim()
    : ''
  if (fromNested) return fromNested
  return String(o.poi_id ?? o.poiId ?? o.id ?? o.shop_id ?? '').trim()
}

/** 无 poi_id 时用名称+地址去重，避免接口字段漂移导致「有数据却 0 条」 */
function stableFallbackPoiKey(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const poi =
    o.poi && typeof o.poi === 'object' && !Array.isArray(o.poi)
      ? (o.poi as Record<string, unknown>)
      : o
  const name = String(poi.poi_name ?? o.poi_name ?? poi.name ?? o.name ?? '').trim()
  const addr = String(poi.address ?? o.address ?? poi.address_detail ?? o.address_detail ?? '').trim()
  const tail = `${name}|${addr}`.trim()
  return tail ? `fb:${tail.slice(0, 240)}` : ''
}

/** 快手 shop.query 易返回「请求太过频繁」：翻页与多种 relation 之间拉长间隔 + 失败退避重试 */
const SHOP_QUERY_PAGE_DELAY_MS = 380
const SHOP_QUERY_RELATION_SWITCH_DELAY_MS = 900

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isKuaishouOpenApiRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /太过频繁|太过于频繁|请稍后再试|rate limit|429|限流|频率过高|too many requests/i.test(msg)
}

function isShopQueryRateLimited(err: unknown): boolean {
  return isKuaishouOpenApiRateLimited(err)
}

/** 按 relation_type 翻页拉全量（最多 200 页），供认领拆分、tabCounts、装修列表复用 */
async function fetchAllPoiPages(
  sessionKey: string,
  session: KuaishouMerchantSession,
  accountId: string,
  relationType?: 0 | 1 | 2,
): Promise<{ pois: unknown[]; total: number }> {
  const all: unknown[] = []
  let reportedTotal = 0
  for (let page = 1; page <= 200; page++) {
    if (page > 1) await sleep(SHOP_QUERY_PAGE_DELAY_MS)
    let j: Record<string, unknown> | undefined
    let lastErr: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        const backoff = 700 * attempt * attempt
        await sleep(backoff)
      }
      try {
        j = await withKuaishouClientTokenRetry(
          session,
          { sessionKey },
          (token) => shopPoiQueryPage(accountId, token, page, 50, relationType),
        )
        lastErr = undefined
        break
      } catch (e) {
        lastErr = e
        if (attempt < 4 && isShopQueryRateLimited(e)) continue
        throw e
      }
    }
    if (!j) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? 'shop/query 无响应'))
    const data = j.data as Record<string, unknown> | undefined
    if (!data) break
    if (page === 1) reportedTotal = Number(data.total) || 0
    const pois = extractPoisFromShopQueryData(data)
    if (!Array.isArray(pois) || pois.length === 0) break
    all.push(...pois)
    if (pois.length < 50) break
    if (reportedTotal > 0 && all.length >= reportedTotal) break
  }
  return { pois: all, total: reportedTotal || all.length }
}

function mergePoiPacksInto(
  packs: { pois: unknown[]; total: number }[],
  seen: Set<string>,
  merged: unknown[],
): void {
  for (const pack of packs) {
    for (const row of pack.pois) {
      let id = extractRowPoiId(row)
      if (!id) id = stableFallbackPoiKey(row)
      if (!id || seen.has(id)) continue
      seen.add(id)
      merged.push(row)
    }
  }
}

async function fetchMergedAllPois(
  sessionKey: string,
  session: KuaishouMerchantSession,
  accountId: string,
): Promise<{ pois: unknown[]; total: number; relationWarnings: string[] }> {
  /** 串行降低瞬时 QPS；原先 Promise.all + 全程静默失败会导致线上「永远 0 条」 */
  const packs: { pois: unknown[]; total: number }[] = []
  const errors: string[] = []
  for (const rt of [0, 1, 2] as const) {
    if (packs.length > 0) await sleep(SHOP_QUERY_RELATION_SWITCH_DELAY_MS)
    try {
      packs.push(await fetchAllPoiPages(sessionKey, session, accountId, rt))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`relation_type=${rt}：${msg.slice(0, 320)}`)
      packs.push({ pois: [], total: 0 })
    }
  }
  const seen = new Set<string>()
  const merged: unknown[] = []
  mergePoiPacksInto(packs, seen, merged)

  /** 文档：不传 relation_type 时按认领(0)处理；个别账号显式 0/1/2 与省略行为不一致时再兜一层 */
  const relationWarnings = [...errors]
  if (merged.length === 0 && errors.length === 0) {
    try {
      await sleep(SHOP_QUERY_RELATION_SWITCH_DELAY_MS)
      const omitPack = await fetchAllPoiPages(sessionKey, session, accountId, undefined)
      mergePoiPacksInto([omitPack], seen, merged)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      relationWarnings.push(`relation_type=默认(不传)：${msg.slice(0, 320)}`)
    }
  }

  if (merged.length === 0 && errors.length === 3) {
    throw new Error(
      `快手 shop.query 三种 relation_type 均失败（请核对 life.capacity.shop 与账户 ID）：${errors.join(' | ')}`,
    )
  }
  return { pois: merged, total: merged.length, relationWarnings }
}

const POI_LIST_CACHE_TTL_MS = 45_000
const poiListCache = new Map<string, { ts: number; pois: unknown[]; total: number }>()

function clearSessionPoiCache(sessionKey: string) {
  for (const k of [...poiListCache.keys()]) {
    if (k.startsWith(`${sessionKey}::`)) poiListCache.delete(k)
  }
}

type RelationSpec = 'all' | 0 | 1 | 2

async function getCachedPoiList(
  sessionKey: string,
  session: KuaishouMerchantSession,
  accountId: string,
  relationSpec: RelationSpec,
  forceRefresh: boolean,
): Promise<{ pois: unknown[]; total: number; relationWarnings?: string[] }> {
  const cacheKey = `${sessionKey}::${accountId}::rt:${relationSpec}`
  const now = Date.now()
  if (!forceRefresh) {
    const hit = poiListCache.get(cacheKey)
    if (hit && now - hit.ts < POI_LIST_CACHE_TTL_MS) {
      return { pois: hit.pois, total: hit.total }
    }
  }
  const pack =
    relationSpec === 'all'
      ? await fetchMergedAllPois(sessionKey, session, accountId)
      : { ...(await fetchAllPoiPages(sessionKey, session, accountId, relationSpec)), relationWarnings: [] }
  /** 勿缓存「空列表」：避免首次瞬时失败/权限抖动导致长时间空白 */
  if (pack.pois.length > 0) {
    poiListCache.set(cacheKey, { ts: now, pois: pack.pois, total: pack.total })
  } else {
    poiListCache.delete(cacheKey)
  }
  const relationWarnings =
    relationSpec === 'all' && pack.relationWarnings?.length ? pack.relationWarnings : undefined
  return { pois: pack.pois, total: pack.total, relationWarnings }
}

/** 认领中：综合快手返回的状态字段做保守识别（无明确「进行中」语义时归为已认领侧） */
function rowIsClaiming(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false
  const o = row as Record<string, unknown>
  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
  const bag = [o, poi]
    .flatMap((x) => [
      x.claim_status,
      x.claimStatus,
      x.audit_status,
      x.auditStatus,
      x.poi_audit_status,
      x.shop_audit_status,
      x.relation_status,
      x.relationStatus,
      x.status,
      x.poi_status,
      x.lifecycle_status,
    ])
    .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : ''))
    .join(' ')
  if (!bag.trim()) return false
  if (/已认领|认领成功|认领通过|已通过|生效|正常|营业中/.test(bag)) return false
  return /认领中|待认领|待审核|审核中|处理中|审核驳回|驳回待改|待完善|认领失败|冻结|异常/.test(bag)
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function pickNum(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function getPoiExt(poi: Record<string, unknown>): Record<string, unknown> | null {
  const ext = poi.poi_ext
  if (ext && typeof ext === 'object' && !Array.isArray(ext)) return ext as Record<string, unknown>
  return null
}

/** 与前端 normalizeStoreRow 对齐：快手 shop.query 实际常含 poi_ext / attributes，文档示例仅列基础 poi 字段 */
function pickStrMerged(
  poi: Record<string, unknown>,
  ext: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  for (const bag of [poi, ext].filter((x): x is Record<string, unknown> => x != null)) {
    for (const k of keys) {
      const v = bag[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
      if (typeof v === 'number' && !Number.isNaN(v)) return String(v)
      if (typeof v === 'boolean') return v ? '是' : '否'
    }
  }
  return undefined
}

function pickStrDeep(
  poi: Record<string, unknown>,
  ext: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  const direct = pickStrMerged(poi, ext, keys)
  if (direct) return direct
  const nests = [poi.attributes, poi.attr, ext?.attributes, ext?.attr].filter(
    (x): x is Record<string, unknown> =>
      x != null && typeof x === 'object' && !Array.isArray(x),
  )
  for (const nest of nests) {
    const hit = pickStr(nest, keys)
    if (hit) return hit
    const hit2 = pickStrMerged(nest, null, keys)
    if (hit2) return hit2
  }
  return undefined
}

function pickCoverMerged(poi: Record<string, unknown>, ext: Record<string, unknown> | null): string | undefined {
  const keys = [
    'head_image_url',
    'head_image',
    'cover_url',
    'avatar_url',
    'icon_url',
    'image_url',
    'display_image',
    'thumbnail',
    'thumbnail_url',
    'front_img',
    'main_pic',
    'main_picture',
  ]
  const direct = pickStrMerged(poi, ext, keys)
  if (direct) return direct
  const albumKeys = ['photos', 'images', 'poi_photos', 'album', 'pic_list', 'image_list', 'store_images']
  for (const bag of [poi, ext].filter((x): x is Record<string, unknown> => x != null)) {
    for (const ak of albumKeys) {
      const al = bag[ak]
      if (!Array.isArray(al) || al.length === 0) continue
      const x = al[0]
      if (typeof x === 'string' && x.trim()) return x.trim()
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        const u = o.url ?? o.uri ?? o.image_url ?? o.thumb_url ?? o.cover_url
        if (typeof u === 'string' && u.trim()) return u.trim()
      }
    }
  }
  return undefined
}

function countAlbumMerged(poi: Record<string, unknown>, ext: Record<string, unknown> | null): number | undefined {
  const albumKeys = [
    'image_list',
    'images',
    'photos',
    'poi_photos',
    'album',
    'pic_list',
    'store_images',
    'pic_urls',
    'shop_photos',
  ]
  for (const bag of [poi, ext].filter((x): x is Record<string, unknown> => x != null)) {
    for (const k of albumKeys) {
      const v = bag[k]
      if (Array.isArray(v) && v.length > 0) return v.length
    }
  }
  const n = pickNum(poi.album_count ?? poi.image_count ?? poi.photo_count)
  if (n != null) return n
  if (ext) return pickNum(ext.album_count ?? ext.image_count ?? ext.photo_count)
  return undefined
}

/** 店铺装修列表：由门店 POI + poi_ext 聚合（与 kuaishouMerchantApi.normalizeStoreRow 同源字段策略） */
function rowToDecorationItem(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    return { id: '-', name: '（无效数据）' }
  }
  const o = row as Record<string, unknown>
  const poi = getPoiRecord(row)
  const ext = getPoiExt(poi)

  const id = String(poi.poi_id ?? o.poi_id ?? '').trim() || '-'
  const name = String(poi.poi_name ?? o.poi_name ?? '未命名门店')

  const auditStatus =
    pickStrDeep(poi, ext, [
      'shop_audit_status',
      'poi_audit_status',
      'audit_status',
      'decorate_audit_status',
      'claim_audit_status',
      'audit_status_desc',
      'shop_audit_status_desc',
      'shopAuditStatus',
      'poiAuditStatus',
      'auditStatus',
      'decorateAuditStatus',
    ]) ??
    pickStrMerged(o, null, ['claim_status', 'claimStatus', 'audit_status', 'auditStatus'])

  const optimization = pickStrDeep(poi, ext, [
    'optimization_suggestion',
    'optimization',
    'suggest_reason',
    'optimize_suggestion',
    'decorate_suggestion',
    'optimization_tip',
  ])

  const storeInfoStatus = pickStrDeep(poi, ext, [
    'poi_info_status',
    'store_info_status',
    'info_complete_status',
    'completeness',
    'info_status',
    'storeInfoStatus',
    'poiInfoStatus',
  ])

  const staffDisplay = pickStrDeep(poi, ext, [
    'staff_display_status',
    'talent_display_status',
    'employee_display_status',
    'craftsman_display_status',
    'staffDisplayStatus',
    'talent_display',
  ])

  const coverImageUrl = pickCoverMerged(poi, ext)
  const albumCount = countAlbumMerged(poi, ext)

  const signatureDishes = pickStrDeep(poi, ext, [
    'signature_dishes',
    'recommend_dishes',
    'specialty',
    'recommend_food',
    'signatureDishes',
  ])

  const announcement = pickStrDeep(poi, ext, [
    'announcement',
    'notice',
    'bulletin',
    'official_notice',
    'store_notice',
  ])

  return {
    id,
    name,
    auditStatus,
    optimization,
    storeInfoStatus,
    staffDisplay,
    coverImageUrl,
    albumCount,
    signatureDishes,
    announcement,
  }
}

function getPoiRecord(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') return {}
  const o = row as Record<string, unknown>
  if (o.poi && typeof o.poi === 'object') return o.poi as Record<string, unknown>
  return o
}

function rowAddressHay(row: unknown): string {
  const poi = getPoiRecord(row)
  const parts = [
    poi.address,
    poi.address_all,
    poi.full_address,
    poi.region_name,
    poi.province_name,
    poi.province,
    poi.city_name,
    poi.city,
    poi.district_name,
    poi.district,
    poi.area_name,
  ]
  return parts.map((p) => (typeof p === 'string' ? p : '')).join(' ')
}

function claimAuditBag(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const poi = getPoiRecord(row)
  const parts = [o, poi].flatMap((x) => [
    x.claim_status,
    x.claimStatus,
    x.audit_status,
    x.auditStatus,
    x.poi_audit_status,
    x.shop_audit_status,
    x.decorate_audit_status,
    x.poi_info_status,
    x.lifecycle_status,
    x.status,
  ])
  return parts.map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')).join(' ')
}

function matchesClaimAuditFilter(row: unknown, filter: string): boolean {
  const bag = claimAuditBag(row)
  switch (filter) {
    case 'store_auditing':
      return /门店审核中|店铺审核中|门店审核/.test(bag) && !/(失败|未通过)/.test(bag)
    case 'store_audit_fail':
      return /审核失败|未通过|驳回|失败/.test(bag)
    case 'pending_qual':
      return /待提交资质|资质待|待资质/.test(bag)
    case 'reviewing':
      return /审核中|审核/.test(bag)
    default:
      return true
  }
}

function rowBusinessLine(row: unknown): string {
  const poi = getPoiRecord(row)
  return [poi.business_status, poi.open_status_desc, poi.status, poi.business_status_desc]
    .map((v) => (typeof v === 'string' ? v : ''))
    .join(' ')
}

function matchesBusinessStatusFilter(row: unknown, filter: string): boolean {
  const line = rowBusinessLine(row).toLowerCase()
  if (filter === 'open') return /营业|正常|在营|开店|营/.test(line) || line.trim().length === 0
  if (filter === 'rest') return /休息|打烊|间歇|暂停营业/.test(line)
  if (filter === 'closed') return /关闭|停业|歇业|倒闭/.test(line)
  return true
}

function rowPoiAccountNameForBrand(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const acc = o.account && typeof o.account === 'object' ? (o.account as Record<string, unknown>) : null
  const pa = acc?.poi_account && typeof acc.poi_account === 'object' ? (acc.poi_account as Record<string, unknown>) : null
  return typeof pa?.account_name === 'string' ? pa.account_name : ''
}

function rowBrandHay(row: unknown): string {
  if (!row || typeof row !== 'object') return ''
  const o = row as Record<string, unknown>
  const poi = getPoiRecord(row)
  const fromPoi = [
    poi.brand_name,
    poi.poi_brand,
    poi.chain_name,
    typeof poi.brand === 'string' ? poi.brand : '',
    poi.merchant_brand,
  ]
    .map((p) => (typeof p === 'string' ? p : ''))
    .join(' ')
  const sameEnvelope = poi === o
  const fromStruct = [
    extractLifeBrandStructName(o),
    sameEnvelope ? undefined : extractLifeBrandStructName(poi as Record<string, unknown>),
  ]
    .filter(Boolean)
    .join(' ')
  const acct = rowPoiAccountNameForBrand(row)
  return `${fromPoi} ${fromStruct} ${acct}`.trim().toLowerCase()
}

export async function handleKuaishouBindPost(
  _req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  try {
    const r = await runKuaishouMerchantBind(bodyRaw)
    json(res, r.statusCode, r.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 500, { message: msg || '快手绑定处理异常' })
  }
}

function collectUploadableLeafCategoryIds(nodes: unknown): string[] {
  const out: string[] = []
  const walk = (arr: unknown[]) => {
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') continue
      const n = raw as Record<string, unknown>
      const id = n.category_id
      const sid = id != null ? String(id) : ''
      const isLeaf = Boolean(n.is_leaf)
      const enable = n.enable !== false
      const blocked = n.is_publish_block === true
      const subs = n.sub_tree_infos
      if (isLeaf && sid && enable && !blocked) out.push(sid)
      if (Array.isArray(subs) && subs.length) walk(subs)
    }
  }
  if (Array.isArray(nodes)) walk(nodes)
  return out
}

/** 代理 goodlife/v1/goods/category/get/，原样返回快手 JSON（与来客类目一致） */
export async function handleKuaishouGoodsCategoryGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId =
      (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/category/get/'))
    u.searchParams.set('account_id', accountId)
    const qct = (url.searchParams.get('query_category_type') ?? '1').trim()
    u.searchParams.set('query_category_type', qct || '1')
    const cid = (url.searchParams.get('category_id') ?? '').trim()
    if (cid) u.searchParams.set('category_id', cid)

    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const trimmed = raw.trim()
    if (trimmed.startsWith('<')) {
      json(res, 502, {
        message:
          '快手类目接口返回了 HTML（多为鉴权/频控/WAF 或上游错误页），请稍后重试或重新绑定；若部署在同域，请确认 Vercel 未将 /api 回退到 index.html。',
      })
      return
    }
    res.statusCode = dr.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手类目查询失败：${msg}` })
  }
}

/** 代理 goodlife/v1/goods/product/online/query/（商品名称模糊、分页 cursor） */
export async function handleKuaishouGoodsProductOnlineQueryGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/product/online/query/'))
    u.searchParams.set('account_id', accountId)
    const pn = (url.searchParams.get('product_name') ?? '').trim().slice(0, 30)
    if (pn) u.searchParams.set('product_name', pn)
    const count = Math.min(50, Math.max(1, Number(url.searchParams.get('count')) || 10))
    u.searchParams.set('count', String(count))
    const cursor = (url.searchParams.get('cursor') ?? '').trim()
    if (cursor) u.searchParams.set('cursor', cursor)
    /** 文档：传 goods_query_type 时 goods_creator_type 不生效；不传则可配合 goods_creator_type 查商家/服务商创建的商品 */
    const gqtRaw = url.searchParams.get('goods_query_type')
    if (gqtRaw !== null) {
      const gqt = gqtRaw.trim()
      if (gqt) u.searchParams.set('goods_query_type', gqt)
    }
    const gctRaw = url.searchParams.get('goods_creator_type')
    if (gctRaw !== null) {
      const gct = gctRaw.trim()
      if (gct) u.searchParams.set('goods_creator_type', gct)
    }
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status) u.searchParams.set('status', status)

    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    res.statusCode = dr.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手商品线上列表查询失败：${msg}` })
  }
}

/** 代理 goodlife/v1/goods/product/draft/query/（与 goods/save 创建链路一致，用于发品前单品匹配） */
export async function handleKuaishouGoodsProductDraftQueryGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/product/draft/query/'))
    u.searchParams.set('account_id', accountId)
    const count = Math.min(50, Math.max(1, Number(url.searchParams.get('count')) || 20))
    u.searchParams.set('count', String(count))
    const cursor = (url.searchParams.get('cursor') ?? '').trim()
    if (cursor) u.searchParams.set('cursor', cursor)
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status) u.searchParams.set('status', status)

    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    res.statusCode = dr.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手商品草稿列表查询失败：${msg}` })
  }
}

export type DouyinGoodsListItem = {
  id: string
  name: string
  price: number
  store: string
  /** @deprecated 请用 audit_status；保留兼容旧前端 */
  status: string
  /** 平台侧审核状态（草稿/审核中/通过/驳回） */
  audit_status: string
  /** 售卖状态（上架中/已下架/已售罄/未上架） */
  sale_status: string
  platform: string
  source: 'online' | 'draft' | 'local'
}

function goodlifeListAmountToYuan(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0
  if (v >= 100 && v < 1e12) return Math.round(v) / 100
  if (v > 0 && v < 1e6) return Math.round(v)
  return 0
}

function goodlifeOnlineStatusLabel(online_status: number | undefined): string {
  switch (online_status) {
    case 1:
      return '在售'
    case 2:
      return '已下架'
    case 3:
      return '封禁'
    default:
      return '在售'
  }
}

function goodlifeDraftStatusLabel(draft_status: number | undefined): string {
  switch (draft_status) {
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

function goodlifeSkuAvailQty(sku: Record<string, unknown> | null): number | undefined {
  if (!sku) return undefined
  const stock =
    sku.stock && typeof sku.stock === 'object'
      ? (sku.stock as Record<string, unknown>)
      : null
  const candidates = [
    stock?.avail_qty,
    stock?.available_qty,
    sku.avail_qty,
    sku.available_qty,
    stock?.stock_qty,
    sku.stock_qty,
  ]
  for (const v of candidates) {
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return undefined
}

/** 来客线上售卖状态（与 ERP 商品列表「商品状态」列对齐） */
function goodlifeSaleStatusLabel(
  source: 'online' | 'draft' | 'local',
  online_status: number | undefined,
  availQty: number | undefined,
): string {
  if (source !== 'online') return '未上架'
  if (online_status === 2 || online_status === 3) return '已下架'
  if (availQty !== undefined && availQty <= 0) return '已售罄'
  if (online_status === 1) return '上架中'
  return '未上架'
}

function goodlifeAuditStatusLabel(
  source: 'online' | 'draft' | 'local',
  draft_status: number | undefined,
): string {
  if (source === 'draft') return goodlifeDraftStatusLabel(draft_status)
  if (source === 'local') return '草稿'
  if (draft_status != null) return goodlifeDraftStatusLabel(draft_status)
  return '审核通过'
}

function mergeDouyinGoodsListItems(
  a: DouyinGoodsListItem,
  b: DouyinGoodsListItem,
): DouyinGoodsListItem {
  const hasOnline = a.source === 'online' || b.source === 'online'
  const audit =
    a.source === 'draft'
      ? a.audit_status
      : b.source === 'draft'
        ? b.audit_status
        : a.audit_status !== '审核通过'
          ? a.audit_status
          : b.audit_status
  const sale = hasOnline
    ? a.source === 'online'
      ? a.sale_status
      : b.sale_status
    : a.sale_status === '未上架'
      ? b.sale_status
      : a.sale_status
  return {
    id: a.id,
    name: b.name || a.name,
    price: b.price > 0 ? b.price : a.price,
    store: b.store !== '—' ? b.store : a.store,
    audit_status: audit,
    sale_status: sale,
    status: audit,
    platform: b.platform || a.platform,
    source: hasOnline ? 'online' : a.source === 'draft' || b.source === 'draft' ? 'draft' : a.source,
  }
}

function extractProductsArrayFromGoodlifeEnvelope(j: Record<string, unknown>): unknown[] {
  const inner = j.data as Record<string, unknown> | undefined
  const arr = (inner?.products ?? inner?.product_list ?? j.products) as unknown
  return Array.isArray(arr) ? arr : []
}

function goodlifeEntryToListItem(
  row: Record<string, unknown>,
  source: 'online' | 'draft',
): DouyinGoodsListItem | null {
  const product =
    row.product && typeof row.product === 'object'
      ? (row.product as Record<string, unknown>)
      : row
  const product_id = String(
    product.product_id ?? product.id ?? row.product_id ?? row.out_id ?? '',
  ).trim()
  const product_name = String(product.product_name ?? product.name ?? '').trim()
  if (!product_id || !product_name) return null
  const sku =
    row.sku && typeof row.sku === 'object' ? (row.sku as Record<string, unknown>) : null
  const skus = Array.isArray(row.skus) ? row.skus : []
  const firstSku =
    (skus[0] && typeof skus[0] === 'object' ? (skus[0] as Record<string, unknown>) : null) ?? sku
  const price = firstSku
    ? goodlifeListAmountToYuan(firstSku.actual_amount) ||
      goodlifeListAmountToYuan(firstSku.origin_amount)
    : 0
  const poisRaw = product.pois
  let store = String(product.account_name ?? '').trim()
  if (Array.isArray(poisRaw) && poisRaw.length > 0) {
    store = `${poisRaw.length} 家门店`
  }
  if (!store) store = '—'
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
  const availQty = goodlifeSkuAvailQty(firstSku)
  const audit_status = goodlifeAuditStatusLabel(source, draft_status)
  const sale_status = goodlifeSaleStatusLabel(source, online_status, availQty)
  return {
    id: product_id,
    name: product_name,
    price,
    store,
    status: audit_status,
    audit_status,
    sale_status,
    platform: '快手团购',
    source,
  }
}

async function douyinGoodlifeQueryPage(
  accountId: string,
  token: string,
  path: '/goodlife/v1/goods/product/online/query/' | '/goodlife/v1/goods/product/draft/query/',
  params: URLSearchParams,
): Promise<{ products: unknown[]; next_cursor?: string; has_more?: boolean; err?: string }> {
  const u = new URL(kuaishouOpenApiUrl(path))
  u.searchParams.set('account_id', accountId)
  for (const [k, v] of params.entries()) {
    u.searchParams.set(k, v)
  }
  const dr = await kuaishouServerFetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': token,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  const raw = await dr.text()
  const j = parseKuaishouJson(raw) as Record<string, unknown>
  const dataErr = getDataError(j)
  if (!dr.ok || !dataErr.ok) {
    return { products: [], err: dataErr.msg || `HTTP ${dr.status}` }
  }
  const inner = j.data as Record<string, unknown> | undefined
  const products = extractProductsArrayFromGoodlifeEnvelope(j)
  const next_cursor = String(inner?.next_cursor ?? '').trim() || undefined
  const has_more = inner?.has_more === true
  return { products, next_cursor, has_more }
}

async function paginateGoodlifeProducts(
  accountId: string,
  token: string,
  path: '/goodlife/v1/goods/product/online/query/' | '/goodlife/v1/goods/product/draft/query/',
  baseParams: Record<string, string>,
  source: 'online' | 'draft',
  map: Map<string, DouyinGoodsListItem>,
  warnings: string[],
): Promise<void> {
  let cursor = ''
  for (let page = 0; page < 40; page++) {
    const q = new URLSearchParams({ count: '50', ...baseParams })
    if (cursor) q.set('cursor', cursor)
    const { products, next_cursor, has_more, err } = await douyinGoodlifeQueryPage(
      accountId,
      token,
      path,
      q,
    )
    if (err && products.length === 0 && map.size === 0) {
      warnings.push(err)
    }
    for (const p of products) {
      if (!p || typeof p !== 'object') continue
      const item = goodlifeEntryToListItem(p as Record<string, unknown>, source)
      if (!item) continue
      const prev = map.get(item.id)
      map.set(item.id, prev ? mergeDouyinGoodsListItems(prev, item) : item)
    }
    if (!next_cursor || (!has_more && products.length < 50)) break
    cursor = next_cursor
  }
}

async function fetchAllDouyinGoodsListItems(
  accountId: string,
  token: string,
): Promise<{ items: DouyinGoodsListItem[]; warnings: string[] }> {
  const warnings: string[] = []
  const map = new Map<string, DouyinGoodsListItem>()

  await paginateGoodlifeProducts(
    accountId,
    token,
    '/goodlife/v1/goods/product/online/query/',
    { goods_query_type: '2' },
    'online',
    map,
    warnings,
  )
  await paginateGoodlifeProducts(
    accountId,
    token,
    '/goodlife/v1/goods/product/online/query/',
    { goods_query_type: '3' },
    'online',
    map,
    warnings,
  )
  await paginateGoodlifeProducts(
    accountId,
    token,
    '/goodlife/v1/goods/product/draft/query/',
    {},
    'draft',
    map,
    warnings,
  )
  for (const st of ['10', '12', '1'] as const) {
    await paginateGoodlifeProducts(
      accountId,
      token,
      '/goodlife/v1/goods/product/draft/query/',
      { status: st },
      'draft',
      map,
      warnings,
    )
  }

  for (const [id, p] of mockDouyinProductStore.entries()) {
    if (map.has(id)) continue
    const name = String(p.product_name ?? '').trim()
    if (!name) continue
    const audit = String(p._mock_status ?? '草稿')
    map.set(id, {
      id,
      name,
      price: Number(p.price_yuan ?? 0) || 0,
      store:
        Array.isArray(p.poi_ids) && (p.poi_ids as string[]).length
          ? `${(p.poi_ids as string[]).length} 家门店`
          : '—',
      status: audit,
      audit_status: audit,
      sale_status: '未上架',
      platform: '快手团购',
      source: 'local',
    })
  }

  return { items: Array.from(map.values()), warnings }
}

function mockStoreListItems(): DouyinGoodsListItem[] {
  return Array.from(mockDouyinProductStore.entries()).map(([id, p]) => {
    const audit = String(p._mock_status ?? '草稿')
    return {
      id,
      name: String(p.product_name ?? '未命名商品'),
      price: Number(p.price_yuan ?? 0) || 0,
      store:
        Array.isArray(p.poi_ids) && (p.poi_ids as string[]).length
          ? `${(p.poi_ids as string[]).length} 家门店`
          : '—',
      status: audit,
      audit_status: audit,
      sale_status: '未上架',
      platform: '快手团购',
      source: 'local' as const,
    }
  })
}

function detailPayloadToListItem(
  detail: Record<string, unknown>,
  source: 'online' | 'draft' | 'local',
): DouyinGoodsListItem {
  const id = String(detail.product_id ?? detail.out_id ?? '').trim()
  const pois = detail.poi_ids
  const audit = String(
    detail._mock_status ?? (source === 'online' ? '审核通过' : '草稿'),
  )
  const online_status =
    typeof detail.online_status === 'number' ? detail.online_status : undefined
  const stockQty = Number((detail.sales_info as Record<string, unknown> | undefined)?.stock_qty)
  const availQty = Number.isFinite(stockQty) ? stockQty : undefined
  const sale = goodlifeSaleStatusLabel(source, online_status, availQty)
  return {
    id,
    name: String(detail.product_name ?? '未命名商品'),
    price: Number(detail.price_yuan ?? 0) || 0,
    store: Array.isArray(pois) && pois.length ? `${pois.length} 家门店` : '—',
    status: audit,
    audit_status: audit,
    sale_status: sale,
    platform: '快手团购',
    source,
  }
}

async function fetchGoodlifeProductDetailPreferOnline(
  accountId: string,
  token: string,
  productId: string,
): Promise<{ detail: Record<string, unknown>; source: 'online' | 'draft' } | null> {
  const paths: Array<{ path: string; source: 'online' | 'draft' }> = [
    { path: '/goodlife/v1/goods/product/online/get/', source: 'online' },
    { path: '/goodlife/v1/goods/product/draft/get/', source: 'draft' },
  ]
  for (const { path, source } of paths) {
    const u = new URL(kuaishouOpenApiUrl(path))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('product_id', productId)
    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    if (!getDataError(j).ok) continue
    const extracted = extractGoodlifeProductFromGetEnvelope(j)
    if (!extracted) continue
    const detail = mapGoodlifeProductToErpDetail(extracted.product, extracted.skus)
    const listStatus =
      source === 'online'
        ? goodlifeOnlineStatusLabel(
            typeof extracted.product.online_status === 'number'
              ? extracted.product.online_status
              : undefined,
          )
        : goodlifeDraftStatusLabel(
            typeof extracted.product.draft_status === 'number'
              ? extracted.product.draft_status
              : undefined,
          )
    return {
      detail: { ...detail, _mock_status: listStatus },
      source,
    }
  }
  return null
}

/** 商品列表：合并来客线上（在售/下架/封禁）与草稿（审核中/驳回等）及本机 save 缓存 */
export async function handleKuaishouGoodsProductsListGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { ok: false, message: '缺少 Authorization Bearer' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { ok: false, message: '会话无效或已失效，请重新绑定' })
    return
  }

  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size') ?? '20') || 20))
  const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
  const full = url.searchParams.get('full') === '1' || url.searchParams.get('sync_all') === '1'

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const { items, warnings } = await fetchAllDouyinGoodsListItems(accountId, token)
    let filtered = items
    if (keyword) {
      filtered = items.filter((x) => x.name.toLowerCase().includes(keyword))
    }
    const total = filtered.length
    const start = full ? 0 : (page - 1) * pageSize
    const slice = full ? filtered : filtered.slice(start, start + pageSize)
    json(res, 200, {
      ok: true,
      data: {
        items: slice.map(({ source: _s, ...rest }) => rest),
        total,
        page: full ? 1 : page,
        page_size: full ? total || pageSize : pageSize,
      },
      ...(warnings.length ? { message: warnings.join('；') } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    let items = mockStoreListItems()
    if (keyword) items = items.filter((x) => x.name.toLowerCase().includes(keyword))
    const total = items.length
    const start = full ? 0 : (page - 1) * pageSize
    json(res, 200, {
      ok: true,
      data: {
        items: (full ? items : items.slice(start, start + pageSize)).map(
          ({ source: _s, ...rest }) => rest,
        ),
        total,
        page: full ? 1 : page,
        page_size: full ? total || pageSize : pageSize,
      },
      message: `来客列表拉取失败，已展示本机缓存：${msg}`,
    })
  }
}

/** 单商品拉取：从平台同步该商品信息与状态至 ERP */
export async function handleKuaishouGoodsProductPullSyncPost(
  req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { ok: false, message: '缺少 Authorization Bearer' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { ok: false, message: '会话无效或已失效，请重新绑定' })
    return
  }
  let product_id = ''
  let account_id = ''
  try {
    const b = JSON.parse(bodyRaw || '{}') as { product_id?: string; account_id?: string }
    product_id = String(b.product_id ?? '').trim()
    account_id = String(b.account_id ?? '').trim()
  } catch {
    /* ignore */
  }
  if (!product_id) {
    json(res, 400, { ok: false, message: '缺少 product_id' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = account_id || session.merchantId
    const pulled = await fetchGoodlifeProductDetailPreferOnline(accountId, token, product_id)
    if (!pulled) {
      const cached = mockDouyinProductStore.get(product_id)
      if (cached) {
        const item = detailPayloadToListItem(cached, 'local')
        json(res, 200, {
          ok: true,
          item,
          detail: cached,
          message: '未从来客拉取到线上/草稿详情，已返回本机保存快照',
        })
        return
      }
      json(res, 404, {
        ok: false,
        message:
          '未在快手团购找到该商品。请确认商品 ID、账户授权，或先在创建流程中保存草稿。',
      })
      return
    }
    mockDouyinProductStore.set(product_id, pulled.detail)
    const item = detailPayloadToListItem(pulled.detail, pulled.source)
    json(res, 200, {
      ok: true,
      item,
      detail: pulled.detail,
      message: '已从快手团购拉取该商品最新信息与状态',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { ok: false, message: `拉取商品失败：${msg}` })
  }
}

/** 商品上下架：代理 goodlife/v1/goods/product/operate/ */
export async function handleKuaishouGoodsProductOperatePost(
  req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { ok: false, message: '缺少 Authorization Bearer' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { ok: false, message: '会话无效或已失效，请重新绑定' })
    return
  }
  let product_id = ''
  let op_type = 0
  let account_id = ''
  try {
    const b = JSON.parse(bodyRaw || '{}') as {
      product_id?: string
      op_type?: number
      account_id?: string
    }
    product_id = String(b.product_id ?? '').trim()
    op_type = Number(b.op_type)
    account_id = String(b.account_id ?? '').trim()
  } catch {
    /* ignore */
  }
  if (!product_id) {
    json(res, 400, { ok: false, message: '缺少 product_id' })
    return
  }
  if (op_type !== 1 && op_type !== 2) {
    json(res, 400, { ok: false, message: 'op_type 须为 1（上架）或 2（下架）' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = account_id || session.merchantId
    const u = kuaishouOpenApiUrl('/goodlife/v1/goods/product/operate/')
    const dr = await kuaishouServerFetch(u, {
      method: 'POST',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
      body: JSON.stringify({
        account_id: accountId,
        product_id,
        op_type,
      }),
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    const dataErr = getDataError(j)
    if (!dr.ok || !dataErr.ok) {
      json(res, dr.ok ? 400 : dr.status, {
        ok: false,
        message: dataErr.msg || `快手 operate HTTP ${dr.status}`,
        douyin_response: j,
      })
      return
    }
    json(res, 200, {
      ok: true,
      message: op_type === 1 ? '商品已上架' : '商品已下架',
      douyin_response: j,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { ok: false, message: `上下架失败：${msg}` })
  }
}

/** template/get 上游失败或空 attrs 时返回与 save 兜底一致的结构（避免前端「fetch failed」卡死） */
function buildSyntheticTemplateGetEnvelope(erpUiProductType: number): Record<string, unknown> {
  const syn = syntheticGoodlifeTemplateAttrsBundle(
    isErpUiVoucherProductType(erpUiProductType) ? ERP_UI_PRODUCT_TYPE_VOUCHER : erpUiProductType,
  )
  return {
    data: {
      error_code: 0,
      description: '',
      product_attrs: syn.productAttrs,
      sku_attrs: syn.skuAttrs,
    },
  }
}

/** 代理 goodlife template/get；中继失败时对零售代金券等返回服务端 synthetic 模板 */
export async function handleKuaishouGoodsTemplateGetGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }
  const categoryId = (url.searchParams.get('category_id') ?? '').trim()
  const erpUiProductType = Number(url.searchParams.get('product_type') ?? '1') || 1
  if (!categoryId) {
    json(res, 400, { message: '缺少 category_id' })
    return
  }
  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    let bundle: TemplateAttrsBundle = { productAttrs: [], skuAttrs: [] }
    try {
      bundle = await fetchTemplateAttrsBundle(accountId, token, categoryId, erpUiProductType)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(
        '[meoo douyin template/get] upstream_fetch_failed',
        JSON.stringify({
          category_id: categoryId,
          erp_ui_product_type: erpUiProductType,
          message: msg.slice(0, 200),
        }),
      )
    }
    const templateGetApiType = bundle.resolvedProductType ?? goodlifeApiProductTypesForErpUi(erpUiProductType)[0]!
    if (bundle.productAttrs.length > 0 || bundle.skuAttrs.length > 0) {
      const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/template/get/'))
      u.searchParams.set('account_id', accountId)
      u.searchParams.set('category_id', categoryId)
      u.searchParams.set('product_type', String(templateGetApiType))
      try {
        const dr = await kuaishouServerFetch(u.toString(), {
          method: 'GET',
          headers: {
            'access-token': token,
            'content-type': 'application/json',
            'Rpc-Transit-Life-Account': accountId,
          },
        })
        const raw = await dr.text()
        const j = parseKuaishouJson(raw)
        if (getDataError(j).ok) {
          const data = j.data as Record<string, unknown> | undefined
          const { pa, sa } = extractProductSkuAttrsFromTemplateEnvelope(data, j)
          if (pa.length > 0 || sa.length > 0) {
            res.statusCode = dr.status
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(raw)
            return
          }
        }
      } catch {
        /* 有 bundle 但透传失败：用 bundle 组装 envelope */
      }
      json(res, 200, {
        data: {
          error_code: 0,
          description: '',
          product_attrs: bundle.productAttrs,
          sku_attrs: bundle.skuAttrs,
        },
      })
      return
    }
    const useSynthetic =
      isErpUiVoucherProductType(erpUiProductType) ||
      (erpUiProductType === 1 && categoryRetailGroupAndVoucherLikely(categoryId)) ||
      inferProductTypeEligibleFromTemplate(
        erpUiProductType,
        bundle.productAttrs,
        bundle.skuAttrs,
        categoryId,
      )
    if (useSynthetic) {
      console.warn(
        '[meoo douyin template/get] synthetic_fallback',
        JSON.stringify({
          category_id: categoryId,
          erp_ui_product_type: erpUiProductType,
          goodlife_api_product_type: templateGetApiType,
        }),
      )
      json(res, 200, buildSyntheticTemplateGetEnvelope(erpUiProductType))
      return
    }
    json(res, 502, {
      message: `快手未返回类目 ${categoryId}、商品类型 ${erpUiProductType} 的模板，且当前类目不支持本地兜底。请检查 KUAISHOU_OPENAPI_BASE_URL 中继或更换类目。`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      isErpUiVoucherProductType(erpUiProductType) ||
      categoryRetailGroupAndVoucherLikely(categoryId) ||
      erpUiProductType === 1
    ) {
      console.warn(
        '[meoo douyin template/get] error_synthetic_fallback',
        JSON.stringify({
          category_id: categoryId,
          erp_ui_product_type: erpUiProductType,
          message: msg.slice(0, 200),
        }),
      )
      json(res, 200, buildSyntheticTemplateGetEnvelope(erpUiProductType))
      return
    }
    json(res, 502, { message: `快手商品模板查询失败：${msg}` })
  }
}

/** 按类目探测 template/get，仅返回快手侧确有模板的商品类型 */
export async function handleKuaishouGoodsProductTypesGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }
  const categoryId = (url.searchParams.get('category_id') ?? '').trim()
  const base = [
    { product_type: 1, label: '团购' },
    { product_type: 2, label: '代金券' },
    { product_type: 3, label: '次卡' },
    { product_type: 4, label: '预约品' },
  ]
  if (!categoryId) {
    json(res, 200, {
      types: base.map((t) => ({ ...t, eligible: t.product_type <= 2 })),
    })
    return
  }
  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const types = await Promise.all(
      base.map(async (t) => {
        let bundle = { productAttrs: [] as Record<string, unknown>[], skuAttrs: [] as Record<string, unknown>[] }
        try {
          bundle = await fetchTemplateAttrsBundle(accountId, token, categoryId, t.product_type)
        } catch {
          /* 单次失败不拖垮整页；由 infer + 零售兜底决定 eligible */
        }
        const eligible = inferProductTypeEligibleFromTemplate(
          t.product_type,
          bundle.productAttrs,
          bundle.skuAttrs,
          categoryId,
        )
        return { ...t, eligible }
      }),
    )
    json(res, 200, { types })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(
      '[meoo douyin product-types] error_using_retail_fallback',
      JSON.stringify({ category_id: categoryId, message: msg.slice(0, 200) }),
    )
    const types = base.map((t) => ({
      ...t,
      eligible: inferProductTypeEligibleFromTemplate(t.product_type, [], [], categoryId),
    }))
    json(res, 200, { types })
  }
}

/** 商品详情：草稿/线上 get + 本地 save 缓存，供编辑页回显 */
export async function handleKuaishouGoodsProductGetGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { ok: false, message: '缺少 Authorization Bearer' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { ok: false, message: '会话无效或已失效，请重新绑定' })
    return
  }
  const pid = (url.searchParams.get('product_id') ?? '').trim()
  if (!pid) {
    json(res, 400, { ok: false, message: '缺少 product_id' })
    return
  }
  const cached = mockDouyinProductStore.get(pid)
  if (cached) {
    json(res, 200, { ok: true, data: { detail: cached } })
    return
  }
  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const detail = await fetchGoodlifeProductDetailById(accountId, token, pid)
    if (!detail) {
      json(res, 404, {
        ok: false,
        message:
          '未在快手团购找到该商品（已尝试草稿与线上查询）。请确认商品 ID、账户授权，或在本页曾「保存草稿」后从列表进入编辑。',
      })
      return
    }
    json(res, 200, { ok: true, data: { detail } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { ok: false, message: `查询商品详情失败：${msg}` })
  }
}

/** 基于 category/get 结果解析可创建商品的末级类目（enable 且非 is_publish_block） */
export async function handleKuaishouGoodsIndustryScopeGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId =
      (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/category/get/'))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('query_category_type', '1')

    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    const data = j.data as Record<string, unknown> | undefined
    const tree = data?.category_tree_infos
    const uploadable = collectUploadableLeafCategoryIds(tree)
    json(res, 200, {
      data: {
        error_code: 0,
        description: '',
        industry_name: '快手团购类目（末级 enable 且未封禁）',
        uploadable_leaf_category_ids: uploadable,
      },
      message:
        '与 goodlife/v1/goods/category/get 树解析一致；若需资质/行业额外圈定请在生产网关合并资质接口结果。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手行业类目范围失败：${msg}` })
  }
}

export async function handleKuaishouStoresGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  const qMid = (url.searchParams.get('merchantId') ?? '').trim()
  if (qMid && qMid !== session.merchantId) {
    json(res, 403, { message: 'merchantId 与当前绑定账户不一致' })
    return
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
  const claimScopeRaw = (url.searchParams.get('claimScope') ?? 'claimed').trim().toLowerCase()
  const claimScope = claimScopeRaw === 'claiming' ? 'claiming' : 'claimed'
  /** 未传时默认 all：仅查 relation_type=0 时许多账户在关联/挂靠关系下门店为空 */
  const rtRaw = url.searchParams.get('relationType')
  const rt = !rtRaw?.trim() ? 'all' : rtRaw.trim()
  let relationSpec: RelationSpec = 'all'
  if (rt === '0') relationSpec = 0
  else if (rt === '1') relationSpec = 1
  else if (rt === '2') relationSpec = 2
  else if (rt === 'all') relationSpec = 'all'

  const forceRefresh =
    url.searchParams.get('refresh') === '1' ||
    url.searchParams.get('sync') === '1' ||
    url.searchParams.get('force') === '1'

  try {
    const accountId = session.merchantId

    if (forceRefresh) {
      clearSessionPoiCache(auth)
    }

    const { pois: allPois, relationWarnings } = await getCachedPoiList(
      auth,
      session,
      accountId,
      relationSpec,
      forceRefresh,
    )

    const claimedBucket: unknown[] = []
    const claimingBucket: unknown[] = []
    for (const row of allPois) {
      if (rowIsClaiming(row)) claimingBucket.push(row)
      else claimedBucket.push(row)
    }

    const tabCounts = { claimed: claimedBucket.length, claiming: claimingBucket.length }
    let scopeBucket = claimScope === 'claiming' ? claimingBucket : claimedBucket
    if (claimScope !== 'claiming' && scopeBucket.length === 0 && allPois.length > 0) {
      scopeBucket = allPois
    }

    let filtered = scopeBucket
    const claimStatusFilter = (url.searchParams.get('claimStatusFilter') ?? 'all').trim()
    if (claimStatusFilter !== 'all') {
      filtered = filtered.filter((row) => matchesClaimAuditFilter(row, claimStatusFilter))
    }
    const provinceCity = (url.searchParams.get('provinceCity') ?? '').trim().toLowerCase()
    if (provinceCity) {
      filtered = filtered.filter((row) => rowAddressHay(row).toLowerCase().includes(provinceCity))
    }
    const businessStatusFilter = (url.searchParams.get('businessStatusFilter') ?? 'all')
      .trim()
      .toLowerCase()
    if (businessStatusFilter && businessStatusFilter !== 'all') {
      filtered = filtered.filter((row) => matchesBusinessStatusFilter(row, businessStatusFilter))
    }
    const storeBrand = (url.searchParams.get('storeBrand') ?? '').trim().toLowerCase()
    if (storeBrand) {
      filtered = filtered.filter((row) => rowBrandHay(row).includes(storeBrand))
    }
    if (keyword) {
      filtered = filtered.filter((row) => poiSearchHay(row).includes(keyword))
    }
    const total = filtered.length
    const start = (page - 1) * pageSize
    const slice = filtered.slice(start, start + pageSize)
    const accountName = accountNameFromPois(slice.length ? slice : allPois)

    const relationWarnOut =
      relationWarnings?.filter((w) => typeof w === 'string' && w.trim()) ?? []
    const emptyHint =
      total === 0
        ? allPois.length === 0
          ? '快手 shop.query 在当前账户下返回 0 条门店。绑定成功只表示 client_token 有效；请核对来客 PC 端右上角「账户 ID」与开放平台授权一致，且门店已在该账户下完成认领。若仅有「关联/挂靠」门店，本接口已合并 relation_type 0/1/2。'
          : '当前筛选条件下无门店，请清空搜索词或筛选条件后重试。'
        : undefined

    json(res, 200, {
      accountName,
      tabCounts,
      relationWarnings: relationWarnOut.length ? relationWarnOut : undefined,
      emptyHint,
      data: {
        pois: slice,
        total,
        error_code: 0,
        description: '',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手门店查询失败：${msg}` })
  }
}

/** 代理 goodlife/v2/shop/brand/query/，原样返回快手 JSON（与开放平台 envelope 一致） */
export async function handleKuaishouBrandsGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  const qMid = (url.searchParams.get('merchantId') ?? '').trim()
  if (qMid && qMid !== session.merchantId) {
    json(res, 403, { message: 'merchantId 与当前绑定账户不一致' })
    return
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 50))
  const keyword = (url.searchParams.get('keyword') ?? '').trim()

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = session.merchantId

    const u = new URL(kuaishouOpenApiUrl('/goodlife/v2/shop/brand/query/'))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('page', String(page))
    u.searchParams.set('size', String(pageSize))
    if (keyword) {
      u.searchParams.set('keyword', keyword)
      u.searchParams.set('brand_name', keyword)
    }

    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    let body: unknown = {}
    try {
      body = JSON.parse(raw) as unknown
    } catch {
      body = { message: raw.slice(0, 400) }
    }
    if (!dr.ok) {
      json(res, 502, {
        message: `快手品牌查询 HTTP ${dr.status}`,
        detail: body,
      })
      return
    }
    json(res, 200, body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手品牌查询失败：${msg}` })
  }
}

export async function handleKuaishouStoreDecorationGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 10))
  const keyword = (url.searchParams.get('keyword') ?? '').trim().toLowerCase()
  const rtRawDecor = url.searchParams.get('relationType')
  const rtDecor = !rtRawDecor?.trim() ? 'all' : rtRawDecor.trim()
  let relationSpec: RelationSpec = 'all'
  if (rtDecor === '0') relationSpec = 0
  else if (rtDecor === '1') relationSpec = 1
  else if (rtDecor === '2') relationSpec = 2
  else if (rtDecor === 'all') relationSpec = 'all'

  const forceRefresh =
    url.searchParams.get('refresh') === '1' ||
    url.searchParams.get('sync') === '1' ||
    url.searchParams.get('force') === '1'

  try {
    const accountId = session.merchantId

    if (forceRefresh) {
      clearSessionPoiCache(auth)
    }

    const { pois: allPois } = await getCachedPoiList(auth, session, accountId, relationSpec, forceRefresh)
    let filtered = allPois
    if (keyword) {
      filtered = allPois.filter((row) => poiSearchHay(row).includes(keyword))
    }
    const total = filtered.length
    const start = (page - 1) * pageSize
    const slice = filtered.slice(start, start + pageSize)
    const items = slice.map(rowToDecorationItem)

    json(res, 200, {
      items,
      total,
      message:
        '由 goodlife/v1/shop/poi/query 的 poi + poi_ext（及 attributes）聚合展示字段；若列为「—」多为快手未返回该维度或需单独开通装修类能力。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手门店装修列表失败：${msg}` })
  }
}

/** 单店详情：shop.query（poi_id）+ 可选 cert/info；可选 task_ids 拉 task/query */
export async function handleKuaishouStoreDetailGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }
  const poiId = (url.searchParams.get('poiId') ?? '').trim()
  if (!poiId) {
    json(res, 400, { message: '缺少 query poiId（快手门店 ID）' })
    return
  }
  const taskIdsRaw = (url.searchParams.get('taskIds') ?? url.searchParams.get('task_ids') ?? '')
    .trim()
  const taskIdList = taskIdsRaw
    ? taskIdsRaw
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  try {
    const accountId = session.merchantId
    const j = await withKuaishouClientTokenRetry(session, { sessionKey: auth }, (token) =>
      shopPoiQuerySinglePoi(poiId, accountId, token),
    )
    const data = j.data as Record<string, unknown> | undefined
    const pois = (data?.pois as unknown[]) ?? []
    if (!Array.isArray(pois) || pois.length === 0) {
      json(res, 404, { message: '未查询到该门店，请确认门店已关联当前账户且 poi_id 正确' })
      return
    }

    const cert = await withKuaishouClientTokenRetry(session, { sessionKey: auth }, (token) =>
      poiCertInfoGet(poiId, accountId, token, accountId),
    )
    let taskBody: Record<string, unknown> | undefined
    let taskQueryError: string | undefined
    if (taskIdList.length > 0) {
      const tq = await withKuaishouClientTokenRetry(session, { sessionKey: auth }, (token) =>
        poiTaskQueryGet(taskIdList, token, accountId),
      )
      if (tq.ok === true) {
        taskBody = tq.body
      } else {
        taskQueryError = tq.message
      }
    }

    json(res, 200, {
      accountName: accountNameFromPois(pois),
      data: {
        pois,
        total: 1,
        error_code: 0,
        description: '',
      },
      certInfo: cert.ok === true ? cert.body : undefined,
      certInfoError: cert.ok === false ? cert.message : undefined,
      taskQuery: taskBody,
      taskQueryError,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手单店查询失败：${msg}` })
  }
}

/**
 * 代理「提交门店资质亮照/认领」异步任务。
 * 请求体须与官方一致（含 datas 数组等），成功后会清空本会话 POI 缓存以便列表与来客侧对齐。
 */
export async function handleKuaishouPoiClaimPost(
  req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }
  let body: unknown
  try {
    body = JSON.parse(bodyRaw || '{}') as unknown
  } catch {
    json(res, 400, { message: '请求体须为 JSON' })
    return
  }
  if (!body || typeof body !== 'object') {
    json(res, 400, { message: '请求体格式错误' })
    return
  }
  const b = body as { datas?: unknown; target_type?: unknown }
  if (!Array.isArray(b.datas) || b.datas.length === 0) {
    json(res, 400, {
      message:
        '请求体须包含非空 datas 数组，字段与快手「提交门店资质亮照/修改任务」OpenAPI 一致（life.capacity.poi.claim）。',
    })
    return
  }
  try {
    const token = await ensureKuaishouToken(session)
    const payload =
      typeof b.target_type === 'number' || typeof b.target_type === 'string'
        ? body
        : { ...b, target_type: 100 }
    const dr = await kuaishouServerFetch(kuaishouOpenApiUrl('/goodlife/v1/poi/poi/claim/'), {
      method: 'POST',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': session.merchantId,
      },
      body: JSON.stringify(payload),
    })
    const raw = await dr.text()
    clearSessionPoiCache(auth)
    res.statusCode = dr.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手认领/亮照提交失败：${msg}` })
  }
}

function yuanToFen(yuan: number): number {
  if (!Number.isFinite(yuan) || yuan <= 0) return 1
  const n = Math.round(yuan * 100)
  return Math.min(Math.max(1, n), Number.MAX_SAFE_INTEGER)
}

function fenToYuan(fen: number): number {
  if (!Number.isFinite(fen) || fen <= 0) return 0
  return Math.round(fen) / 100
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

function extractGoodlifeProductFromGetEnvelope(
  root: Record<string, unknown>,
): { product: Record<string, unknown>; skus: Record<string, unknown>[] } | null {
  const data = root.data as Record<string, unknown> | undefined
  const pickProduct = (src: Record<string, unknown> | undefined): Record<string, unknown> | null => {
    if (!src) return null
    if (src.product && typeof src.product === 'object' && !Array.isArray(src.product)) {
      return src.product as Record<string, unknown>
    }
    const list = src.products ?? src.product_list
    if (Array.isArray(list) && list[0] && typeof list[0] === 'object') {
      return list[0] as Record<string, unknown>
    }
    if (src.product_id || src.product_name || src.category_id) return src
    return null
  }
  const pickSkus = (src: Record<string, unknown> | undefined, product: Record<string, unknown>): Record<string, unknown>[] => {
    if (!src) {
      const s = product.sku
      if (s && typeof s === 'object' && !Array.isArray(s)) return [s as Record<string, unknown>]
      if (Array.isArray(product.skus)) return product.skus as Record<string, unknown>[]
      return []
    }
    if (Array.isArray(src.skus)) return src.skus as Record<string, unknown>[]
    if (src.sku && typeof src.sku === 'object' && !Array.isArray(src.sku)) return [src.sku as Record<string, unknown>]
    const s = product.sku
    if (s && typeof s === 'object' && !Array.isArray(s)) return [s as Record<string, unknown>]
    if (Array.isArray(product.skus)) return product.skus as Record<string, unknown>[]
    return []
  }
  let product = pickProduct(data) ?? pickProduct(root)
  if (!product) return null
  const skus = pickSkus(data, product)
  return { product, skus }
}

function comboGroupsFromGoodlifeProduct(
  product: Record<string, unknown>,
  attrMap: Record<string, string>,
): { groups: Record<string, unknown>[] } | undefined {
  const tryParse = (raw: unknown): { groups: Record<string, unknown>[] } | undefined => {
    if (typeof raw !== 'string' || !raw.trim()) return undefined
    const parsed = parseComboRuleJsonToGroupsObject(raw)
    if (!parsed || !Array.isArray(parsed.groups)) return undefined
    return { groups: parsed.groups as Record<string, unknown>[] }
  }
  const top = product.combo_rule
  if (top && typeof top === 'object' && !Array.isArray(top)) {
    const g = (top as { groups?: unknown[] }).groups
    if (Array.isArray(g) && g.length > 0) return { groups: g as Record<string, unknown>[] }
  }
  if (typeof top === 'string') {
    const p = tryParse(top)
    if (p) return p
  }
  for (const [k, v] of Object.entries(attrMap)) {
    if (/combo_rule|commodity|搭配|套餐/i.test(k) || /combo|commodity/i.test(k)) {
      const p = tryParse(v)
      if (p) return p
    }
  }
  return undefined
}

function mapGoodlifeProductToErpDetail(
  product: Record<string, unknown>,
  skus: Record<string, unknown>[],
): Record<string, unknown> {
  const product_id = String(product.product_id ?? product.id ?? '').trim()
  const out_id = String(product.out_id ?? product.outId ?? '').trim() || `erp-${product_id || randomUUID()}`
  const category_id = String(product.category_id ?? product.categoryId ?? '').trim()
  const product_type = erpUiProductTypeFromGoodlifeApi(
    Number(product.product_type ?? product.productType) || 1,
  )
  const product_name = String(product.product_name ?? product.name ?? '').trim()
  const attrMap =
    product.attr_key_value_map && typeof product.attr_key_value_map === 'object' && !Array.isArray(product.attr_key_value_map)
      ? (product.attr_key_value_map as Record<string, string>)
      : {}
  const sku0 = skus[0] ?? {}
  const skuAttrMap =
    sku0.attr_key_value_map && typeof sku0.attr_key_value_map === 'object' && !Array.isArray(sku0.attr_key_value_map)
      ? (sku0.attr_key_value_map as Record<string, string>)
      : {}
  const actualFen = Number(sku0.actual_amount ?? skuAttrMap.actual_amount)
  const originFen = Number(sku0.origin_amount ?? skuAttrMap.origin_amount ?? actualFen)
  const price_yuan = fenToYuan(Number.isFinite(actualFen) ? actualFen : 0)
  const origin_price_yuan = fenToYuan(Number.isFinite(originFen) ? originFen : actualFen)

  const imageUrls = [
    ...parseImageListAttrJson(attrMap.image_list),
    ...parseImageListAttrJson(attrMap.image_1v1_list),
    ...parseImageListAttrJson(attrMap.detail_image_list),
  ]
  const head_image_urls = imageUrls.length > 0 ? [imageUrls[0]!] : []
  const aux_image_urls = imageUrls.length > 1 ? imageUrls.slice(1) : []
  const env_image_urls = parseImageListAttrJson(attrMap.environment_image_list)

  const poisRaw = product.pois
  const poi_ids = Array.isArray(poisRaw)
    ? poisRaw
        .map((p) => {
          if (typeof p === 'string') return p.trim()
          if (p && typeof p === 'object') return String((p as Record<string, unknown>).poi_id ?? '').trim()
          return ''
        })
        .filter(Boolean)
    : []

  const combo = comboGroupsFromGoodlifeProduct(product, { ...attrMap, ...skuAttrMap })
  let package_combo: Record<string, unknown> | undefined
  if (product_type === 1 && combo?.groups?.length) {
    package_combo = {
      groups: combo.groups.map((g) => {
        const gr = g as Record<string, unknown>
        const itemsIn = Array.isArray(gr.item_list)
          ? gr.item_list
          : Array.isArray(gr.items)
            ? gr.items
            : []
        const tc = Number(gr.total_count)
        const oc = Number(gr.option_count)
        const n = itemsIn.length
        let pick_rule = String(gr.pick_rule ?? gr.pickRule ?? '').trim()
        if (!pick_rule && Number.isFinite(tc) && Number.isFinite(oc) && n > 0) {
          if (tc === n && oc === n) pick_rule = '全部必选'
          else if (tc === n && oc === 1) pick_rule = `${tc}选1`
          else if (tc > 0 && oc > 0) pick_rule = `${tc}选${oc}`
        }
        if (!pick_rule) pick_rule = '全部必选'
        return {
          group_name: String(gr.group_name ?? gr.groupName ?? '').trim() || '商品组',
          pick_rule,
          items: itemsIn.map((it) => {
            const row = it as Record<string, unknown>
            const priceFen = comboItemPriceFenFromRow(row, originFen)
            return {
              name: String(row.name ?? product_name).trim() || product_name,
              quantity: comboItemCountFromRow(row),
              origin_price_yuan: fenToYuan(priceFen),
            }
          }),
        }
      }),
    }
  }

  const rp = Number(attrMap.RefundPolicy)
  let after_sale_policy = 'refund_anytime'
  if (rp === 2) after_sale_policy = 'no_refund'
  else if (rp === 3) after_sale_policy = 'refund_auto_expire'

  let reserve_mode: 'none' | 'required' = 'none'
  try {
    const ap = attrMap.appointment ? (JSON.parse(attrMap.appointment) as Record<string, unknown>) : null
    if (ap && Number(ap.need_appointment) === 1) reserve_mode = 'required'
  } catch {
    /* ignore */
  }

  let consume_valid_days = 360
  try {
    const ud = attrMap.use_date ? (JSON.parse(attrMap.use_date) as Record<string, unknown>) : null
    const d = Number(ud?.use_day ?? ud?.day ?? ud?.valid_days)
    if (Number.isFinite(d) && d > 0) consume_valid_days = Math.floor(d)
  } catch {
    /* ignore */
  }

  const product_desc =
    (typeof attrMap.description_rich_text === 'string' && attrMap.description_rich_text.trim()) ||
    (typeof product.desc === 'string' && product.desc.trim()) ||
    undefined

  return {
    ...(product_id ? { product_id } : {}),
    out_id,
    category_id,
    product_type,
    product_name,
    product_desc,
    price_yuan,
    origin_price_yuan,
    head_image_urls,
    aux_image_urls,
    env_image_urls,
    poi_ids,
    ...(package_combo ? { package_combo } : {}),
    sales_info: {
      channel: 'unlimited',
      stock_qty: Number(skuAttrMap.stock_qty ?? sku0.stock_qty) || 999,
    },
    trade_rules: {
      consume_date_mode: 'days',
      consume_valid_days,
      after_sale_policy,
      reserve_mode,
    },
    consume_rules: {
      in_store_discount: false,
      extra_fee: false,
      voucher_limit: product_type === 2,
      voucher_max: 1,
      people_limit: false,
    },
  }
}

async function fetchGoodlifeProductDetailById(
  accountId: string,
  token: string,
  productId: string,
): Promise<Record<string, unknown> | null> {
  const paths = [
    '/goodlife/v1/goods/product/draft/get/',
    '/goodlife/v1/goods/product/online/get/',
  ] as const
  for (const path of paths) {
    const u = new URL(kuaishouOpenApiUrl(path))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('product_id', productId)
    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    if (!getDataError(j).ok) continue
    const extracted = extractGoodlifeProductFromGetEnvelope(j)
    if (!extracted) continue
    return mapGoodlifeProductToErpDetail(extracted.product, extracted.skus)
  }
  return null
}

function pickProductImageAttrKey(attrs: Record<string, unknown>[]): string | null {
  const scored: { key: string; score: number }[] = []
  for (const a of attrs) {
    const key = String(a.key ?? '').trim()
    if (!key) continue
    const vt = String(a.value_type ?? '').toUpperCase()
    const name = String(a.name ?? '')
    let score = 0
    if (vt === 'IMAGE_LIST' || vt === 'IMAGE') score += 12
    if (/头图|主图|商品图|轮播|封面|相册/.test(name)) score += 10
    if (/image|img|carousel|banner|pic|photo/i.test(key)) score += 6
    if (/图/.test(name)) score += 2
    scored.push({ key, score })
  }
  scored.sort((x, y) => y.score - x.score)
  return scored[0] && scored[0].score > 0 ? scored[0].key : null
}

function templateAttrKeyNames(
  productAttrs: Record<string, unknown>[],
  skuAttrs: Record<string, unknown>[],
): string[] {
  const out: string[] = []
  for (const a of [...productAttrs, ...skuAttrs]) {
    const k = String((a as Record<string, unknown>).key ?? '').trim().toLowerCase()
    const n = String((a as Record<string, unknown>).name ?? '').trim().toLowerCase()
    if (k) out.push(k)
    if (n) out.push(n)
  }
  return out
}

/** 模板含代金券专有字段（voucher_type / 适用品牌品类等） */
function templateLooksLikeVoucher(keys: string[]): boolean {
  const hay = keys.join(' ')
  return /voucher_type|applicable_brand|applicable_category|代金券类型|适用品牌|适用品类/.test(hay)
}

/** 模板含团购/套餐搭配字段 */
function templateLooksLikeGroupBuy(keys: string[]): boolean {
  const hay = keys.join(' ')
  return /^commodity$|combo_rule|菜品搭配|套餐|团购/.test(hay)
}

/** 模板含次卡专有字段（勿与「仅返回团购模板」混淆） */
function templateLooksLikeTimesCard(keys: string[]): boolean {
  const hay = keys.join(' ')
  return /次卡|times.?card|multi.?pass|use_times|核销次数|card_times/.test(hay)
}

/**
 * 零售日用百货等（如 5003003）：来客后台通常为「团购 + 代金券」，不含次卡/预约品。
 * 与 template.get 空返回时的 UI 兜底一致。
 */
function categoryRetailGroupAndVoucherLikely(categoryId: string): boolean {
  return categoryRetailComboAttrNormalize(categoryId)
}

/** ERP/来客 UI：代金券 */
const ERP_UI_PRODUCT_TYPE_VOUCHER = 2

/** goodlife OpenAPI 常见代金券 product_type（文档/餐饮旧版为 11；部分链路仍认 2） */
const GOODLIFE_API_PRODUCT_TYPE_VOUCHER_PRIMARY = 11

function isErpUiVoucherProductType(t: number): boolean {
  return t === ERP_UI_PRODUCT_TYPE_VOUCHER
}

function isGoodlifeVoucherApiProductType(t: number): boolean {
  return t === ERP_UI_PRODUCT_TYPE_VOUCHER || t === GOODLIFE_API_PRODUCT_TYPE_VOUCHER_PRIMARY || t === 15
}

/** 快手详情/保存返回的 API 类型 → ERP 向导展示类型 */
function erpUiProductTypeFromGoodlifeApi(apiType: number): number {
  if (apiType === GOODLIFE_API_PRODUCT_TYPE_VOUCHER_PRIMARY || apiType === 15) return ERP_UI_PRODUCT_TYPE_VOUCHER
  return apiType
}

/** ERP UI 类型 → goodlife template/save 应尝试的 product_type 顺序（代金券优先 11） */
function goodlifeApiProductTypesForErpUi(uiProductType: number): number[] {
  if (!isErpUiVoucherProductType(uiProductType)) return [uiProductType || 1]
  const envAlt = process.env.KUAISHOU_GOODS_VOUCHER_TEMPLATE_PRODUCT_TYPE_ALT?.trim() ?? ''
  const alts = envAlt
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
  return Array.from(
    new Set(
      [GOODLIFE_API_PRODUCT_TYPE_VOUCHER_PRIMARY, ERP_UI_PRODUCT_TYPE_VOUCHER, 15, ...alts].filter(
        (n) => Number.isFinite(n) && n > 0,
      ),
    ),
  )
}

/**
 * 按 template.get 返回的 attr 形态判断某 product_type 是否可选（避免「有次卡模板字段却实为团购模板」误开次卡）。
 */
function inferProductTypeEligibleFromTemplate(
  productType: number,
  productAttrs: Record<string, unknown>[],
  skuAttrs: Record<string, unknown>[],
  categoryId: string,
): boolean {
  const keys = templateAttrKeyNames(productAttrs, skuAttrs)
  const hasAttrs = keys.length > 0
  const voucher = templateLooksLikeVoucher(keys)
  const groupBuy = templateLooksLikeGroupBuy(keys)
  const timesCard = templateLooksLikeTimesCard(keys)

  if (productType === 1) {
    if (!hasAttrs) return categoryRetailGroupAndVoucherLikely(categoryId)
    if (voucher && !groupBuy) return false
    if (timesCard && !groupBuy) return false
    return groupBuy || !voucher
  }
  if (productType === 2) {
    if (!hasAttrs) return categoryRetailGroupAndVoucherLikely(categoryId)
    if (timesCard && !voucher) return false
    if (groupBuy && !voucher) return false
    return voucher || !groupBuy
  }
  if (productType === 3) {
    if (!hasAttrs) return false
    return timesCard && !voucher
  }
  if (productType === 4) {
    if (!hasAttrs) return false
    const hay = keys.join(' ')
    return /预约|appointment|calendar|预售预约/.test(hay) && !voucher && !timesCard
  }
  return hasAttrs
}

async function fetchTemplateAttrsBundleOnce(
  accountId: string,
  token: string,
  categoryId: string,
  productType: number,
  openBizType: number | undefined,
  signal?: AbortSignal,
): Promise<{ productAttrs: Record<string, unknown>[]; skuAttrs: Record<string, unknown>[] }> {
  const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/template/get/'))
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('category_id', categoryId)
  u.searchParams.set('product_type', String(productType))
  if (openBizType !== undefined && Number.isFinite(openBizType)) {
    u.searchParams.set('open_biz_type', String(Math.floor(openBizType)))
  }
  const dr = await kuaishouServerFetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': token,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
    signal,
  })
  const raw = await dr.text()
  const j = parseKuaishouJson(raw)
  if (!getDataError(j).ok) return { productAttrs: [], skuAttrs: [] }
  const data = j.data as Record<string, unknown> | undefined
  const { pa, sa } = extractProductSkuAttrsFromTemplateEnvelope(data, j)
  return { productAttrs: pa, skuAttrs: sa }
}

async function fetchTemplateAttrsBundle(
  accountId: string,
  token: string,
  categoryId: string,
  erpUiProductType: number,
  signal?: AbortSignal,
  opts?: { apiProductTypeOnly?: number },
): Promise<TemplateAttrsBundle> {
  if (!categoryId) return { productAttrs: [], skuAttrs: [] }
  const openBizAttempts: Array<number | undefined> = [undefined]
  /** 代金券：部分零售类目需 open_biz_type=0 才返回模板（勿传 1=组合券包） */
  if (isErpUiVoucherProductType(erpUiProductType) || opts?.apiProductTypeOnly != null) {
    openBizAttempts.push(0)
  }
  const productTypeAttempts: number[] =
    opts?.apiProductTypeOnly != null
      ? [opts.apiProductTypeOnly]
      : goodlifeApiProductTypesForErpUi(erpUiProductType)
  const ttl = templateAttrsBundleCacheTtlMs()
  const ck = templateAttrsBundleCacheKey(accountId, categoryId, erpUiProductType)
  if (ttl > 0 && opts?.apiProductTypeOnly == null) {
    const hit = templateAttrsBundleCache.get(ck)
    if (hit && Date.now() < hit.expiresAt) return hit.bundle
  }
  let last: TemplateAttrsBundle = { productAttrs: [], skuAttrs: [] }
  for (const pt of productTypeAttempts) {
    for (const obt of openBizAttempts) {
      try {
        const bundle = await fetchTemplateAttrsBundleOnce(
          accountId,
          token,
          categoryId,
          pt,
          obt,
          signal,
        )
        last = { ...bundle, resolvedProductType: pt, resolvedOpenBizType: obt }
        if (bundle.productAttrs.length > 0 || bundle.skuAttrs.length > 0) {
          const resolved: TemplateAttrsBundle = { ...bundle, resolvedProductType: pt, resolvedOpenBizType: obt }
          if (ttl > 0 && opts?.apiProductTypeOnly == null) {
            templateAttrsBundleCache.set(ck, { expiresAt: Date.now() + ttl, bundle: resolved })
          }
          return resolved
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(
          '[meoo douyin template/get] bundle_attempt_failed',
          JSON.stringify({
            category_id: categoryId,
            erp_ui_product_type: erpUiProductType,
            product_type: pt,
            open_biz_type: obt ?? null,
            message: msg.slice(0, 200),
          }),
        )
      }
    }
  }
  return last
}

/** 从 template/get 的 data（或少数变体的根对象）解析 product_attrs / sku_attrs */
function extractProductSkuAttrsFromTemplateEnvelope(
  data: Record<string, unknown> | undefined,
  root: Record<string, unknown>,
): { pa: Record<string, unknown>[]; sa: Record<string, unknown>[] } {
  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as Record<string, unknown>[]) : []
  const spuFrom = (src: Record<string, unknown> | undefined) =>
    arr(src?.spu_attrs ?? (src as Record<string, unknown> | undefined)?.spuAttrs)
  const pick = (src: Record<string, unknown> | undefined) => {
    if (!src) return { pa: [] as Record<string, unknown>[], sa: [] as Record<string, unknown>[] }
    return {
      pa: arr(src.product_attrs ?? (src as Record<string, unknown>).productAttrs),
      sa: arr(src.sku_attrs ?? (src as Record<string, unknown>).skuAttrs),
    }
  }
  let { pa, sa } = pick(data)
  if (pa.length === 0 && sa.length === 0 && data?.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    const inner = pick(data.data as Record<string, unknown>)
    pa = inner.pa
    sa = inner.sa
  }
  if (pa.length === 0 && sa.length === 0) {
    const r = pick(root)
    pa = r.pa
    sa = r.sa
  }
  if (pa.length === 0 && data && typeof data === 'object') {
    const spu = spuFrom(data)
    if (spu.length > 0) pa = spu
  }
  if (pa.length === 0 && root && typeof root === 'object') {
    const d = root.data as Record<string, unknown> | undefined
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      const spu = spuFrom(d)
      if (spu.length > 0) pa = spu
    }
  }
  return { pa, sa }
}

/** 团购 template/get 为空时的文档级兜底（含 commodity / 套餐搭配） */
function syntheticGoodlifeGroupBuyTemplateAttrsBundle(): {
  productAttrs: Record<string, unknown>[]
  skuAttrs: Record<string, unknown>[]
} {
  const productAttrs: Record<string, unknown>[] = [
    {
      key: 'image_list',
      name: '封面图',
      value_type: 'IMAGE',
      is_multi: true,
      is_required: true,
    },
    {
      key: 'environment_image_list',
      name: '环境图',
      value_type: 'IMAGE',
      is_multi: true,
      is_required: false,
    },
    {
      key: 'Notification',
      name: '使用规则',
      value_type: 'NOTIFICATION',
      is_multi: true,
      is_required: true,
    },
    {
      key: 'description_rich_text',
      name: '商品描述',
      value_type: 'TEXT',
      is_multi: false,
      is_required: false,
    },
  ]
  const skuAttrs: Record<string, unknown>[] = [
    {
      key: 'commodity',
      name: '菜品搭配',
      value_type: 'COMMODITY',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'actual_amount',
      name: '售价(分)',
      value_type: 'INT',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'origin_amount',
      name: '原价(分)',
      value_type: 'INT',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'stock_qty',
      name: '库存',
      value_type: 'INT',
      is_multi: false,
      is_required: false,
    },
  ]
  return { productAttrs, skuAttrs }
}

/**
 * 代金券 template/get 为空时的兜底（勿含 commodity/combo_rule，否则易报「商品类型和类目对应的商品模板不存在」）。
 * @see template.get 文档 voucher_type / applicable_category / applicable_brands
 */
function syntheticGoodlifeVoucherTemplateAttrsBundle(): {
  productAttrs: Record<string, unknown>[]
  skuAttrs: Record<string, unknown>[]
} {
  const productAttrs: Record<string, unknown>[] = [
    {
      key: 'image_list',
      name: '封面图',
      value_type: 'IMAGE',
      is_multi: true,
      is_required: true,
    },
    {
      key: 'environment_image_list',
      name: '环境图',
      value_type: 'IMAGE',
      is_multi: true,
      is_required: false,
    },
    {
      key: 'Notification',
      name: '使用规则',
      value_type: 'NOTIFICATION',
      is_multi: true,
      is_required: true,
    },
    {
      key: 'description_rich_text',
      name: '商品描述',
      value_type: 'TEXT',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'voucher_type',
      name: '代金券类型',
      value_type: 'COMMON_ENUM',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'applicable_category',
      name: '适用品类',
      value_type: 'APPLICABLE_CATEGORY',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'applicable_brands',
      name: '适用品牌',
      value_type: 'APPLICABLE_BRANDS',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'product_diy_name',
      name: '代金券展示名',
      value_type: 'STRING',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'platform_unified_description',
      name: '平台统一说明',
      value_type: 'BOOL',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'use_date',
      name: '顾客可消费日期',
      value_type: 'USE_DATE',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'use_time',
      name: '每日消费时段',
      value_type: 'USE_TIME',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'can_no_use_date',
      name: '顾客不可消费日期',
      value_type: 'CAN_NO_USE_DATE',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'appointment',
      name: '预约信息',
      value_type: 'APPOINTMENT',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'RefundPolicy',
      name: '售后政策',
      value_type: 'INT',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'show_channel',
      name: '投放渠道',
      value_type: 'INT',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'limit_use_rule',
      name: '限制使用规则',
      value_type: 'LIMIT_USE_RULE',
      is_multi: false,
      is_required: true,
    },
  ]
  const skuAttrs: Record<string, unknown>[] = [
    {
      key: 'actual_amount',
      name: '售价(分)',
      value_type: 'INT',
      is_multi: false,
      is_required: true,
    },
    {
      key: 'origin_amount',
      name: '原价(分)',
      value_type: 'INT',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'stock_qty',
      name: '库存',
      value_type: 'INT',
      is_multi: false,
      is_required: false,
    },
    {
      key: 'limit_rule',
      name: '限购规则',
      value_type: 'LIMIT_RULE',
      is_multi: false,
      is_required: false,
    },
  ]
  return { productAttrs, skuAttrs }
}

function syntheticGoodlifeTemplateAttrsBundle(productType: number): {
  productAttrs: Record<string, unknown>[]
  skuAttrs: Record<string, unknown>[]
} {
  return productType === 2
    ? syntheticGoodlifeVoucherTemplateAttrsBundle()
    : syntheticGoodlifeGroupBuyTemplateAttrsBundle()
}

/** 代金券 attr：适用品类/类型等（template.get 未返回时由网关写入最小合法 JSON） */
function injectVoucherTemplateAttrsFromErp(mergedProductAttrs: Record<string, string>): void {
  if (!(mergedProductAttrs.voucher_type ?? '').trim()) {
    mergedProductAttrs.voucher_type = JSON.stringify({ key: 3, value: '通用券' })
  }
  if (!(mergedProductAttrs.applicable_category ?? '').trim()) {
    mergedProductAttrs.applicable_category = JSON.stringify({
      applicable_category_type: { key: 1, value: '全部品类适用' },
    })
  }
  if (!(mergedProductAttrs.applicable_brands ?? '').trim()) {
    mergedProductAttrs.applicable_brands = JSON.stringify({
      applicable_brand_type: { key: 1, value: '全部品牌适用' },
    })
  }
}

/** 在 merge 之后补齐开放平台文档级字面 key（模板未返回 opaque 槽时仍常必填） */
function injectDocKeyedProductAttrsFromErp(
  mergedProductAttrs: Record<string, string>,
  erp: Record<string, unknown>,
  categoryId: string,
): void {
  const sales =
    erp.sales_info && typeof erp.sales_info === 'object' ? (erp.sales_info as Record<string, unknown>) : {}
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object' ? (erp.trade_rules as Record<string, unknown>) : {}
  const ch = typeof sales.channel === 'string' ? sales.channel.trim() : ''
  if (!(mergedProductAttrs.show_channel ?? '').trim()) {
    mergedProductAttrs.show_channel = normalizeDouyinShowChannelValue('', ch, categoryId)
  }
  const asp = typeof trade.after_sale_policy === 'string' ? trade.after_sale_policy.trim() : ''
  if (asp && !(mergedProductAttrs.RefundPolicy ?? '').trim()) {
    const rp = asp === 'no_refund' ? 2 : asp === 'refund_auto_expire' ? 3 : 1
    mergedProductAttrs.RefundPolicy = String(rp)
  }
  const validDays = Math.max(1, Math.floor(Number(trade.consume_valid_days) || 360))
  const consumeMode = trade.consume_date_mode === 'calendar' ? 'calendar' : 'days'
  if (!(mergedProductAttrs.use_date ?? '').trim()) {
    mergedProductAttrs.use_date = douyinUseDateJson(validDays, consumeMode)
  }
  if (!(mergedProductAttrs.use_time ?? '').trim()) {
    mergedProductAttrs.use_time = douyinUseTimeJson()
  }
  if (!(mergedProductAttrs.can_no_use_date ?? '').trim()) {
    mergedProductAttrs.can_no_use_date = douyinCanNoUseDateJson(false)
  }
  const reserveMode = typeof trade.reserve_mode === 'string' ? trade.reserve_mode.trim() : ''
  const reserveAdvance = Math.max(1, Math.floor(Number(trade.reserve_advance_value) || 1))
  if (!(mergedProductAttrs.appointment ?? '').trim()) {
    mergedProductAttrs.appointment = douyinAppointmentJson(reserveMode === 'required', reserveAdvance)
  }
}

/** template.get 有 image_list 必填但 value_type 未标 IMAGE 时，仍写入轮播图 JSON */
function ensureProductImageAttrsInMap(
  mergedProductAttrs: Record<string, string>,
  templateAttrs: Record<string, unknown>[],
  carouselUrls: string[],
): void {
  const urls = carouselUrls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u))
  if (urls.length === 0) return
  const payload = jsonImageUrlList(urls)
  const keys = new Set<string>(['image_list', 'image_1v1_list', 'detail_image_list', 'environment_image_list'])
  for (const a of templateAttrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key) continue
    const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
    const name = String((a as Record<string, unknown>).name ?? '')
    if (vt === 'IMAGE_LIST' || vt === 'IMAGE' || /image|img|carousel|banner|pic|photo|图|相册|头图|主图|轮播|封面/i.test(key + name)) {
      keys.add(key)
    }
  }
  for (const key of keys) {
    if (!(mergedProductAttrs[key] ?? '').trim()) mergedProductAttrs[key] = payload
  }
}

/** 去掉空 IMAGE 槽（如 atmosphere_image），避免 goodlife 报参数不合法 */
function pruneEmptyNonRequiredImageAttrs(
  templateAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
): void {
  for (const a of templateAttrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key || (merged[key] ?? '').trim()) continue
    if (Boolean((a as Record<string, unknown>).is_required)) continue
    const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
    const name = String((a as Record<string, unknown>).name ?? '')
    if (vt.includes('IMAGE') || /image|img|图|氛围|atmosphere/i.test(key + name)) {
      delete merged[key]
    }
  }
}

function jsonImageUrlList(urls: string[]): string {
  return JSON.stringify(urls.slice(0, 30).map((url) => ({ url })))
}

function productImageUrlsFromErp(erp: Record<string, unknown>): string[] {
  const fields = ['head_image_urls', 'aux_image_urls', 'env_image_urls']
  const out: string[] = []
  for (const field of fields) {
    const raw = erp[field]
    if (!Array.isArray(raw)) continue
    for (const x of raw) {
      const u = String(x ?? '').trim()
      if (u) out.push(u)
    }
  }
  return out
}

function findUnpublishableImageUrls(erp: Record<string, unknown>): string[] {
  return productImageUrlsFromErp(erp).filter((u) => {
    if (/^https?:\/\//i.test(u)) return false
    return /^data:image\//i.test(u) || /^blob:/i.test(u) || u.length > 2000
  })
}

/** 模板手填 JSON / 文本中夹带本机预览图 */
function findUnpublishableImageInTemplateOverrides(erp: Record<string, unknown>): string[] {
  const paths: string[] = []
  for (const top of ['template_attr_overrides', 'template_sku_attr_overrides'] as const) {
    const o = erp[top]
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v !== 'string' || !v.trim()) continue
      if (/data:image\//i.test(v) || /^blob:/i.test(v)) paths.push(`${top}.${k}`)
    }
  }
  return paths
}

/** 组装后的 attr 值中仍含内联图（兜底） */
function findAttrMapDataUrlOrBlobKeys(m: unknown): string[] {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    if (/data:image\//i.test(v) || /^blob:/i.test(v)) out.push(k)
  }
  return out
}

/**
 * 快手「商品搭配 / COMMODITY」控件：ItemGroupStruct（见开放平台商品搭配控件文档）
 * total_count + option_count 表达 n 选 k；「全部必选」= n==k==单品数。
 * 不使用中文 pick_rule、不使用 items/quantity/origin_price 等自创字段名，避免 goodlife 反序列化后判空。
 */
function pickRuleToTotalAndOptionCount(itemCount: number, pickRule: string): { total_count: number; option_count: number } {
  if (itemCount <= 0) return { total_count: 0, option_count: 0 }
  const pr = (pickRule.trim() || '全部必选') === '全部必选' ? '全部必选' : pickRule.trim()
  if (itemCount === 1 || pr === '全部必选') {
    return { total_count: itemCount, option_count: itemCount }
  }
  const m = /^(\d+)选(\d+)$/.exec(pr)
  if (m) {
    const n = Number.parseInt(m[1]!, 10)
    const k = Number.parseInt(m[2]!, 10)
    if (n === itemCount && k >= 1 && k <= n) return { total_count: n, option_count: k }
  }
  return { total_count: itemCount, option_count: itemCount }
}

/** 模板 attr：套餐 / combo_rule / COMMODITY 类（与 merge + 强制回填逻辑一致） */
function attrTemplateLooksComboLike(key: string, name: string, vtRaw: string): boolean {
  const vt = vtRaw.toUpperCase()
  const nm = name.toLowerCase()
  if (vt === 'COMMODITY') return true
  if (/^combo_rule$/i.test(key)) return true
  if (/^commodity$/i.test(key)) return true
  if (nm.includes('combo_rule')) return true
  if (/套餐规则|搭配规则|组合规则|套餐数据|搭配数据|商品搭配|菜品搭配/.test(name)) return true
  if ((vt === 'STRUCT' || vt === 'OBJECT' || vt === 'JSON') && /套餐|搭配|组合/.test(name)) return true
  return false
}

function comboItemPriceFenFromRow(row: Record<string, unknown>, originFenFallback: number): number {
  const opFenDirect = row.origin_price
  if (opFenDirect != null && Number.isFinite(Number(opFenDirect))) {
    const n = Math.floor(Number(opFenDirect))
    if (n > 0) return Math.max(1, Math.min(n, Number.MAX_SAFE_INTEGER))
  }
  const priceFen = row.price
  if (priceFen != null && Number.isFinite(Number(priceFen))) {
    const n = Math.floor(Number(priceFen))
    if (n > 0) return Math.max(1, Math.min(n, Number.MAX_SAFE_INTEGER))
  }
  const opYuan = row.origin_price_yuan
  if (opYuan != null && Number.isFinite(Number(opYuan))) {
    const n = yuanToFen(Number(opYuan))
    return Math.max(1, Math.min(n, Number.MAX_SAFE_INTEGER))
  }
  return Math.max(1, Math.min(originFenFallback, Number.MAX_SAFE_INTEGER))
}

function comboItemCountFromRow(row: Record<string, unknown>): number {
  return Math.max(1, Math.floor(Number(row.quantity ?? row.count ?? row.qty ?? 1) || 1))
}

/** 解析用户/前端手填的 commodity 或 combo_rule JSON → `{ groups: ItemGroupStruct[] }` */
function parseComboRuleJsonToGroupsObject(raw: string): Record<string, unknown> | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  try {
    const j = JSON.parse(t) as unknown
    if (Array.isArray(j) && j.length > 0) return { groups: j }
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const g = (j as { groups?: unknown[] }).groups
      if (Array.isArray(g) && g.length > 0) return { groups: g }
    }
  } catch {
    return null
  }
  return null
}

/**
 * 手填 `template_sku_attr_overrides.commodity` / `template_attr_overrides.combo_rule` 优先于 package_combo，
 * 避免「页面 JSON 已填对、顶层 product.combo_rule 仍来自旧 package_combo」导致快手校验失败。
 */
function resolveComboRuleFromErpOverrides(
  erp: Record<string, unknown>,
  fallback: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const tryField = (raw: unknown): Record<string, unknown> | null => {
    if (typeof raw !== 'string') return null
    return parseComboRuleJsonToGroupsObject(raw)
  }
  const skuO = erp.template_sku_attr_overrides
  if (skuO && typeof skuO === 'object' && !Array.isArray(skuO)) {
    const parsed = tryField((skuO as Record<string, unknown>).commodity)
    if (parsed) return parsed
  }
  const tplO = erp.template_attr_overrides
  if (tplO && typeof tplO === 'object' && !Array.isArray(tplO)) {
    const parsed = tryField((tplO as Record<string, unknown>).combo_rule)
    if (parsed) return parsed
  }
  return fallback
}

/** goodlife 侧 combo_rule 与 ERP `package_combo` 同源；仅团购 product_type=1 使用；出站对齐 ItemGroupStruct */
function buildDouyinProductComboRule(
  erp: Record<string, unknown>,
  productNameFallback: string,
  /** SKU 原价（分）：组内单品未填原价时用于兜底 */
  originFenFallback: number,
): Record<string, unknown> | null {
  const raw = erp.package_combo
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { groups?: unknown[] }
  const groupsIn = Array.isArray(o.groups) ? o.groups : []
  if (groupsIn.length === 0) return null
  const fb = productNameFallback.trim().slice(0, 120) || '单品'
  const groups = groupsIn.map((g) => {
    const gr = g as Record<string, unknown>
    const itemsIn = Array.isArray(gr.items)
      ? gr.items
      : Array.isArray(gr.item_list)
        ? gr.item_list
        : []
    const groupName = String(gr.group_name ?? gr.groupName ?? '').trim() || '商品组'
    const item_list = itemsIn.map((it) => {
      const row = it as Record<string, unknown>
      const name = String(row.name ?? '').trim() || fb
      const count = comboItemCountFromRow(row)
      const price = comboItemPriceFenFromRow(row, originFenFallback)
      const item: Record<string, unknown> = {
        name,
        /** 单品价（分），与开放平台团购示例字段一致（勿加 qty/quantity，部分类目反序列化会判失败） */
        price,
        count,
        /** 类目 5003003 等常强校验「单位必须为份」；勿传「个/件」等以免误判 */
        unit: '份',
        count_unit: '份',
      }
      const pid = String(row.product_id ?? '').trim()
      if (pid) item.product_id = pid
      const sid = String(row.sku_id ?? '').trim()
      if (sid) item.sku_id = sid
      return item
    })
    const prRaw = String(gr.pick_rule ?? gr.pickRule ?? '').trim()
    const inferred = (() => {
      const tc = Number(gr.total_count)
      const oc = Number(gr.option_count)
      if (Number.isFinite(tc) && Number.isFinite(oc) && tc > 0 && oc > 0 && item_list.length > 0) {
        return { total_count: Math.floor(tc), option_count: Math.floor(oc) }
      }
      return pickRuleToTotalAndOptionCount(item_list.length, prRaw || '全部必选')
    })()
    return {
      group_name: groupName,
      total_count: inferred.total_count,
      option_count: inferred.option_count,
      item_list,
    }
  })
  const groupsWithItems = groups.filter((g) => Array.isArray(g.item_list) && g.item_list.length > 0)
  if (groupsWithItems.length === 0) return null
  return { groups: groupsWithItems }
}

/**
 * 部分类目下 goodlife 要求团购 `combo_rule` 至少 2 个商品组；仅 1 组时拆成 A/B（内容同源）。
 * 与来客里手动复制第二组等价。`KUAISHOU_GOODS_COMBO_SINGLE_GROUP_AUTO_DUP=0|false|off` 关闭。
 */
/**
 * 零售类目：多组内容完全一致时压成 1 组（自动填满曾默认 2 组同源）。
 */
function collapseRetailDuplicateComboGroups(
  comboRule: Record<string, unknown> | null,
  categoryId: string,
): Record<string, unknown> | null {
  if (!comboRule || !categoryRetailComboAttrNormalize(categoryId)) return comboRule
  const groups = (comboRule as { groups?: unknown[] }).groups
  if (!Array.isArray(groups) || groups.length <= 1) return comboRule
  const sig = (g: Record<string, unknown>) => {
    const list = Array.isArray(g.item_list) ? g.item_list : Array.isArray(g.items) ? g.items : []
    return JSON.stringify(
      list.map((it) => {
        const r = it as Record<string, unknown>
        return {
          n: String(r.name ?? ''),
          p: comboItemPriceFenFromRow(r, 0),
          c: comboItemCountFromRow(r),
          u: String(r.unit ?? ''),
        }
      }),
    )
  }
  const first = groups[0] as Record<string, unknown>
  if (!first || typeof first !== 'object') return comboRule
  const s0 = sig(first)
  if (groups.every((g) => g && typeof g === 'object' && sig(g as Record<string, unknown>) === s0)) {
    return { groups: [JSON.parse(JSON.stringify(first))] }
  }
  return comboRule
}

function categoryComboSingleGroupAutoDup(categoryId: string): boolean {
  const cid = String(categoryId ?? '').trim()
  /** 零售 5003003 等：单组自动克隆 A/B 易触发「数量/单位」误报，默认关闭；其它团购类目仍默认开启 */
  if (categoryRetailSplitItemsToSeparateGroups(cid)) return false
  const dupOff = process.env.KUAISHOU_GOODS_COMBO_SINGLE_GROUP_AUTO_DUP?.trim().toLowerCase()
  return dupOff !== '0' && dupOff !== 'false' && dupOff !== 'off'
}

function expandGroupBuyComboRuleMinTwoGroups(
  comboRule: Record<string, unknown> | null,
  categoryId: string,
): Record<string, unknown> | null {
  if (!comboRule) return null
  const groupsIn = (comboRule as { groups?: unknown[] }).groups
  if (!Array.isArray(groupsIn) || groupsIn.length === 0) return comboRule
  const withItems = groupsIn.filter((g) => {
    const gr = g as Record<string, unknown>
    return Array.isArray(gr.item_list) && gr.item_list.length > 0
  }) as Record<string, unknown>[]
  if (withItems.length !== 1) return comboRule
  if (!categoryComboSingleGroupAutoDup(categoryId)) return comboRule
  const g0 = withItems[0]
  const clone = JSON.parse(JSON.stringify(g0)) as Record<string, unknown>
  const base = String(g0.group_name ?? '商品组').trim().slice(0, 60) || '商品组'
  g0.group_name = `${base}-A`
  clone.group_name = `${base}-B`
  return { groups: [g0, clone] }
}

/** 零售等类目：用户只有 1 个商品组但组内多个单品时，拆成「每组 1 个单品」的多组（满足「商品组≥2」且避免 A/B 克隆同源误校验）。未设置 env 时默认含 5003003；关闭设空。 */
function categoryRetailSplitItemsToSeparateGroups(categoryId: string): boolean {
  const raw = process.env.KUAISHOU_GOODS_RETAIL_SPLIT_ITEMS_TO_GROUPS_CATEGORY_IDS
  const cid = String(categoryId ?? '').trim()
  if (raw === undefined) return cid === '5003003'
  const t = raw.trim()
  if (t === '' || t === '0' || t === 'false' || t === 'off') return false
  return new Set(t.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)).has(cid)
}

/**
 * 单组且 item_list≥2 → 每组只保留 1 个单品；组名带序号。
 */
function retailSplitSingleGroupIntoOneGroupPerItem(
  comboRule: Record<string, unknown>,
  categoryId: string,
): Record<string, unknown> | null {
  if (!categoryRetailSplitItemsToSeparateGroups(categoryId)) return null
  const groups = (comboRule as { groups?: unknown[] }).groups
  if (!Array.isArray(groups) || groups.length !== 1) return null
  const g0 = groups[0] as Record<string, unknown>
  const list = Array.isArray(g0.item_list)
    ? g0.item_list
    : Array.isArray(g0.items)
      ? g0.items
      : []
  if (!Array.isArray(list) || list.length < 2) return null
  const base = String(g0.group_name ?? '商品组').trim().slice(0, 36) || '商品组'
  const newGroups = list.map((it, idx) => ({
    group_name: `${base}-${idx + 1}`.slice(0, 60),
    total_count: 1,
    option_count: 1,
    item_list: [it],
  }))
  return { groups: newGroups }
}

function categoryUsesStringifiedComboItemNumbers(categoryId: string): boolean {
  const raw = process.env.KUAISHOU_GOODS_COMBO_ATTR_ITEM_NUMBERS_AS_STRING_CATEGORY_IDS
  const cid = String(categoryId ?? '').trim()
  /** 默认关闭：字符串化曾仍触发误报，改为零售规范化数值 + quantity + wrapped */
  if (raw === undefined) return false
  const t = raw.trim()
  if (t === '' || t === '0' || t === 'false' || t === 'off') return false
  return new Set(t.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)).has(cid)
}

/** 写入 attr/sku 套餐 JSON 前规范化单品字段（数值 count/price/unit=份，并带 quantity 兼容字段）。默认类目 5003003。 */
function categoryRetailComboAttrNormalize(categoryId: string): boolean {
  const raw = process.env.KUAISHOU_GOODS_COMBO_ATTR_RETAIL_NORMALIZE_CATEGORY_IDS
  const cid = String(categoryId ?? '').trim()
  if (raw === undefined) return cid === '5003003'
  const t = raw.trim()
  if (t === '' || t === '0' || t === 'false' || t === 'off') return false
  return new Set(t.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)).has(cid)
}

/** attr.combo_rule / sku.commodity 使用 `{"groups":[...]}` 包裹。默认关闭（数组更安全）；排障可设 KUAISHOU_GOODS_COMBO_ATTR_WRAPPED_GROUPS_CATEGORY_IDS=5003003 */
function categoryUsesWrappedGroupsAttrCombo(categoryId: string): boolean {
  const raw = process.env.KUAISHOU_GOODS_COMBO_ATTR_WRAPPED_GROUPS_CATEGORY_IDS
  const cid = String(categoryId ?? '').trim()
  if (raw === undefined || raw.trim() === '') return false
  const t = raw.trim()
  if (t === '' || t === '0' || t === 'false' || t === 'off') return false
  return new Set(t.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)).has(cid)
}

function normalizeComboItemRowForAttrJson(
  row: Record<string, unknown>,
  originFenFallback: number,
  mode: 'retail' | 'stringify',
): Record<string, unknown> {
  const count = comboItemCountFromRow(row)
  const price = comboItemPriceFenFromRow(row, originFenFallback)
  const name = String(row.name ?? '').trim() || '单品'
  /** 与开放平台团购示例一致：count + unit + count_unit（份数单位，见 goods/save 文档 commodity 示例） */
  const item: Record<string, unknown> =
    mode === 'stringify'
      ? {
          name,
          price: String(price),
          count: String(count),
          unit: '份',
          count_unit: '份',
        }
      : { name, price, count, quantity: count, unit: '份', count_unit: '份' }
  const pid = String(row.product_id ?? '').trim()
  if (pid) item.product_id = pid
  const sid = String(row.sku_id ?? '').trim()
  if (sid) item.sku_id = sid
  return item
}

function normalizeComboGroupsArrayForAttrMaps(
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): Record<string, unknown>[] {
  const groups = (comboRule as { groups?: unknown[] }).groups
  if (!Array.isArray(groups)) return []
  const arr = JSON.parse(JSON.stringify(groups)) as Record<string, unknown>[]
  const cid = String(categoryId ?? '').trim()
  const stringifyNums = categoryUsesStringifiedComboItemNumbers(cid)
  const retailNorm = categoryRetailComboAttrNormalize(cid)
  if (!stringifyNums && !retailNorm) return arr
  const mode = stringifyNums ? 'stringify' : 'retail'
  for (const g of arr) {
    if (!g || typeof g !== 'object') continue
    const listKey = Array.isArray(g.item_list)
      ? 'item_list'
      : Array.isArray(g.items)
        ? 'items'
        : null
    if (!listKey) continue
    const list = g[listKey] as Record<string, unknown>[]
    if (!Array.isArray(list)) continue
    g[listKey] = list.map((row) =>
      row && typeof row === 'object'
        ? normalizeComboItemRowForAttrJson(row as Record<string, unknown>, originFenFallback, mode)
        : row,
    )
  }
  return arr
}

/** attr_key_value_map / sku commodity 最终 JSON 字符串（数组或 {"groups":[]}）。 */
function serializeComboGroupsAttrPayload(
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): string {
  const arr = normalizeComboGroupsArrayForAttrMaps(comboRule, categoryId, originFenFallback)
  const shape = process.env.KUAISHOU_GOODS_COMBO_ATTR_JSON_SHAPE?.trim().toLowerCase()
  const envWrapped = shape === 'wrapped' || shape === 'object' || shape === 'groups'
  const catWrapped = categoryUsesWrappedGroupsAttrCombo(categoryId)
  const wrapped = envWrapped || catWrapped
  return JSON.stringify(wrapped ? { groups: arr } : arr).slice(0, 120_000)
}

function comboRuleFlattenedItemsJsonString(
  comboRule: Record<string, unknown>,
  originFenFallback: number,
): string {
  const groups = (comboRule as { groups?: unknown[] }).groups
  const items: Record<string, unknown>[] = []
  if (!Array.isArray(groups)) return '[]'
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue
    const gr = g as Record<string, unknown>
    const list = Array.isArray(gr.item_list)
      ? gr.item_list
      : Array.isArray(gr.items)
        ? gr.items
        : []
    for (const it of list) {
      if (!it || typeof it !== 'object') continue
      const row = it as Record<string, unknown>
      const count = comboItemCountFromRow(row)
      const price = comboItemPriceFenFromRow(row, originFenFallback)
      items.push({
        name: String(row.name ?? '').trim() || '单品',
        price,
        count,
        unit: '份',
      })
    }
  }
  return JSON.stringify(items).slice(0, 120_000)
}

/**
 * SKU `commodity`（COMMODITY 控件）：默认 ItemGroupStruct[] 组数组 JSON。
 * 排障：`KUAISHOU_GOODS_COMBO_COMMODITY_JSON_SHAPE=flattened` 可试扁平 ItemStruct[]（多数类目不适用）。
 */
function comboRuleSkuCommodityAttrJsonString(
  comboRule: Record<string, unknown>,
  originFenFallback: number,
  categoryId: string,
): string {
  const shape =
    process.env.KUAISHOU_GOODS_COMBO_COMMODITY_JSON_SHAPE?.trim().toLowerCase() ||
    process.env.KUAISHOU_GOODS_COMBO_ATTR_ITEMS_SHAPE?.trim().toLowerCase()
  if (shape === 'flattened' || shape === 'flat' || shape === 'items') {
    return comboRuleFlattenedItemsJsonString(comboRule, originFenFallback)
  }
  return serializeComboGroupsAttrPayload(comboRule, categoryId, originFenFallback)
}

/**
 * product.attr 字面量 `combo_rule`（无 opaque 槽、且非团购顶层已带 combo_rule 时）。
 * 形态与 commodity 一致：ItemGroupStruct[] 组数组。
 */
function comboRuleProductLiteralAttrJsonString(
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): string {
  return serializeComboGroupsAttrPayload(comboRule, categoryId, originFenFallback)
}

/** attr 内 opaque 套餐槽：与字面量 commodity 同源，见 serializeComboGroupsAttrPayload。 */
function comboRuleJsonForAttrKeyValueMap(
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): string {
  return serializeComboGroupsAttrPayload(comboRule, categoryId, originFenFallback)
}

/** attr 侧序列化结果是否无有效组/单品（`[]` 或 `{"groups":[]}`） */
function comboRuleAttrJsonIsEffectivelyEmpty(s: string): boolean {
  const t = (s ?? '').trim()
  if (!t) return true
  if (t === '[]') return true
  try {
    const j = JSON.parse(t) as unknown
    if (Array.isArray(j)) return j.length === 0
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const g = (j as { groups?: unknown }).groups
      return !Array.isArray(g) || g.length === 0
    }
  } catch {
    return true
  }
  return false
}

/** 无 package_combo 或解析失败时：单组单品 ItemGroupStruct，供团购兜底与代金券等 template 仍要求 combo 的场景 */
function buildDouyinComboRuleSingleGroupDefault(
  productNameFallback: string,
  actualFen: number,
  originFenForItemList?: number,
): Record<string, unknown> {
  const af = Math.max(1, Math.floor(Number(actualFen)) || 1)
  const of = Number(originFenForItemList)
  const itemLineFen = Number.isFinite(of) && of > 0 ? Math.max(af, Math.floor(of)) : af
  return {
    groups: [
      {
        group_name: '商品组',
        total_count: 1,
        option_count: 1,
        item_list: [
          {
            name: productNameFallback.slice(0, 120) || '团购套餐',
            count: 1,
            unit: '份',
            /** 与来客「划线价 ≥ 售价」一致：取 max(实付分, 原价分)，避免套餐标价低于 SKU 划线 */
            price: itemLineFen,
          },
        ],
      },
    ],
  }
}

/**
 * 将 combo_rule 写入商品模板 attr_key_value_map（与快手「商品搭配」一致：值为 **groups 数组** 的 JSON 字符串）。
 * 勿写入 `{"groups":[…]}` 形态，否则易触发「请传入合法的 combo_rule」。
 */
function applyComboRuleToMergedProductAttrs(
  attrs: Record<string, unknown>[],
  mergedProductAttrs: Record<string, string>,
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): void {
  const groupsPayload = comboRuleJsonForAttrKeyValueMap(comboRule, categoryId, originFenFallback)
  if (comboRuleAttrJsonIsEffectivelyEmpty(groupsPayload)) return
  for (const a of attrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key) continue
    const name = String((a as Record<string, unknown>).name ?? '')
    const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
    if (!attrTemplateLooksComboLike(key, name, vt)) continue
    if ((mergedProductAttrs[key] ?? '').trim()) continue
    mergedProductAttrs[key] = groupsPayload
  }
  /** 勿写入字面量 key「combo_rule」：模板多为不透明 key，乱写会触发上游异常 */
}

/** SKU 模板 COMMODITY/commodity：ItemGroupStruct[] 组数组（与开放平台 COMMODITY 控件一致）。 */
function applyComboRuleToSkuAttrMap(
  skuAttrs: Record<string, unknown>[],
  skuAttrMap: Record<string, string>,
  comboRule: Record<string, unknown>,
  originFenFallback: number,
  categoryId: string,
): void {
  const commodityPayload = comboRuleSkuCommodityAttrJsonString(comboRule, originFenFallback, categoryId)
  if (comboRuleAttrJsonIsEffectivelyEmpty(commodityPayload)) return
  for (const a of skuAttrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key) continue
    const name = String((a as Record<string, unknown>).name ?? '')
    const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
    if (!(vt === 'COMMODITY' || /^commodity$/i.test(key) || /菜品搭配|商品搭配/.test(name))) continue
    if ((skuAttrMap[key] ?? '').trim()) continue
    skuAttrMap[key] = commodityPayload
  }
  /** 勿写入字面量「commodity」：须与 template.get 的 sku_attrs.key 一致 */
}

function countComboGroupsInCommodityAttrJson(s: string): number {
  const t = (s ?? '').trim()
  if (!t.startsWith('[') && !t.startsWith('{')) return -1
  try {
    const j = JSON.parse(t) as unknown
    if (Array.isArray(j)) return j.length
    if (j && typeof j === 'object' && Array.isArray((j as { groups?: unknown[] }).groups)) {
      return (j as { groups: unknown[] }).groups.length
    }
  } catch {
    return -1
  }
  return -1
}

/**
 * 用户手填的 sku.commodity 常只有 1 组，而网关已对 `product.combo_rule` 做「≥2 组」扩展或零售拆组，
 * 二者组数不一致时快手常误报「数量必须大于0且单位必须为份」。按 `combo_rule` 组数补齐/截断并保留用户已填组的单品。
 */
function alignSkuCommodityJsonToComboRuleGroups(
  existingJson: string,
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): string {
  const shape =
    process.env.KUAISHOU_GOODS_COMBO_COMMODITY_JSON_SHAPE?.trim().toLowerCase() ||
    process.env.KUAISHOU_GOODS_COMBO_ATTR_ITEMS_SHAPE?.trim().toLowerCase()
  if (shape === 'flattened' || shape === 'flat' || shape === 'items') return existingJson

  const expArr = normalizeComboGroupsArrayForAttrMaps(comboRule, categoryId, originFenFallback)
  if (expArr.length === 0) return existingJson

  const curLen = countComboGroupsInCommodityAttrJson(existingJson)
  if (curLen < 0) return existingJson

  let userGroups: Record<string, unknown>[]
  try {
    const parsed = JSON.parse((existingJson ?? '').trim()) as unknown
    if (Array.isArray(parsed)) userGroups = parsed as Record<string, unknown>[]
    else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { groups?: unknown[] }).groups)) {
      userGroups = (parsed as { groups: Record<string, unknown>[] }).groups
    } else {
      return comboRuleSkuCommodityAttrJsonString(comboRule, originFenFallback, categoryId)
    }
  } catch {
    return comboRuleSkuCommodityAttrJsonString(comboRule, originFenFallback, categoryId)
  }

  const out: Record<string, unknown>[] = []
  for (let i = 0; i < expArr.length; i++) {
    const expG = expArr[i] as Record<string, unknown>
    if (i < userGroups.length && userGroups[i] && typeof userGroups[i] === 'object') {
      const uG = userGroups[i] as Record<string, unknown>
      const uItemList = Array.isArray(uG.item_list)
        ? uG.item_list
        : Array.isArray(uG.items)
          ? uG.items
          : null
      const base = JSON.parse(JSON.stringify(expG)) as Record<string, unknown>
      const listKey = Array.isArray(base.item_list)
        ? 'item_list'
        : Array.isArray(base.items)
          ? 'items'
          : 'item_list'
      if (Array.isArray(uItemList) && uItemList.length > 0) {
        const cid = String(categoryId ?? '').trim()
        const stringifyNums = categoryUsesStringifiedComboItemNumbers(cid)
        const retailNorm = categoryRetailComboAttrNormalize(cid)
        const mode = stringifyNums ? 'stringify' : retailNorm ? 'retail' : null
        base[listKey] =
          mode == null
            ? uItemList
            : uItemList.map((row) =>
                row && typeof row === 'object'
                  ? normalizeComboItemRowForAttrJson(row as Record<string, unknown>, originFenFallback, mode)
                  : row,
              )
      }
      out.push(base)
    } else {
      out.push(JSON.parse(JSON.stringify(expG)) as Record<string, unknown>)
    }
  }
  return serializeComboGroupsAttrPayload({ groups: out } as Record<string, unknown>, categoryId, originFenFallback)
}

/** 将套餐组数组规范为 goodlife ItemGroupStruct（组级 total_count/option_count + 单品 count/unit=份） */
function normalizeComboGroupsForProductBody(
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): Record<string, unknown> {
  const arr = normalizeComboGroupsArrayForAttrMaps(comboRule, categoryId, originFenFallback)
  const groups = arr.map((g) => {
    const gr = g as Record<string, unknown>
    const item_list = (Array.isArray(gr.item_list)
      ? gr.item_list
      : Array.isArray(gr.items)
        ? gr.items
        : []) as Record<string, unknown>[]
    const inferred = pickRuleToTotalAndOptionCount(item_list.length, '')
    const tc = Math.max(1, Math.floor(Number(gr.total_count) || inferred.total_count))
    const oc = Math.max(1, Math.floor(Number(gr.option_count) || inferred.option_count))
    const normItems = item_list.map((row) =>
      row && typeof row === 'object'
        ? normalizeComboItemRowForProductBody(
            row as Record<string, unknown>,
            originFenFallback,
            categoryId,
          )
        : row,
    )
    const pr = String(gr.pick_rule ?? gr.pickRule ?? '').trim()
    return {
      group_name: String(gr.group_name ?? '商品组').trim().slice(0, 80) || '商品组',
      total_count: tc,
      option_count: oc,
      ...(pr ? { pick_rule: pr } : {}),
      item_list: normItems,
    }
  })
  return { groups }
}

/** 顶层 product.combo_rule 对象内单品：attr 为 JSON 字符串，body 内可同时带 quantity 兼容字段 */
function normalizeComboItemRowForProductBody(
  row: Record<string, unknown>,
  originFenFallback: number,
  categoryId: string,
): Record<string, unknown> {
  const retail = categoryRetailComboAttrNormalize(categoryId)
  const item = normalizeComboItemRowForAttrJson(row, originFenFallback, retail ? 'retail' : 'retail')
  const count = comboItemCountFromRow(item)
  return { ...item, count, quantity: count, unit: '份', count_unit: '份' }
}

/**
 * 团购保存前：顶层 combo_rule、attr.combo_rule、sku.commodity 同源且全部规范化。
 * 组数已对齐仍可能因手填 JSON 缺 unit/count 或 attr 含 quantity 字段触发误报。
 */
function finalizeGroupBuyComboPayloads(
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
  mergedProductAttrs: Record<string, string>,
  skuAttrs: Record<string, unknown>[],
  skuAttrMap: Record<string, string>,
  tplProductComboKeys: string[],
): Record<string, unknown> {
  const normalized = normalizeComboGroupsForProductBody(comboRule, categoryId, originFenFallback)
  const attrJson = comboRuleProductLiteralAttrJsonString(normalized, categoryId, originFenFallback)
  const commodityJson = comboRuleSkuCommodityAttrJsonString(normalized, originFenFallback, categoryId)

  if (!comboRuleAttrJsonIsEffectivelyEmpty(attrJson)) {
    mergedProductAttrs.combo_rule = attrJson
    for (const key of tplProductComboKeys) {
      if (key && key !== 'combo_rule') mergedProductAttrs[key] = attrJson
    }
  }

  if (!comboRuleAttrJsonIsEffectivelyEmpty(commodityJson)) {
    skuAttrMap.commodity = commodityJson
    for (const a of skuAttrs) {
      const key = String((a as Record<string, unknown>).key ?? '').trim()
      if (!key) continue
      const name = String((a as Record<string, unknown>).name ?? '')
      const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
      if (vt === 'COMMODITY' || /^commodity$/i.test(key) || /菜品搭配|商品搭配/.test(name)) {
        skuAttrMap[key] = commodityJson
      }
    }
  }

  /** 零售：commodity 已填时不再重复写 attr.combo_rule，避免双份校验不一致 */
  if (
    categoryRetailComboAttrNormalize(categoryId) &&
    !comboRuleAttrJsonIsEffectivelyEmpty(commodityJson) &&
    (mergedProductAttrs.combo_rule ?? '').trim() === commodityJson.trim()
  ) {
    delete mergedProductAttrs.combo_rule
  }

  return normalized
}

function alignAllSkuCommodityAttrsToComboRule(
  skuAttrs: Record<string, unknown>[],
  skuAttrMap: Record<string, string>,
  comboRule: Record<string, unknown>,
  categoryId: string,
  originFenFallback: number,
): void {
  for (const a of skuAttrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key) continue
    const name = String((a as Record<string, unknown>).name ?? '')
    const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
    if (!(vt === 'COMMODITY' || /^commodity$/i.test(key) || /菜品搭配|商品搭配/.test(name))) continue
    const cur = (skuAttrMap[key] ?? '').trim()
    if (!cur) continue
    const next = alignSkuCommodityJsonToComboRuleGroups(cur, comboRule, categoryId, originFenFallback)
    if (next !== cur) skuAttrMap[key] = next.slice(0, 120_000)
  }
}

function mergeGoodlifeProductAttrMapFromErp(
  attrs: Record<string, unknown>[],
  erp: Record<string, unknown>,
  base: Record<string, string>,
  opts?: { omitComboTemplateAttrs?: boolean },
): Record<string, string> {
  const omitCombo = Boolean(opts?.omitComboTemplateAttrs)
  const out: Record<string, string> = { ...base }
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object' ? (erp.trade_rules as Record<string, unknown>) : {}
  const consume =
    erp.consume_rules && typeof erp.consume_rules === 'object' ? (erp.consume_rules as Record<string, unknown>) : {}
  const sales =
    erp.sales_info && typeof erp.sales_info === 'object' ? (erp.sales_info as Record<string, unknown>) : {}

  const headUrls = Array.isArray(erp.head_image_urls)
    ? (erp.head_image_urls as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const auxUrls = Array.isArray(erp.aux_image_urls)
    ? (erp.aux_image_urls as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const envUrls = Array.isArray(erp.env_image_urls)
    ? (erp.env_image_urls as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const carouselUrls = [...headUrls, ...auxUrls]

  const productName = String(erp.product_name ?? '').trim()
  const productDesc = String(erp.product_desc ?? '').trim()
  const otherExplain = typeof consume.other === 'string' ? consume.other.trim() : ''
  const usageBlob = [otherExplain, `交易/售卖：${JSON.stringify({ trade, sales })}`]
    .filter((x) => x.length > 0)
    .join('\n\n')
    .slice(0, 12000)

  const pkgJson =
    erp.package_combo && typeof erp.package_combo === 'object'
      ? JSON.stringify(erp.package_combo).slice(0, 120_000)
      : ''

  const imageAttrs: Record<string, unknown>[] = []
  const otherAttrs: Record<string, unknown>[] = []
  for (const a of attrs) {
    const vt = String(a.value_type ?? '').toUpperCase()
    if (vt.includes('IMAGE') || vt === 'PIC') imageAttrs.push(a)
    else otherAttrs.push(a)
  }

  let envPool = [...envUrls]
  const carouselPool = [...carouselUrls]

  const takeCarousel = (multi: boolean): string[] => {
    if (carouselPool.length === 0) return []
    if (multi) {
      const chunk = carouselPool.splice(0, 30)
      return chunk
    }
    const one = carouselPool.shift()
    return one ? [one] : []
  }

  const takeEnv = (multi: boolean): string[] => {
    if (envPool.length === 0) return []
    if (multi) {
      const chunk = envPool.splice(0, 15)
      return chunk
    }
    const one = envPool.shift()
    return one ? [one] : []
  }

  for (const a of imageAttrs.sort((x, y) => Number(!!y.is_required) - Number(!!x.is_required))) {
    const key = String(a.key ?? '').trim()
    if (!key || out[key]) continue
    const multi = Boolean(a.is_multi)
    const name = String(a.name ?? '')
    let urls: string[] = []
    if (/环境|场景/.test(name)) urls = takeEnv(multi)
    if (urls.length === 0) urls = takeCarousel(multi)
    if (urls.length === 0 && headUrls[0]) urls = [headUrls[0]!]
    if (urls.length === 0) continue
    out[key] = jsonImageUrlList(urls)
  }

  const sorted = [...otherAttrs].sort((a, b) => Number(!!b.is_required) - Number(!!a.is_required))
  for (const a of sorted) {
    const key = String(a.key ?? '').trim()
    if (!key || out[key]) continue
    const name = String(a.name ?? '')
    const vt = String(a.value_type ?? '').toUpperCase()
    const req = Boolean(a.is_required)
    if (omitCombo && attrTemplateLooksComboLike(key, name, vt)) continue

    if (
      vt === 'STRUCT' ||
      vt === 'OBJECT' ||
      vt === 'JSON' ||
      /套餐|搭配|组合/.test(name) ||
      /^combo_rule$/i.test(key) ||
      /套餐规则|搭配规则|组合规则/.test(name)
    ) {
      if (omitCombo && pkgJson && attrTemplateLooksComboLike(key, name, vt)) {
        /* 团购：套餐 JSON 仅走顶层 product.combo_rule，不写入 combo 类 attr */
        continue
      }
      /**
       * 团购 omitCombo 时：原始 package_combo 为 `{ groups: [{ items, quantity }] }`，与 goodlife ItemStruct（item_list、count、unit）不一致。
       * 若写入任意 STRUCT/JSON 模板槽位，快手常报「数量必须大于0且单位必须为份」。套餐数据仅由 applyComboRule* + product.combo_rule 写入。
       */
      if (pkgJson && !omitCombo) {
        out[key] = pkgJson
        continue
      }
    }

    if (vt === 'NOTE' || /^description_rich/i.test(key) || attrKeyIsDouyinDescription(key)) {
      continue
    }

    /** Notification 须为 [{title,content}] 列表 JSON，勿写纯文本（会报 Notification参数不合法） */
    if (/^notification$/i.test(key) || vt === 'NOTIFICATION') {
      continue
    }

    if (/^limit_use_rule$/i.test(key) || vt === 'LIMIT_USE_RULE') {
      const voucherLimit = consume.voucher_limit === true
      const voucherMax = Math.max(1, Math.floor(Number(consume.voucher_max) || 1))
      out[key] = voucherLimit ? douyinLimitUseRuleJson(true, voucherMax) : douyinLimitUseRuleJson(false)
      continue
    }

    /** 零售代金券：勿用营销标题填充 product_diy_name / platform_unified_description */
    if (attrKeyIsDouyinProductDiyName(key) || attrKeyIsDouyinPlatformUnifiedDescription(key)) {
      continue
    }

    if (vt === 'STRING' || vt === 'TEXT' || vt === 'URL' || vt === '' || vt === 'ENUM') {
      if ((/^combo_rule$/i.test(key) || name.toLowerCase().includes('combo_rule')) && pkgJson && !omitCombo) {
        out[key] = pkgJson
        continue
      }
      if (attrKeyIsDouyinSubTitle(key) || /副标题/.test(name)) {
        out[key] = buildDouyinSubTitleFromTradeRules(extractDouyinSubTitleTradeContextFromErp(erp))
        continue
      }
      if (
        /标题|商品名称|名称(?!规范)/.test(name) &&
        productName &&
        !/副标题/.test(name) &&
        !attrKeyIsDouyinProductDiyName(key)
      ) {
        out[key] = productName.slice(0, 2000)
        continue
      }
      if (
        (/详情|图文|介绍/.test(name) ||
          (/描述/.test(name) &&
            !attrKeyIsDouyinDescription(key) &&
            !/^description_rich/i.test(key))) &&
        !/副标题/.test(name)
      ) {
        const v = (productDesc || productName).slice(0, 12000)
        if (v) {
          out[key] = v
          continue
        }
      }
      if (/卖点/.test(name) && !attrKeyIsDouyinSubTitle(key)) {
        const v = (productDesc || productName).slice(0, 80)
        if (v) out[key] = v
        continue
      }
      if (/购买须知|使用说明|温馨提示|使用规则|注意事项|其他说明/.test(name)) {
        const v = (usageBlob || productDesc || productName).slice(0, 12000)
        if (v || req) {
          out[key] = v || productName.slice(0, 500) || '详见商品名称'
          continue
        }
      }
      if (/券|码类型|三方|平台券/.test(name) && trade.coupon_type != null && String(trade.coupon_type).trim()) {
        out[key] = String(trade.coupon_type).trim().slice(0, 256)
        continue
      }
    }

    if (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER' || vt === 'INTEGER') {
      if (/有效|天数|天/.test(name) && trade.consume_valid_days != null) {
        const n = Math.max(0, Math.floor(Number(trade.consume_valid_days) || 0))
        out[key] = String(n)
        continue
      }
      if (/库存|数量/.test(name) && sales.stock_qty != null) {
        const n = Math.max(0, Math.floor(Number(sales.stock_qty) || 0))
        out[key] = String(n)
        continue
      }
    }

    if ((vt === 'BOOL' || vt === 'BOOLEAN') && req) {
      out[key] = 'false'
      continue
    }

    if (req && !out[key]) {
      if (vt === 'STRING' || vt === 'TEXT' || vt === '' || !vt) {
        out[key] = (productDesc || productName || '-').slice(0, 2000)
      } else if (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER' || vt === 'INTEGER') {
        out[key] = '0'
      }
    }
  }

  for (const a of attrs) {
    const key = String(a.key ?? '').trim()
    if (!key || out[key]) continue
    if (!Boolean(a.is_required)) continue
    const vt = String(a.value_type ?? '').toUpperCase()
    if (/^limit_use_rule$/i.test(key) || vt === 'LIMIT_USE_RULE') {
      const voucherLimit = consume.voucher_limit === true
      const voucherMax = Math.max(1, Math.floor(Number(consume.voucher_max) || 1))
      out[key] = voucherLimit ? douyinLimitUseRuleJson(true, voucherMax) : douyinLimitUseRuleJson(false)
      continue
    }
    if (/^notification$/i.test(key) || vt === 'NOTIFICATION') {
      continue
    }
    if (attrKeyIsDouyinProductDiyName(key) || attrKeyIsDouyinPlatformUnifiedDescription(key)) {
      continue
    }
    if (vt.includes('IMAGE') || vt === 'PIC') {
      if (headUrls[0]) out[key] = jsonImageUrlList([headUrls[0]!])
    } else if (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER' || vt === 'INTEGER') {
      out[key] = '0'
    } else {
      out[key] = (productDesc || productName || '-').slice(0, 2000)
    }
  }

  return out
}

/**
 * template.get 标记 is_required 但 merge 未自动识别的 SKU 槽位补默认值，避免上游泛化错误（如缺券码来源仍报套餐数量/单位）。
 * - code_source_type：券码来源；优先 trade_rules.code_source_type，否则 KUAISHOU_GOODS_SKU_CODE_SOURCE_TYPE_DEFAULT 或 "1"（平台发码）。
 */
/**
 * 按 template.get 返回的 sku_attrs.key 写入开放平台文档常见默认值（仅填空项）。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/locallife/old-versions-warning/goods-repo/goods-save
 */
function applySkuTemplateAttrLiteralsFromTemplate(
  skuAttrs: Record<string, unknown>[],
  skuAttrMap: Record<string, string>,
): void {
  const defaults: Record<string, string> = {
    limit_rule: '{"is_limit":false}',
    settle_type: '1',
    use_type: '1',
  }
  for (const a of skuAttrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key || (skuAttrMap[key] ?? '').trim()) continue
    const lk = key.toLowerCase()
    if (defaults[lk]) skuAttrMap[key] = defaults[lk]!
  }
}

function applyMissingRequiredSkuAttrDefaults(
  skuAttrs: Record<string, unknown>[],
  skuAttrMap: Record<string, string>,
  erp: Record<string, unknown>,
): void {
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object'
      ? (erp.trade_rules as Record<string, unknown>)
      : {}
  const pickCodeSource = (): string => {
    for (const k of ['code_source_type', 'coupon_code_source_type', 'codeSourceType'] as const) {
      const v = trade[k]
      if (v != null && String(v).trim()) return String(v).trim().slice(0, 32)
    }
    const d = process.env.KUAISHOU_GOODS_SKU_CODE_SOURCE_TYPE_DEFAULT?.trim()
    if (d) return d.slice(0, 32)
    return '1'
  }
  for (const a of skuAttrs) {
    if (!Boolean((a as Record<string, unknown>).is_required)) continue
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key || (skuAttrMap[key] ?? '').trim()) continue
    const name = String((a as Record<string, unknown>).name ?? '')
    const lk = key.toLowerCase()
    if (lk === 'code_source_type' || /code_source|券码来源/.test(`${lk} ${name}`)) {
      skuAttrMap[key] = pickCodeSource()
    }
  }
}

function mergeGoodlifeSkuAttrMapFromTemplate(
  skuAttrs: Record<string, unknown>[],
  productName: string,
  actualFen: number,
  originFen: number,
  stockQty: number,
): Record<string, string> {
  const out: Record<string, string> = {}
  const sorted = [...skuAttrs].sort((a, b) => Number(!!b.is_required) - Number(!!a.is_required))
  for (const a of sorted) {
    const key = String(a.key ?? '').trim()
    if (!key || out[key]) continue
    const name = String(a.name ?? '')
    const vt = String(a.value_type ?? '').toUpperCase()
    const req = Boolean(a.is_required)
    if (
      (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER' || vt === 'INTEGER') &&
      (/^actual_amount$/i.test(key) || /售价|实付|现价|团购/.test(name))
    ) {
      out[key] = String(actualFen)
      continue
    }
    if ((vt === 'INT' || vt === 'LONG') && (/^origin_amount$/i.test(key) || /原价|划线/.test(name))) {
      out[key] = String(originFen)
      continue
    }
    if ((vt === 'INT' || vt === 'LONG') && (/^stock_qty$/i.test(key) || /库存/.test(name))) {
      out[key] = String(stockQty)
      continue
    }
    if ((vt === 'STRING' || vt === 'TEXT') && (/^sku_name$/i.test(key) || /名称|规格/.test(name))) {
      out[key] = productName.slice(0, 120)
      continue
    }
    if (req && !out[key] && (vt === 'STRING' || vt === 'TEXT')) out[key] = productName.slice(0, 120)
    if (req && !out[key] && (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER')) out[key] = String(actualFen)
  }
  return out
}

/**
 * 开放平台：同一服务商下 out_id 标识商品；「三方码」等场景 out_id 不可为空串。
 * 前端「商家平台商品ID」落在 trade_rules.external_goods_id，须合并进 product.out_id。
 */
function resolveProductOutIdForSave(erp: Record<string, unknown>): string {
  const top = String(erp.out_id ?? '').trim()
  if (top) return top.slice(0, 128)
  const trade =
    erp.trade_rules && typeof erp.trade_rules === 'object' ? (erp.trade_rules as Record<string, unknown>) : {}
  const ext = String(trade.external_goods_id ?? '').trim()
  if (ext) return ext.slice(0, 128)
  return `erp-${randomUUID()}`.slice(0, 128)
}

/** goodlife product.save 要求 `product.account_name`（根账户昵称）；与 Rpc-Transit-Life-Account 不同 */
async function resolveProductAccountNameForSave(
  sessionKey: string,
  session: KuaishouMerchantSession,
  accountId: string,
  erp: Record<string, unknown>,
): Promise<string> {
  const direct = String(
    erp.account_name ?? (erp as Record<string, unknown>).accountName ?? '',
  ).trim()
  if (direct) return direct

  const fromCache = accountNameFromPois(
    (await getCachedPoiList(sessionKey, session, accountId, 'all', false)).pois,
  )
  if (typeof fromCache === 'string' && fromCache.trim()) return fromCache.trim()

  try {
    const j = await withKuaishouClientTokenRetry(session, { sessionKey }, (access) =>
      shopPoiQueryPage(accountId, access, 1, 30),
    )
    const data = j.data as Record<string, unknown> | undefined
    const pois = data ? extractPoisFromShopQueryData(data) : []
    const list = Array.isArray(pois) ? pois : []
    const n = accountNameFromPois(list)
    if (typeof n === 'string' && n.trim()) return n.trim()
  } catch {
    // 由调用方统一提示
  }
  return ''
}

/**
 * goodlife product/save 的 `open_biz_type`：与 template.get 文档一致，**1 = 组合券包**。
 * 代金券/次卡等若误传 1，快手常返回泛化「服务器打瞌睡」类错误。团购（product_type=1）与官方示例对齐默认 1。
 */
function resolveOpenBizTypeForGoodlifeSave(
  erp: Record<string, unknown>,
  productType: number,
  categoryId: string,
): number {
  const forced = process.env.KUAISHOU_GOODS_SAVE_OPEN_BIZ_TYPE?.trim()
  if (forced !== undefined && forced !== '') {
    const n = Number(forced)
    if (Number.isFinite(n) && n >= 0 && n <= 99) return Math.floor(n)
  }
  const raw = erp.open_biz_type ?? (erp as Record<string, unknown>).openBizType
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0 && n <= 99) return Math.floor(n)
  }
  /** 零售团购 5003003：open_biz_type=1 为「组合券包」，误传易触发业务规则/套餐数量类误报 */
  if (productType === 1 && categoryRetailComboAttrNormalize(categoryId)) return 0
  if (isGoodlifeVoucherApiProductType(productType)) return 0
  return productType === 1 ? 1 : 0
}

/**
 * 将 ERP 聚合表单映射为 goodlife/v1/goods/product/save 的 Body（含单 SKU）。
 * 头图写入 template/get 返回的 IMAGE 类 attr（按名称/类型启发式匹配）。
 */
async function buildGoodlifeProductSaveBody(
  accountId: string,
  token: string,
  erp: Record<string, unknown>,
  _mode: 'draft' | 'submit',
  account_name: string,
  douyinHttpSignal?: AbortSignal,
  opts?: {
    goodlifeProductTypeOverride?: number
    productDiyNameStrategy?: DouyinProductDiyNameApplyStrategy
  },
): Promise<{
  body: Record<string, unknown>
  templateProductAttrs: Record<string, unknown>[]
  templateSkuAttrs: Record<string, unknown>[]
  erpUiProductType: number
  goodlifeApiProductType: number
}> {
  const product_name = String(erp.product_name ?? '').trim()
  const category_id = String(erp.category_id ?? '').trim()
  const productDescRaw = String(erp.product_desc ?? product_name).trim()
  const erpUiProductType = Number(erp.product_type) || 1
  const isGroupBuy = erpUiProductType === 1
  const isVoucher = isErpUiVoucherProductType(erpUiProductType)
  const out_id = resolveProductOutIdForSave(erp)
  const product_id_existing =
    typeof erp.product_id === 'string' && erp.product_id.trim() ? erp.product_id.trim() : ''

  const poi_ids = Array.isArray(erp.poi_ids)
    ? (erp.poi_ids as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const headUrls = Array.isArray(erp.head_image_urls)
    ? (erp.head_image_urls as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []

  const priceYuan = Number(erp.price_yuan)
  const originYuan = Number(erp.origin_price_yuan ?? erp.price_yuan)
  const actualFen = yuanToFen(Number.isFinite(priceYuan) ? priceYuan : 0)
  const originFen = Math.max(actualFen, yuanToFen(Number.isFinite(originYuan) ? originYuan : priceYuan))

  const sales = erp.sales_info && typeof erp.sales_info === 'object' ? (erp.sales_info as Record<string, unknown>) : {}
  const stockQtyRaw = Number(sales.stock_qty)
  const stockQty =
    Number.isFinite(stockQtyRaw) && stockQtyRaw > 0 ? Math.min(Math.floor(stockQtyRaw), 99_999_999) : 999_999

  const templateBundle = await fetchTemplateAttrsBundle(
    accountId,
    token,
    category_id,
    erpUiProductType,
    douyinHttpSignal,
    opts?.goodlifeProductTypeOverride != null
      ? { apiProductTypeOnly: opts.goodlifeProductTypeOverride }
      : undefined,
  )
  let { productAttrs: attrs, skuAttrs } = templateBundle
  const goodlifeApiProductType =
    opts?.goodlifeProductTypeOverride ??
    templateBundle.resolvedProductType ??
    goodlifeApiProductTypesForErpUi(erpUiProductType)[0] ??
    erpUiProductType
  if (attrs.length === 0 && skuAttrs.length === 0 && category_id) {
    const typeLabel = isVoucher ? '代金券' : erpUiProductType === 1 ? '团购' : `商品类型${erpUiProductType}`
    const hint = isVoucher
      ? '该类目在快手侧未配置代金券模板，请改选「团购」或更换支持代金券的三级类目后再提交。'
      : '请更换三级类目或联系来客运营配置该类目商品模板后再提交。'
    const retailVoucherFallback = isVoucher && categoryRetailGroupAndVoucherLikely(category_id)
    if (_mode === 'submit' && !retailVoucherFallback) {
      throw new Error(
        `快手未返回「${typeLabel}」商品模板（category_id=${category_id}）。${hint}`,
      )
    }
    if (erpUiProductType >= 3 && _mode === 'submit') {
      throw new Error(
        `快手未返回「${typeLabel}」商品模板（category_id=${category_id}）。${hint}`,
      )
    }
    const syn = syntheticGoodlifeTemplateAttrsBundle(ERP_UI_PRODUCT_TYPE_VOUCHER)
    attrs = syn.productAttrs
    skuAttrs = syn.skuAttrs
    console.warn(
      '[meoo douyin goods/save] template_get_empty_using_doc_fallback',
      JSON.stringify({
        category_id,
        erp_ui_product_type: erpUiProductType,
        goodlife_api_product_type: goodlifeApiProductType,
        mode: _mode,
        voucher_shaped: isVoucher,
      }),
    )
  }
  const tplProductComboKeysEarly = templateComboAttrKeysFromAttrs(attrs)
  const tplHasComboSlotsEarly = tplProductComboKeysEarly.length > 0
  const auxUrls = Array.isArray(erp.aux_image_urls)
    ? (erp.aux_image_urls as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const carouselUrls = [...headUrls, ...auxUrls]

  const attr_key_value_map: Record<string, string> = {}
  const imageKey = pickProductImageAttrKey(attrs)
  if (imageKey && carouselUrls.length > 0) {
    attr_key_value_map[imageKey] = jsonImageUrlList(carouselUrls)
  }

  let comboRule: Record<string, unknown> | null = null
  if (isGroupBuy) {
    comboRule = buildDouyinProductComboRule(erp, product_name, originFen)
    if (!comboRule) {
      comboRule = buildDouyinComboRuleSingleGroupDefault(product_name, actualFen, originFen)
    }
    const splitRule = retailSplitSingleGroupIntoOneGroupPerItem(comboRule, category_id)
    if (splitRule) comboRule = splitRule
    comboRule = expandGroupBuyComboRuleMinTwoGroups(comboRule, category_id)
    comboRule = resolveComboRuleFromErpOverrides(erp, comboRule)
    comboRule = collapseRetailDuplicateComboGroups(comboRule, category_id)
  } else if (isVoucher) {
    /**
     * 代金券：勿写入团购 combo_rule/commodity（零售类目会报「商品类型和类目对应的商品模板不存在」）。
     * 有真实 template 且声明了搭配槽时再按模板写入。
     */
    comboRule = null
  } else {
    /**
     * 次卡、预售、预约等类目（product_type≥3）：部分类目/审核链路仍强校验顶层 `product.combo_rule` 非空，
     * 否则会直接报「combo_rule不能为空」。与代金券一致使用单组单品占位结构（标价与 SKU 对齐）。
     */
    comboRule = buildDouyinComboRuleSingleGroupDefault(product_name, actualFen, originFen)
  }

  const erpForAttrMerge: Record<string, unknown> =
    isGroupBuy && comboRule && (!erp.package_combo || typeof erp.package_combo !== 'object')
      ? { ...erp, package_combo: { groups: (comboRule as { groups: unknown[] }).groups } }
      : erp

  const mergedProductAttrs = mergeGoodlifeProductAttrMapFromErp(attrs, erpForAttrMerge, attr_key_value_map, {
    /** 团购先避开原始 package_combo，后面统一用规范化后的 comboRule 回填模板槽位 */
    omitComboTemplateAttrs: isGroupBuy || isVoucher,
  })

  let explicitLiteralComboRuleOverride = false
  const tplOverrides = erp.template_attr_overrides
  if (tplOverrides && typeof tplOverrides === 'object' && !Array.isArray(tplOverrides)) {
    for (const [k, val] of Object.entries(tplOverrides as Record<string, unknown>)) {
      const key = String(k).trim()
      if (!key) continue
      /** 手填 SubTitle/Description 易与官方 template 语义冲突，一律由网关按 trade_rules / 模板生成 */
      if (attrKeyIsDouyinSubTitle(key) || attrKeyIsDouyinDescription(key) || /^description_rich/i.test(key)) {
        continue
      }
      const s = typeof val === 'string' ? val.trim() : String(val ?? '').trim()
      if (!s) continue
      if (isGroupBuy) {
        if (/^combo_rule$/i.test(key)) {
          mergedProductAttrs[key] = s.slice(0, 120_000)
          explicitLiteralComboRuleOverride = true
          continue
        }
        const a = attrs.find((x) => String((x as Record<string, unknown>).key ?? '').trim() === key)
        if (a && typeof a === 'object') {
          const ar = a as Record<string, unknown>
          const name = String(ar.name ?? '')
          const vt = String(ar.value_type ?? '').toUpperCase()
          if (attrTemplateLooksComboLike(key, name, vt)) {
            mergedProductAttrs[key] = s.slice(0, 120_000)
            continue
          }
        }
      }
      mergedProductAttrs[key] = s.slice(0, 120_000)
    }
  }

  injectDocKeyedProductAttrsFromErp(mergedProductAttrs, erp, category_id)
  if (isVoucher) {
    injectVoucherTemplateAttrsFromErp(mergedProductAttrs)
  }
  ensureProductImageAttrsInMap(mergedProductAttrs, attrs, carouselUrls)

  /**
   * 仅向 template.get 声明的 opaque 搭配槽写入套餐 JSON；代金券无搭配槽时不写 combo_rule/commodity。
   */
  if (comboRule && (!isVoucher || tplHasComboSlotsEarly)) {
    applyComboRuleToMergedProductAttrs(attrs, mergedProductAttrs, comboRule, category_id, originFen)
  }

  if (comboRule && tplProductComboKeysEarly.length === 0 && !isVoucher) {
    const literalStr = comboRuleProductLiteralAttrJsonString(comboRule, category_id, originFen)
    if (!comboRuleAttrJsonIsEffectivelyEmpty(literalStr) && !(mergedProductAttrs.combo_rule ?? '').trim()) {
      mergedProductAttrs.combo_rule = literalStr
    }
  }

  const nowSec = toDouyinUnixSeconds(Date.now())
  const oneYearSec = nowSec + 366 * 86400

  const product: Record<string, unknown> = {
    product_name,
    desc: productDescRaw || product_name,
    category_id,
    product_type: goodlifeApiProductType,
    biz_line: 1,
    open_biz_type: resolveOpenBizTypeForGoodlifeSave(erp, goodlifeApiProductType, category_id),
    out_id,
    account_name,
    sold_start_time: nowSec,
    sold_end_time: oneYearSec,
    pois: poi_ids.map((poi_id) => ({ poi_id })),
  }
  normalizeGoodlifeProductTopLevelTimes(product)

  const extIn = erp.product_ext
  if (extIn && typeof extIn === 'object' && !Array.isArray(extIn)) {
    product.product_ext = { ...(extIn as Record<string, unknown>) }
  }

  if (product_id_existing) {
    product.product_id = product_id_existing
  }

  const skuAttrMap = mergeGoodlifeSkuAttrMapFromTemplate(skuAttrs, product_name, actualFen, originFen, stockQty)
  let explicitLiteralCommodityOverride = false
  const skuTplOverrides = erp.template_sku_attr_overrides
  if (skuTplOverrides && typeof skuTplOverrides === 'object' && !Array.isArray(skuTplOverrides)) {
    for (const [k, val] of Object.entries(skuTplOverrides as Record<string, unknown>)) {
      const key = String(k).trim()
      if (!key) continue
      const s = typeof val === 'string' ? val.trim() : String(val ?? '').trim()
      if (s) {
        skuAttrMap[key] = s.slice(0, 120_000)
        if (isGroupBuy && /^commodity$/i.test(key)) explicitLiteralCommodityOverride = true
      }
    }
  }
  if (comboRule && (!isVoucher || tplHasComboSlotsEarly)) {
    applyComboRuleToSkuAttrMap(skuAttrs, skuAttrMap, comboRule, originFen, category_id)
    if (isGroupBuy) {
      alignAllSkuCommodityAttrsToComboRule(skuAttrs, skuAttrMap, comboRule, category_id, originFen)
    }
  }

  const tplSkuComboKeys = templateComboAttrKeysFromAttrs(skuAttrs)
  if (comboRule && tplSkuComboKeys.length === 0 && !isVoucher) {
    const commodityStr = comboRuleSkuCommodityAttrJsonString(comboRule, originFen, category_id)
    if (!comboRuleAttrJsonIsEffectivelyEmpty(commodityStr) && !(skuAttrMap.commodity ?? '').trim()) {
      skuAttrMap.commodity = commodityStr
    }
  }
  if (isVoucher && !tplHasComboSlotsEarly) {
    delete skuAttrMap.commodity
    delete mergedProductAttrs.combo_rule
  }

  const productTplKeySet = new Set(
    attrs.map((a) => String((a as Record<string, unknown>).key ?? '').trim()).filter(Boolean),
  )
  const skuTplKeySet = new Set(
    skuAttrs.map((a) => String((a as Record<string, unknown>).key ?? '').trim()).filter(Boolean),
  )
  /**
   * 若已通过模板 opaque 搭配槽写入套餐，则去掉可能冲突的字面量 `combo_rule`（除非模板本身声明 key 即为 combo_rule）。
   * 若模板无任何搭配槽（含 template 拉取失败），保留字面量兜底。
   */
  const filledOpaqueProductCombo =
    tplProductComboKeysEarly.length > 0 &&
    tplProductComboKeysEarly.some((k) => (mergedProductAttrs[k] ?? '').trim().length > 0)
  if (
    mergedProductAttrs.combo_rule != null &&
    filledOpaqueProductCombo &&
    !productTplKeySet.has('combo_rule') &&
    !explicitLiteralComboRuleOverride
  ) {
    delete mergedProductAttrs.combo_rule
  }
  const filledOpaqueSkuCombo =
    tplSkuComboKeys.length > 0 && tplSkuComboKeys.some((k) => (skuAttrMap[k] ?? '').trim().length > 0)
  if (
    skuAttrMap.commodity != null &&
    filledOpaqueSkuCombo &&
    !skuTplKeySet.has('commodity') &&
    !explicitLiteralCommodityOverride
  ) {
    delete skuAttrMap.commodity
  }

  applyMissingRequiredSkuAttrDefaults(skuAttrs, skuAttrMap, erp)
  applySkuTemplateAttrLiteralsFromTemplate(skuAttrs, skuAttrMap)

  if (isGroupBuy && comboRule) {
    comboRule = finalizeGroupBuyComboPayloads(
      comboRule,
      category_id,
      originFen,
      mergedProductAttrs,
      skuAttrs,
      skuAttrMap,
      tplProductComboKeysEarly,
    )
  }

  /** 顶层 product.combo_rule：团购/次卡等需要；零售代金券勿带团购套餐结构 */
  if (comboRule && (!isVoucher || tplHasComboSlotsEarly)) {
    product.combo_rule = comboRule
  }

  sanitizeDouyinTradeRuleProductAttrs(mergedProductAttrs, erp, category_id, attrs)
  applyErpExtendedRulesToGoodlifeSave(product, mergedProductAttrs, skuAttrMap, erp)
  finalizeDouyinProductAttrsByTemplate(attrs, mergedProductAttrs, {
    productName: product_name,
    productDesc: productDescRaw,
    categoryId: category_id,
  })
  /** 必须在 finalize 之后：按 template value_type 写入 NOTE JSON / "[]"，避免被 merge 纯文本覆盖 */
  const descShort = applyDouyinProductDescriptionAttrs(attrs, mergedProductAttrs, {
    productName: product_name,
    productDesc: productDescRaw,
    categoryId: category_id,
  })
  finalizeDouyinSubTitleInProductAttrs(attrs, mergedProductAttrs, {
    tradeRules: extractDouyinSubTitleTradeContextFromErp(erp),
  })
  const { canonicalTitle: voucherCanonicalTitle } = finalizeDouyinVoucherNameAttrsInProductMap(
    attrs,
    mergedProductAttrs,
    {
      productName: product_name,
      actualAmountFen: actualFen,
      originAmountFen: originFen,
      isVoucher,
      strategy: opts?.productDiyNameStrategy,
    },
  )
  if (isVoucher && voucherCanonicalTitle) {
    product.product_name = voucherCanonicalTitle
  }
  product.desc = descShort
  pruneEmptyNonRequiredImageAttrs(attrs, mergedProductAttrs)

  if (Object.keys(mergedProductAttrs).length > 0) {
    product.attr_key_value_map = mergedProductAttrs
  }

  const skuDisplayName = (isVoucher && voucherCanonicalTitle ? voucherCanonicalTitle : product_name).slice(
    0,
    120,
  )
  const sku: Record<string, unknown> = {
    sku_name: skuDisplayName,
    actual_amount: actualFen,
    origin_amount: originFen,
    status: 1,
    stock: {
      stock_qty: stockQty,
      avail_qty: stockQty,
      frozen_qty: 0,
      sold_qty: 0,
      sold_count: 0,
      limit_type: 1,
    },
  }
  if (Object.keys(skuAttrMap).length > 0) {
    sku.attr_key_value_map = skuAttrMap
  }

  return {
    body: {
      ability: { ignore_inapplicable_poi: true },
      account_id: accountId,
      product,
      sku,
    },
    templateProductAttrs: attrs,
    templateSkuAttrs: skuAttrs,
    erpUiProductType,
    goodlifeApiProductType,
  }
}

function listUnfilledRequiredTemplateAttrs(
  attrs: Record<string, unknown>[],
  merged: Record<string, string> | undefined,
): string[] {
  const out: string[] = []
  const map = merged ?? {}
  for (const a of attrs) {
    if (!Boolean((a as Record<string, unknown>).is_required)) continue
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key) continue
    if (!(map[key] ?? '').trim()) out.push(key)
  }
  return out
}

function templateComboAttrKeysFromAttrs(attrs: Record<string, unknown>[]): string[] {
  const out: string[] = []
  for (const a of attrs) {
    const key = String((a as Record<string, unknown>).key ?? '').trim()
    if (!key) continue
    const name = String((a as Record<string, unknown>).name ?? '')
    const vt = String((a as Record<string, unknown>).value_type ?? '').toUpperCase()
    if (attrTemplateLooksComboLike(key, name, vt)) out.push(key)
  }
  return out
}

/** 日志：保留字段名与结构，仅打码 name / group_name 文案 */
function maskDouyinComboRuleForLog(combo: unknown): unknown {
  const mask = (s: string) => {
    const t = s.trim()
    if (!t) return s
    if (t.length <= 1) return '〈已脱敏〉'
    return `〈已脱敏·${t.length}字〉`
  }
  const walk = (x: unknown): unknown => {
    if (x === null || typeof x !== 'object') return x
    if (Array.isArray(x)) return x.map(walk)
    const o = x as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(o)) {
      if ((k === 'name' || k === 'group_name') && typeof val === 'string') next[k] = mask(val)
      else next[k] = walk(val)
    }
    return next
  }
  return walk(combo)
}

function summarizeComboRuleForLog(combo: unknown): Record<string, unknown> {
  if (!combo || typeof combo !== 'object' || Array.isArray(combo)) {
    return { present: false }
  }
  const groups = (combo as { groups?: unknown }).groups
  if (!Array.isArray(groups)) return { present: true, groups: 0, items: 0, combo_mode: [] as string[] }
  const modes: string[] = []
  let items = 0
  let one_item_per_group = groups.length > 0
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const pr = o.pick_rule
    const tc = o.total_count
    const oc = o.option_count
    if (typeof pr === 'string' && pr.trim()) modes.push(String(pr).slice(0, 48))
    else if (typeof tc === 'number' || typeof oc === 'number')
      modes.push(`total=${String(tc ?? '?')},opt=${String(oc ?? '?')}`)
    else modes.push('')
    const arr = Array.isArray(o.item_list) ? o.item_list : Array.isArray(o.items) ? o.items : []
    if (arr.length !== 1) one_item_per_group = false
    items += arr.length
  }
  return {
    present: true,
    groups: groups.length,
    items,
    one_item_per_group,
    combo_mode: modes.slice(0, 10),
  }
}

/** product_diy_name 参数不合法时，在已组装的 saveBody 上切换策略并重算字节数 */
function repatchGoodlifeSaveBodyVoucherDiyStrategy(
  saveBody: Record<string, unknown>,
  templateProductAttrs: Record<string, unknown>[],
  erp: Record<string, unknown>,
  strategy: DouyinProductDiyNameApplyStrategy,
): number {
  const prod = saveBody.product as Record<string, unknown> | undefined
  if (!prod) return JSON.stringify(saveBody).length
  const skuObj = saveBody.sku as Record<string, unknown> | undefined
  const prevMap =
    prod.attr_key_value_map && typeof prod.attr_key_value_map === 'object' && !Array.isArray(prod.attr_key_value_map)
      ? (prod.attr_key_value_map as Record<string, string>)
      : {}
  const attrMap = { ...prevMap }
  const actualFen = Number(skuObj?.actual_amount) || yuanToFen(Number(erp.price_yuan) || 0)
  const originFen = Number(skuObj?.origin_amount) || actualFen
  const canonicalTitle = normalizeDouyinVoucherProductTitle(
    String(prod.product_name ?? erp.product_name ?? ''),
    actualFen,
    originFen,
  )
  const daiCore = buildDouyinVoucherDaiCoreName(canonicalTitle, actualFen, originFen)
  applyDouyinProductDiyNameStrategy(templateProductAttrs, attrMap, {
    canonicalTitle,
    daiCore,
    strategy,
  })
  prod.attr_key_value_map = attrMap
  if (strategy === 'unified_off_full_diy' || strategy === 'diy_sync_title') {
    prod.product_name = canonicalTitle
    if (skuObj) skuObj.sku_name = canonicalTitle.slice(0, 120)
  }
  return JSON.stringify(saveBody).length
}

function summarizeDouyinProductSaveForLog(
  saveBody: Record<string, unknown>,
  mode: string,
  meta: {
    templateProductAttrs: Record<string, unknown>[]
    templateSkuAttrs: Record<string, unknown>[]
    erpUiProductType?: number
    goodlifeApiProductType?: number
  },
): Record<string, unknown> {
  const product = saveBody.product as Record<string, unknown> | undefined
  const sku = saveBody.sku as Record<string, unknown> | undefined
  const ak = product?.attr_key_value_map as Record<string, string> | undefined
  const sk = sku?.attr_key_value_map as Record<string, string> | undefined
  const relay = process.env.KUAISHOU_OPENAPI_BASE_URL?.trim()
  const tplComboKeys = templateComboAttrKeysFromAttrs(meta.templateProductAttrs)
  const tplSkuComboKeys = templateComboAttrKeysFromAttrs(meta.templateSkuAttrs)
  const comboRuleRaw = product?.combo_rule
  const attrComboPeek = (ak?.combo_rule ?? '').trim().slice(0, 1)
  const skuCommodityPeek = (sk?.commodity ?? '').trim().slice(0, 1)
  const combo_attr_json_shape =
    attrComboPeek === '[' ? 'array' : attrComboPeek === '{' ? 'object' : attrComboPeek ? 'other' : 'none'
  const combo_sku_commodity_shape =
    skuCommodityPeek === '[' ? 'array' : skuCommodityPeek === '{' ? 'object' : skuCommodityPeek ? 'other' : 'none'
  const itemsShapeEnv =
    process.env.KUAISHOU_GOODS_COMBO_COMMODITY_JSON_SHAPE?.trim().toLowerCase() ||
    process.env.KUAISHOU_GOODS_COMBO_ATTR_ITEMS_SHAPE?.trim().toLowerCase()
  const combo_sku_commodity_items_shape =
    itemsShapeEnv === 'flattened' || itemsShapeEnv === 'flat' || itemsShapeEnv === 'items'
      ? 'flattened_items'
      : 'groups'
  const combo_attr_literal_in_body = Boolean((ak?.combo_rule ?? '').trim())
  const combo_attr_item_numbers_stringified = categoryUsesStringifiedComboItemNumbers(
    String(product?.category_id ?? ''),
  )
  const missing_required_product_attr_keys = listUnfilledRequiredTemplateAttrs(
    meta.templateProductAttrs,
    ak,
  )
  const missing_required_sku_attr_keys = listUnfilledRequiredTemplateAttrs(meta.templateSkuAttrs, sk)
  const implicit_missing_combo_rule_attr =
    product?.product_type === 1 && product?.combo_rule && !combo_attr_literal_in_body
      ? ['combo_rule']
      : []
  let combo_sku_commodity_json_groups = 0
  let combo_attr_combo_rule_json_groups = 0
  const cidLog = String(product?.category_id ?? '')
  const combo_attr_payload_wrapped = categoryUsesWrappedGroupsAttrCombo(cidLog)
  try {
    const c = (sk?.commodity ?? '').trim()
    if (c.startsWith('[')) {
      const j = JSON.parse(c) as unknown
      if (Array.isArray(j)) combo_sku_commodity_json_groups = j.length
    } else if (c.startsWith('{')) {
      const j = JSON.parse(c) as { groups?: unknown[] }
      if (Array.isArray(j.groups)) combo_sku_commodity_json_groups = j.groups.length
    }
  } catch {
    /* ignore */
  }
  try {
    const cr = (ak?.combo_rule ?? '').trim()
    if (cr.startsWith('[')) {
      const j = JSON.parse(cr) as unknown
      if (Array.isArray(j)) combo_attr_combo_rule_json_groups = j.length
    } else if (cr.startsWith('{')) {
      const j = JSON.parse(cr) as { groups?: unknown[] }
      if (Array.isArray(j.groups)) combo_attr_combo_rule_json_groups = j.groups.length
    }
  } catch {
    /* ignore */
  }
  return {
    mode,
    relay_base: relay && relay.length ? relay.replace(/\/+$/, '') : 'https://open.kwailocallife.com',
    goodlife_official_fallback: process.env.KUAISHOU_OPENAPI_GOODLIFE_OFFICIAL_FALLBACK?.trim() === '1',
    account_id: saveBody.account_id,
    product_type: product?.product_type,
    erp_ui_product_type: meta.erpUiProductType,
    goodlife_api_product_type: meta.goodlifeApiProductType,
    category_id: product?.category_id,
    open_biz_type: product?.open_biz_type,
    open_biz_type_note:
      product?.open_biz_type === 0
        ? 'retail_default_0'
        : product?.open_biz_type === 1
          ? 'combo_coupon_1'
          : 'other',
    combo_in_product_body: Boolean(product?.combo_rule),
    combo_attr_json_shape,
    combo_sku_commodity_shape,
    combo_sku_commodity_items_shape,
    combo_attr_literal_in_body,
    combo_attr_item_numbers_stringified,
    combo_attr_payload_wrapped,
    combo_sku_commodity_json_groups,
    combo_attr_combo_rule_json_groups,
    combo_rule_shape: summarizeComboRuleForLog(product?.combo_rule),
    combo_rule_debug: maskDouyinComboRuleForLog(comboRuleRaw),
    template_combo_attr_keys: tplComboKeys,
    template_sku_combo_attr_keys: tplSkuComboKeys,
    combo_filled_product_attr_keys: ak ? tplComboKeys.filter((k) => k in ak) : [],
    combo_filled_sku_attr_keys: sk ? tplSkuComboKeys.filter((k) => k in sk) : [],
    /** @deprecated 仅用 key 子串匹配 opaque key 不准，请看 template_*_combo_attr_keys */
    combo_like_attr_keys:
      ak == null ? [] : Object.keys(ak).filter((k) => /combo|套餐|搭配|组合|rule|commodity/i.test(k)),
    attr_key_count: ak ? Object.keys(ak).length : 0,
    subtitle_len: (() => {
      if (!ak) return 0
      for (const [k, v] of Object.entries(ak)) {
        if (attrKeyIsDouyinSubTitle(k)) return String(v ?? '').length
      }
      return 0
    })(),
    subtitle_value: (() => {
      if (!ak) return null
      for (const [k, v] of Object.entries(ak)) {
        if (attrKeyIsDouyinSubTitle(k)) return String(v ?? '').slice(0, 120)
      }
      return null
    })(),
    show_channel: ak?.show_channel ?? null,
    ...(ak && meta.templateProductAttrs
      ? describeDouyinDescriptionAttrForLog(meta.templateProductAttrs, ak)
      : {
          description_len: 0,
          description_is_note_json: false,
          description_rich_is_note_json: false,
        }),
    ...(ak
      ? describeDouyinProductDiyNameForLog(ak, meta.templateProductAttrs)
      : {}),
    attr_keys_sample: ak ? Object.keys(ak).slice(0, 36) : [],
    sku_attr_keys: sk ? Object.keys(sk) : [],
    missing_required_product_attr_keys,
    missing_required_sku_attr_keys,
    implicit_missing_combo_rule_attr,
    poi_count: Array.isArray(product?.pois) ? (product!.pois as unknown[]).length : 0,
    sold_start_time: product?.sold_start_time ?? null,
    sold_end_time: product?.sold_end_time ?? null,
    sold_times_are_unix_sec:
      Number(product?.sold_start_time) > 0 && Number(product?.sold_start_time) < 1e12,
  }
}

function extractProductIdFromSaveEnvelope(j: Record<string, unknown>): string {
  const data = j.data as Record<string, unknown> | undefined
  if (data && typeof data === 'object') {
    const p = data.product_id ?? data.productId
    if (typeof p === 'string' && p.trim()) return p.trim()
    if (typeof p === 'number' && Number.isFinite(p)) return String(Math.trunc(p))
  }
  const root = j.product_id ?? j.productId
  if (typeof root === 'string' && root.trim()) return root.trim()
  if (typeof root === 'number' && Number.isFinite(root)) return String(Math.trunc(root))
  return ''
}

function douyinGoodsSaveUpstreamHint(status: number, raw: string): string {
  const t = raw.replace(/^\uFEFF/, '').trim()
  if ([403, 404, 405].includes(status)) {
    return `HTTP ${status}，多为 KUAISHOU_OPENAPI_BASE_URL 反代未匹配该 POST 路径或方法错误，请求未正确到达快手 OpenAPI。`
  }
  if (t.startsWith('<') || /^<!doctype/i.test(t.slice(0, 120))) {
    return '上游返回 HTML/WAF 页面而非 JSON：请检查自建反代 Host、路径前缀与 body 透传。'
  }
  return ''
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractDouyinLogidFromEnvelope(j: Record<string, unknown>): string {
  const ex = j.extra as Record<string, unknown> | undefined
  return ex && typeof ex.logid === 'string' ? ex.logid.trim() : ''
}

/**
 * 快手 goods/save 文档中「系统繁忙 / 稍后重试」类错误，适合短退避重试（仍失败则把 logid 交给开放平台排查）。
 */
/** goods/save 业务错误：类目与 product_type 在快手侧无注册模板（常见于 UI 代金券=2 但 API 须用 11） */
function isDouyinSaveTemplateMismatchError(j: Record<string, unknown>, raw: string): boolean {
  const data = j.data as Record<string, unknown> | undefined
  const desc = typeof data?.description === 'string' ? data.description : ''
  const blob = `${desc}${raw}`.slice(0, 4000)
  return /商品类型和类目对应的商品模板不存在|模板不存在|无对应模板|模板不匹配/.test(blob)
}

function isDouyinProductSaveResponseRetryable(j: Record<string, unknown>, raw: string): boolean {
  const data = j.data as Record<string, unknown> | undefined
  const code = data ? numericErrorCode(data.error_code) : undefined
  if (code === 2100001 || code === 2100004 || code === 2100005) return true
  const desc = typeof data?.description === 'string' ? data.description : ''
  const blob = `${desc}${raw}`.slice(0, 4000)
  return /打瞌睡|打盹|系统繁忙|稍后再试|服务器.*试|请稍后|timeout|timed out|Too many requests|rate limit/i.test(
    blob,
  )
}

/** goods/save JSON 内 access_token 失效（2190008 或文案命中） */
function isDouyinSaveResponseTokenExpired(j: Record<string, unknown>): boolean {
  const data = j.data as Record<string, unknown> | undefined
  const extra = j.extra as Record<string, unknown> | undefined
  const inner = data ? numericErrorCode(data.error_code) : undefined
  if (inner === 2190008) return true
  const exEc = extra ? numericErrorCode(extra.error_code) : undefined
  if (exEc === 2190008) return true
  const blob = [
    typeof data?.description === 'string' ? data.description : '',
    typeof extra?.description === 'string' ? extra.description : '',
    typeof j.description === 'string' ? String(j.description) : '',
  ].join(' ')
  return isLikelyKuaishouClientTokenExpiredBizError(blob)
}

function douyinGoodsSaveRetryMaxAttempts(): number {
  const raw = process.env.KUAISHOU_GOODS_SAVE_RETRY_MAX?.trim()
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isFinite(n) && n >= 1 && n <= 6) return n
  return 3
}

const MERCHANT_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

function productImageDemoFallbackAllowed(): boolean {
  const a = process.env.MERCHANT_PRODUCT_IMAGE_UPLOAD_DEMO_FALLBACK?.trim().toLowerCase()
  const b = process.env.MERCHANT_KUAISHOU_IMAGE_UPLOAD_DEMO_FALLBACK?.trim().toLowerCase()
  return a === '1' || a === 'true' || b === '1' || b === 'true'
}

function demoImageUploadFallback(
  res: ServerResponse,
  mimeType: string,
  contentBase64: string,
  approxBytes: number,
) {
  const maxInlineBytes = Math.floor(2.5 * 1024 * 1024)
  if (approxBytes <= maxInlineBytes) {
    const safeMime =
      typeof mimeType === 'string' && /^image\/[a-z0-9.+-]+$/i.test(mimeType.trim())
        ? mimeType.trim().toLowerCase()
        : 'image/jpeg'
    json(res, 200, {
      url: `data:${safeMime};base64,${contentBase64}`,
      mimeType: safeMime,
      message:
        '演示回退（MERCHANT_PRODUCT_IMAGE_UPLOAD_DEMO_FALLBACK）：内联 data URL。生产请配置 Supabase Storage 并关闭演示变量。',
    })
    return
  }
  const seed = createHash('sha256').update(contentBase64).digest('hex').slice(0, 40)
  json(res, 200, {
    url: `https://picsum.photos/seed/v${seed}/800/800`,
    mimeType,
    message: '演示回退：大图返回占位外链。',
  })
}

function merchantProductImageSupabaseBucket(): string {
  return (process.env.MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET ?? '').trim()
}

function merchantProductImageStoragePrefix(): string {
  const p = (process.env.MERCHANT_PRODUCT_IMAGE_SUPABASE_PREFIX ?? 'douyin-goods').trim().replace(/^\/+|\/+$/g, '')
  return p || 'douyin-goods'
}

function extFromMimeAndName(mime: string, name: string): string {
  const m = mime.toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('bmp')) return 'bmp'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  const base = name.split(/[/\\]/).pop() ?? ''
  const hit = /\.([a-z0-9]{1,8})$/i.exec(base)
  if (hit && /^[a-z0-9]+$/i.test(hit[1]!)) return hit[1]!.toLowerCase()
  return 'jpg'
}

async function uploadMerchantProductImageToSupabase(params: {
  merchantId: string
  buf: Buffer
  safeMime: string
  originalName: string
}): Promise<{ publicUrl: string; objectPath: string }> {
  const bucket = merchantProductImageSupabaseBucket()
  if (!bucket) throw new Error('MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET 未配置')

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    throw new Error(`Supabase 服务端密钥不齐：${missingParts.join(', ')}`)
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const safeMid = params.merchantId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'merchant'
  const ext = extFromMimeAndName(params.safeMime, params.originalName)
  const objectPath = `${merchantProductImageStoragePrefix()}/${safeMid}/${Date.now()}-${randomUUID()}.${ext}`

  const { error } = await admin.storage.from(bucket).upload(objectPath, params.buf, {
    contentType: params.safeMime,
    upsert: false,
    cacheControl: 'public, max-age=604800',
  })
  if (error) {
    throw new Error(error.message || 'storage.upload 失败')
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(objectPath)
  const publicUrl = pub.publicUrl?.trim() ?? ''
  if (!/^https:\/\//i.test(publicUrl)) {
    throw new Error('getPublicUrl 未返回 https：请将桶设为 Public bucket，或为 storage.objects 配置匿名可读策略')
  }
  return { publicUrl, objectPath }
}

/**
 * 商品图上传：写入 **Supabase Storage** 公开桶，返回 **https** 直链供 goods/save（需 Vercel 配置 MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET + SUPABASE_SERVICE_ROLE_KEY）。
 */
export async function handleKuaishouGoodsImageUploadPost(
  req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = resolveSession(auth)
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  let fileName = 'image.jpg'
  let mimeType = 'image/jpeg'
  let contentBase64 = ''
  try {
    const j = JSON.parse(bodyRaw || '{}') as {
      fileName?: string
      mimeType?: string
      contentBase64?: string
    }
    fileName = typeof j.fileName === 'string' ? j.fileName : fileName
    mimeType = typeof j.mimeType === 'string' ? j.mimeType : mimeType
    contentBase64 = typeof j.contentBase64 === 'string' ? j.contentBase64 : ''
  } catch {
    json(res, 400, { message: '请求体须为 JSON：{ fileName, mimeType, contentBase64 }' })
    return
  }

  if (!contentBase64) {
    json(res, 400, { message: '缺少 contentBase64' })
    return
  }
  const approxBytes = Math.ceil((contentBase64.length * 3) / 4)
  if (approxBytes > MERCHANT_PRODUCT_IMAGE_MAX_BYTES) {
    json(res, 400, { message: `单张图片不超过 ${Math.floor(MERCHANT_PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024))}MB` })
    return
  }

  let buf: Buffer
  try {
    buf = Buffer.from(contentBase64, 'base64')
  } catch {
    json(res, 400, { message: 'contentBase64 非法' })
    return
  }
  if (buf.length === 0) {
    json(res, 400, { message: '图片内容为空' })
    return
  }
  if (buf.length > MERCHANT_PRODUCT_IMAGE_MAX_BYTES) {
    json(res, 400, { message: `单张图片不超过 ${Math.floor(MERCHANT_PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024))}MB` })
    return
  }

  const safeMime =
    typeof mimeType === 'string' && /^image\/[a-z0-9.+-]+$/i.test(mimeType.trim())
      ? mimeType.trim().toLowerCase()
      : 'image/jpeg'

  const bucket = merchantProductImageSupabaseBucket()
  const adminParts = readMerchantSupabaseAdminEnv()
  const missingSupabase = !bucket || adminParts.missingParts.length > 0

  if (missingSupabase) {
    if (productImageDemoFallbackAllowed()) {
      demoImageUploadFallback(res, safeMime, contentBase64, approxBytes)
      return
    }
    const lines: string[] = [
      '商品图上传已改为 Supabase Storage：请在 Vercel 配置 MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET（公开桶名），并确保已配置 VITE_SUPABASE_URL 或 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY；桶须对公网可读以便快手拉取图片。',
    ]
    if (!bucket) lines.push('· 缺少 MERCHANT_PRODUCT_IMAGE_SUPABASE_BUCKET')
    if (adminParts.missingParts.length) lines.push(merchantSupabaseAdminEnvConfigureHint(adminParts.missingParts))
    json(res, 503, { message: lines.join('\n') })
    return
  }

  try {
    const { publicUrl, objectPath } = await uploadMerchantProductImageToSupabase({
      merchantId: session.merchantId,
      buf,
      safeMime,
      originalName: fileName,
    })
    json(res, 200, {
      url: publicUrl,
      mimeType: safeMime,
      storage: 'supabase',
      bucket,
      object_path: objectPath,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (productImageDemoFallbackAllowed()) {
      demoImageUploadFallback(res, safeMime, contentBase64, approxBytes)
      return
    }
    json(res, 502, {
      message: `Supabase Storage 上传失败：${msg.slice(0, 900)}。请检查桶策略（INSERT 允许 service_role）、对象大小与 MIME；公开读可参考 Dashboard → Storage → 桶 → Public bucket。`,
    })
  }
}

/** 代理 goodlife/v1/goods/product/save/（创建/更新商品，草稿与提交审核均走此接口） */
function readClientTraceHeader(req: IncomingMessage): string {
  const h = req.headers['x-meoo-client-trace']
  const s = Array.isArray(h) ? h[0] : h
  return typeof s === 'string' ? s.trim().slice(0, 80) : ''
}

export async function handleKuaishouGoodsProductSavePost(
  _req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  const clientTrace = readClientTraceHeader(_req)
  const auth = _req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { message: '会话无效或已失效，请重新绑定' })
    return
  }

  let body: { mode?: string; product?: Record<string, unknown> }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    json(res, 400, { message: '请求体须为 JSON' })
    return
  }

  const mode = body.mode === 'submit' ? 'submit' : 'draft'
  const erp = body.product && typeof body.product === 'object' ? body.product : null
  if (!erp) {
    json(res, 400, { message: '缺少 product 对象' })
    return
  }

  if (!String(erp.product_name ?? '').trim()) {
    json(res, 400, { message: '缺少 product.product_name' })
    return
  }
  const badUrls = findUnpublishableImageUrls(erp)
  const badOverridePaths = findUnpublishableImageInTemplateOverrides(erp)
  if (badUrls.length > 0 || badOverridePaths.length > 0) {
    json(res, 400, {
      message:
        '商品含不可发布的本机图片：头图/辅图/环境图须为 https 公网 URL；开放平台模板属性中不得粘贴 data:image 或 blob: 整段，否则 goods/save 请求体过大并在中继/快手侧超时。请先完成图片上传拿到可访问 URL 后再提交。',
      invalid_image_urls_count: badUrls.length,
      invalid_template_override_paths: badOverridePaths.slice(0, 32),
    })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = session.merchantId
    const accountName = await resolveProductAccountNameForSave(auth, session, accountId, erp)
    if (!accountName) {
      json(res, 400, {
        message:
          '缺少快手团购商品所需的 account_name（根账户昵称）。请先在系统设置完成绑定并加载门店列表，或保存时带上 account_name 后重试。',
      })
      return
    }

    const relay = process.env.KUAISHOU_OPENAPI_BASE_URL?.trim()
    const relayBase = relay && relay.length ? relay.replace(/\/+$/, '') : 'https://open.kwailocallife.com'
    const buildBudgetMs = douyinGoodsSaveBuildBudgetMs()
    const savePostBudgetMs = douyinGoodsSavePostBudgetMs()
    console.info(
      '[meoo douyin goods/save] start',
      JSON.stringify({
        phase: 'before_build',
        mode,
        client_trace: clientTrace || undefined,
        account_id: accountId,
        product_type: Number(erp.product_type) || 1,
        category_id: String(erp.category_id ?? '').trim().slice(0, 32),
        name_len: String(erp.product_name ?? '').trim().length,
        relay_base: relayBase,
        build_budget_s: Math.round(buildBudgetMs / 1000),
        save_post_budget_s: Math.round(savePostBudgetMs / 1000),
      }),
    )

    const buildAbort = new AbortController()
    const buildTimer = setTimeout(() => buildAbort.abort(), buildBudgetMs)
    const erpUiProductType = Number(erp.product_type) || 1
    const goodlifeApiAttempts = isErpUiVoucherProductType(erpUiProductType)
      ? goodlifeApiProductTypesForErpUi(erpUiProductType)
      : [erpUiProductType]

    let built!: Awaited<ReturnType<typeof buildGoodlifeProductSaveBody>>
    let saveBody!: Record<string, unknown>
    let bodyBytes = 0
    let dr!: Response
    let raw = ''
    let trimmed = ''
    let upstreamBizHint = ''

    for (let typeIdx = 0; typeIdx < goodlifeApiAttempts.length; typeIdx++) {
      const apiPt = goodlifeApiAttempts[typeIdx]!
      try {
        built = await buildGoodlifeProductSaveBody(
          accountId,
          token,
          erp,
          mode,
          accountName,
          buildAbort.signal,
          { goodlifeProductTypeOverride: apiPt },
        )
      } catch (e) {
        clearTimeout(buildTimer)
        const msg = e instanceof Error ? e.message : String(e)
        const isAbort =
          (e instanceof Error && (e.name === 'AbortError' || /aborted|AbortError|timeout/i.test(msg))) ||
          /aborted|AbortError/i.test(msg)
        console.warn(
          '[meoo douyin goods/save] phase_fail',
          JSON.stringify({
            phase: 'build',
            mode,
            goodlife_api_product_type: apiPt,
            is_abort: isAbort,
            build_budget_s: Math.round(buildBudgetMs / 1000),
            message: msg.slice(0, 400),
          }),
        )
        json(res, isAbort ? 504 : 502, {
          message: isAbort
            ? `快手商品保存「模板/组装」阶段超时（约 ${Math.round(buildBudgetMs / 1000)}s）：template/get 或组装未及时完成。请稍后重试或检查 KUAISHOU_OPENAPI_BASE_URL 中继。可调环境变量 KUAISHOU_GOODS_BUILD_TIMEOUT_MS（默认 38s）。`
            : `组装商品保存请求失败：${msg}`,
        })
        return
      }

      saveBody = built.body
      const prod = saveBody.product as Record<string, unknown>
      if (prod && typeof prod === 'object') normalizeGoodlifeProductTopLevelTimes(prod)
      bodyBytes = JSON.stringify(saveBody).length
      const badAk = findAttrMapDataUrlOrBlobKeys(prod.attr_key_value_map)
      const skuObj = saveBody.sku as Record<string, unknown> | undefined
      const badSk = findAttrMapDataUrlOrBlobKeys(skuObj?.attr_key_value_map)
      if (badAk.length > 0 || badSk.length > 0) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message:
            '组装后的 attr_key_value_map 仍含有 data:image/blob: 内联图，快手无法接受且易导致超时。请检查开放平台类目手填项与图片来源。',
          bad_product_attr_keys: badAk.slice(0, 40),
          bad_sku_attr_keys: badSk.slice(0, 40),
        })
        return
      }
      if (bodyBytes > 2_400_000) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message: `商品保存请求体约 ${Math.round(bodyBytes / 1_000_000)}MB，过大（常见原因：图片仍为 base64 内联）。请改为 https 图片 URL 后再试。`,
          save_body_bytes: bodyBytes,
        })
        return
      }
      const saveLogSummary = summarizeDouyinProductSaveForLog(saveBody, mode, {
        templateProductAttrs: built.templateProductAttrs,
        templateSkuAttrs: built.templateSkuAttrs,
        erpUiProductType: built.erpUiProductType,
        goodlifeApiProductType: built.goodlifeApiProductType,
      })
      console.info(
        '[meoo douyin goods/save] built',
        JSON.stringify({
          ...saveLogSummary,
          save_body_bytes: bodyBytes,
          goodlife_api_attempt: typeIdx + 1,
          goodlife_api_attempts: goodlifeApiAttempts.length,
        }),
      )

      const attrMap =
        prod.attr_key_value_map && typeof prod.attr_key_value_map === 'object' && !Array.isArray(prod.attr_key_value_map)
          ? (prod.attr_key_value_map as Record<string, string>)
          : {}
      const missProd = listUnfilledRequiredTemplateAttrs(built.templateProductAttrs, attrMap)
      const publishableImages = productImageUrlsFromErp(erp).filter((u) => /^https?:\/\//i.test(u))
      if (
        missProd.some((k) => /^image_list$/i.test(k) || /image|img|carousel|头图|主图|轮播|封面/i.test(k)) &&
        publishableImages.length === 0
      ) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message:
            '缺少商品头图/轮播图（image_list 等）。请在「① 商品基础信息」上传头图并取得 https 公网地址后再提交；data/blob 预览图无法用于 goods/save。',
          missing_required_product_attr_keys: missProd.filter((k) => /image|img/i.test(k)).slice(0, 12),
        })
        return
      }
      const categoryIdSave = String(erp.category_id ?? '').trim()
      const descKey =
        Object.keys(attrMap).find((k) => attrKeyIsDouyinDescription(k)) ?? 'Description'
      const descVal = String(attrMap[descKey] ?? '').trim()
      const topDesc = String(prod.desc ?? '').trim()
      if (
        topDesc &&
        descVal &&
        !isDouyinDescriptionAttrUnused(descVal) &&
        !isDouyinNoteRichTextJsonString(descVal) &&
        topDesc !== descVal
      ) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message:
            '商品顶层 desc 与开放平台 Description 不一致。有富文本时 Description 应为 "[]"，短描述写在 product.desc / 商品说明。',
          product_desc_len: topDesc.length,
          description_attr_len: descVal.length,
        })
        return
      }
      const descCheck = validateDouyinDescriptionAttrForSave(descVal, categoryIdSave)
      if (!descCheck.ok) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message: descCheck.message,
          description_len: descCheck.description_len,
        })
        return
      }
      const richRaw = String(attrMap.description_rich_text ?? '').trim()
      if (richRaw && !isDouyinNoteRichTextJsonString(richRaw)) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message:
            'description_rich_text（其他说明/富文本）须为 NOTE 控件 JSON 列表，不能为纯文本。请点「一键填满」或清空该字段后重试。',
          description_rich_text_preview: richRaw.slice(0, 120),
        })
        return
      }
      const nameLen = String(erp.product_name ?? '').trim().length
      if (nameLen < 4) {
        clearTimeout(buildTimer)
        json(res, 400, {
          message: '商品名称过短（建议至少 4 个字），快手审核与 Description/SubTitle 校验易失败。',
          name_len: nameLen,
        })
        return
      }
      const maxAttempts = douyinGoodsSaveRetryMaxAttempts()
      const diyRepostStrategies: DouyinProductDiyNameApplyStrategy[] = [
        'omit_diy',
        'unified_off_full_diy',
        'diy_sync_title',
        'diy_dai_only',
      ]
      let diyRepostIdx = 0
      let jPosted: Record<string, unknown> = {}
      postSaveLoop: while (true) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            const backoff = 500 + attempt * 450
            console.info(
              '[meoo douyin goods/save] retry_backoff',
              JSON.stringify({ phase: 'before_product_save_retry', mode, attempt, backoff_ms: backoff }),
            )
            await sleepMs(backoff)
          }
          console.info(
            '[meoo douyin goods/save] posting_save',
            JSON.stringify({
              phase: 'before_product_save_post',
              mode,
              attempt,
              goodlife_api_product_type: apiPt,
              max_attempts: maxAttempts,
              save_post_budget_s: Math.round(savePostBudgetMs / 1000),
              save_body_bytes: bodyBytes,
              product_diy_repost_idx: diyRepostIdx,
            }),
          )
          const accessToken = await ensureKuaishouToken(session)
          const attemptAbort = new AbortController()
          const attemptTimer = setTimeout(() => attemptAbort.abort(), savePostBudgetMs)
          try {
            dr = await kuaishouServerFetch(kuaishouOpenApiUrl('/goodlife/v1/goods/product/save/'), {
              method: 'POST',
              headers: {
                'access-token': accessToken,
                'content-type': 'application/json',
                'Rpc-Transit-Life-Account': accountId,
              },
              body: JSON.stringify(saveBody),
              signal: attemptAbort.signal,
            })
            raw = await dr.text()
          } catch (e) {
            clearTimeout(attemptTimer)
            const msg = e instanceof Error ? e.message : String(e)
            const isAbort =
              (e instanceof Error && (e.name === 'AbortError' || /aborted|AbortError|timeout/i.test(msg))) ||
              /aborted|AbortError/i.test(msg)
            const canNetRetry =
              attempt < maxAttempts - 1 &&
              /aborted|AbortError|timeout|fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|socket/i.test(msg)
            if (canNetRetry) {
              console.warn(
                '[meoo douyin goods/save] phase_fail_retry',
                JSON.stringify({
                  phase: 'product_save_fetch',
                  mode,
                  attempt,
                  is_abort: isAbort,
                  save_post_budget_s: Math.round(savePostBudgetMs / 1000),
                  message: msg.slice(0, 400),
                }),
              )
              continue
            }
            clearTimeout(buildTimer)
            console.warn(
              '[meoo douyin goods/save] phase_fail',
              JSON.stringify({
                phase: 'product_save_fetch',
                mode,
                attempt,
                is_abort: isAbort,
                save_post_budget_s: Math.round(savePostBudgetMs / 1000),
                save_body_bytes: bodyBytes,
                message: msg.slice(0, 400),
              }),
            )
            json(res, isAbort ? 504 : 502, {
              message: isAbort
                ? `快手 goods/save 请求超时（本阶段约 ${Math.round(savePostBudgetMs / 1000)}s）。中继应已收到 POST；若中继无日志请查 Vercel→该请求是否到达、或调大 KUAISHOU_GOODS_SAVE_POST_TIMEOUT_MS。`
                : `快手 goods/save 网络失败：${msg}`,
            })
            return
          }
          clearTimeout(attemptTimer)
          trimmed = raw.replace(/^\uFEFF/, '').trim()
          if (trimmed.startsWith('<') || !trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
            break
          }
          const jAttempt = parseKuaishouJson(trimmed)
          if (dr.ok && !getDataError(jAttempt).ok) {
            if (isDouyinSaveResponseTokenExpired(jAttempt) && attempt < maxAttempts - 1) {
              invalidateKuaishouMerchantClientTokenCache(session)
              console.warn(
                '[meoo douyin goods/save] access_token_stale_retry',
                JSON.stringify({
                  mode,
                  attempt,
                  logid: extractDouyinLogidFromEnvelope(jAttempt),
                  hint: String((jAttempt.data as Record<string, unknown> | undefined)?.description ?? '').slice(0, 240),
                }),
              )
              continue
            }
            if (isDouyinProductSaveResponseRetryable(jAttempt, raw) && attempt < maxAttempts - 1) {
              console.warn(
                '[meoo douyin goods/save] upstream_transient_retry',
                JSON.stringify({
                  mode,
                  attempt,
                  logid: extractDouyinLogidFromEnvelope(jAttempt),
                  hint: String((jAttempt.data as Record<string, unknown> | undefined)?.description ?? '').slice(0, 240),
                }),
              )
              continue
            }
          }
          break
        }

        upstreamBizHint = ''
        try {
          const peek = trimmed.replace(/^\uFEFF/, '').trim()
          if (peek.startsWith('{')) {
            const jpeek = parseKuaishouJson(peek)
            const ge = getDataError(jpeek)
            upstreamBizHint = ge.ok ? 'biz_ok' : String(ge.msg ?? 'biz_err').slice(0, 240)
          }
        } catch {
          upstreamBizHint = 'parse_skip'
        }
        jPosted = trimmed.startsWith('{') ? parseKuaishouJson(trimmed) : ({} as Record<string, unknown>)
        const prodPosted = saveBody.product as Record<string, unknown>
        const akPosted =
          prodPosted?.attr_key_value_map && typeof prodPosted.attr_key_value_map === 'object'
            ? (prodPosted.attr_key_value_map as Record<string, string>)
            : {}
        console.info(
          '[meoo douyin goods/save] posted',
          JSON.stringify({
            phase: 'after_product_save_post',
            mode,
            client_trace: clientTrace || undefined,
            http_status: dr.status,
            upstream_biz: upstreamBizHint,
            goodlife_api_product_type: apiPt,
            logid: extractDouyinLogidFromEnvelope(jPosted),
            save_body_bytes: bodyBytes,
            product_diy_repost_idx: diyRepostIdx,
            ...describeDouyinProductDiyNameForLog(akPosted, built.templateProductAttrs),
          }),
        )

        if (dr.ok && getDataError(jPosted).ok) {
          break postSaveLoop
        }
        if (
          isErpUiVoucherProductType(erpUiProductType) &&
          isDouyinProductDiyNameBizError(upstreamBizHint) &&
          diyRepostIdx < diyRepostStrategies.length
        ) {
          const strategy = diyRepostStrategies[diyRepostIdx]!
          diyRepostIdx += 1
          bodyBytes = repatchGoodlifeSaveBodyVoucherDiyStrategy(
            saveBody,
            built.templateProductAttrs,
            erp,
            strategy,
          )
          console.warn(
            '[meoo douyin goods/save] product_diy_name_strategy_retry',
            JSON.stringify({
              strategy,
              product_diy_repost_idx: diyRepostIdx,
              save_body_bytes: bodyBytes,
            }),
          )
          continue postSaveLoop
        }
        break postSaveLoop
      }

      if (dr.ok && getDataError(jPosted).ok) {
        break
      }
      if (
        isDouyinSaveTemplateMismatchError(jPosted, raw) &&
        typeIdx < goodlifeApiAttempts.length - 1
      ) {
        console.warn(
          '[meoo douyin goods/save] product_type_retry',
          JSON.stringify({
            category_id: String(erp.category_id ?? '').trim(),
            failed_goodlife_product_type: apiPt,
            next_goodlife_product_type: goodlifeApiAttempts[typeIdx + 1],
            upstream_biz: upstreamBizHint,
          }),
        )
        continue
      }
      break
    }
    clearTimeout(buildTimer)

    if (trimmed.startsWith('<')) {
      json(res, 502, {
        message: `快手 goods/save 经自建出口返回 HTML：${douyinGoodsSaveUpstreamHint(dr.status, raw)}`,
        douyin_raw_preview: trimmed.slice(0, 800),
      })
      return
    }
    if (!trimmed) {
      json(res, 502, {
        message: '快手 goods/save 响应体为空，请检查 KUAISHOU_OPENAPI_BASE_URL 反代与网络连通性。',
      })
      return
    }
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      json(res, 502, {
        message: `快手 goods/save 返回非 JSON：${douyinGoodsSaveUpstreamHint(dr.status, raw) || `HTTP ${dr.status}`}`,
        douyin_raw_preview: trimmed.slice(0, 800),
      })
      return
    }
    if (!dr.ok && trimmed.startsWith('{')) {
      const hint = douyinGoodsSaveUpstreamHint(dr.status, raw)
      if (hint) {
        json(res, 502, {
          message: `快手 goods/save HTTP ${dr.status}。${hint}`,
          douyin_raw_preview: trimmed.slice(0, 1200),
        })
        return
      }
    }

    const j = parseKuaishouJson(raw)
    const bizOk = getDataError(j).ok
    const pid = extractProductIdFromSaveEnvelope(j)
    const ambiguousSuccess = dr.ok && bizOk && !pid
    if (ambiguousSuccess) {
      json(res, 502, {
        message:
          '快手 JSON 未包含可识别的 product_id（无法确认已写入来客草稿）。请查看服务端 [meoo douyin goods/save] 脱敏日志与快手生活服务开放平台 logid。',
        douyin_response: j,
      })
      return
    }
    if (dr.ok && bizOk && pid) {
      mockDouyinProductStore.set(pid, {
        ...erp,
        product_id: pid,
        price_yuan: erp.price_yuan,
        _mock_status: mode === 'submit' ? '审核中' : '草稿',
      })
    }

    res.statusCode = dr.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `快手商品保存失败：${msg}` })
  }
}

export type FinanceReconcileRowPayload = {
  date: string
  platform: 'kuaishou'
  platformLabel: string
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

function shanghaiDateStringFromUnixSec(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function shanghaiHourFromUnixSec(sec: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(sec * 1000))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  return Number.isFinite(h) ? h : 0
}

export type FinanceHourlyPayPoint = {
  hour: number
  label: string
  payAmount: number
}

export function buildHourlyPayTrend(hourlyPay: Map<number, number>): FinanceHourlyPayPoint[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    payAmount: Math.round((hourlyPay.get(hour) ?? 0) * 100) / 100,
  }))
}

function unixRangeInclusiveShanghai(startYmd: string, endYmd: string): { startSec: number; endSec: number } | null {
  const start = `${startYmd.trim()}T00:00:00+08:00`
  const end = `${endYmd.trim()}T23:59:59+08:00`
  const s = Math.floor(new Date(start).getTime() / 1000)
  const e = Math.floor(new Date(end).getTime() / 1000)
  if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return null
  return { startSec: s, endSec: e }
}

function addCalendarDaysShanghai(ymd: string, deltaDays: number): string {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + deltaDays * 86_400_000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function eachShanghaiYmdInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = []
  let cur = startYmd
  let guard = 0
  while (cur <= endYmd && guard++ < 400) {
    out.push(cur)
    if (cur === endYmd) break
    cur = addCalendarDaysShanghai(cur, 1)
  }
  return out
}

function orderPayAmountYuan(order: Record<string, unknown>): number {
  let fen = Number(order.pay_amount)
  if (!Number.isFinite(fen) || fen <= 0) {
    const subs = order.sub_order_amount_infos as unknown[] | undefined
    const first = Array.isArray(subs) && subs[0] && typeof subs[0] === 'object' ? (subs[0] as Record<string, unknown>) : null
    if (first) fen = Number(first.pay_amount)
  }
  if (!Number.isFinite(fen) || fen <= 0) return 0
  const yuan = fen / 100
  return Math.round(yuan * 100) / 100
}

function orderCreateUnixSec(order: Record<string, unknown>): number {
  const t = Number(order.create_order_time ?? order.pay_time ?? order.update_order_time)
  if (!Number.isFinite(t) || t <= 0) return 0
  return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t)
}

function unixSecFromApiTime(t: unknown): number {
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

/** 团购券 401=已履约；即配无券结构时以订单已完成兜底 */
function orderIsPaidForSales(order: Record<string, unknown>): boolean {
  const st = Number(order.order_status)
  return st === 200 || st === 201 || st === 1
}

function orderSalesCouponCount(order: Record<string, unknown>): number {
  const certs = order.certificate
  if (Array.isArray(certs) && certs.length > 0) return certs.length
  const c = Number(order.count)
  if (Number.isFinite(c) && c > 0) return Math.floor(c)
  return 1
}

function certIsFulfilled(itemStatus: number): boolean {
  return itemStatus === 401
}

function orderUniqueId(order: Record<string, unknown>): string {
  const id = String(order.order_id ?? order.id ?? '').trim()
  return id || `${orderCreateUnixSec(order)}:${orderPayAmountYuan(order)}`
}

type DouyinFinanceDayBucket = {
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

function emptyDouyinFinanceDayBucket(): DouyinFinanceDayBucket {
  return { orderCount: 0, verifyOrderCount: 0, salesAmountYuan: 0, verifyAmountYuan: 0 }
}

function certVerifyDedupeKey(order: Record<string, unknown>, cert: Record<string, unknown>): string {
  const itemId = String(cert.order_item_id ?? cert.certificate_id ?? '').trim()
  if (itemId) return itemId
  return `${orderUniqueId(order)}:${String(cert.item_status ?? '')}`
}

function perCertificatePayYuan(order: Record<string, unknown>, certCount: number): number {
  const total = orderPayAmountYuan(order)
  if (certCount <= 1) return total
  return Math.round((total / certCount) * 100) / 100
}

function mergeDouyinOrderSales(
  bucket: Map<string, DouyinFinanceDayBucket>,
  order: Record<string, unknown>,
  startYmd: string,
  endYmd: string,
  seenSalesOrderIds: Set<string>,
  hourlyPay?: Map<number, number>,
): void {
  if (!orderIsPaidForSales(order)) return
  const oid = orderUniqueId(order)
  if (seenSalesOrderIds.has(oid)) return
  seenSalesOrderIds.add(oid)
  const cu = orderCreateUnixSec(order)
  if (cu <= 0) return
  const day = shanghaiDateStringFromUnixSec(cu)
  if (day < startYmd || day > endYmd) return
  const amount = orderPayAmountYuan(order)
  const cur = bucket.get(day) ?? emptyDouyinFinanceDayBucket()
  cur.orderCount += orderSalesCouponCount(order)
  cur.salesAmountYuan += amount
  bucket.set(day, cur)
  if (hourlyPay && startYmd === endYmd && day === startYmd) {
    const hour = shanghaiHourFromUnixSec(cu)
    hourlyPay.set(hour, (hourlyPay.get(hour) ?? 0) + amount)
  }
}

function mergeDouyinOrderVerify(
  bucket: Map<string, DouyinFinanceDayBucket>,
  order: Record<string, unknown>,
  startYmd: string,
  endYmd: string,
  seenVerifyCerts: Set<string>,
  isHermes: boolean,
): void {
  const certs = order.certificate
  if (Array.isArray(certs) && certs.length > 0) {
    const perCertYuan = perCertificatePayYuan(order, certs.length)
    for (const c of certs) {
      if (!c || typeof c !== 'object') continue
      const cert = c as Record<string, unknown>
      const st = Number(cert.item_status ?? cert.status)
      if (!certIsFulfilled(st)) continue
      const dedupeKey = certVerifyDedupeKey(order, cert)
      if (seenVerifyCerts.has(dedupeKey)) continue
      seenVerifyCerts.add(dedupeKey)
      const verifySec = unixSecFromApiTime(cert.item_update_time)
      if (verifySec <= 0) continue
      const day = shanghaiDateStringFromUnixSec(verifySec)
      if (day < startYmd || day > endYmd) continue
      const cur = bucket.get(day) ?? emptyDouyinFinanceDayBucket()
      cur.verifyOrderCount += 1
      cur.verifyAmountYuan += perCertYuan
      bucket.set(day, cur)
    }
    return
  }
  if (!isHermes || Number(order.order_status) !== 1) return
  const oid = orderUniqueId(order)
  const dedupeKey = `hermes:${oid}`
  if (seenVerifyCerts.has(dedupeKey)) return
  seenVerifyCerts.add(dedupeKey)
  const verifySec = unixSecFromApiTime(order.update_order_time ?? order.pay_time ?? order.create_order_time)
  if (verifySec <= 0) return
  const day = shanghaiDateStringFromUnixSec(verifySec)
  if (day < startYmd || day > endYmd) return
  const cur = bucket.get(day) ?? emptyDouyinFinanceDayBucket()
  cur.verifyOrderCount += 1
  cur.verifyAmountYuan += orderPayAmountYuan(order)
  bucket.set(day, cur)
}

type DouyinOrderQueryTimeRange = 'create' | 'update'

type DouyinFinanceFetchLimits = {
  pageSize: number
  createMaxPages: number
  verifyUpdateMaxPages: number
  includeHermes: boolean
  hermesMaxPages: number
}

function douyinFinanceFetchLimits(startYmd: string, endYmd: string): DouyinFinanceFetchLimits {
  const daySpan = eachShanghaiYmdInclusive(startYmd, endYmd).length
  return {
    pageSize: 100,
    createMaxPages: daySpan <= 1 ? 15 : daySpan <= 7 ? 20 : daySpan <= 30 ? 28 : 35,
    verifyUpdateMaxPages: daySpan <= 1 ? 20 : daySpan <= 7 ? 8 : 5,
    includeHermes: daySpan <= 3,
    hermesMaxPages: daySpan <= 1 ? 10 : 6,
  }
}

type PaginateDouyinOrdersOpts = {
  maxPages?: number
  pageSize?: number
}

async function paginateDouyinTradeOrders(
  token: string,
  accountId: string,
  apiPath: '/goodlife/v1/trade/order/query/' | '/goodlife/v1/hermes/trade/order/query/',
  startSec: number,
  endSec: number,
  startYmd: string,
  endYmd: string,
  bucket: Map<string, DouyinFinanceDayBucket>,
  seenSalesOrderIds: Set<string>,
  seenVerifyCerts: Set<string>,
  timeRange: DouyinOrderQueryTimeRange,
  warnings: string[],
  opts?: PaginateDouyinOrdersOpts,
  hourlyPay?: Map<number, number>,
): Promise<void> {
  const isHermes = apiPath.includes('hermes')
  let page = 1
  const pageSize = opts?.pageSize ?? 100
  const maxPages = opts?.maxPages ?? 100
  while (page <= maxPages) {
    const u = new URL(kuaishouOpenApiUrl(apiPath))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('page_num', String(page))
    u.searchParams.set('page_size', String(pageSize))
    u.searchParams.set('get_secret_number', 'false')
    if (timeRange === 'create') {
      u.searchParams.set('create_order_start_time', String(startSec))
      u.searchParams.set('create_order_end_time', String(endSec))
    } else {
      u.searchParams.set('update_order_start_time', String(startSec))
      u.searchParams.set('update_order_end_time', String(endSec))
    }

    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    if (!dr.ok) {
      warnings.push(
        `快手${isHermes ? '即配' : '团购'}订单 HTTP ${dr.status}：${raw.slice(0, 200)}`,
      )
      break
    }
    const envErr = getDataError(j)
    if (!envErr.ok) {
      warnings.push(envErr.msg ?? `快手${isHermes ? '即配' : '团购'}订单业务错误`)
      break
    }
    const data = j.data as Record<string, unknown> | undefined
    const orders = (data?.orders as unknown[]) ?? []
    for (const rawOrder of orders) {
      if (!rawOrder || typeof rawOrder !== 'object') continue
      const order = rawOrder as Record<string, unknown>
      if (timeRange === 'create') {
        mergeDouyinOrderSales(bucket, order, startYmd, endYmd, seenSalesOrderIds, hourlyPay)
        mergeDouyinOrderVerify(bucket, order, startYmd, endYmd, seenVerifyCerts, isHermes)
      } else {
        mergeDouyinOrderVerify(bucket, order, startYmd, endYmd, seenVerifyCerts, isHermes)
      }
    }
    if (orders.length < pageSize) break
    page += 1
  }
  if (page > maxPages) warnings.push('快手订单分页达到上限，汇总可能不完整')
}

/**
 * 按创单时间在 [startYmd,endYmd] 内拉取团购 trade/order + 即配 hermes 订单，汇总为财务对账行。
 */
export async function fetchKuaishouFinanceReconcileRows(
  bearerToken: string,
  startYmd: string,
  endYmd: string,
): Promise<{ rows: FinanceReconcileRowPayload[]; warnings: string[]; hourlyTrend?: FinanceHourlyPayPoint[] }> {
  const warnings: string[] = []
  const session = bearerToken ? resolveSession(bearerToken) : undefined
  if (!session) {
    warnings.push('当前 Bearer 非快手团购绑定会话，无法拉取快手订单；请使用「快手绑定」返回的 accessToken。')
    return { rows: [], warnings }
  }
  const rng = unixRangeInclusiveShanghai(startYmd, endYmd)
  if (!rng) {
    warnings.push('日期范围无效')
    return { rows: [], warnings }
  }

  const bucket = new Map<string, DouyinFinanceDayBucket>()
  const seenSalesOrderIds = new Set<string>()
  const seenVerifyCerts = new Set<string>()
  const trackHourly = startYmd === endYmd
  const hourlyPay = trackHourly ? new Map<number, number>() : undefined

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = session.merchantId
    const limits = douyinFinanceFetchLimits(startYmd, endYmd)
    const paginateOpts = { pageSize: limits.pageSize }
    const tasks: Promise<void>[] = [
      paginateDouyinTradeOrders(
        token,
        accountId,
        '/goodlife/v1/trade/order/query/',
        rng.startSec,
        rng.endSec,
        startYmd,
        endYmd,
        bucket,
        seenSalesOrderIds,
        seenVerifyCerts,
        'create',
        warnings,
        { ...paginateOpts, maxPages: limits.createMaxPages },
        hourlyPay,
      ),
    ]
    if (limits.verifyUpdateMaxPages > 0) {
      tasks.push(
        paginateDouyinTradeOrders(
          token,
          accountId,
          '/goodlife/v1/trade/order/query/',
          rng.startSec,
          rng.endSec,
          startYmd,
          endYmd,
          bucket,
          seenSalesOrderIds,
          seenVerifyCerts,
          'update',
          warnings,
          { ...paginateOpts, maxPages: limits.verifyUpdateMaxPages },
          hourlyPay,
        ),
      )
    }
    if (limits.includeHermes) {
      tasks.push(
        paginateDouyinTradeOrders(
          token,
          accountId,
          '/goodlife/v1/hermes/trade/order/query/',
          rng.startSec,
          rng.endSec,
          startYmd,
          endYmd,
          bucket,
          seenSalesOrderIds,
          seenVerifyCerts,
          'create',
          warnings,
          { ...paginateOpts, maxPages: limits.hermesMaxPages },
          hourlyPay,
        ),
      )
    }
    await Promise.all(tasks)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    warnings.push(`快手对账拉取异常：${msg}`)
  }

  const allDays = eachShanghaiYmdInclusive(startYmd, endYmd)
  const rows: FinanceReconcileRowPayload[] = allDays.map((date) => {
    const v = bucket.get(date)
    return {
      date,
      platform: 'kuaishou',
      platformLabel: '快手团购',
      orderCount: v?.orderCount ?? 0,
      verifyOrderCount: v?.verifyOrderCount ?? 0,
      salesAmountYuan: Math.round((v?.salesAmountYuan ?? 0) * 100) / 100,
      verifyAmountYuan: Math.round((v?.verifyAmountYuan ?? 0) * 100) / 100,
    }
  })

  if (warnings.length === 0) {
    warnings.push(
      '快手：成交按创单时间汇总已支付订单（200/201/1）；核销仅统计券 item_status=401（已履约），按 item_update_time 归属日期；最终以来客后台为准。',
    )
  }
  return {
    rows,
    warnings,
    ...(hourlyPay ? { hourlyTrend: buildHourlyPayTrend(hourlyPay) } : {}),
  }
}

function akteRateScoreToStars(rateScore: unknown): number {
  const n = Number(rateScore)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n <= 5) return Math.min(5, Math.max(0, Math.round(n)))
  if (n <= 50) return Math.min(5, Math.max(0, Math.round(n / 10)))
  /* 常见于百分制或其它放大倍数 */
  if (n <= 500) return Math.min(5, Math.max(0, Math.round(n / 100)))
  return Math.min(5, Math.max(0, Math.round(n / (n > 5000 ? 1000 : 100))))
}

function sentimentFromStars(stars: number): MerchantReviewRowDouyin['sentiment'] {
  if (stars >= 4) return 'good'
  if (stars >= 3) return 'neutral'
  return 'bad'
}

/** 复合 ID，避免 poi_id/rate_id 超出 JS Number 安全整数时失真 */
export function composeKuaishouReviewId(poiId: string | number, rateId: string | number): string {
  return `douyin:${String(poiId)}:${String(rateId)}`
}

export function parseKuaishouReviewCompositeId(id: string): { poiId: string; rateId: string } | null {
  if (!id.startsWith('douyin:')) return null
  const rest = id.slice('douyin:'.length)
  const i = rest.lastIndexOf(':')
  if (i <= 0) return null
  const poiId = rest.slice(0, i).trim()
  const rateId = rest.slice(i + 1).trim()
  if (!poiId || !rateId) return null
  return { poiId, rateId }
}

function isoFromAkteTime(t: unknown): string {
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString()
  const ms = n > 1e12 ? n : n * 1000
  return new Date(ms).toISOString()
}

function mapKuaishouAkteCommentRow(
  row: Record<string, unknown>,
  ctx: { reviewKind: 'store' | 'product'; poiId?: string; poiName?: string; productId?: string; productName?: string },
): MerchantReviewRowDouyin | null {
  const ci = row.comment_info
  const info = ci && typeof ci === 'object' ? (ci as Record<string, unknown>) : row
  const rateId = info.rate_id ?? row.rate_id
  const poiId = row.poi_id ?? info.poi_id ?? ctx.poiId
  if (rateId == null || String(rateId).trim() === '' || poiId == null || String(poiId).trim() === '') {
    return null
  }

  const compositeId = composeKuaishouReviewId(String(poiId), String(rateId))
  const rateText = typeof info.rate_text === 'string' ? info.rate_text : ''
  const stars = akteRateScoreToStars(info.rate_score)
  const hasReply = info.has_merchant_reply === true
  const replyList = Array.isArray(row.reply_list) ? (row.reply_list as unknown[]) : []
  const firstReply =
    replyList[0] && typeof replyList[0] === 'object' ? (replyList[0] as Record<string, unknown>) : null
  const replyText =
    typeof firstReply?.text === 'string' && firstReply.text.trim() ? firstReply.text.trim() : undefined

  const nick =
    (typeof info.nickname === 'string' && info.nickname.trim()) ||
    (typeof info.nick_name === 'string' && info.nick_name.trim()) ||
    (typeof info.user_name === 'string' && info.user_name.trim()) ||
    '快手用户'

  const prodRaw = row.product_info
  const prodInfo =
    prodRaw && typeof prodRaw === 'object' ? (prodRaw as Record<string, unknown>) : null
  const mappedProductId =
    ctx.productId ??
    (prodInfo?.product_id != null ? String(prodInfo.product_id) : undefined)
  const mappedProductName =
    ctx.productName ??
    (typeof prodInfo?.product_name === 'string' ? prodInfo.product_name : undefined)

  return {
    id: compositeId,
    platform: 'kuaishou',
    sentiment: sentimentFromStars(stars || 3),
    userName: nick,
    ratingStars: stars,
    content: rateText || '（无文字评价）',
    createdAt: isoFromAkteTime(info.create_time),
    replied: hasReply || Boolean(replyText),
    replyText: replyText || undefined,
    reviewKind: ctx.reviewKind,
    poiId: String(poiId),
    poiName: ctx.poiName,
    productId: mappedProductId,
    productName: mappedProductName,
  }
}

async function listDouyinOnlineProductIds(
  accessToken: string,
  accountId: string,
  maxProducts: number,
): Promise<Array<{ productId: string; productName: string }>> {
  const out: Array<{ productId: string; productName: string }> = []
  let cursor = ''
  for (let page = 0; page < 30 && out.length < maxProducts; page += 1) {
    const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/goods/product/online/query/'))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('count', '50')
    if (cursor) u.searchParams.set('cursor', cursor)
    const dr = await kuaishouServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    if (!dr.ok || !getDataError(j).ok) break
    const data = j.data as Record<string, unknown> | undefined
    const products = extractProductsArrayFromGoodlifeEnvelope(j)
    for (const p of products) {
      if (!p || typeof p !== 'object') continue
      const o = p as Record<string, unknown>
      const prod = (o.product && typeof o.product === 'object' ? o.product : o) as Record<string, unknown>
      const productId = String(prod.product_id ?? prod.id ?? o.product_id ?? '').trim()
      const productName = String(prod.product_name ?? prod.name ?? o.product_name ?? productId).trim()
      if (!productId) continue
      out.push({ productId, productName: productName || productId })
      if (out.length >= maxProducts) break
    }
    const hasMore = data?.has_more === true
    const next = data?.cursor != null ? String(data.cursor) : ''
    if (!hasMore || !next || next === cursor) break
    cursor = next
  }
  return out
}

function formatKuaishouAkteIdList(ids: string[]): string {
  const cleaned = ids.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 20)
  if (cleaned.length === 0) return ''
  const body = cleaned.map((id) => (/^\d+$/.test(id) ? id : JSON.stringify(id)))
  return `[${body.join(',')}]`
}

/** 快手评价查询首页游标（官方示例 cursor=%22%22，不可省略） */
const KUAISHOU_AKTE_COMMENT_FIRST_CURSOR = '""'
/** 评价查询 QPS 约 20；翻页/批次间留间隔并在限频时退避重试 */
const AKTE_COMMENT_PAGE_DELAY_MS = 450
const AKTE_COMMENT_BATCH_DELAY_MS = 900

async function fetchAkteCommentsForTarget(
  accessToken: string,
  accountId: string,
  target: { poiId?: string; productId?: string; poiIds?: string[]; productIds?: string[] },
  ctx: { reviewKind: 'store' | 'product'; poiId?: string; poiName?: string; productId?: string; productName?: string },
): Promise<{ ok: true; items: MerchantReviewRowDouyin[] } | { ok: false; message: string }> {
  const poiIds = [
    ...(Array.isArray(target.poiIds) ? target.poiIds : []),
    ...(target.poiId?.trim() ? [target.poiId.trim()] : []),
  ]
  const productIds = [
    ...(Array.isArray(target.productIds) ? target.productIds : []),
    ...(target.productId?.trim() ? [target.productId.trim()] : []),
  ]
  const poiIdList = [...new Set(poiIds.map((x) => x.trim()).filter(Boolean))].slice(0, 20)
  const productIdList = [...new Set(productIds.map((x) => x.trim()).filter(Boolean))].slice(0, 20)
  const usePoi = ctx.reviewKind === 'store' ? poiIdList : []
  const useProduct = ctx.reviewKind === 'product' ? productIdList : []
  if (usePoi.length === 0 && useProduct.length === 0) {
    return { ok: false, message: '请至少选择一个门店或商品后再同步评价。' }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const startSec = nowSec - 90 * 86400
  const out: MerchantReviewRowDouyin[] = []
  let cursor = KUAISHOU_AKTE_COMMENT_FIRST_CURSOR
  for (let page = 0; page < 80; page += 1) {
    if (page > 0) await sleep(AKTE_COMMENT_PAGE_DELAY_MS)

    const u = new URL(kuaishouOpenApiUrl('/goodlife/v1/akte/comment/query/'))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('start_time', String(startSec))
    u.searchParams.set('end_time', String(nowSec))
    u.searchParams.set('count', '100')
    u.searchParams.set('cursor', cursor)
    if (usePoi.length > 0) {
      u.searchParams.set('poi_id_list', formatKuaishouAkteIdList(usePoi))
    }
    if (useProduct.length > 0) {
      u.searchParams.set('product_id_list', formatKuaishouAkteIdList(useProduct))
    }

    let raw = ''
    let j: Record<string, unknown> = {}
    let lastErr = '评价查询无响应'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) {
        await sleep(800 * attempt * attempt)
      }
      const dr = await kuaishouServerFetch(u.toString(), {
        method: 'GET',
        headers: {
          'access-token': accessToken,
          'content-type': 'application/json',
          'Rpc-Transit-Life-Account': accountId,
        },
      })
      raw = await dr.text()
      j = parseKuaishouJson(raw)
      const err = getDataError(j)
      if (!dr.ok) {
        lastErr = raw.slice(0, 400) || `评价查询 HTTP ${dr.status}`
        if (attempt < 4 && isKuaishouOpenApiRateLimited(lastErr)) continue
        return { ok: false, message: lastErr }
      }
      if (!err.ok) {
        lastErr = err.msg ?? '评价查询业务错误（请确认已开通餐饮评价权限）'
        if (attempt < 4 && isKuaishouOpenApiRateLimited(lastErr)) continue
        return { ok: false, message: lastErr }
      }
      lastErr = ''
      break
    }
    if (lastErr) {
      return { ok: false, message: lastErr }
    }

    const data = j.data as Record<string, unknown> | undefined
    const comments = Array.isArray(data?.comments) ? (data!.comments as unknown[]) : []
    for (const c of comments) {
      if (!c || typeof c !== 'object') continue
      const commentRow = c as Record<string, unknown>
      const mapped = mapKuaishouAkteCommentRow(commentRow, {
        reviewKind: ctx.reviewKind,
        poiId:
          ctx.poiId ??
          (commentRow.poi_id != null ? String(commentRow.poi_id) : undefined) ??
          target.poiId,
        poiName: ctx.poiName,
        productId:
          ctx.productId ??
          (commentRow.product_info &&
          typeof commentRow.product_info === 'object' &&
          (commentRow.product_info as Record<string, unknown>).product_id != null
            ? String((commentRow.product_info as Record<string, unknown>).product_id)
            : undefined) ??
          target.productId,
        productName: ctx.productName,
      })
      if (mapped) out.push(mapped)
    }

    const hasMore = data?.has_more === true
    const next = data?.cursor != null ? String(data.cursor) : ''
    if (!hasMore || !next || next === cursor) break
    cursor = next
  }
  return { ok: true, items: out }
}

/** 分页拉取近 90 天评价（须传 poi_id 或 product_id；按门店/商品维度聚合） */
export async function fetchKuaishouAkteReviews(
  bearerToken: string,
  opts?: KuaishouAkteReviewFetchOpts,
): Promise<{ ok: true; items: MerchantReviewRowDouyin[] } | { ok: false; message: string }> {
  const auth = bearerToken.trim()
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    return { ok: false, message: '会话无效或未绑定快手团购，请先完成绑定。' }
  }
  const kind = opts?.kind ?? 'all'
  try {
    const accessToken = await ensureKuaishouToken(session)
    const accountId = session.merchantId
    const merged: MerchantReviewRowDouyin[] = []
    const seen = new Set<string>()

    const pushItems = (items: MerchantReviewRowDouyin[]) => {
      for (const it of items) {
        if (seen.has(it.id)) continue
        seen.add(it.id)
        merged.push(it)
      }
    }

    if (kind === 'store' || kind === 'all') {
      const poiTargets: Array<{ poiId: string; poiName?: string }> = []
      if (opts?.poiId?.trim()) {
        poiTargets.push({ poiId: opts.poiId.trim() })
      } else if (Array.isArray(opts?.poiIds) && opts.poiIds.length > 0) {
        for (const id of opts.poiIds) {
          const poiId = String(id ?? '').trim()
          if (poiId) poiTargets.push({ poiId })
          if (poiTargets.length >= 120) break
        }
      } else {
        const { pois } = await fetchMergedAllPois(auth, session, accountId)
        for (const row of pois) {
          const poiId = extractRowPoiId(row)
          if (!poiId) continue
          const name =
            typeof row === 'object' && row && (row as Record<string, unknown>).poi
              ? String(
                  ((row as Record<string, unknown>).poi as Record<string, unknown>).poi_name ??
                    poiId,
                )
              : poiId
          poiTargets.push({ poiId, poiName: name })
          if (poiTargets.length >= 120) break
        }
      }
      if (poiTargets.length === 0 && (kind === 'store' || kind === 'all')) {
        return { ok: false, message: '未找到已绑定门店，请先在「店铺信息」同步快手门店。' }
      }
      for (let i = 0; i < poiTargets.length; i += 20) {
        if (i > 0) await sleep(AKTE_COMMENT_BATCH_DELAY_MS)
        const batch = poiTargets.slice(i, i + 20)
        const r = await fetchAkteCommentsForTarget(
          accessToken,
          accountId,
          { poiIds: batch.map((p) => p.poiId) },
          { reviewKind: 'store', poiName: batch[0]?.poiName },
        )
        if (r.ok === false) return r
        pushItems(r.items)
      }
    }

    if (kind === 'product' || kind === 'all') {
      const productTargets: Array<{ productId: string; productName?: string }> = []
      if (opts?.productId?.trim()) {
        productTargets.push({ productId: opts.productId.trim() })
      } else if (Array.isArray(opts?.productIds) && opts.productIds.length > 0) {
        for (const id of opts.productIds) {
          const productId = String(id ?? '').trim()
          if (productId) productTargets.push({ productId })
          if (productTargets.length >= 120) break
        }
      } else {
        const products = await listDouyinOnlineProductIds(accessToken, accountId, 120)
        for (const p of products) {
          productTargets.push({ productId: p.productId, productName: p.productName })
        }
      }
      if (productTargets.length === 0 && kind === 'product') {
        return { ok: false, message: '未找到在线商品，请先在「商品」页同步快手团购商品。' }
      }
      for (let i = 0; i < productTargets.length; i += 20) {
        if (i > 0) await sleep(AKTE_COMMENT_BATCH_DELAY_MS)
        const batch = productTargets.slice(i, i + 20)
        const r = await fetchAkteCommentsForTarget(
          accessToken,
          accountId,
          { productIds: batch.map((p) => p.productId) },
          {
            reviewKind: 'product',
            productId: batch[0]?.productId,
            productName: batch[0]?.productName,
          },
        )
        if (r.ok === false) return r
        pushItems(r.items)
      }
    }

    return { ok: true, items: merged }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `拉取快手评价失败：${msg}` }
  }
}

/** 回复评价（需 poi_id、rate_id 与开放平台一致；大整数以字符串经 JSON 传递） */
export async function postKuaishouAkteCommentReply(
  bearerToken: string,
  poiId: string,
  rateId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = bearerToken.trim()
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    return { ok: false, message: '会话无效或未绑定快手团购。' }
  }
  const safeInt = (s: string): number | string => {
    if (/^\d{1,15}$/.test(s)) return Number(s)
    return s
  }
  const body = {
    account_id: session.merchantId,
    poi_id: safeInt(poiId),
    rate_id: safeInt(rateId),
    text: text.trim(),
  }
  if (!body.text) return { ok: false, message: '回复内容不能为空' }
  try {
    const accessToken = await ensureKuaishouToken(session)
    const dr = await kuaishouServerFetch(kuaishouOpenApiUrl('/goodlife/v1/akte/comment/reply/'), {
      method: 'POST',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': session.merchantId,
      },
      body: JSON.stringify(body),
    })
    const raw = await dr.text()
    const j = parseKuaishouJson(raw)
    const err = getDataError(j)
    if (!dr.ok) {
      return { ok: false, message: raw.slice(0, 400) || `回复评价 HTTP ${dr.status}` }
    }
    if (!err.ok) {
      const data = j.data as Record<string, unknown> | undefined
      const derr = typeof data?.error_code === 'number' && data.error_code !== 0
      const desc = typeof data?.description === 'string' ? data.description : err.msg
      if (derr && desc) return { ok: false, message: desc }
      if (!err.ok && err.msg) return { ok: false, message: err.msg }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `回复评价失败：${msg}` }
  }
}

/** 平台营销活动列表（招商/报名类）— 代理 goodlife marketing activity query */
export async function handleKuaishouMarketingActivityQueryGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = req.headers.authorization?.match(/^Bearer\s+(\S+)/i)?.[1]
  if (!auth) {
    json(res, 401, { ok: false, message: '缺少 Authorization: Bearer <绑定返回的 accessToken>' })
    return
  }
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    json(res, 401, { ok: false, message: '会话无效或已失效，请重新绑定' })
    return
  }

  try {
    const token = await ensureKuaishouToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size')) || 20))
    const statusFilter = (url.searchParams.get('status') ?? 'all').trim()

    const customPath = process.env.KUAISHOU_MARKETING_ACTIVITY_QUERY_PATH?.trim()
    const paths = customPath
      ? [customPath]
      : [
          '/goodlife/v1/cps/common_plan/list/',
          '/goodlife/v1/cps/oriented_plan/list/',
          '/goodlife/v1/marketing/activity/query/',
          '/goodlife/v1/marketing/platform_activity/query/',
        ]

    let lastErr = ''
    for (const path of paths) {
      const u = new URL(kuaishouOpenApiUrl(path.startsWith('/') ? path : `/${path}`))
      u.searchParams.set('account_id', accountId)
      u.searchParams.set('page', String(page))
      u.searchParams.set('page_size', String(pageSize))
      if (statusFilter && statusFilter !== 'all') {
        u.searchParams.set('activity_status', statusFilter)
      }

      const dr = await kuaishouServerFetch(u.toString(), {
        method: 'GET',
        headers: {
          'access-token': token,
          'content-type': 'application/json',
          'Rpc-Transit-Life-Account': accountId,
        },
      })
      const raw = await dr.text()
      let j: Record<string, unknown> = {}
      try {
        j = JSON.parse(raw || '{}') as Record<string, unknown>
      } catch {
        j = {}
      }
      if (!dr.ok) {
        lastErr = raw.slice(0, 400) || `HTTP ${dr.status}`
        continue
      }
      const biz = getDataError(j)
      if (!biz.ok) {
        lastErr = biz.msg || '快手业务错误'
        if (
          /not found|404|不存在|无权限|scope|unsupported path|janus|不支持的路径/i.test(lastErr)
        ) {
          continue
        }
        json(res, 200, {
          ok: false,
          platform: 'kuaishou',
          message: lastErr,
          upstream: j,
        })
        return
      }
      const data = (j.data ?? j) as Record<string, unknown>
      const listRaw =
        data.activity_list ??
        data.activities ??
        data.common_plan_list ??
        data.plan_list ??
        data.oriented_plan_list ??
        data.list ??
        data.items ??
        (Array.isArray(data) ? data : [])
      const items = normalizeDouyinMarketingActivities(listRaw)
      const total =
        Number(data.total) ||
        Number(data.total_count) ||
        (Array.isArray(listRaw) ? listRaw.length : items.length)
      json(res, 200, {
        ok: true,
        platform: 'kuaishou',
        items,
        total,
        page,
        page_size: pageSize,
        syncedAt: new Date().toISOString(),
        upstream_path: path,
        doc: 'https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/marketing/activity-query',
      })
      return
    }

    if (/unsupported path|janus|不支持的路径/i.test(lastErr)) {
      json(res, 200, {
        ok: true,
        platform: 'kuaishou',
        items: [],
        total: 0,
        page,
        page_size: pageSize,
        syncedAt: new Date().toISOString(),
        upstreamNote:
          '当前快手中继未开放「平台营销活动查询」路径（Unsupported path/Janus）。请在来客开放平台开通营销/招商能力，并由运维配置 KUAISHOU_MARKETING_ACTIVITY_QUERY_PATH 或在中继上透传官方 goodlife 路径。',
      })
      return
    }

    json(res, 502, {
      ok: false,
      platform: 'kuaishou',
      message:
        lastErr ||
        '未能拉取快手营销活动。请在开放平台确认能力已开通，或设置 KUAISHOU_MARKETING_ACTIVITY_QUERY_PATH。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { ok: false, platform: 'kuaishou', message: `快手营销活动查询失败：${msg}` })
  }
}

function normalizeDouyinMarketingActivities(listRaw: unknown): {
  id: string
  platform: 'kuaishou'
  title: string
  summary?: string
  uiStatus: 'ongoing' | 'enrollable' | 'ended' | 'unknown'
  startAt?: string
  endAt?: string
  enrollDeadline?: string
  enrollUrl?: string
  rawStatus?: string | number
}[] {
  if (!Array.isArray(listRaw)) return []
  const out: ReturnType<typeof normalizeDouyinMarketingActivities> = []
  for (const row of listRaw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = String(
      r.activity_id ?? r.id ?? r.campaign_id ?? r.plan_id ?? r.common_plan_id ?? '',
    ).trim()
    if (!id) continue
    const title = String(
      r.activity_name ?? r.plan_name ?? r.title ?? r.name ?? '平台活动',
    ).trim()
    const summary = String(r.description ?? r.desc ?? r.summary ?? '').trim() || undefined
    const rawStatus = r.status ?? r.activity_status ?? r.state
    out.push({
      id,
      platform: 'kuaishou',
      title,
      summary,
      uiStatus: mapMarketingUiStatus(rawStatus, r.start_time ?? r.start_at, r.end_time ?? r.end_at),
      startAt: isoFromMarketingTime(r.start_time ?? r.start_at),
      endAt: isoFromMarketingTime(r.end_time ?? r.end_at),
      enrollDeadline: isoFromMarketingTime(
        r.enroll_end_time ?? r.register_end_time ?? r.signup_end_time,
      ),
      enrollUrl: typeof r.enroll_url === 'string' ? r.enroll_url : undefined,
      rawStatus: typeof rawStatus === 'string' || typeof rawStatus === 'number' ? rawStatus : undefined,
    })
  }
  return out
}

function mapMarketingUiStatus(
  rawStatus: unknown,
  startRaw: unknown,
  endRaw: unknown,
): 'ongoing' | 'enrollable' | 'ended' | 'unknown' {
  const now = Date.now()
  const endMs = parseMarketingTimeMs(endRaw)
  const startMs = parseMarketingTimeMs(startRaw)
  if (endMs != null && endMs < now) return 'ended'
  const s = String(rawStatus ?? '').toLowerCase()
  if (/end|close|finish|已结束|结束|失效/.test(s) || rawStatus === 3 || rawStatus === '3') return 'ended'
  if (/enroll|register|sign|报名|可报|招募|待报名/.test(s) || rawStatus === 1 || rawStatus === '1') {
    return 'enrollable'
  }
  if (/run|ing|open|进行|生效|上线/.test(s) || rawStatus === 2 || rawStatus === '2') return 'ongoing'
  if (startMs != null && endMs != null) {
    if (now < startMs) return 'enrollable'
    if (now >= startMs && now <= endMs) return 'ongoing'
    return 'ended'
  }
  return 'unknown'
}

function parseMarketingTimeMs(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v < 1e12 ? v * 1000 : v
  }
  const s = String(v).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n < 1e12 ? n * 1000 : n
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function isoFromMarketingTime(v: unknown): string | undefined {
  const ms = parseMarketingTimeMs(v)
  if (ms == null) return undefined
  try {
    return new Date(ms).toISOString()
  } catch {
    return undefined
  }
}
