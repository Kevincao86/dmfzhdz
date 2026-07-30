/**
 * 多平台「店铺装修」列表：经网关代理各平台门店装修 / 装修状态查询等 OpenAPI。
 *
 * - 抖音来客：优先 GET `/api/meoo-douyin-store-decoration`（与 ping 同级），再回退 `/api/merchant/douyin/store-decoration`
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

function responseLooksLikeHtml(text: string, contentType: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('<') || /text\/html/i.test(contentType)
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
    const qs = `?${q}`
    const decorationPaths =
      tab === 'douyin'
        ? ([`/api/meoo-douyin-store-decoration${qs}`, `/api/merchant/${segment}/store-decoration${qs}`] as const)
        : ([`/api/merchant/${segment}/store-decoration${qs}`] as const)

    let res: Response | null = null
    let rawText = ''
    for (const path of decorationPaths) {
      const r = await fetch(url(path), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      const text = await r.text()
      const ct = r.headers.get('content-type') ?? ''
      if (r.ok && responseLooksLikeHtml(text, ct)) continue
      res = r
      rawText = text
      break
    }

    let data: Record<string, unknown> = {}
    try {
      data = (JSON.parse(rawText || '{}') as Record<string, unknown>) ?? {}
    } catch {
      data = {}
    }

    if (!res) {
      return {
        ok: false,
        message:
          '店铺装修列表接口返回了网页而非 JSON（已尝试 meoo 路径）。请确认已部署 api/meoo-douyin-store-decoration。',
      }
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

export type DouyinPoiDecorateResult =
  | {
      ok: true
      message: string
      taskIds: string[]
      poiIds: string[]
    }
  | { ok: false; message: string }

/**
 * 提交抖音门店装修（五连图头图）。
 * 优先 POST `/api/meoo-douyin-poi-decorate`，回退 `/api/merchant/douyin/store-decoration/decorate`。
 * 图片须为 https 公网 URL（可先走现有商品图上传拿到 URL，不改商品 save）。
 */
export async function postDouyinPoiDecorate(params: {
  poiId: string
  thirdId?: string
  headImages: string[]
  waitTask?: boolean
}): Promise<DouyinPoiDecorateResult> {
  const token = storeTabToken('douyin')
  if (!token) {
    return { ok: false, message: '请先在「系统 → 商家版后台」完成抖音来客绑定。' }
  }
  const poiId = params.poiId.trim()
  if (!poiId) return { ok: false, message: '请选择要装修的门店（poiId）' }
  const headImages = params.headImages.map((u) => u.trim()).filter((u) => /^https:\/\//i.test(u))
  if (headImages.length === 0) {
    return { ok: false, message: '五连图须先上传为 https 公网地址后再提交装修' }
  }

  const body = JSON.stringify({
    poiId,
    thirdId: (params.thirdId ?? poiId).trim() || poiId,
    headImages,
    waitTask: params.waitTask !== false,
  })

  const paths = [
    '/api/meoo-douyin-poi-decorate',
    '/api/merchant/douyin/store-decoration/decorate',
  ] as const

  let lastStatus = 0
  let lastMsg = ''
  for (const path of paths) {
    try {
      const res = await fetch(url(path), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body,
      })
      lastStatus = res.status
      const text = await res.text()
      const ct = res.headers.get('content-type') ?? ''
      if (res.ok && responseLooksLikeHtml(text, ct)) continue
      if (res.status === 404 && responseLooksLikeHtml(text, ct)) continue
      let data: Record<string, unknown> = {}
      try {
        data = (JSON.parse(text || '{}') as Record<string, unknown>) ?? {}
      } catch {
        data = {}
      }
      if (!res.ok) {
        lastMsg =
          (typeof data.message === 'string' && data.message) ||
          (typeof data.error === 'string' && data.error) ||
          `HTTP ${res.status}`
        if (res.status === 404) continue
        return { ok: false, message: lastMsg }
      }
      if (data.ok === false) {
        return {
          ok: false,
          message: (typeof data.message === 'string' && data.message) || '装修提交失败',
        }
      }
      const taskIds = Array.isArray(data.taskIds)
        ? data.taskIds.map((x) => String(x).trim()).filter(Boolean)
        : []
      const poiIds = Array.isArray(data.poiIds)
        ? data.poiIds.map((x) => String(x).trim()).filter(Boolean)
        : [poiId]
      return {
        ok: true,
        message:
          (typeof data.message === 'string' && data.message) ||
          '已提交抖音门店装修任务',
        taskIds,
        poiIds,
      }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : '网络错误'
    }
  }
  return {
    ok: false,
    message:
      lastMsg ||
      (lastStatus === 404
        ? '装修接口 404：请部署含 meoo-douyin-poi-decorate 的版本'
        : '装修提交失败'),
  }
}
