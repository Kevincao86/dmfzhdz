/** 商品列表本地草稿库：创建商品「保存草稿」成功后写入，供 /products/list 与各平台 Tab 合并展示 */

import { tenantLocalKey } from './tenantLocalState'

export const MEOO_PRODUCT_EDIT_LIBRARY_KEY = 'meoo_product_edit_library_v1'

function libraryStorageKey(): string {
  return tenantLocalKey(MEOO_PRODUCT_EDIT_LIBRARY_KEY)
}

export type ProductEditLibraryRow = {
  id: string
  name: string
  platform: string
  store: string
  status: string
  price: number
  /** 与 `CreatePlatformId` 一致，用于商品列表按平台 Tab 过滤 */
  platformApi?: 'douyin' | 'meituan' | 'xiaohongshu' | 'jd'
}

/** 商品列表/创建页「草稿」状态，用于 Brief 向导等拉取本地草稿箱 */
function isDraftBoxStatus(status: string): boolean {
  const s = status.trim()
  return s === '草稿' || s.includes('草稿')
}

/**
 * 从 ERP 商品草稿库（创建商品保存草稿写入的本地库）生成 Brief 可选商品。
 * 草稿箱**不按**「线上搜索关键词」过滤，避免与商品列表不一致；关键词仅用于向导内抖音线上查询。
 */
export function loadProductEditLibraryDraftBriefPicks(limit = 48): {
  id: string
  name: string
  priceYuan: number
  source: 'erp_draftbox'
}[] {
  const rows = loadProductEditLibrary().filter((r) => isDraftBoxStatus(r.status))
  return rows.slice(0, limit).map((r) => ({
    id: `erp-draft:${r.id}`,
    name: r.name,
    priceYuan: Math.max(0, Math.round(Number(r.price) || 0)),
    source: 'erp_draftbox' as const,
  }))
}

export function loadProductEditLibrary(): ProductEditLibraryRow[] {
  try {
    const raw = window.localStorage.getItem(libraryStorageKey())
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    const out: ProductEditLibraryRow[] = []
    for (const x of arr) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      const id = String(o.id ?? '').trim()
      const name = String(o.name ?? '').trim()
      if (!id || !name) continue
      const price = Number(o.price)
      const api = o.platformApi
      out.push({
        id,
        name,
        platform: String(o.platform ?? '抖音来客').trim() || '抖音来客',
        store: String(o.store ?? '—').trim() || '—',
        status: String(o.status ?? '草稿').trim() || '草稿',
        price: Number.isFinite(price) ? price : 0,
        ...(api === 'douyin' || api === 'meituan' || api === 'xiaohongshu' || api === 'jd'
          ? { platformApi: api }
          : {}),
      })
    }
    return out
  } catch {
    return []
  }
}

function persist(rows: ProductEditLibraryRow[]) {
  try {
    window.localStorage.setItem(libraryStorageKey(), JSON.stringify(rows))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('meoo-product-edit-library-changed'))
  } catch {
    /* ignore */
  }
}

/** 按 id 覆盖或插入到列表头部（草稿再次保存则更新） */
export function upsertProductEditLibraryDraft(row: ProductEditLibraryRow): void {
  const prev = loadProductEditLibrary()
  const idx = prev.findIndex((p) => p.id === row.id)
  const next =
    idx >= 0
      ? [...prev.slice(0, idx), { ...prev[idx], ...row }, ...prev.slice(idx + 1)]
      : [row, ...prev]
  persist(next)
}

/** 将列表中的旧 id 换为平台 product_id（去重后置顶） */
export function updateProductEditLibraryRow(
  id: string,
  patch: Partial<ProductEditLibraryRow>,
): void {
  const key = id.trim()
  if (!key) return
  const prev = loadProductEditLibrary()
  const idx = prev.findIndex((p) => p.id === key)
  if (idx < 0) return
  const next = [...prev]
  next[idx] = { ...next[idx]!, ...patch, id: key }
  persist(next)
}

/** 从平台商品列表同步结果写入/更新本地库（按 id 去重） */
export function upsertProductEditLibraryFromApi(
  item: {
    id: string
    name: string
    price: number
    store: string
    status: string
    platform: string
  },
  platformApi: ProductEditLibraryRow['platformApi'],
): void {
  if (!item.id.trim() || !item.name.trim() || !platformApi) return
  upsertProductEditLibraryDraft({
    id: item.id.trim(),
    name: item.name.trim(),
    platform: item.platform.trim() || '抖音来客',
    store: item.store.trim() || '—',
    status: item.status.trim() || '—',
    price: Number.isFinite(item.price) ? item.price : 0,
    platformApi,
  })
}

export function replaceProductEditLibraryRowId(oldId: string, row: ProductEditLibraryRow): void {
  const o = oldId.trim()
  if (!o) return
  const prev = loadProductEditLibrary()
  const next = prev.filter((p) => p.id !== o && p.id !== row.id)
  persist([row, ...next])
}
