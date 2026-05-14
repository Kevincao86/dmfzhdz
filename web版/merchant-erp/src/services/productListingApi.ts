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
} from '../lib/productDraftSnapshot'
import { loadProductEditLibrary, replaceProductEditLibraryRowId } from '../lib/productEditLibrary'
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
  opts?: { page?: number; pageSize?: number },
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

/** 将本地编辑结果同步至平台（演示：抖音；美团/小红书需网关对齐后扩展） */
export async function postMerchantProductSync(
  platform: CreatePlatformId,
  productId: string,
): Promise<MerchantProductSyncResult> {
  if (platform !== 'douyin') {
    return { ok: false, message: '当前仅抖音来客支持「同步」，其它平台请稍后再试或联系管理员。' }
  }
  const token = readToken(platform)
  if (!token) {
    return { ok: false, message: '未找到平台授权' }
  }
  const id = productId.trim()

  const syncRes = await postDouyinGoodsProductSync(id)
  if (syncRes.ok) {
    return { ok: true, message: syncRes.message }
  }
  const syncErr = syncRes.message

  const snapshot = loadDraftDetailSnapshot(id)
  if (snapshot) {
    const detail = sanitizeDetailForResave({ ...snapshot })
    const saveRes = await postDouyinGoodsProductSave({ mode: 'draft', detail })
    if (!saveRes.ok) {
      return { ok: false, message: `${syncErr}；尝试按本地快照重新保存失败：${saveRes.message}` }
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
        '已根据本地草稿快照重新提交至抖音来客（goodlife/v1/goods/product/save）。',
    }
  }

  return { ok: false, message: syncErr }
}
