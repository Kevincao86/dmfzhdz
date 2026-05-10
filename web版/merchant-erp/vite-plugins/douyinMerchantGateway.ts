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
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import { extractLifeBrandStructName } from '../src/lib/douyinLifeBrandExtract'
import {
  merchantDouyinSessionSecret,
  openDouyinSessionCredentials,
  sealDouyinSessionCredentials,
} from './douyinSessionSeal'
import { mockDouyinProductStore } from './mockDouyinProductStore'

const DOUYIN_CLIENT_TOKEN_URL = 'https://open.douyin.com/oauth/client_token/'
const DOUYIN_SHOP_POI_QUERY = 'https://open.douyin.com/goodlife/v1/shop/poi/query/'
/** 与来客 PC 端「门店品牌」一致；v1 /shop/brand/* 在网关侧为 Unsupported path(Janus)，须走 v2 */
const DOUYIN_SHOP_BRAND_QUERY_V2 = 'https://open.douyin.com/goodlife/v2/shop/brand/query/'
const DOUYIN_POI_CLAIM = 'https://open.douyin.com/goodlife/v1/poi/poi/claim/'
const DOUYIN_POI_CERT_INFO = 'https://open.douyin.com/goodlife/v1/poi/cert/info/'
const DOUYIN_POI_TASK_QUERY = 'https://open.douyin.com/goodlife/v1/poi/task/query/'
const DOUYIN_GOODS_CATEGORY_GET = 'https://open.douyin.com/goodlife/v1/goods/category/get/'
const DOUYIN_GOODS_PRODUCT_ONLINE_QUERY = 'https://open.douyin.com/goodlife/v1/goods/product/online/query/'
const DOUYIN_GOODS_PRODUCT_DRAFT_QUERY = 'https://open.douyin.com/goodlife/v1/goods/product/draft/query/'
const DOUYIN_GOODS_TEMPLATE_GET = 'https://open.douyin.com/goodlife/v1/goods/template/get/'
const DOUYIN_GOODS_PRODUCT_SAVE = 'https://open.douyin.com/goodlife/v1/goods/product/save/'
/**
 * 订单查询（Hermes 交易域；文档载明主要面向即配类订单，其它类型需换用对应 OpenAPI）
 * @see https://partner.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/catering/group-buy-solution/order-query/order-inquiry
 */
const DOUYIN_HERMES_TRADE_ORDER_QUERY = 'https://open.douyin.com/goodlife/v1/hermes/trade/order/query/'
/**
 * 评价查询 / 回复（餐饮团购方案；需在开放平台开通 life.capacity.catering.comment）
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/catering/dining-group-solution/food-review/query_comment
 */
const DOUYIN_AKTE_COMMENT_QUERY = 'https://open.douyin.com/goodlife/v1/akte/comment/query/'
const DOUYIN_AKTE_COMMENT_REPLY = 'https://open.douyin.com/goodlife/v1/akte/comment/reply/'

/** 绑定链路若 hang 住，Vercel 会以 FUNCTION_INVOCATION_FAILED 结束；对抖音出口强制限时 */
const DOUYIN_FETCH_TIMEOUT_MS = 25_000

function douyinFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
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

type Session = {
  clientKey: string
  clientSecret: string
  merchantId: string
  /** 抖音 client access_token（clt.*） */
  douyinToken: string
  douyinExpiresAtMs: number
}

const sessions = new Map<string, Session>()

/** 同一 Lambda 实例内缓存解密后的会话，减少重复申请 client_token */
const sealedSessionRuntimeCache = new Map<string, Session>()

function resolveSession(authToken: string): Session | undefined {
  const t = authToken.trim()
  if (!t) return undefined
  const mem = sessions.get(t)
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

function parseDouyinEnvelope(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function getDataError(j: Record<string, unknown>): { ok: boolean; msg?: string } {
  const data = j.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const code = d.error_code
    if (typeof code === 'number' && code !== 0) {
      return { ok: false, msg: String(d.description ?? `抖音 error_code=${code}`) }
    }
  }
  const extra = j.extra
  if (extra && typeof extra === 'object') {
    const e = extra as Record<string, unknown>
    const code = e.error_code
    if (typeof code === 'number' && code !== 0) {
      return { ok: false, msg: String(e.description ?? `抖音 extra error_code=${code}`) }
    }
  }
  return { ok: true }
}

async function fetchDouyinClientToken(
  clientKey: string,
  clientSecret: string,
): Promise<{ token: string; expiresIn: number }> {
  const res = await douyinFetch(DOUYIN_CLIENT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'client_credential',
    }),
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`client_token HTTP ${res.status}：${raw.slice(0, 300)}`)
  }
  const j = parseDouyinEnvelope(raw)
  const err = getDataError(j)
  if (!err.ok) {
    throw new Error(err.msg ?? `client_token 业务错误`)
  }
  const data = j.data as Record<string, unknown> | undefined
  const token = String(data?.access_token ?? j.access_token ?? '')
  if (!token) throw new Error('client_token 响应缺少 access_token')
  const expiresIn = Number(data?.expires_in ?? 7200)
  return { token, expiresIn }
}

async function ensureDouyinToken(s: Session): Promise<string> {
  const skew = 120_000
  if (s.douyinToken && Date.now() < s.douyinExpiresAtMs - skew) {
    return s.douyinToken
  }
  const { token, expiresIn } = await fetchDouyinClientToken(s.clientKey, s.clientSecret)
  s.douyinToken = token
  s.douyinExpiresAtMs = Date.now() + Math.max(300, expiresIn) * 1000
  return token
}

async function shopPoiQueryPage(
  accountId: string,
  accessToken: string,
  page: number,
  size: number,
  /** 0 认领 / 1 关联 / 2 挂靠；不传则走平台默认（认领） */
  relationType?: 0 | 1 | 2,
): Promise<Record<string, unknown>> {
  const u = new URL(DOUYIN_SHOP_POI_QUERY)
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('page', String(Math.max(1, page)))
  u.searchParams.set('size', String(Math.min(50, Math.max(1, size))))
  if (relationType !== undefined) {
    u.searchParams.set('relation_type', String(relationType))
  }

  const res = await douyinFetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': accessToken,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`shop/query HTTP ${res.status}：${raw.slice(0, 400)}`)
  }
  const j = parseDouyinEnvelope(raw)
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
  const u = new URL(DOUYIN_SHOP_POI_QUERY)
  u.searchParams.set('poi_id', poiId.trim())
  u.searchParams.set('page', '1')
  u.searchParams.set('size', '20')
  const res = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': accessToken,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`shop/query(poi_id) HTTP ${res.status}：${raw.slice(0, 400)}`)
  }
  const j = parseDouyinEnvelope(raw)
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
  const u = new URL(DOUYIN_POI_CERT_INFO)
  u.searchParams.set('merchant_life_account_id', merchantLifeAccountId.trim())
  u.searchParams.set('poi_id', poiId.trim())
  try {
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': rpcTransitAccount,
      },
    })
    const raw = await res.text()
    const j = parseDouyinEnvelope(raw) as Record<string, unknown>
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
  const u = new URL(DOUYIN_POI_TASK_QUERY)
  u.searchParams.set('task_ids', JSON.stringify(ids))
  try {
    const res = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': rpcTransitAccount,
      },
    })
    const raw = await res.text()
    const j = parseDouyinEnvelope(raw) as Record<string, unknown>
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
  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
  return String(poi.poi_id ?? o.poi_id ?? '').trim()
}

/** 按 relation_type 翻页拉全量（最多 200 页），供认领拆分、tabCounts、装修列表复用 */
async function fetchAllPoiPages(
  accountId: string,
  accessToken: string,
  relationType?: 0 | 1 | 2,
): Promise<{ pois: unknown[]; total: number }> {
  const all: unknown[] = []
  let reportedTotal = 0
  for (let page = 1; page <= 200; page++) {
    const j = await shopPoiQueryPage(accountId, accessToken, page, 50, relationType)
    const data = j.data as Record<string, unknown> | undefined
    if (!data) break
    if (page === 1) reportedTotal = Number(data.total) || 0
    const pois = data.pois
    if (!Array.isArray(pois) || pois.length === 0) break
    all.push(...pois)
    if (pois.length < 50) break
    if (reportedTotal > 0 && all.length >= reportedTotal) break
  }
  return { pois: all, total: reportedTotal || all.length }
}

async function fetchMergedAllPois(
  accountId: string,
  accessToken: string,
): Promise<{ pois: unknown[]; total: number }> {
  const packs = await Promise.all([
    fetchAllPoiPages(accountId, accessToken, 0),
    fetchAllPoiPages(accountId, accessToken, 1),
    fetchAllPoiPages(accountId, accessToken, 2),
  ])
  const seen = new Set<string>()
  const merged: unknown[] = []
  for (const pack of packs) {
    for (const row of pack.pois) {
      const id = extractRowPoiId(row)
      if (!id || seen.has(id)) continue
      seen.add(id)
      merged.push(row)
    }
  }
  return { pois: merged, total: merged.length }
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
  accountId: string,
  accessToken: string,
  relationSpec: RelationSpec,
  forceRefresh: boolean,
): Promise<{ pois: unknown[]; total: number }> {
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
      ? await fetchMergedAllPois(accountId, accessToken)
      : await fetchAllPoiPages(accountId, accessToken, relationSpec)
  poiListCache.set(cacheKey, { ts: now, pois: pack.pois, total: pack.total })
  return pack
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

/** 店铺装修列表：由门店 POI 聚合可展示字段（若后续接入独立装修查询接口可在此替换数据源） */
function rowToDecorationItem(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    return { id: '-', name: '（无效数据）' }
  }
  const o = row as Record<string, unknown>
  const poi = o.poi && typeof o.poi === 'object' ? (o.poi as Record<string, unknown>) : o
  const id = String(poi.poi_id ?? o.poi_id ?? '').trim() || '-'
  const name = String(poi.poi_name ?? o.poi_name ?? '未命名门店')
  const auditStatus = pickStr(poi, [
    'shop_audit_status',
    'poi_audit_status',
    'audit_status',
    'auditStatus',
    'decorate_audit_status',
  ])
  const optimization = pickStr(poi, ['optimization_suggestion', 'optimization', 'suggest_reason'])
  const storeInfoStatus = pickStr(poi, ['poi_info_status', 'store_info_status', 'info_complete_status'])
  const staffDisplay = pickStr(poi, ['staff_display_status', 'talent_display_status', 'employee_display_status'])
  const coverImageUrl = pickStr(poi, [
    'head_image_url',
    'head_image',
    'cover_url',
    'avatar_url',
    'icon_url',
    'image_url',
    'display_image',
  ])
  let albumCount: number | undefined
  if (Array.isArray(poi.image_list)) albumCount = poi.image_list.length
  else if (Array.isArray(poi.images)) albumCount = poi.images.length
  else albumCount = pickNum(poi.album_count ?? poi.image_count)
  const signatureDishes = pickStr(poi, ['signature_dishes', 'recommend_dishes', 'specialty'])
  const announcement = pickStr(poi, ['announcement', 'notice', 'bulletin'])
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

/** 供 Vite 中间件与 Vercel `/api/merchant/douyin/bind` 共用；线上须配置 MERCHANT_DOUYIN_SESSION_SECRET 以返回加密令牌（无状态）。 */
export async function runDouyinMerchantBind(
  bodyRaw: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  let body: { appId?: string; appSecret?: string; merchantId?: string }
  try {
    body = JSON.parse(bodyRaw || '{}') as typeof body
  } catch {
    return { statusCode: 400, body: { message: '请求体须为 JSON' } }
  }
  const clientKey = String(body.appId ?? '').trim()
  const clientSecret = String(body.appSecret ?? '').trim()
  const merchantId = String(body.merchantId ?? '').trim()
  if (!clientKey || !clientSecret || !merchantId) {
    return {
      statusCode: 400,
      body: { message: '请提供 appId（client_key）、appSecret（client_secret）、merchantId（account_id）' },
    }
  }

  try {
    const session: Session = {
      clientKey,
      clientSecret,
      merchantId,
      douyinToken: '',
      douyinExpiresAtMs: 0,
    }
    const token = await ensureDouyinToken(session)
    const first = await shopPoiQueryPage(merchantId, token, 1, 1)
    const d = first.data as Record<string, unknown> | undefined
    const pois = (d?.pois as unknown[]) ?? []
    const accountName = accountNameFromPois(pois)

    const secret = merchantDouyinSessionSecret()
    let accessToken: string
    if (secret) {
      accessToken = sealDouyinSessionCredentials({ clientKey, clientSecret, merchantId }, secret)
    } else {
      const sid = crypto.randomBytes(32).toString('hex')
      sessions.set(sid, session)
      accessToken = sid
    }

    return {
      statusCode: 200,
      body: {
        accessToken,
        accountName: accountName ?? undefined,
        message: secret
          ? '已绑定抖音来客（线上加密会话，请在部署环境配置 MERCHANT_DOUYIN_SESSION_SECRET）。'
          : '已建立直连抖音开放平台的本地会话（仅开发服务器内存）。',
      },
    }
  } catch (e) {
    const aborted =
      e instanceof Error &&
      (e.name === 'AbortError' || /aborted|timeout/i.test(e.message))
    const detail = aborted
      ? `连接抖音开放平台超时（${Math.round(DOUYIN_FETCH_TIMEOUT_MS / 1000)}s）。请稍后重试；若持续失败，可在 Vercel → Functions → 区域改为东京(hnd1)/首尔(icn1)等离大陆更近的节点后再试。`
      : e instanceof Error
        ? e.message
        : String(e)
    return { statusCode: 502, body: { message: `抖音鉴权或门店查询失败：${detail}` } }
  }
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
    const u = new URL(DOUYIN_GOODS_CATEGORY_GET)
    u.searchParams.set('account_id', accountId)
    const qct = (url.searchParams.get('query_category_type') ?? '1').trim()
    u.searchParams.set('query_category_type', qct || '1')
    const cid = (url.searchParams.get('category_id') ?? '').trim()
    if (cid) u.searchParams.set('category_id', cid)

    const dr = await fetch(u.toString(), {
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
    const u = new URL(DOUYIN_GOODS_PRODUCT_ONLINE_QUERY)
    u.searchParams.set('account_id', accountId)
    const pn = (url.searchParams.get('product_name') ?? '').trim().slice(0, 30)
    if (pn) u.searchParams.set('product_name', pn)
    const count = Math.min(50, Math.max(1, Number(url.searchParams.get('count')) || 10))
    u.searchParams.set('count', String(count))
    const cursor = (url.searchParams.get('cursor') ?? '').trim()
    if (cursor) u.searchParams.set('cursor', cursor)
    const gqt = (url.searchParams.get('goods_query_type') ?? '2').trim()
    u.searchParams.set('goods_query_type', gqt || '2')
    const gct = (url.searchParams.get('goods_creator_type') ?? '').trim()
    if (gct) u.searchParams.set('goods_creator_type', gct)
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status) u.searchParams.set('status', status)

    const dr = await fetch(u.toString(), {
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
    const u = new URL(DOUYIN_GOODS_PRODUCT_DRAFT_QUERY)
    u.searchParams.set('account_id', accountId)
    const count = Math.min(50, Math.max(1, Number(url.searchParams.get('count')) || 20))
    u.searchParams.set('count', String(count))
    const cursor = (url.searchParams.get('cursor') ?? '').trim()
    if (cursor) u.searchParams.set('cursor', cursor)
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status) u.searchParams.set('status', status)

    const dr = await fetch(u.toString(), {
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
    const u = new URL(DOUYIN_GOODS_CATEGORY_GET)
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('query_category_type', '1')

    const dr = await fetch(u.toString(), {
      method: 'GET',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
    })
    const raw = await dr.text()
    const j = parseDouyinEnvelope(raw)
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
  const rt = (url.searchParams.get('relationType') ?? '').trim()
  let relationSpec: RelationSpec = 0
  if (rt === 'all') relationSpec = 'all'
  else if (rt === '1') relationSpec = 1
  else if (rt === '2') relationSpec = 2
  else if (rt === '0') relationSpec = 0

  const forceRefresh =
    url.searchParams.get('refresh') === '1' ||
    url.searchParams.get('sync') === '1' ||
    url.searchParams.get('force') === '1'

  try {
    const token = await ensureDouyinToken(session)
    const accountId = session.merchantId

    if (forceRefresh) {
      clearSessionPoiCache(auth)
    }

    const { pois: allPois } = await getCachedPoiList(auth, accountId, token, relationSpec, forceRefresh)

    const claimedBucket: unknown[] = []
    const claimingBucket: unknown[] = []
    for (const row of allPois) {
      if (rowIsClaiming(row)) claimingBucket.push(row)
      else claimedBucket.push(row)
    }

    const tabCounts = { claimed: claimedBucket.length, claiming: claimingBucket.length }
    const scopeBucket = claimScope === 'claiming' ? claimingBucket : claimedBucket

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

    json(res, 200, {
      accountName,
      tabCounts,
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

    const u = new URL(DOUYIN_SHOP_BRAND_QUERY_V2)
    u.searchParams.set('account_id', accountId)
    u.searchParams.set('page', String(page))
    u.searchParams.set('size', String(pageSize))
    if (keyword) {
      u.searchParams.set('keyword', keyword)
      u.searchParams.set('brand_name', keyword)
    }

    const dr = await fetch(u.toString(), {
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
  const rt = (url.searchParams.get('relationType') ?? '0').trim()
  let relationSpec: RelationSpec = 0
  if (rt === 'all') relationSpec = 'all'
  else if (rt === '1') relationSpec = 1
  else if (rt === '2') relationSpec = 2
  else if (rt === '0') relationSpec = 0

  const forceRefresh =
    url.searchParams.get('refresh') === '1' ||
    url.searchParams.get('sync') === '1' ||
    url.searchParams.get('force') === '1'

  try {
    const token = await ensureDouyinToken(session)
    const accountId = session.merchantId

    if (forceRefresh) {
      clearSessionPoiCache(auth)
    }

    const { pois: allPois } = await getCachedPoiList(auth, accountId, token, relationSpec, forceRefresh)
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
      message: '由 goodlife/v1/shop/poi/query 聚合的装修维度字段；独立装修状态接口接入后可替换数据源。',
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
    const token = await ensureDouyinToken(session)
    const accountId = session.merchantId
    const j = await shopPoiQuerySinglePoi(poiId, accountId, token)
    const data = j.data as Record<string, unknown> | undefined
    const pois = (data?.pois as unknown[]) ?? []
    if (!Array.isArray(pois) || pois.length === 0) {
      json(res, 404, { message: '未查询到该门店，请确认门店已关联当前账户且 poi_id 正确' })
      return
    }

    const cert = await poiCertInfoGet(poiId, accountId, token, accountId)
    let taskBody: Record<string, unknown> | undefined
    let taskQueryError: string | undefined
    if (taskIdList.length > 0) {
      const tq = await poiTaskQueryGet(taskIdList, token, accountId)
      if (tq.ok) {
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
      certInfo: cert.ok ? cert.body : undefined,
      certInfoError: cert.ok ? undefined : cert.message,
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
    const dr = await fetch(DOUYIN_POI_CLAIM, {
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

async function fetchTemplateProductAttrs(
  accountId: string,
  token: string,
  categoryId: string,
  productType: number,
): Promise<Record<string, unknown>[]> {
  if (!categoryId) return []
  const u = new URL(DOUYIN_GOODS_TEMPLATE_GET)
  u.searchParams.set('account_id', accountId)
  u.searchParams.set('category_id', categoryId)
  u.searchParams.set('product_type', String(productType))
  const dr = await fetch(u.toString(), {
    method: 'GET',
    headers: {
      'access-token': token,
      'content-type': 'application/json',
      'Rpc-Transit-Life-Account': accountId,
    },
  })
  const raw = await dr.text()
  const j = parseDouyinEnvelope(raw)
  if (!getDataError(j).ok) return []
  const data = j.data as Record<string, unknown> | undefined
  const arr = data?.product_attrs
  return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : []
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
): Promise<Record<string, unknown>> {
  const product_name = String(erp.product_name ?? '').trim()
  const desc = String(erp.product_desc ?? product_name).trim()
  const category_id = String(erp.category_id ?? '').trim()
  const product_type = Number(erp.product_type) || 1
  const out_id = String(erp.out_id ?? '').trim()
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

  const attrs = await fetchTemplateProductAttrs(accountId, token, category_id, product_type)
  const attr_key_value_map: Record<string, string> = {}
  const imageKey = pickProductImageAttrKey(attrs)
  if (imageKey && headUrls.length > 0) {
    attr_key_value_map[imageKey] = JSON.stringify(headUrls.slice(0, 30).map((url) => ({ url })))
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
    sold_start_time: nowMs,
    sold_end_time: oneYearMs,
    pois: poi_ids.map((poi_id) => ({ poi_id })),
  }
  if (Object.keys(attr_key_value_map).length > 0) {
    product.attr_key_value_map = attr_key_value_map
  }
  if (product_id_existing) {
    product.product_id = product_id_existing
  }

  const sku: Record<string, unknown> = {
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
    const saveBody = await buildGoodlifeProductSaveBody(accountId, token, erp, mode)

    const dr = await fetch(DOUYIN_GOODS_PRODUCT_SAVE, {
      method: 'POST',
      headers: {
        'access-token': token,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': accountId,
      },
      body: JSON.stringify(saveBody),
    })
    const raw = await dr.text()
    const j = parseDouyinEnvelope(raw)
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
      const u = new URL(DOUYIN_HERMES_TRADE_ORDER_QUERY)
      u.searchParams.set('account_id', accountId)
      u.searchParams.set('page_num', String(page))
      u.searchParams.set('page_size', String(pageSize))
      u.searchParams.set('create_order_start_time', String(rng.startSec))
      u.searchParams.set('create_order_end_time', String(rng.endSec))
      u.searchParams.set('get_secret_number', 'false')

      const dr = await fetch(u.toString(), {
        method: 'GET',
        headers: {
          'access-token': token,
          'content-type': 'application/json',
          'Rpc-Transit-Life-Account': accountId,
        },
      })
      const raw = await dr.text()
      const j = parseDouyinEnvelope(raw)
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
      const u = new URL(DOUYIN_AKTE_COMMENT_QUERY)
      u.searchParams.set('account_id', accountId)
      u.searchParams.set('start_time', String(startSec))
      u.searchParams.set('end_time', String(nowSec))
      u.searchParams.set('cursor', cursor)
      u.searchParams.set('count', '100')

      const dr = await fetch(u.toString(), {
        method: 'GET',
        headers: {
          'access-token': accessToken,
          'content-type': 'application/json',
          'Rpc-Transit-Life-Account': accountId,
        },
      })
      const raw = await dr.text()
      const j = parseDouyinEnvelope(raw)
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
    const dr = await fetch(DOUYIN_AKTE_COMMENT_REPLY, {
      method: 'POST',
      headers: {
        'access-token': accessToken,
        'content-type': 'application/json',
        'Rpc-Transit-Life-Account': session.merchantId,
      },
      body: JSON.stringify(body),
    })
    const raw = await dr.text()
    const j = parseDouyinEnvelope(raw)
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

