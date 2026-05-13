/**
 * 开发环境：将 ERP 的 /api/merchant/douyin/* 直连抖音开放平台（真实数据，无演示门店）。
 * 依赖 Node 18+ fetch；凭证仅存于本机 dev server 内存，不写入前端 bundle。
 *
 * 门店列表：GET https://open.douyin.com/goodlife/v1/shop/poi/query/
 * 门店品牌（来客「门店品牌」）：GET https://open.douyin.com/goodlife/v2/shop/brand/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query
 *
 * 门店亮照/认领：POST https://open.douyin.com/goodlife/v1/poi/poi/claim/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/poi.claim
 *
 * SDK 总览（Java / Node / Go）：https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/sdk-overview
 *
 * Client Token：POST https://open.douyin.com/oauth/client_token/
 *
 * 商品类目：GET https://open.douyin.com/goodlife/v1/goods/category/get/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/category.get
 *
 * 商品线上列表（模糊搜品名，套餐单品匹配）：GET https://open.douyin.com/goodlife/v1/goods/product/online/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query
 *
 * 商品草稿列表（创建/审核中商品，可与线上结果合并）：GET https://open.douyin.com/goodlife/v1/goods/product/draft/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/query
 *
 * 门店资质：GET https://open.douyin.com/goodlife/v1/poi/cert/info/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/store-qualification-info
 *
 * 异步任务结果：GET https://open.douyin.com/goodlife/v1/poi/task/query/
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/task.query
 *
 * 门店基础信息更新（异步）：POST goodlife/v1/poi/poi/update/ — 生产后端按需代理。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/poi.update
 *
 * 能力授权与门店绑定：见抖音「auth_with_bind」文档（生产网关实现）。
 *
 * 出口 IP 需固定时：在部署环境设置 `DOUYIN_OPENAPI_BASE_URL` 为自建反代根（如 `http://<EIP>/douyin`），路径仍与官方一致。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  douyinOpenApiUrl,
  douyinServerFetch,
  exchangeDouyinClientToken,
  extractPoisFromShopQueryData,
  fetchGoodlifeWithOfficialFallback,
  invalidateDouyinMerchantClientTokenCache,
  isLikelyDouyinClientTokenExpiredBizError,
  parseDouyinJson,
  parseDouyinOpenApiEnvelope,
} from '../api/douyinOpenApiBase.js'
import { runDouyinMerchantBind } from '../api/merchant/douyin/bindRuntime.js'
import { extractLifeBrandStructName } from '../src/lib/douyinLifeBrandExtract.js'
import {
  type DouyinMerchantSession,
  douyinMerchantDevSessions,
  openDouyinSessionCredentials,
} from '../api/merchant/douyin/bindShared.js'
import { mockDouyinProductStore } from './mockDouyinProductStore.js'

export { runDouyinMerchantBind }

/** 绑定链路若 hang 住，Vercel 会以 FUNCTION_INVOCATION_FAILED 结束；对抖音出口强制限时 */
const DOUYIN_FETCH_TIMEOUT_MS = 25_000

function douyinFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return douyinServerFetch(input, {
    ...init,
    signal: AbortSignal.timeout(DOUYIN_FETCH_TIMEOUT_MS),
  })
}

export type MerchantReviewRowDouyin = {
  id: string
  platform: 'douyin'
  sentiment: 'good' | 'neutral' | 'bad'
  userName: string
  ratingStars: number
  content: string
  createdAt: string
  replied: boolean
  replyText?: string
}

/** 同一 Lambda 实例内缓存解密后的会话，减少重复申请 client_token */
const sealedSessionRuntimeCache = new Map<string, DouyinMerchantSession>()

function resolveSession(authToken: string): DouyinMerchantSession | undefined {
  const t = authToken.trim()
  if (!t) return undefined
  const mem = douyinMerchantDevSessions.get(t)
  if (mem) return mem
  let cached = sealedSessionRuntimeCache.get(t)
  if (cached) return cached
  const opened = openDouyinSessionCredentials(t)
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

/** 抖音部分字段以字符串形式返回 error_code，仅用 number 判断会漏掉业务失败 */
function numericErrorCode(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function getDataError(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const rootCode = numericErrorCode(j.error_code)
  if (rootCode !== undefined && rootCode !== 0) {
    return { ok: false, msg: String(j.description ?? j.msg ?? `抖音根 error_code=${rootCode}`) }
  }
  const mes = typeof j.message === 'string' ? j.message.trim().toLowerCase() : ''
  if (mes === 'error' || mes === 'fail' || mes === 'failed') {
    const data = j.data
    const d =
      data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : undefined
    return {
      ok: false,
      msg: String(d?.description ?? j.description ?? j.msg ?? '抖音接口返回失败'),
    }
  }
  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const code = numericErrorCode(d.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(d.description ?? `抖音 error_code=${code}`) }
    }
  }
  const extra = j.extra
  if (extra && typeof extra === 'object') {
    const e = extra as Record<string, unknown>
    const code = numericErrorCode(e.error_code)
    if (code !== undefined && code !== 0) {
      return { ok: false, msg: String(e.description ?? `抖音 extra error_code=${code}`) }
    }
  }
  return { ok: true }
}

async function fetchDouyinClientToken(
  clientKey: string,
  clientSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  return exchangeDouyinClientToken(clientKey, clientSecret, douyinFetch)
}

async function ensureDouyinToken(s: DouyinMerchantSession): Promise<string> {
  const skew = 120_000
  if (s.douyinToken && Date.now() < s.douyinExpiresAtMs - skew) {
    return s.douyinToken
  }
  const { token, expiresIn } = await fetchDouyinClientToken(s.clientKey, s.clientSecret)
  s.douyinToken = token
  s.douyinExpiresAtMs = Date.now() + Math.max(300, expiresIn) * 1000
  return token
}

/** 抖音侧偶发提前失效 client_token：清空缓存、重领 token 后重试一次 goodlife 请求 */
async function withDouyinClientTokenRetry<T>(
  session: DouyinMerchantSession,
  opts: { sessionKey?: string },
  op: (accessToken: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureDouyinToken(session)
    try {
      return await op(token)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt === 0 && isLikelyDouyinClientTokenExpiredBizError(msg)) {
        invalidateDouyinMerchantClientTokenCache(session)
        if (opts.sessionKey) clearSessionPoiCache(opts.sessionKey)
        continue
      }
      throw e
    }
  }
  throw new Error('withDouyinClientTokenRetry: exhausted retries')
}

async function shopPoiQueryPage(
  accountId: string,
  accessToken: string,
  page: number,
  size: number,
  /** 0 认领 / 1 关联 / 2 挂靠；不传则走平台默认（认领） */
  relationType?: 0 | 1 | 2,
): Promise<Record<string, unknown>> {
  const u = new URL(douyinOpenApiUrl('/goodlife/v1/shop/poi/query/'))
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
  const j = parseDouyinOpenApiEnvelope(raw, 'shop/query')
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
  const u = new URL(douyinOpenApiUrl('/goodlife/v1/shop/poi/query/'))
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
  const j = parseDouyinOpenApiEnvelope(raw, 'shop/query(poi_id)')
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
  const u = new URL(douyinOpenApiUrl('/goodlife/v1/poi/cert/info/'))
  u.searchParams.set('merchant_life_account_id', merchantLifeAccountId.trim())
  u.searchParams.set('poi_id', poiId.trim())
  try {
    const res = await douyinServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': rpcTransitAccount,
      },
    })
    const raw = await res.text()
    const j = parseDouyinJson(raw) as Record<string, unknown>
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
  const u = new URL(douyinOpenApiUrl('/goodlife/v1/poi/task/query/'))
  u.searchParams.set('task_ids', JSON.stringify(ids))
  try {
    const res = await douyinServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': rpcTransitAccount,
      },
    })
    const raw = await res.text()
    const j = parseDouyinJson(raw) as Record<string, unknown>
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

/** 抖音 shop.query 易返回「请求太过频繁」：翻页与多种 relation 之间拉长间隔 + 失败退避重试 */
const SHOP_QUERY_PAGE_DELAY_MS = 380
const SHOP_QUERY_RELATION_SWITCH_DELAY_MS = 900

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isShopQueryRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /太过频繁|请稍后再试|rate limit|429|限流|频率过高|too many requests/i.test(msg)
}

/** 按 relation_type 翻页拉全量（最多 200 页），供认领拆分、tabCounts、装修列表复用 */
async function fetchAllPoiPages(
  sessionKey: string,
  session: DouyinMerchantSession,
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
        j = await withDouyinClientTokenRetry(
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
  session: DouyinMerchantSession,
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
      `抖音 shop.query 三种 relation_type 均失败（请核对 life.capacity.shop 与账户 ID）：${errors.join(' | ')}`,
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
  session: DouyinMerchantSession,
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

/** 认领中：综合抖音返回的状态字段做保守识别（无明确「进行中」语义时归为已认领侧） */
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

/** 与前端 normalizeStoreRow 对齐：抖音 shop.query 实际常含 poi_ext / attributes，文档示例仅列基础 poi 字段 */
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

/** 店铺装修列表：由门店 POI + poi_ext 聚合（与 douyinMerchantApi.normalizeStoreRow 同源字段策略） */
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

export async function handleDouyinBindPost(
  _req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
  try {
    const r = await runDouyinMerchantBind(bodyRaw)
    json(res, r.statusCode, r.body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 500, { message: msg || '抖音绑定处理异常' })
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

/** 代理 goodlife/v1/goods/category/get/，原样返回抖音 JSON（与来客类目一致） */
export async function handleDouyinGoodsCategoryGet(
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
    const token = await ensureDouyinToken(session)
    const accountId =
      (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(douyinOpenApiUrl('/goodlife/v1/goods/category/get/'))
    u.searchParams.set('account_id', accountId)
    const qct = (url.searchParams.get('query_category_type') ?? '1').trim()
    u.searchParams.set('query_category_type', qct || '1')
    const cid = (url.searchParams.get('category_id') ?? '').trim()
    if (cid) u.searchParams.set('category_id', cid)

    const dr = await douyinServerFetch(u.toString(), {
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
          '抖音类目接口返回了 HTML（多为鉴权/频控/WAF 或上游错误页），请稍后重试或重新绑定；若部署在同域，请确认 Vercel 未将 /api 回退到 index.html。',
      })
      return
    }
    res.statusCode = dr.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(raw)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `抖音类目查询失败：${msg}` })
  }
}

/** 代理 goodlife/v1/goods/product/online/query/（商品名称模糊、分页 cursor） */
export async function handleDouyinGoodsProductOnlineQueryGet(
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
    const token = await ensureDouyinToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(douyinOpenApiUrl('/goodlife/v1/goods/product/online/query/'))
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

    const dr = await douyinServerFetch(u.toString(), {
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
    json(res, 502, { message: `抖音商品线上列表查询失败：${msg}` })
  }
}

/** 代理 goodlife/v1/goods/product/draft/query/（与 goods/save 创建链路一致，用于发品前单品匹配） */
export async function handleDouyinGoodsProductDraftQueryGet(
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
    const token = await ensureDouyinToken(session)
    const accountId = (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(douyinOpenApiUrl('/goodlife/v1/goods/product/draft/query/'))
    u.searchParams.set('account_id', accountId)
    const count = Math.min(50, Math.max(1, Number(url.searchParams.get('count')) || 20))
    u.searchParams.set('count', String(count))
    const cursor = (url.searchParams.get('cursor') ?? '').trim()
    if (cursor) u.searchParams.set('cursor', cursor)
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status) u.searchParams.set('status', status)

    const dr = await douyinServerFetch(u.toString(), {
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
    json(res, 502, { message: `抖音商品草稿列表查询失败：${msg}` })
  }
}

/** 基于 category/get 结果解析可创建商品的末级类目（enable 且非 is_publish_block） */
export async function handleDouyinGoodsIndustryScopeGet(
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
    const token = await ensureDouyinToken(session)
    const accountId =
      (url.searchParams.get('account_id') ?? '').trim() || session.merchantId
    const u = new URL(douyinOpenApiUrl('/goodlife/v1/goods/category/get/'))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('query_category_type', '1')

    const dr = await douyinServerFetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseDouyinJson(raw)
    const data = j.data as Record<string, unknown> | undefined
    const tree = data?.category_tree_infos
    const uploadable = collectUploadableLeafCategoryIds(tree)
    json(res, 200, {
      data: {
        error_code: 0,
        description: '',
        industry_name: '抖音来客类目（末级 enable 且未封禁）',
        uploadable_leaf_category_ids: uploadable,
      },
      message:
        '与 goodlife/v1/goods/category/get 树解析一致；若需资质/行业额外圈定请在生产网关合并资质接口结果。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `抖音行业类目范围失败：${msg}` })
  }
}

export async function handleDouyinStoresGet(
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
          ? '抖音 shop.query 在当前账户下返回 0 条门店。绑定成功只表示 client_token 有效；请核对来客 PC 端右上角「账户 ID」与开放平台授权一致，且门店已在该账户下完成认领。若仅有「关联/挂靠」门店，本接口已合并 relation_type 0/1/2。'
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
    json(res, 502, { message: `抖音门店查询失败：${msg}` })
  }
}

/** 代理 goodlife/v2/shop/brand/query/，原样返回抖音 JSON（与开放平台 envelope 一致） */
export async function handleDouyinBrandsGet(
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
    const token = await ensureDouyinToken(session)
    const accountId = session.merchantId

    const u = new URL(douyinOpenApiUrl('/goodlife/v2/shop/brand/query/'))
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('page', String(page))
    u.searchParams.set('size', String(pageSize))
    if (keyword) {
      u.searchParams.set('keyword', keyword)
      u.searchParams.set('brand_name', keyword)
    }

    const dr = await douyinServerFetch(u.toString(), {
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
        message: `抖音品牌查询 HTTP ${dr.status}`,
        detail: body,
      })
      return
    }
    json(res, 200, body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `抖音品牌查询失败：${msg}` })
  }
}

export async function handleDouyinStoreDecorationGet(
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
        '由 goodlife/v1/shop/poi/query 的 poi + poi_ext（及 attributes）聚合展示字段；若列为「—」多为抖音未返回该维度或需单独开通装修类能力。',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    json(res, 502, { message: `抖音门店装修列表失败：${msg}` })
  }
}

/** 单店详情：shop.query（poi_id）+ 可选 cert/info；可选 task_ids 拉 task/query */
export async function handleDouyinStoreDetailGet(
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
    json(res, 400, { message: '缺少 query poiId（抖音门店 ID）' })
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
    const j = await withDouyinClientTokenRetry(session, { sessionKey: auth }, (token) =>
      shopPoiQuerySinglePoi(poiId, accountId, token),
    )
    const data = j.data as Record<string, unknown> | undefined
    const pois = (data?.pois as unknown[]) ?? []
    if (!Array.isArray(pois) || pois.length === 0) {
      json(res, 404, { message: '未查询到该门店，请确认门店已关联当前账户且 poi_id 正确' })
      return
    }

    const cert = await withDouyinClientTokenRetry(session, { sessionKey: auth }, (token) =>
      poiCertInfoGet(poiId, accountId, token, accountId),
    )
    let taskBody: Record<string, unknown> | undefined
    let taskQueryError: string | undefined
    if (taskIdList.length > 0) {
      const tq = await withDouyinClientTokenRetry(session, { sessionKey: auth }, (token) =>
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
    json(res, 502, { message: `抖音单店查询失败：${msg}` })
  }
}

/**
 * 代理「提交门店资质亮照/认领」异步任务。
 * 请求体须与官方一致（含 datas 数组等），成功后会清空本会话 POI 缓存以便列表与来客侧对齐。
 */
export async function handleDouyinPoiClaimPost(
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
        '请求体须包含非空 datas 数组，字段与抖音「提交门店资质亮照/修改任务」OpenAPI 一致（life.capacity.poi.claim）。',
    })
    return
  }
  try {
    const token = await ensureDouyinToken(session)
    const payload =
      typeof b.target_type === 'number' || typeof b.target_type === 'string'
        ? body
        : { ...b, target_type: 100 }
    const dr = await douyinServerFetch(douyinOpenApiUrl('/goodlife/v1/poi/poi/claim/'), {
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
    json(res, 502, { message: `抖音认领/亮照提交失败：${msg}` })
  }
}

function yuanToFen(yuan: number): number {
  if (!Number.isFinite(yuan) || yuan <= 0) return 1
  const n = Math.round(yuan * 100)
  return Math.min(Math.max(1, n), Number.MAX_SAFE_INTEGER)
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

async function fetchTemplateAttrsBundle(
  accountId: string,
  token: string,
  categoryId: string,
  productType: number,
): Promise<{ productAttrs: Record<string, unknown>[]; skuAttrs: Record<string, unknown>[] }> {
  if (!categoryId) return { productAttrs: [], skuAttrs: [] }
  const u = new URL(douyinOpenApiUrl('/goodlife/v1/goods/template/get/'))
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('category_id', categoryId)
  u.searchParams.set('product_type', String(productType))
  const dr = await douyinServerFetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': token,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  const raw = await dr.text()
  const j = parseDouyinJson(raw)
  if (!getDataError(j).ok) return { productAttrs: [], skuAttrs: [] }
  const data = j.data as Record<string, unknown> | undefined
  const pa = data?.product_attrs
  const sa = data?.sku_attrs
  return {
    productAttrs: Array.isArray(pa) ? (pa as Record<string, unknown>[]) : [],
    skuAttrs: Array.isArray(sa) ? (sa as Record<string, unknown>[]) : [],
  }
}

function jsonImageUrlList(urls: string[]): string {
  return JSON.stringify(urls.slice(0, 30).map((url) => ({ url })))
}

/** 与来客常见规则一致：单组内 n 个单品时 pick_rule 须为「全部必选」或「n选1」…「n选n」 */
function normalizePickRuleForComboGroup(itemCount: number, pickRule: string): string {
  const raw = pickRule.trim() || '全部必选'
  if (itemCount <= 1) return '全部必选'
  if (raw === '全部必选') return raw
  const m = /^(\d+)选(\d+)$/.exec(raw)
  if (m) {
    const n = Number.parseInt(m[1]!, 10)
    const k = Number.parseInt(m[2]!, 10)
    if (n === itemCount && k >= 1 && k <= itemCount) return raw
  }
  return `${itemCount}选${itemCount}`
}

function comboRuleJsonPayloadValid(s: string): boolean {
  try {
    const o = JSON.parse(s) as { groups?: unknown }
    if (!o || typeof o !== 'object' || !Array.isArray(o.groups) || o.groups.length === 0) return false
    for (const g of o.groups) {
      const gr = g as Record<string, unknown>
      if (!Array.isArray(gr.items) || gr.items.length === 0) return false
      const pr = String(gr.pick_rule ?? '').trim()
      if (!pr) return false
    }
    return true
  } catch {
    return false
  }
}

/** 模板 attr：套餐 / combo_rule 类（与 merge + 强制回填逻辑一致） */
function attrTemplateLooksComboLike(key: string, name: string, vtRaw: string): boolean {
  const vt = vtRaw.toUpperCase()
  const nm = name.toLowerCase()
  if (/^combo_rule$/i.test(key)) return true
  if (nm.includes('combo_rule')) return true
  if (/套餐规则|搭配规则|组合规则|套餐数据|搭配数据|商品搭配/.test(name)) return true
  if ((vt === 'STRUCT' || vt === 'OBJECT' || vt === 'JSON') && /套餐|搭配|组合/.test(name)) return true
  return false
}

/** goodlife 侧 combo_rule 与 ERP `package_combo` 同源；团购/代金券等多类型均可能校验非空 */
function buildDouyinProductComboRule(
  erp: Record<string, unknown>,
  productNameFallback: string,
): Record<string, unknown> | null {
  const raw = erp.package_combo
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { groups?: unknown[] }
  const groupsIn = Array.isArray(o.groups) ? o.groups : []
  if (groupsIn.length === 0) return null
  const fb = productNameFallback.trim().slice(0, 120) || '单品'
  const groups = groupsIn.map((g) => {
    const gr = g as Record<string, unknown>
    const itemsIn = Array.isArray(gr.items) ? gr.items : []
    const items = itemsIn.map((it) => {
      const row = it as Record<string, unknown>
      const name = String(row.name ?? '').trim() || fb
      const quantity = Math.max(1, Math.floor(Number(row.quantity ?? row.qty ?? 1) || 1))
      const item: Record<string, unknown> = { name, quantity }
      const op = row.origin_price_yuan
      if (op != null && Number.isFinite(Number(op))) item.origin_price_yuan = Number(op)
      const pid = String(row.product_id ?? '').trim()
      if (pid) item.product_id = pid
      const sid = String(row.sku_id ?? '').trim()
      if (sid) item.sku_id = sid
      return item
    })
    const prRaw = String(gr.pick_rule ?? gr.pickRule ?? '全部必选').trim() || '全部必选'
    return {
      pick_rule: normalizePickRuleForComboGroup(items.length, prRaw),
      items,
    }
  })
  const groupsWithItems = groups.filter((g) => Array.isArray(g.items) && g.items.length > 0)
  if (groupsWithItems.length === 0) return null
  return { groups: groupsWithItems }
}

function mergeGoodlifeProductAttrMapFromErp(
  attrs: Record<string, unknown>[],
  erp: Record<string, unknown>,
  base: Record<string, string>,
): Record<string, string> {
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

    if (
      vt === 'STRUCT' ||
      vt === 'OBJECT' ||
      vt === 'JSON' ||
      /套餐|搭配|组合/.test(name) ||
      /^combo_rule$/i.test(key) ||
      /套餐规则|搭配规则|组合规则/.test(name)
    ) {
      if (pkgJson) {
        out[key] = pkgJson
        continue
      }
    }

    if (vt === 'STRING' || vt === 'TEXT' || vt === 'URL' || vt === '' || vt === 'ENUM') {
      if ((/^combo_rule$/i.test(key) || name.toLowerCase().includes('combo_rule')) && pkgJson) {
        out[key] = pkgJson
        continue
      }
      if (/标题|商品名称|名称(?!规范)/.test(name) && productName) {
        out[key] = productName.slice(0, 2000)
        continue
      }
      if (/详情|图文|介绍|卖点|描述/.test(name)) {
        const v = (productDesc || productName).slice(0, 12000)
        if (v) {
          out[key] = v
          continue
        }
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
  session: DouyinMerchantSession,
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
    const j = await withDouyinClientTokenRetry(session, { sessionKey }, (access) =>
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
 * 将 ERP 聚合表单映射为 goodlife/v1/goods/product/save 的 Body（含单 SKU）。
 * 头图写入 template/get 返回的 IMAGE 类 attr（按名称/类型启发式匹配）。
 */
async function buildGoodlifeProductSaveBody(
  accountId: string,
  token: string,
  erp: Record<string, unknown>,
  _mode: 'draft' | 'submit',
  account_name: string,
): Promise<Record<string, unknown>> {
  const product_name = String(erp.product_name ?? '').trim()
  const desc = String(erp.product_desc ?? product_name).trim()
  const category_id = String(erp.category_id ?? '').trim()
  const product_type = Number(erp.product_type) || 1
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

  const { productAttrs: attrs, skuAttrs } = await fetchTemplateAttrsBundle(
    accountId,
    token,
    category_id,
    product_type,
  )
  const auxUrls = Array.isArray(erp.aux_image_urls)
    ? (erp.aux_image_urls as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : []
  const carouselUrls = [...headUrls, ...auxUrls]

  const attr_key_value_map: Record<string, string> = {}
  const imageKey = pickProductImageAttrKey(attrs)
  if (imageKey && carouselUrls.length > 0) {
    attr_key_value_map[imageKey] = jsonImageUrlList(carouselUrls)
  }

  let comboRule = buildDouyinProductComboRule(erp, product_name)
  if (!comboRule) {
    const oy = Number(erp.origin_price_yuan ?? erp.price_yuan)
    comboRule = {
      groups: [
        {
          pick_rule: '全部必选',
          items: [
            {
              name: product_name.slice(0, 120) || '团购套餐',
              quantity: 1,
              ...(Number.isFinite(oy) && oy > 0 ? { origin_price_yuan: oy } : {}),
            },
          ],
        },
      ],
    }
  }

  /** template 的 attr_key_value_map 常要求 combo_rule 为 JSON 字符串；须与 package_combo 同源，否则报「combo_rule不能为空」 */
  const erpForAttrMerge: Record<string, unknown> =
    comboRule
      ? (() => {
          const raw = erp.package_combo
          if (raw && typeof raw === 'object') {
            const g = (raw as { groups?: unknown[] }).groups
            if (Array.isArray(g) && g.length > 0) return { ...erp, package_combo: raw }
          }
          return { ...erp, package_combo: { groups: (comboRule as { groups: unknown[] }).groups } }
        })()
      : erp

  const mergedProductAttrs = mergeGoodlifeProductAttrMapFromErp(attrs, erpForAttrMerge, attr_key_value_map)

  const tplOverrides = erp.template_attr_overrides
  if (tplOverrides && typeof tplOverrides === 'object' && !Array.isArray(tplOverrides)) {
    for (const [k, val] of Object.entries(tplOverrides as Record<string, unknown>)) {
      const key = String(k).trim()
      if (!key) continue
      const s = typeof val === 'string' ? val.trim() : String(val ?? '').trim()
      if (s) mergedProductAttrs[key] = s.slice(0, 120_000)
    }
  }

  /**
   * 抖音会校验 attr_key_value_map 中套餐/搭配类字段为合法 JSON；前端 overrides 或历史草稿可能写入坏串。
   * 在合并 template_attr_overrides 之后，强制与 package_combo 推导结果一致，并避免重复写入冲突的裸 combo_rule。
   */
  const comboJsonMandatory = comboRule
    ? JSON.stringify({ groups: (comboRule as { groups: unknown[] }).groups }).slice(0, 120_000)
    : ''
  if (comboJsonMandatory) {
    for (const a of attrs) {
      const key = String(a.key ?? '').trim()
      if (!key) continue
      const name = String(a.name ?? '')
      const vt = String(a.value_type ?? '').toUpperCase()
      if (!attrTemplateLooksComboLike(key, name, vt)) continue
      if (
        vt === 'STRUCT' ||
        vt === 'OBJECT' ||
        vt === 'JSON' ||
        vt === 'STRING' ||
        vt === 'TEXT' ||
        vt === 'ENUM' ||
        !vt
      ) {
        mergedProductAttrs[key] = comboJsonMandatory
      }
    }
    const hasLiteralComboRuleKey = Object.keys(mergedProductAttrs).some((k) => /^combo_rule$/i.test(k))
    const hasOtherValidComboPayload = Object.entries(mergedProductAttrs).some(
      ([k, v]) => !/^combo_rule$/i.test(k) && comboRuleJsonPayloadValid(String(v ?? '').trim()),
    )
    if (!hasLiteralComboRuleKey && !hasOtherValidComboPayload) {
      mergedProductAttrs.combo_rule = comboJsonMandatory
    }
  }

  const nowMs = Date.now()
  const oneYearMs = nowMs + 366 * 86400000

  const product: Record<string, unknown> = {
    product_name,
    desc,
    category_id,
    product_type,
    biz_line: 1,
    open_biz_type: 1,
    out_id,
    account_name,
    sold_start_time: nowMs,
    sold_end_time: oneYearMs,
    pois: poi_ids.map((poi_id) => ({ poi_id })),
  }
  if (comboRule) {
    product.combo_rule = comboRule
  }
  if (Object.keys(mergedProductAttrs).length > 0) {
    product.attr_key_value_map = mergedProductAttrs
  }
  if (product_id_existing) {
    product.product_id = product_id_existing
  }

  const skuAttrMap = mergeGoodlifeSkuAttrMapFromTemplate(skuAttrs, product_name, actualFen, originFen, stockQty)
  const skuTplOverrides = erp.template_sku_attr_overrides
  if (skuTplOverrides && typeof skuTplOverrides === 'object' && !Array.isArray(skuTplOverrides)) {
    for (const [k, val] of Object.entries(skuTplOverrides as Record<string, unknown>)) {
      const key = String(k).trim()
      if (!key) continue
      const s = typeof val === 'string' ? val.trim() : String(val ?? '').trim()
      if (s) skuAttrMap[key] = s.slice(0, 120_000)
    }
  }
  const sku: Record<string, unknown> = {
    sku_name: product_name.slice(0, 120),
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
    ability: { ignore_inapplicable_poi: true },
    account_id: accountId,
    product,
    sku,
  }
}

/** 代理 goodlife/v1/goods/product/save/（创建/更新商品，草稿与提交审核均走此接口） */
export async function handleDouyinGoodsProductSavePost(
  _req: IncomingMessage,
  res: ServerResponse,
  bodyRaw: string,
): Promise<void> {
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

  try {
    const token = await ensureDouyinToken(session)
    const accountId = session.merchantId
    const accountName = await resolveProductAccountNameForSave(auth, session, accountId, erp)
    if (!accountName) {
      json(res, 400, {
        message:
          '缺少抖音来客商品所需的 account_name（根账户昵称）。请先在系统设置完成绑定并加载门店列表，或保存时带上 account_name 后重试。',
      })
      return
    }
    const saveBody = await buildGoodlifeProductSaveBody(accountId, token, erp, mode, accountName)

    const dr = await douyinServerFetch(douyinOpenApiUrl('/goodlife/v1/goods/product/save/'), {
      method: 'POST',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
      body: JSON.stringify(saveBody),
    })
    const raw = await dr.text()
    const j = parseDouyinJson(raw)
    const bizOk = getDataError(j).ok
    const data = j.data as Record<string, unknown> | undefined
    const pid = typeof data?.product_id === 'string' ? data.product_id.trim() : ''
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
    json(res, 502, { message: `抖音商品保存失败：${msg}` })
  }
}

export type FinanceReconcileRowPayload = {
  date: string
  platform: 'douyin'
  platformLabel: string
  orderCount: number
  verifyOrderCount: number
  salesAmountYuan: number
  verifyAmountYuan: number
}

function shanghaiDateStringFromUnixSec(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
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

/** 券维度有 item_update_time 时视为已发生验券/状态更新，计入核销侧（粗口径，以平台结算为准） */
function orderHasVerifySignal(order: Record<string, unknown>): boolean {
  const certs = order.certificate
  if (!Array.isArray(certs) || certs.length === 0) return false
  for (const c of certs) {
    if (!c || typeof c !== 'object') continue
    const cert = c as Record<string, unknown>
    const iut = Number(cert.item_update_time)
    if (Number.isFinite(iut) && iut > 1_000_000_000) return true
  }
  return false
}

/**
 * 按创单时间在 [startYmd,endYmd]（上海日历日）内拉取 Hermes 订单并汇总为财务对账行（按日一条）。
 */
export async function fetchDouyinFinanceReconcileRows(
  bearerToken: string,
  startYmd: string,
  endYmd: string,
): Promise<{ rows: FinanceReconcileRowPayload[]; warnings: string[] }> {
  const warnings: string[] = []
  const session = bearerToken ? resolveSession(bearerToken) : undefined
  if (!session) {
    warnings.push('当前 Bearer 非抖音来客绑定会话，无法拉取抖音订单；请使用「抖音绑定」返回的 accessToken。')
    return { rows: [], warnings }
  }
  const rng = unixRangeInclusiveShanghai(startYmd, endYmd)
  if (!rng) {
    warnings.push('日期范围无效')
    return { rows: [], warnings }
  }

  const bucket = new Map<
    string,
    { orderCount: number; verifyOrderCount: number; salesAmountYuan: number; verifyAmountYuan: number }
  >()

  try {
    const token = await ensureDouyinToken(session)
    const accountId = session.merchantId
    let page = 1
    const pageSize = 50
    const maxPages = 100

    while (page <= maxPages) {
      const u = new URL(douyinOpenApiUrl('/goodlife/v1/hermes/trade/order/query/'))
      u.searchParams.set('account_id', accountId)
      u.searchParams.set('page_num', String(page))
      u.searchParams.set('page_size', String(pageSize))
      u.searchParams.set('create_order_start_time', String(rng.startSec))
      u.searchParams.set('create_order_end_time', String(rng.endSec))
      u.searchParams.set('get_secret_number', 'false')

      const dr = await douyinServerFetch(u.toString(), {
        method: 'GET',
        headers: {
          'access-token': token,
          'content-type': 'application/json',
          'Rpc-Transit-Life-Account': accountId,
        },
      })
      const raw = await dr.text()
      const j = parseDouyinJson(raw)
      if (!dr.ok) {
        warnings.push(`抖音订单查询 HTTP ${dr.status}：${raw.slice(0, 240)}`)
        break
      }
      const envErr = getDataError(j)
      if (!envErr.ok) {
        warnings.push(envErr.msg ?? '抖音订单查询业务错误')
        break
      }
      const data = j.data as Record<string, unknown> | undefined
      const orders = (data?.orders as unknown[]) ?? []
      for (const rawOrder of orders) {
        if (!rawOrder || typeof rawOrder !== 'object') continue
        const order = rawOrder as Record<string, unknown>
        const cu = orderCreateUnixSec(order)
        if (cu <= 0) continue
        const day = shanghaiDateStringFromUnixSec(cu)
        if (day < startYmd || day > endYmd) continue
        const cur = bucket.get(day) ?? {
          orderCount: 0,
          verifyOrderCount: 0,
          salesAmountYuan: 0,
          verifyAmountYuan: 0,
        }
        cur.orderCount += 1
        const yuan = orderPayAmountYuan(order)
        cur.salesAmountYuan += yuan
        if (orderHasVerifySignal(order)) {
          cur.verifyOrderCount += 1
          cur.verifyAmountYuan += yuan
        }
        bucket.set(day, cur)
      }
      if (orders.length < pageSize) break
      page += 1
    }
    if (page > maxPages) {
      warnings.push('抖音订单分页达到上限，汇总可能不完整')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    warnings.push(`抖音对账拉取异常：${msg}`)
  }

  const allDays = eachShanghaiYmdInclusive(startYmd, endYmd)
  const rows: FinanceReconcileRowPayload[] = allDays.map((date) => {
    const v = bucket.get(date)
    return {
      date,
      platform: 'douyin',
      platformLabel: '抖音来客',
      orderCount: v?.orderCount ?? 0,
      verifyOrderCount: v?.verifyOrderCount ?? 0,
      salesAmountYuan: Math.round((v?.salesAmountYuan ?? 0) * 100) / 100,
      verifyAmountYuan: Math.round((v?.verifyAmountYuan ?? 0) * 100) / 100,
    }
  })

  if (warnings.length === 0) {
    warnings.push(
      '抖音：数据来自开放平台 goodlife/v1/hermes/trade/order/query/（文档说明主要覆盖即配类订单）；到店团购等请以平台对账与对应 OpenAPI 为准。',
    )
  }
  return { rows, warnings }
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
export function composeDouyinReviewId(poiId: string | number, rateId: string | number): string {
  return `douyin:${String(poiId)}:${String(rateId)}`
}

export function parseDouyinReviewCompositeId(id: string): { poiId: string; rateId: string } | null {
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

/** 分页拉取近 90 天评价列表并映射为 ERP 行 */
export async function fetchDouyinAkteReviews(
  bearerToken: string,
): Promise<{ ok: true; items: MerchantReviewRowDouyin[] } | { ok: false; message: string }> {
  const auth = bearerToken.trim()
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    return { ok: false, message: '会话无效或未绑定抖音来客，请先完成绑定。' }
  }
  try {
    const accessToken = await ensureDouyinToken(session)
    const accountId = session.merchantId
    const nowSec = Math.floor(Date.now() / 1000)
    const startSec = nowSec - 90 * 86400

    const out: MerchantReviewRowDouyin[] = []
    let cursor = '0'
    for (let page = 0; page < 80; page += 1) {
      const u = new URL(douyinOpenApiUrl('/goodlife/v1/akte/comment/query/'))
      u.searchParams.set('account_id', accountId)
      u.searchParams.set('start_time', String(startSec))
      u.searchParams.set('end_time', String(nowSec))
      u.searchParams.set('cursor', cursor)
      u.searchParams.set('count', '100')

      const dr = await douyinServerFetch(u.toString(), {
        method: 'GET',
        headers: {
          'access-token': accessToken,
          'content-type': 'application/json',
          'Rpc-Transit-Life-Account': accountId,
        },
      })
      const raw = await dr.text()
      const j = parseDouyinJson(raw)
      const err = getDataError(j)
      if (!dr.ok) {
        return { ok: false, message: raw.slice(0, 400) || `评价查询 HTTP ${dr.status}` }
      }
      if (!err.ok) {
        return { ok: false, message: err.msg ?? '评价查询业务错误（请确认应用已开通餐饮评价权限 life.capacity.catering.comment）' }
      }

      const data = j.data as Record<string, unknown> | undefined
      const comments = Array.isArray(data?.comments) ? (data!.comments as unknown[]) : []
      for (const c of comments) {
        if (!c || typeof c !== 'object') continue
        const row = c as Record<string, unknown>
        const ci = row.comment_info
        const info = ci && typeof ci === 'object' ? (ci as Record<string, unknown>) : {}
        const rateId = info.rate_id
        const poiId = row.poi_id
        if (rateId == null || poiId == null) continue

        const compositeId = composeDouyinReviewId(String(poiId), String(rateId))
        const rateText = typeof info.rate_text === 'string' ? info.rate_text : ''
        const stars = akteRateScoreToStars(info.rate_score)
        const hasReply = info.has_merchant_reply === true
        const replyList = Array.isArray(row.reply_list) ? (row.reply_list as unknown[]) : []
        const firstReply =
          replyList[0] && typeof replyList[0] === 'object'
            ? (replyList[0] as Record<string, unknown>)
            : null
        const replyText =
          typeof firstReply?.text === 'string' && firstReply.text.trim()
            ? firstReply.text.trim()
            : undefined

        const nick =
          (typeof info.nickname === 'string' && info.nickname.trim()) ||
          (typeof info.nick_name === 'string' && info.nick_name.trim()) ||
          (typeof info.user_name === 'string' && info.user_name.trim()) ||
          '抖音用户'

        out.push({
          id: compositeId,
          platform: 'douyin',
          sentiment: sentimentFromStars(stars || 3),
          userName: nick,
          ratingStars: stars,
          content: rateText || '（无文字评价）',
          createdAt: isoFromAkteTime(info.create_time),
          replied: hasReply || Boolean(replyText),
          replyText: replyText || undefined,
        })
      }

      const hasMore = data?.has_more === true
      const next = data?.cursor != null ? String(data.cursor) : ''
      if (!hasMore || !next || next === cursor) break
      cursor = next
    }

    return { ok: true, items: out }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `拉取抖音评价失败：${msg}` }
  }
}

/** 回复评价（需 poi_id、rate_id 与开放平台一致；大整数以字符串经 JSON 传递） */
export async function postDouyinAkteCommentReply(
  bearerToken: string,
  poiId: string,
  rateId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const auth = bearerToken.trim()
  const session = auth ? resolveSession(auth) : undefined
  if (!session) {
    return { ok: false, message: '会话无效或未绑定抖音来客。' }
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
    const accessToken = await ensureDouyinToken(session)
    const dr = await douyinServerFetch(douyinOpenApiUrl('/goodlife/v1/akte/comment/reply/'), {
      method: 'POST',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': session.merchantId,
      },
      body: JSON.stringify(body),
    })
    const raw = await dr.text()
    const j = parseDouyinJson(raw)
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

