/**
 * 各平台「创建商品 / 上品」由后端网关代理开放平台接口。
 * 此处为 ERP 与网关约定路径；具体字段以后端与抖音/美团/小红书 OpenAPI 对齐为准。
 */

import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { createPlatformApiSegment, createPlatformLabel } from '../constants/productCreatePlatforms'
import { readMerchantSession } from '../lib/merchantSession'
import {
  loadDraftDetailSnapshot,
  renameDraftDetailSnapshotKey,
  saveDraftDetailSnapshot,
} from '../lib/productDraftSnapshot'
import {
  loadProductEditLibrary,
  replaceProductEditLibraryRowId,
  upsertProductEditLibraryFromApi,
} from '../lib/productEditLibrary'
import {
  isLikelyRouteMiss404,
  merchantApiFetchUrlCandidates,
  postDouyinGoodsProductSave,
  postDouyinGoodsProductSync,
  type DouyinProductDetailPayload,
} from './douyinProductApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

const TOKEN_KEYS: Record<CreatePlatformId, string> = {
  douyin: 'meoo_douyin_merchant_token',
  meituan: 'meoo_meituan_merchant_token',
  xiaohongshu: 'meoo_xhs_merchant_token',
  jd: 'meoo_jd_merchant_token',
}

/** 与 `readMerchantSession` 一致：抖音来客 token 在 localStorage，其它平台多在 sessionStorage */
function readToken(platform: CreatePlatformId): string | null {
  const key = TOKEN_KEYS[platform]
  return readMerchantSession(key)
}

export type ProductDraftPayload = {
  title: string
  /** 单位：元，提交时由网关决定是否转分 */
  priceYuan: number
  description?: string
}

export type ProductDraftResult =
  | { ok: true; draftId?: string; message?: string }
  | { ok: false; message: string }

/**
 * 提交商品草稿，触发网关调用对应平台「创建商品」类接口完成上品参数落库/同步。
 */
export async function postPlatformProductDraft(
  platform: CreatePlatformId,
  payload: ProductDraftPayload,
): Promise<ProductDraftResult> {
  if (platform === 'jd') {
    return { ok: false, message: '京东本地生活暂未接入上品接口' }
  }
  const token = readToken(platform)
  if (!token) {
    return { ok: false, message: '未找到平台授权，请先在系统设置中完成绑定' }
  }
  const seg = createPlatformApiSegment(platform)
  const res = await fetch(url(`/api/merchant/${seg}/product/draft`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      title: payload.title.trim(),
      priceYuan: payload.priceYuan,
      description: payload.description?.trim() || undefined,
    }),
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
  const draftId = typeof data.draftId === 'string' ? data.draftId : undefined
  const message = typeof data.message === 'string' ? data.message : undefined
  return { ok: true, draftId, message }
}

export type MerchantProductListItem = {
  id: string
  name: string
  price: number
  store: string
  status: string
  platform: string
}

export type MerchantProductListResult =
  | { ok: true; items: MerchantProductListItem[]; total: number; message?: string }
  | { ok: false; message: string }

/**
 * 商品列表查询（网关代理各平台「商品管理 / 商品查询」类 OpenAPI）。
 * 路径：`GET /api/merchant/{douyin|meituan|xhs}/goods/products`
 */
export async function fetchMerchantProductList(
  platform: CreatePlatformId,
  opts?: { page?: number; pageSize?: number; full?: boolean },
): Promise<MerchantProductListResult> {
  if (platform === 'jd') {
    return { ok: true, items: [], total: 0, message: '京东本地生活商品列表尚未接入' }
  }
  const token = readToken(platform)
  if (!token) {
    return {
      ok: true,
      items: [],
      total: 0,
      message:
        '未检测到平台授权，无法拉取线上商品；下方仍会展示本机在「创建商品」中「保存草稿」写入的条目。绑定后可刷新获取来客侧列表。',
    }
  }
  const seg = createPlatformApiSegment(platform)
  const page = Math.max(1, opts?.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, opts?.pageSize ?? 20))
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (opts?.full) q.set('full', '1')
  const qs = `?${q}`
  const paths =
    platform === 'douyin'
      ? ([`/api/meoo-douyin-goods-products${qs}`, `/api/merchant/${seg}/goods/products${qs}`] as const)
      : ([`/api/merchant/${seg}/goods/products${qs}`] as const)
  const targets = platform === 'douyin' ? merchantApiFetchUrlCandidates(paths) : [url(paths[0]!)]

  let res: Response | null = null
  let bodyText = ''
  let lastStatus = 0
  for (const target of targets) {
    const r = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    lastStatus = r.status
    const text = await r.text()
    const trim = text.trimStart()
    const ct = r.headers.get('content-type') ?? ''
    if (platform === 'douyin' && isLikelyRouteMiss404(r, trim, ct)) continue
    res = r
    bodyText = text
    break
  }
  if (!res) {
    return {
      ok: false,
      message: `商品列表接口无法访问（HTTP ${lastStatus || 404}）：请部署含 /api/meoo-douyin-goods-products 的版本，或检查 VITE_MERCHANT_API_BASE_URL 是否指向含该路由的站点。`,
    }
  }

  let data: Record<string, unknown> = {}
  try {
    data = (JSON.parse(bodyText || '{}') || {}) as Record<string, unknown>
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  const d = data.data as Record<string, unknown> | undefined
  const raw = d?.items
  const items: MerchantProductListItem[] = []
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      const id = String(o.id ?? '').trim()
      const name = String(o.name ?? '').trim()
      if (!id || !name) continue
      const price = Number(o.price)
      items.push({
        id,
        name,
        price: Number.isFinite(price) ? price : 0,
        store: String(o.store ?? '—'),
        status: String(o.status ?? '—'),
        platform: String(o.platform ?? createPlatformLabel(platform)),
      })
    }
  }
  const total = typeof d?.total === 'number' ? d.total : items.length
  const message = typeof data.message === 'string' ? data.message : undefined
  return { ok: true, items, total, message }
}

export type MerchantProductSyncResult = { ok: true; message?: string } | { ok: false; message: string }

function sanitizeDetailForResave(detail: DouyinProductDetailPayload): DouyinProductDetailPayload {
  const out = String(detail.out_id ?? '').trim()
  const pid = typeof detail.product_id === 'string' ? detail.product_id.trim() : ''
  if (
    !pid ||
    pid === out ||
    pid.startsWith('erp-') ||
    pid.startsWith('demo-product-')
  ) {
    const { product_id: _drop, ...rest } = detail
    return rest as DouyinProductDetailPayload
  }
  return detail
}

/** 从平台拉取单商品信息与状态（行内「同步」） */
export async function pullMerchantProductFromPlatform(
  platform: CreatePlatformId,
  productId: string,
): Promise<MerchantProductSyncResult> {
  if (platform !== 'douyin') {
    return { ok: false, message: '当前仅抖音来客支持从平台拉取商品，其它平台请稍后再试。' }
  }
  const token = readToken(platform)
  if (!token) {
    return { ok: false, message: '未找到平台授权' }
  }
  const id = productId.trim()
  const pullRes = await postDouyinGoodsProductSync(id)
  if (!pullRes.ok) {
    return { ok: false, message: pullRes.message }
  }
  if (pullRes.item) {
    upsertProductEditLibraryFromApi(pullRes.item, 'douyin')
  }
  if (pullRes.detail) {
    saveDraftDetailSnapshot(id, pullRes.detail as DouyinProductDetailPayload)
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
  return { ok: true, message: pullRes.message ?? '已从平台拉取该商品最新信息与状态' }
}

/** 全平台批量拉取商品列表（在售、审核中、已驳回、已下架等）并写入本地库 */
export async function syncAllMerchantProductsFromPlatforms(): Promise<MerchantProductSyncResult> {
  const platforms: CreatePlatformId[] = ['douyin', 'meituan', 'xiaohongshu']
  let count = 0
  const notes: string[] = []
  for (const platform of platforms) {
    const r = await fetchMerchantProductList(platform, { page: 1, pageSize: 50, full: true })
    if (!r.ok) {
      notes.push(`${createPlatformLabel(platform)}：${r.message}`)
      continue
    }
    if (r.message) notes.push(`${createPlatformLabel(platform)}：${r.message}`)
    for (const item of r.items) {
      upsertProductEditLibraryFromApi(item, platform)
      count++
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
  if (count === 0 && notes.length > 0) {
    return { ok: false, message: notes.join('；') }
  }
  return {
    ok: true,
    message:
      count > 0
        ? `已同步 ${count} 个商品（含各平台在售、审核中、已驳回、已下架等状态）${notes.length ? `。${notes.join('；')}` : ''}`
        : notes.join('；') || '未拉取到商品，请确认平台授权后重试',
  }
}

export type MerchantProductShelfResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

/** 上下架并同步至抖音来客 */
export async function postMerchantProductShelfOperate(
  platform: CreatePlatformId,
  productId: string,
  shelf: 'online' | 'offline',
): Promise<MerchantProductShelfResult> {
  if (platform !== 'douyin') {
    return { ok: false, message: '当前仅抖音来客支持上下架操作' }
  }
  const token = readToken(platform)
  if (!token) {
    return { ok: false, message: '未找到平台授权' }
  }
  const id = productId.trim()
  const op_type = shelf === 'online' ? 1 : 2
  const bodyStr = JSON.stringify({ product_id: id, op_type })
  const paths = [
    '/api/meoo-douyin-goods-product-operate',
    '/api/merchant/douyin/goods/product/operate',
  ] as const
  const targets = merchantApiFetchUrlCandidates(paths)
  let lastStatus = 0
  for (const target of targets) {
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
        message:
          (typeof data.message === 'string' && data.message) ||
          `上下架失败 HTTP ${res.status}`,
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
  return {
    ok: false,
    message:
      lastStatus === 404
        ? '上下架接口返回 404：请部署含 /api/meoo-douyin-goods-product-operate 的版本'
        : `HTTP ${lastStatus || 404}`,
  }
}

/** 将本地编辑结果推送至平台（保存草稿快照；编辑页等场景使用） */
export async function pushMerchantProductToPlatform(
  platform: CreatePlatformId,
  productId: string,
): Promise<MerchantProductSyncResult> {
  if (platform !== 'douyin') {
    return { ok: false, message: '当前仅抖音来客支持推送，其它平台请稍后再试或联系管理员。' }
  }
  const token = readToken(platform)
  if (!token) {
    return { ok: false, message: '未找到平台授权' }
  }
  const id = productId.trim()

  const snapshot = loadDraftDetailSnapshot(id)
  if (snapshot) {
    const detail = sanitizeDetailForResave({ ...snapshot })
    const saveRes = await postDouyinGoodsProductSave({ mode: 'draft', detail })
    if (!saveRes.ok) {
      return { ok: false, message: saveRes.message }
    }
    const newPid = saveRes.product_id?.trim()
    if (newPid && newPid !== id) {
      const libRow = loadProductEditLibrary().find((r) => r.id === id)
      if (libRow) {
        replaceProductEditLibraryRowId(id, { ...libRow, id: newPid })
      }
      renameDraftDetailSnapshotKey(id, newPid)
    }
    try {
      window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
    } catch {
      /* ignore */
    }
    return {
      ok: true,
      message:
        saveRes.message ??
        '已根据本地草稿快照提交至抖音来客（goodlife/v1/goods/product/save）。',
    }
  }

  return {
    ok: false,
    message: '未找到本地商品快照，请进入编辑页保存后再推送。',
  }
}

/** @deprecated 行内同步请使用 pullMerchantProductFromPlatform */
export async function postMerchantProductSync(
  platform: CreatePlatformId,
  productId: string,
): Promise<MerchantProductSyncResult> {
  return pullMerchantProductFromPlatform(platform, productId)
}
