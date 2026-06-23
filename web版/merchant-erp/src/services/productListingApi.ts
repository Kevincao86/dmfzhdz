/**
 * 创建商品草稿 / 推送 — 商品列表见 merchantProductListApi.ts
 */

import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { createPlatformApiSegment } from '../constants/productCreatePlatforms'
import { readMerchantSession } from '../lib/merchantSession'
import {
  loadProductEditLibrary,
  replaceProductEditLibraryRowId,
} from '../lib/productEditLibrary'
import { loadDraftDetailSnapshot, renameDraftDetailSnapshotKey } from '../lib/productDraftSnapshot'
import {
  postDouyinGoodsProductSave,
  type DouyinProductDetailPayload,
} from './douyinProductApi'
import { postKuaishouGoodsProductSave } from './kuaishouProductApi'

export type {
  MerchantProductListItem,
  MerchantProductListResult,
  MerchantProductShelfResult,
  MerchantProductSyncResult,
  PlatformSyncOutcome,
} from './merchantProductListApi'
export {
  fetchMerchantProductList,
  formatPlatformSyncSummary,
  postMerchantProductShelfOperate,
  postMerchantProductSync,
  pullMerchantProductFromPlatform,
  syncAllMerchantProductsFromPlatforms,
} from './merchantProductListApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
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

function readToken(platform: CreatePlatformId): string | null {
  return readMerchantSession(TOKEN_KEYS[platform])
}

export type ProductDraftPayload = {
  title: string
  priceYuan: number
  description?: string
}

export type ProductDraftResult =
  | { ok: true; draftId?: string; message?: string }
  | { ok: false; message: string }

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

const GROUPBUY_GOODS_PLATFORMS = new Set<CreatePlatformId>(['douyin', 'kuaishou'])

function sanitizeDetailForResave(detail: DouyinProductDetailPayload): DouyinProductDetailPayload {
  const out = String(detail.out_id ?? '').trim()
  const pid = typeof detail.product_id === 'string' ? detail.product_id.trim() : ''
  if (!pid || pid === out || pid.startsWith('erp-') || pid.startsWith('demo-product-')) {
    const { product_id: _drop, ...rest } = detail
    return rest as DouyinProductDetailPayload
  }
  return detail
}

export async function pushMerchantProductToPlatform(
  platform: CreatePlatformId,
  productId: string,
): Promise<{ ok: true; message?: string } | { ok: false; message: string }> {
  if (!GROUPBUY_GOODS_PLATFORMS.has(platform)) {
    return { ok: false, message: '当前仅抖音来客与快手团购支持推送' }
  }
  const token = readToken(platform)
  if (!token) return { ok: false, message: '未找到平台授权' }
  const id = productId.trim()
  const snapshot = loadDraftDetailSnapshot(id)
  if (!snapshot) {
    return { ok: false, message: '未找到本地商品快照，请进入编辑页保存后再推送。' }
  }
  const detail = sanitizeDetailForResave({ ...snapshot })
  const saveRes =
    platform === 'kuaishou'
      ? await postKuaishouGoodsProductSave({ mode: 'draft', detail })
      : await postDouyinGoodsProductSave({ mode: 'draft', detail })
  if (!saveRes.ok) return { ok: false, message: saveRes.message }
  const newPid = saveRes.product_id?.trim()
  if (newPid && newPid !== id) {
    const libRow = loadProductEditLibrary().find((r) => r.id === id)
    if (libRow) replaceProductEditLibraryRowId(id, { ...libRow, id: newPid })
    renameDraftDetailSnapshotKey(id, newPid)
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
  return { ok: true, message: saveRes.message ?? '已提交至平台' }
}
