/**
 * 多平台「店铺装修」列表：经网关代理各平台门店装修 / 装修状态查询等 OpenAPI。
 *
 * - 抖音来客：由后端聚合门店查询 + 装修能力相关接口
 * - 美团 / 小红书：`GET /api/merchant/{meituan|xhs}/store-decoration`
 *
 * Query：`page`, `pageSize`, `keyword?`；Header：`Authorization: Bearer <token>`
 */

import { storeTabApiSegment, storeTabToken, type StorePlatformTab } from './merchantStoresApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type StoreDecorationRow = {
  id: string
  name: string
  auditStatus?: string
  optimization?: string
  storeInfoStatus?: string
  staffDisplay?: string
  coverImageUrl?: string
  albumCount?: number
  signatureDishes?: string
  announcement?: string
}

export type StoreDecorationListResult =
  | { ok: true; items: StoreDecorationRow[]; total: number }
  | { ok: false; message: string }

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined
}

function rowsFromPayload(data: Record<string, unknown>): unknown[] {
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.list)) return data.list
  if (Array.isArray(data.rows)) return data.rows
  const inner = data.data
  if (inner && typeof inner === 'object') {
    const d = inner as Record<string, unknown>
    if (Array.isArray(d.items)) return d.items
    if (Array.isArray(d.list)) return d.list
    if (Array.isArray(d.decorations)) return d.decorations
  }
  return []
}

function normalizeDecorationRow(row: unknown): StoreDecorationRow {
  if (!row || typeof row !== 'object') {
    return { id: '-', name: '（无效数据）' }
  }
  const o = row as Record<string, unknown>
  const id = String(o.id ?? o.shopId ?? o.poiId ?? o.storeId ?? o.poi_id ?? '')
  const name = String(o.name ?? o.shopName ?? o.storeName ?? o.poi_name ?? '未命名门店')
  return {
    id: id || '-',
    name,
    auditStatus: str(o.auditStatus ?? o.audit_status ?? o.shop_audit_status),
    optimization: str(o.optimization ?? o.optimization_suggestion),
    storeInfoStatus: str(o.storeInfoStatus ?? o.store_info_status ?? o.poi_info_status),
    staffDisplay: str(o.staffDisplay ?? o.staff_display_status),
    coverImageUrl: str(o.coverImageUrl ?? o.cover_url ?? o.thumb_url),
    albumCount: num(o.albumCount ?? o.album_count ?? o.image_count),
    signatureDishes: str(o.signatureDishes ?? o.signature_dishes),
    announcement: str(o.announcement ?? o.notice),
  }
}

export async function fetchStoreDecorationsForPlatform(
  tab: StorePlatformTab,
  params: { page: number; pageSize: number; keyword?: string; refresh?: boolean },
): Promise<StoreDecorationListResult> {
  if (tab === 'jd') {
    return { ok: false, message: '京东本地生活门店装修接口尚未接入。' }
  }
  const token = storeTabToken(tab)
  if (!token) {
    return { ok: false, message: '请先在「系统 → 商家版后台」完成该平台绑定。' }
  }

  const q = new URLSearchParams({
    page: String(params.page),
    pageSize: String(Math.min(100, Math.max(1, params.pageSize))),
  })
  const kw = params.keyword?.trim()
  if (kw) q.set('keyword', kw)
  if (params.refresh) q.set('sync', '1')

  const segment = storeTabApiSegment(tab)
  try {
    const res = await fetch(url(`/api/merchant/${segment}/store-decoration?${q}`), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
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
    const raw = rowsFromPayload(data)
    const items = raw.map(normalizeDecorationRow)
    const total =
      num(data.total) ??
      num(data.totalCount) ??
      (data.data && typeof data.data === 'object'
        ? num((data.data as Record<string, unknown>).total)
        : undefined) ??
      items.length
    return { ok: true, items, total }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '网络错误'
    return { ok: false, message: msg }
  }
}
