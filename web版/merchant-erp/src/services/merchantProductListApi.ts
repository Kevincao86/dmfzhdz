/**
 * 商品列表（各平台）— 与「创建商品」分离；抖音走后端 douyinGoodsListCore + online.query 文档。
 */

import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { createPlatformApiSegment, createPlatformLabel } from '../constants/productCreatePlatforms'
import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { readMerchantSession } from '../lib/merchantSession'
import { upsertProductEditLibraryFromApi } from '../lib/productEditLibrary'
import { saveDraftDetailSnapshot } from '../lib/productDraftSnapshot'
import {
  isLikelyHtmlApiResponse,
  isLikelyRouteMiss404,
  postDouyinGoodsProductSync,
  shouldRetryMerchantApiFetchTarget,
  type DouyinProductDetailPayload,
} from './douyinProductApi'
import {
  postKuaishouGoodsProductSync,
  type KuaishouProductDetailPayload,
} from './kuaishouProductApi'

const GROUPBUY_GOODS_PLATFORMS = new Set<CreatePlatformId>(['douyin', 'kuaishou'])

/** 已授权且接口成功但 0 条时，列表/同步统一提示，勿误报「未授权」 */
export const EMPTY_ONLINE_PRODUCTS_MSG = '线上无商品'

function isMisleadingEmptyListNote(message: string): boolean {
  const m = message.trim()
  if (!m) return false
  /** 仅过滤历史固定排查模板；含 error_code/权限/scope 的为真实 API 警告，须展示 */
  if (/error_code|无权限|未授权|scope|权限不足|access.?denied/i.test(m)) return false
  if (/^OpenAPI\s*未返回/.test(m)) return true
  if (/^未返回商品[，。]?/.test(m) && !/：/.test(m)) return true
  if (/第三方应用.*未拉到/.test(m)) return true
  if (/服务应用授权/.test(m) && !/失败|拒绝|无效/.test(m)) return true
  return false
}

function joinListDiagnostics(message?: string, warnings?: unknown): string | undefined {
  const parts: string[] = []
  const note = message?.trim()
  if (note && !isMisleadingEmptyListNote(note)) parts.push(note)
  if (Array.isArray(warnings)) {
    for (const w of warnings) {
      const s = String(w ?? '').trim()
      if (s && !parts.includes(s) && !isMisleadingEmptyListNote(s)) parts.push(s)
    }
  }
  return parts.length ? parts.join('；') : undefined
}

/** 0 条商品时的展示文案：优先 API 警告（权限/Scope），避免误报「线上无商品」 */
function emptyListOutcomeMessage(rawMessage?: string): string {
  const note = compactSyncUserMessage(rawMessage)
  if (note && !isMisleadingEmptyListNote(note)) return note
  return EMPTY_ONLINE_PRODUCTS_MSG
}

/** 同步 toast 勿展示整段 OpenAPI JSON */
function compactSyncUserMessage(message?: string): string | undefined {
  const m = message?.trim()
  if (!m) return undefined
  if (m.length <= 240 && !/(\{|\[)\s*"/.test(m.slice(120))) return m
  const jsonIdx = m.search(/[\[{]\s*"/)
  if (jsonIdx > 0 && jsonIdx < 400) return `${m.slice(0, jsonIdx).replace(/[：:；;]\s*$/, '').trim()}（已省略原始 JSON）`
  if (m.length > 240) return `${m.slice(0, 237)}…`
  return m
}

/** 成功拉取但 0 条：不向上层传递易误导的排查文案（兼容旧版后端/缓存 bundle） */
function normalizeEmptyListMessage(
  items: MerchantProductListItem[],
  message?: string,
): string | undefined {
  if (items.length > 0) return message?.trim() || undefined
  const note = message?.trim()
  if (!note || isMisleadingEmptyListNote(note)) return undefined
  return note
}

const TOKEN_KEYS: Record<CreatePlatformId, string> = {
  douyin: 'meoo_douyin_merchant_token',
  kuaishou: 'meoo_kuaishou_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xiaohongshu: 'meoo_xhs_merchant_token',
  jd: 'meoo_jd_merchant_token',
  eleme: 'meoo_eleme_merchant_token',
  meituan_waimai: 'meoo_meituan_waimai_merchant_token',
  jd_waimai: 'meoo_jd_waimai_merchant_token',
}

function readPlatformToken(platform: CreatePlatformId): string | null {
  return readMerchantSession(TOKEN_KEYS[platform])
}

function listApiPaths(platform: CreatePlatformId, qs: string): string[] {
  const seg = createPlatformApiSegment(platform)
  const flat =
    platform === 'douyin'
      ? `/api/meoo-douyin-goods-products${qs}`
      : platform === 'kuaishou'
        ? `/api/meoo-kuaishou-goods-products${qs}`
        : platform === 'meituan'
          ? `/api/meoo-meituan-goods-products${qs}`
          : platform === 'xiaohongshu'
            ? `/api/meoo-xhs-goods-products${qs}`
            : `/api/merchant/${seg}/goods/products${qs}`
  const nested = `/api/merchant/${seg}/goods/products${qs}`
  const out: string[] = []
  const add = (p: string) => {
    for (const u of merchantErpApiCandidates(p)) {
      if (!out.includes(u)) out.push(u)
    }
  }
  add(flat)
  if (flat !== nested) add(nested)
  return out
}

export type MerchantProductListItem = {
  id: string
  name: string
  price: number
  store: string
  /** 商品关联门店 poi_id（与 shop.query 对齐，用于按门店筛选） */
  poiIds?: string[]
  /** 头图 URL（列表 OpenAPI 或本地快照） */
  headImageUrl?: string
  status: string
  auditStatus: string
  saleStatus: string
  platform: string
}

export type MerchantProductListResult =
  | { ok: true; items: MerchantProductListItem[]; total: number; message?: string }
  | { ok: false; message: string }

function parseListItems(
  raw: unknown,
  platform: CreatePlatformId,
): MerchantProductListItem[] {
  if (!Array.isArray(raw)) return []
  const items: MerchantProductListItem[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const id = String(o.id ?? '').trim()
    const name = String(o.name ?? '').trim()
    if (!id || !name) continue
    const price = Number(o.price)
    const auditStatus = String(o.audit_status ?? o.status ?? '—')
    let saleStatus = String(o.sale_status ?? '').trim()
    if (!saleStatus) {
      const legacy = String(o.status ?? '')
      if (legacy === '在售' || legacy.includes('上架')) saleStatus = '上架中'
      else if (legacy === '已下架' || legacy === '封禁') saleStatus = '已下架'
      else saleStatus = '—'
    }
    const headImageUrl = (() => {
      const direct = String(o.head_image_url ?? o.headImageUrl ?? '').trim()
      if (/^https?:\/\//i.test(direct)) return direct
      return undefined
    })()
    items.push({
      id,
      name,
      price: Number.isFinite(price) ? price : 0,
      store: String(o.store ?? '—'),
      poiIds: (() => {
        const raw = o.poi_ids ?? o.poiIds
        if (!Array.isArray(raw)) return undefined
        const ids = raw.map((x) => String(x).trim()).filter(Boolean)
        return ids.length ? ids : undefined
      })(),
      ...(headImageUrl ? { headImageUrl } : {}),
      status: auditStatus,
      auditStatus,
      saleStatus,
      platform: String(o.platform ?? createPlatformLabel(platform)),
    })
  }
  return items
}

async function fetchListJson(
  platform: CreatePlatformId,
  qs: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; bodyText: string }> {
  const targets = listApiPaths(platform, qs)
  let lastStatus = 0
  let lastBody = ''
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!
    let r: Response
    try {
      r = await fetch(target, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/failed to fetch|network|aborted|timeout/i.test(msg) && i < targets.length - 1) continue
      return {
        ok: false,
        status: 0,
        data: {
          ok: false,
          message: `商品列表网络请求失败（${msg}）。请确认 /api/meoo-douyin-goods-products 或 /erp-api 可达。`,
        },
        bodyText: msg,
      }
    }
    lastStatus = r.status
    const text = await r.text()
    lastBody = text
    const trim = text.trimStart()
    const ct = r.headers.get('content-type') ?? ''
    if (isLikelyRouteMiss404(r, trim, ct) || isLikelyHtmlApiResponse(trim, ct)) {
      if (shouldRetryMerchantApiFetchTarget(r, text, i < targets.length - 1)) continue
    }
    if (shouldRetryMerchantApiFetchTarget(r, text, i < targets.length - 1)) continue
    let data: Record<string, unknown> = {}
    try {
      data = (JSON.parse(text || '{}') || {}) as Record<string, unknown>
    } catch {
      return { ok: false, status: r.status, data: {}, bodyText: text }
    }
    return { ok: r.ok, status: r.status, data, bodyText: text }
  }
  return { ok: false, status: lastStatus || 404, data: {}, bodyText: lastBody }
}

/**
 * 拉取平台商品列表（抖音：后端 goodlife online.query + draft.query）。
 */
export async function fetchMerchantProductList(
  platform: CreatePlatformId,
  opts?: { page?: number; pageSize?: number; full?: boolean },
): Promise<MerchantProductListResult> {
  if (platform === 'jd') {
    return { ok: true, items: [], total: 0, message: '京东本地生活商品列表尚未接入' }
  }

  const token = readPlatformToken(platform)
  if (!token) {
    return {
      ok: false,
      message: `未检测到${createPlatformLabel(platform)}授权，请先在系统设置绑定后再同步商品。`,
    }
  }

  const page = Math.max(1, opts?.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, opts?.pageSize ?? 20))
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (opts?.full) q.set('full', '1')

  const { ok, status, data } = await fetchListJson(platform, `?${q}`, token)

  if (data.ok === false) {
    const msg =
      (typeof data.message === 'string' && data.message.trim()) ||
      (typeof data.error === 'string' && data.error) ||
      `商品列表接口拒绝（HTTP ${status}）`
    return { ok: false, message: msg }
  }

  if (!ok) {
    const msg =
      (typeof data.message === 'string' && data.message) ||
      `商品列表 HTTP ${status}${status === 401 ? '：请重新绑定平台授权' : ''}`
    return { ok: false, message: msg }
  }

  const d = data.data as Record<string, unknown> | undefined
  const items = parseListItems(d?.items, platform)
  const total = typeof d?.total === 'number' ? d.total : items.length
  const rawMessage = typeof data.message === 'string' ? data.message : undefined
  const message = normalizeEmptyListMessage(
    items,
    joinListDiagnostics(rawMessage, d?.warnings ?? data.warnings),
  )

  return { ok: true, items, total, message }
}

export type MerchantProductSyncResult = { ok: true; message?: string } | { ok: false; message: string }

export async function pullMerchantProductFromPlatform(
  platform: CreatePlatformId,
  productId: string,
): Promise<MerchantProductSyncResult> {
  if (!GROUPBUY_GOODS_PLATFORMS.has(platform)) {
    return { ok: false, message: '当前仅抖音来客与快手团购支持从平台拉取商品' }
  }
  if (!readPlatformToken(platform)) {
    return { ok: false, message: '未找到平台授权' }
  }
  const id = productId.trim()
  const pullRes =
    platform === 'kuaishou'
      ? await postKuaishouGoodsProductSync(id)
      : await postDouyinGoodsProductSync(id)
  if (!pullRes.ok) return { ok: false, message: pullRes.message }
  if (pullRes.item) upsertProductEditLibraryFromApi(pullRes.item, platform)
  if (pullRes.detail) {
    saveDraftDetailSnapshot(
      id,
      pullRes.detail as DouyinProductDetailPayload | KuaishouProductDetailPayload,
    )
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
  return { ok: true, message: pullRes.message ?? '已从平台拉取该商品最新信息与状态' }
}

export type PlatformSyncOutcome = {
  platform: CreatePlatformId
  label: string
  ok: boolean
  count: number
  message: string
}

export function formatPlatformSyncSummary(outcomes: PlatformSyncOutcome[]): string {
  if (!outcomes.length) return '未执行同步'
  return outcomes
    .map((o) => {
      if (o.ok) {
        if (o.count > 0) return `${o.label}同步成功（${o.count} 个）`
        const note = compactSyncUserMessage(o.message)
        if (note && note !== EMPTY_ONLINE_PRODUCTS_MSG && !isMisleadingEmptyListNote(note)) {
          return `${o.label}：${note}`
        }
        return `${o.label}：${EMPTY_ONLINE_PRODUCTS_MSG}`
      }
      const failMsg = compactSyncUserMessage(o.message)
      return failMsg ? `${o.label}同步失败：${failMsg}` : `${o.label}同步失败`
    })
    .join('，')
}

export async function syncAllMerchantProductsFromPlatforms(): Promise<MerchantProductSyncResult> {
  const platforms: CreatePlatformId[] = [
    'douyin',
    'kuaishou',
    'meituan',
    'xiaohongshu',
    'eleme',
    'meituan_waimai',
    'jd_waimai',
  ]
  const boundPlatforms = platforms.filter((p) => readPlatformToken(p))
  if (!boundPlatforms.length) {
    return {
      ok: false,
      message: '未绑定任何平台，请先在系统设置完成授权后再同步商品。',
    }
  }
  const outcomes: PlatformSyncOutcome[] = []
  for (const platform of boundPlatforms) {
    const label = createPlatformLabel(platform)
    const r = await fetchMerchantProductList(platform, { page: 1, pageSize: 50, full: true })
    if (!r.ok) {
      outcomes.push({ platform, label, ok: false, count: 0, message: r.message })
      continue
    }
    let platformCount = 0
    for (const item of r.items) {
      upsertProductEditLibraryFromApi(item, platform)
      platformCount++
    }
    outcomes.push({
      platform,
      label,
      ok: true,
      count: platformCount,
      message:
        platformCount > 0
          ? r.message ?? `已同步 ${platformCount} 个`
          : emptyListOutcomeMessage(r.message),
    })
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
  const summary = formatPlatformSyncSummary(outcomes)
  const anyOk = outcomes.some((o) => o.ok)
  const anyFail = outcomes.some((o) => !o.ok)
  if (!anyOk && anyFail) return { ok: false, message: summary }
  return { ok: true, message: summary }
}

export type MerchantProductShelfResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

export async function postMerchantProductShelfOperate(
  platform: CreatePlatformId,
  productId: string,
  shelf: 'online' | 'offline',
): Promise<MerchantProductShelfResult> {
  if (!GROUPBUY_GOODS_PLATFORMS.has(platform)) {
    return { ok: false, message: '当前仅抖音来客与快手团购支持上下架操作' }
  }
  const token = readPlatformToken(platform)
  if (!token) return { ok: false, message: '未找到平台授权' }
  const id = productId.trim()
  const op_type = shelf === 'online' ? 1 : 2
  const bodyStr = JSON.stringify({ product_id: id, op_type })
  const paths =
    platform === 'kuaishou'
      ? (['/api/meoo-kuaishou-goods-product-operate', '/api/merchant/kuaishou/goods/product/operate'] as const)
      : (['/api/meoo-douyin-goods-product-operate', '/api/merchant/douyin/goods/product/operate'] as const)
  let lastStatus = 0
  for (const p of paths) {
    for (const target of merchantErpApiCandidates(p)) {
      const res = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: bodyStr,
      })
      lastStatus = res.status
      const text = await res.text()
      const trim = text.trimStart()
      const ct = res.headers.get('content-type') ?? ''
      if (isLikelyRouteMiss404(res, trim, ct)) continue
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(text || '{}') as Record<string, unknown>
      } catch {
        data = {}
      }
      if (!res.ok || data.ok === false) {
        return {
          ok: false,
          message: (typeof data.message === 'string' && data.message) || `上下架失败 HTTP ${res.status}`,
        }
      }
      const pull = await pullMerchantProductFromPlatform(platform, id)
      return {
        ok: true,
        message:
          (typeof data.message === 'string' ? data.message : shelf === 'online' ? '已上架' : '已下架') +
          (pull.ok ? '，已刷新本地状态' : `（${pull.message}）`),
      }
    }
  }
  return { ok: false, message: `上下架接口不可用 HTTP ${lastStatus || 404}` }
}

export async function postMerchantProductSync(
  platform: CreatePlatformId,
  productId: string,
): Promise<MerchantProductSyncResult> {
  return pullMerchantProductFromPlatform(platform, productId)
}
