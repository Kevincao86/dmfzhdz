/**
 * 抖音来客商品创建 — 经 ERP 网关代理的 OpenAPI 对齐路径。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/category.get
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save
 */

import { defaultGoodsQueryType } from '../lib/appEdition'
import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { readMerchantSession } from '../lib/merchantSession'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

/**
 * cs 等 ECS 静态站：`/erp-api` 反代轻量 auth-api 须优先；再试同源 `/api` 与 VITE 基址。
 */
export function merchantApiFetchUrlCandidates(paths: readonly string[]): string[] {
  const out: string[] = []
  const add = (u: string) => {
    const t = u.trim()
    if (!t || out.includes(t)) return
    out.push(t)
  }
  for (const raw of paths) {
    const path = raw.startsWith('/') ? raw : `/${raw}`
    for (const u of merchantErpApiCandidates(path)) {
      add(u)
    }
    const b = apiBase().replace(/\/$/, '')
    if (b) add(`${b}${path}`)
    else if (typeof window === 'undefined') add(path)
  }
  return out
}

/** 商品列表接口返回 ok 但 items 为空时，尝试下一个 URL（常见于 /api 未反代而 /erp-api 正常） */
export function isEmptyMerchantProductListResponse(bodyText: string): boolean {
  try {
    const data = JSON.parse(bodyText || '{}') as Record<string, unknown>
    if (data.ok === false) return false
    const d = data.data as Record<string, unknown> | undefined
    const raw = d?.items
    return Array.isArray(raw) && raw.length === 0
  } catch {
    return false
  }
}

/** 鉴权/会话失败时不应换 URL 重试（各候选路径共用同一 Bearer，重试只会掩盖真实错误） */
export function isMerchantApiAuthFailure(res: Response, bodyText: string): boolean {
  if (res.status === 401) return true
  try {
    const data = JSON.parse(bodyText || '{}') as Record<string, unknown>
    const msg = typeof data.message === 'string' ? data.message : ''
    if (
      data.ok === false &&
      /authorization bearer|缺少 authorization|会话无效|已失效|重新绑定|not authenticated|invalid token/i.test(
        msg,
      )
    ) {
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** 当前 URL 未命中路由或基础设施故障时，换下一个候选（勿对业务 ok:false 如会话失效盲目重试） */
export function shouldRetryMerchantApiFetchTarget(
  res: Response,
  bodyText: string,
  hasMoreTargets: boolean,
): boolean {
  if (!hasMoreTargets) return false
  if (isMerchantApiAuthFailure(res, bodyText)) return false
  const trim = bodyText.trimStart()
  const ct = res.headers.get('content-type') ?? ''
  if (isLikelyRouteMiss404(res, trim, ct)) return true
  if (isLikelyHtmlApiResponse(trim, ct)) return true
  if (res.status === 404 || res.status >= 502) return true
  if (!res.ok) return true
  try {
    const data = JSON.parse(bodyText || '{}') as Record<string, unknown>
    if (data.error === 'not_found') return true
  } catch {
    /* ignore */
  }
  return false
}

/** SPA 回退页或未反代 /api 时常见 HTML 200 */
export function isLikelyHtmlApiResponse(text: string, contentType: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<') || /text\/html/i.test(contentType)
}

/**
 * 未部署的 /api 常落到 SPA（HTML）或纯 404 页；JSON 多为网关或抖音上游业务响应，不应再换 URL 重试。
 */
export function isLikelyRouteMiss404(res: Response, trimBody: string, contentType: string): boolean {
  if (res.status !== 404) return false
  const t = trimBody
  if (/application\/json/i.test(contentType) || t.startsWith('{') || t.startsWith('[')) return false
  return true
}

function authHeaders(): HeadersInit {
  const token = readMerchantSession('meoo_douyin_merchant_token')
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) {
    h.Authorization = `Bearer ${token}`
    h['X-Meoo-Douyin-Token'] = token
  }
  return h
}

export type DouyinCategoryTreeNode = {
  category_id: string
  name: string
  parent_id: string
  level: number
  is_leaf: boolean
  enable: boolean
  /** 为 true 时平台禁止在该类目发品 */
  is_publish_block?: boolean
  sub_tree_infos?: DouyinCategoryTreeNode[]
}

/** 抖音类目 id 常为 64 位整型，浏览器 JSON.parse 会丢精度；在解析前把数字改为字符串。 */
function quoteInt64CategoryIdFieldsInJson(raw: string): string {
  return raw
    .replace(/"category_id"\s*:\s*(\d+)\b/g, '"category_id":"$1"')
    .replace(/"parent_id"\s*:\s*(\d+)\b/g, '"parent_id":"$1"')
}

function pickSubTreeArray(raw: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const a = raw.sub_tree_infos ?? raw.sub_tree_info ?? raw.children ?? raw.category_list
  if (!Array.isArray(a)) return undefined
  const filtered = (a as Record<string, unknown>[]).filter(
    (x) => x && typeof x === 'object' && pickCategoryId(x).length > 0,
  )
  return filtered.length > 0 ? filtered : undefined
}

function pickCategoryId(raw: Record<string, unknown>): string {
  const v = raw.category_id ?? raw.id ?? raw.categoryId
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  return ''
}

function pickParentId(raw: Record<string, unknown>): string {
  const v = raw.parent_id ?? raw.parentId
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v))
  return ''
}

function normalizeCategoryNode(raw: Record<string, unknown>): DouyinCategoryTreeNode {
  const subs = pickSubTreeArray(raw)
  return {
    category_id: pickCategoryId(raw),
    name: String(raw.name ?? ''),
    parent_id: pickParentId(raw),
    level: Number(raw.level) || 0,
    is_leaf: Boolean(raw.is_leaf),
    enable: raw.enable !== false,
    is_publish_block: raw.is_publish_block === true,
    sub_tree_infos: subs?.length ? subs.map((x) => normalizeCategoryNode(x)) : undefined,
  }
}

export function normalizeCategoryTree(raw: unknown[]): DouyinCategoryTreeNode[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => normalizeCategoryNode(x as Record<string, unknown>))
}

/**
 * 解析 category/get 内层业务对象：多为 `{ data: { error_code, category_tree_infos? } }`，
 * 少数响应把类目字段放在根级或与文档不一致，这里一并兼容。
 */
function pickCategoryGetInnerData(root: Record<string, unknown>): Record<string, unknown> | undefined {
  const nested = root.data
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>
    if (
      'category_tree_infos' in inner ||
      'category_infos' in inner ||
      typeof inner.error_code === 'number'
    ) {
      return inner
    }
  }
  if (
    'category_tree_infos' in root ||
    'category_infos' in root ||
    typeof root.error_code === 'number'
  ) {
    return root
  }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>
  }
  return undefined
}

/** 树形字段可能是数组、单根对象，或与 query_category_type=0 一样只给 category_infos */
function coerceCategoryTreeRootArray(d: Record<string, unknown>): Record<string, unknown>[] | undefined {
  let raw: unknown = d.category_tree_infos
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = [raw as Record<string, unknown>]
  }
  if (Array.isArray(raw)) {
    return raw as Record<string, unknown>[]
  }
  const infos = d.category_infos
  if (Array.isArray(infos) && infos.length > 0) {
    return infos as Record<string, unknown>[]
  }
  return undefined
}

/** 与开发网关 industry-scope 解析规则一致：末级 + enable + 非封禁 */
export function collectUploadableLeafCategoryIdsFromTree(
  nodes: DouyinCategoryTreeNode[],
): string[] {
  const out: string[] = []
  const walk = (arr: DouyinCategoryTreeNode[]) => {
    for (const n of arr) {
      if (n.is_leaf && n.category_id && n.enable !== false && !n.is_publish_block) {
        out.push(n.category_id)
      }
      if (n.sub_tree_infos?.length) walk(n.sub_tree_infos)
    }
  }
  walk(nodes)
  return out
}

export type ImageUploadResult =
  | { ok: false; message: string }
  | { ok: true; url: string }

/** 经商户网关上传至 Supabase Storage 公开桶，返回 https 直链（供 goods/save） */
export async function uploadDouyinProductImage(file: File): Promise<ImageUploadResult> {
  const max = 10 * 1024 * 1024
  if (file.size > max) {
    return { ok: false, message: '单张图片不超过 10MB' }
  }
  let contentBase64: string
  try {
    contentBase64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        const s = String(r.result ?? '')
        const i = s.indexOf(',')
        resolve(i >= 0 ? s.slice(i + 1) : s)
      }
      r.onerror = () => reject(new Error('读取文件失败'))
      r.readAsDataURL(file)
    })
  } catch {
    return { ok: false, message: '读取文件失败' }
  }
  const bodyStr = JSON.stringify({
    fileName: file.name,
    mimeType: file.type || 'image/jpeg',
    contentBase64,
  })
  const headers = authHeaders()
  const paths = ['/api/meoo-douyin-goods-image-upload', '/api/merchant/douyin/goods/image/upload'] as const
  const targets = merchantApiFetchUrlCandidates(paths)
  let lastStatus = 0
  for (const target of targets) {
    const res = await fetch(target, { method: 'POST', headers, body: bodyStr })
    lastStatus = res.status
    const text = await res.text()
    const ct = res.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (isLikelyRouteMiss404(res, trim, ct)) continue
    if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    if (!res.ok) {
      return {
        ok: false,
        message:
          (typeof data.message === 'string' && data.message) ||
          (typeof data.description === 'string' && data.description) ||
          `HTTP ${res.status}`,
      }
    }
    const u = typeof data.url === 'string' ? data.url : ''
    if (!u) return { ok: false, message: '上传接口未返回 url' }
    return { ok: true, url: u }
  }
  return {
    ok: false,
    message:
      lastStatus === 404
        ? '图片上传接口返回 404：请部署含 /api/meoo-douyin-goods-image-upload 的版本，或检查 VITE_MERCHANT_API_BASE_URL。'
        : `HTTP ${lastStatus || 404}`,
  }
}

export type IndustryScopeResult =
  | {
      ok: true
      industryName: string
      /** 行业允许创建的三级类目 id（与类目树叶子求交后决定可选黑色） */
      uploadableLeafCategoryIds: string[]
    }
  | { ok: false; message: string }

export type CategoryGetResult =
  | { ok: false; message: string }
  | { ok: true; category_tree_infos: DouyinCategoryTreeNode[] }

export type ProductTypeOption = {
  product_type: number
  label: string
  /** false 时 UI 置灰不可选 */
  eligible: boolean
}

export type ProductTypesResult =
  | { ok: true; types: ProductTypeOption[] }
  | { ok: false; message: string }

export type TemplateAttr = {
  key: string
  name: string
  is_required: boolean
  is_multi: boolean
  value_type: string
  desc?: string
}

/** template/get 与 goods/save 对齐的投放渠道、职人带货、售后枚举等（网关可按类目/类型裁剪） */
export type TemplateSelectOption = { value: string; label: string }

export type TradeRuleDefaults = {
  consume_date_mode: 'days' | 'calendar'
  consume_valid_days: number
  non_consume_date_mode: 'all_dates' | 'partial_dates'
  daily_consume_mode: 'all_day' | 'time_slots'
  purchase_limit_mode: 'none' | 'limited'
  purchase_limit_max: number
  after_sale_policy: string
  reserve_mode: 'none' | 'required'
  reserve_advance_value: number
  reserve_advance_unit: 'day' | 'hour'
  reserve_channel: 'phone' | 'online'
}

export type GoodsTemplateResult =
  | { ok: false; message: string }
  | {
      ok: true
      product_attrs: TemplateAttr[]
      sku_attrs: TemplateAttr[]
      sales_channels: TemplateSelectOption[]
      staff_sales_options: TemplateSelectOption[]
      after_sale_policies: TemplateSelectOption[]
      trade_rule_defaults: TradeRuleDefaults
    }

export type ComboPackageItem = {
  name: string
  quantity: number
  origin_price_yuan: number
  /** 匹配到的抖音线上商品 id，随 package_combo 提交供网关映射 save */
  product_id?: string
  sku_id?: string
}

export type ComboPackageGroup = {
  /** 商品组展示名，映射 goodlife combo_rule.groups[].group_name */
  group_name?: string
  pick_rule: string
  items: ComboPackageItem[]
}

/** template/get 未返回时的占位，与来客后台常见投放渠道对齐 */
export const DEFAULT_TEMPLATE_SALES_CHANNELS: TemplateSelectOption[] = [
  { value: 'unlimited', label: '不限制' },
  { value: 'live_only', label: '仅直播间' },
  { value: 'offline_only', label: '仅线下' },
  { value: 'newcomer_only', label: '仅新人频道' },
  { value: 'online_only', label: '仅线上' },
  { value: 'free_trial_only', label: '仅免费试' },
  { value: 'group_mall_only', label: '仅团购商城' },
  { value: 'live_and_acquisition', label: '直播间+获客卡' },
  { value: 'event_only', label: '仅活动报名' },
]

export const DEFAULT_STAFF_SALES_OPTIONS: TemplateSelectOption[] = [
  { value: 'allow', label: '允许' },
  { value: 'deny', label: '不允许' },
]

export const DEFAULT_AFTER_SALE_POLICIES: TemplateSelectOption[] = [
  { value: 'refund_anytime', label: '随时退' },
  { value: 'refund_auto_expire', label: '过期自动退' },
  { value: 'no_refund', label: '不可退' },
]

/** 聚合详情表单，网关负责映射为 product/save 的 product、sku 结构 */
export type DouyinProductDetailPayload = {
  /** 已存在商品时传入，网关走更新/覆盖草稿 */
  product_id?: string
  out_id: string
  category_id: string
  product_type: number
  /** 来客根账户昵称，写入 goodlife product.save 的 `product.account_name` */
  account_name?: string
  merchant_display_name?: string
  /**
   * 收款方式：网关映射 goodlife 商品 save 中与结算/分账相关字段（如总店统一收款、门店独立收款等）。
   * 具体枚举以开放平台当前类目模板为准。
   */
  payment_collect_mode?: 'per_poi' | 'merchant_unified' | 'platform_agent'
  product_name: string
  product_desc?: string
  /** 售价（元）→ 网关转 actual_amount 等 */
  price_yuan: number
  origin_price_yuan?: number
  head_image_urls: string[]
  aux_image_urls: string[]
  env_image_urls: string[]
  /** 适用门店 poi_id 列表 */
  poi_ids: string[]
  /** 套餐结构：仅团购 product_type=1 传 package_combo；代金券（2）由网关生成最小 combo_rule，勿传 package_combo */
  package_combo?: { groups: ComboPackageGroup[] }
  /**
   * 按 [template.get](https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get)
   * 返回的 attr `key` 直填 `attr_key_value_map`（opaque key、combo_rule 类字段等），由网关合并进 [product.save](https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/goods/save)。
   */
  template_attr_overrides?: Record<string, string>
  /** SKU 模板 attr（如 actual_amount）直填 sku.attr_key_value_map，网关在与启发式合并后覆盖 */
  template_sku_attr_overrides?: Record<string, string>
  /** 售卖、库存、交易、消费等扩展块（JSON 透传网关拼装 attr_key_value_map） */
  sales_info: Record<string, unknown>
  trade_rules: Record<string, unknown>
  consume_rules: Record<string, unknown>
  /**
   * goodlife `product.open_biz_type`；不设时网关默认 **团购 product_type=1 → 1**，其余类型 **→ 0**（开放平台枚举里 **1 为「组合券包」**，代金券勿误用 1，否则易触发抖音泛化「服务器打瞌睡」类错误）。
   */
  open_biz_type?: number
}

export type ProductSaveResult =
  | { ok: true; product_id?: string; message?: string }
  | { ok: false; message: string }

export type DouyinGoodsProductGetResult =
  | { ok: true; detail: DouyinProductDetailPayload }
  | { ok: false; message: string }

/**
 * 商品查询：对齐网关代理的 goodlife 商品详情/草稿查询（路径约定，生产由网关实现）。
 */
export async function getDouyinGoodsProductGet(productId: string): Promise<DouyinGoodsProductGetResult> {
  const id = productId.trim()
  if (!id) return { ok: false, message: '缺少 product_id' }
  const q = new URLSearchParams({ product_id: id })
  appendDouyinAccountIdToQuery(q)
  const qs = `?${q}`
  const paths = [
    `/api/meoo-douyin-goods-product-get${qs}`,
    `/api/merchant/douyin/goods/product/get${qs}`,
  ] as const
  const headers = authHeaders()
  let lastStatus = 0
  for (const p of paths) {
    const target = merchantApiFetchUrlCandidates([p])[0] ?? url(p)
    const res = await fetch(target, { method: 'GET', headers })
    lastStatus = res.status
    const text = await res.text()
    const ct = res.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (isLikelyRouteMiss404(res, trim, ct)) continue
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    if (!res.ok) {
      return {
        ok: false,
        message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
      }
    }
    const d = data.data as Record<string, unknown> | undefined
    if (!d || typeof d !== 'object') {
      return { ok: false, message: '响应缺少 data' }
    }
    const detail = d.detail as DouyinProductDetailPayload | undefined
    if (!detail || typeof detail !== 'object') {
      return { ok: false, message: '响应缺少 data.detail' }
    }
    return { ok: true, detail }
  }
  return {
    ok: false,
    message:
      lastStatus === 404
        ? '商品详情接口返回 404：请部署含 /api/meoo-douyin-goods-product-get 的版本，或检查 VITE_MERCHANT_API_BASE_URL。'
        : `HTTP ${lastStatus || 404}`,
  }
}

export type ProductSyncResult =
  | {
      ok: true
      message?: string
      item?: {
        id: string
        name: string
        price: number
        store: string
        status: string
        platform: string
      }
      detail?: Record<string, unknown>
    }
  | { ok: false; message: string }

/** 从抖音来客拉取单商品信息与状态（由网关代理 online/draft get） */
export async function postDouyinGoodsProductSync(productId: string): Promise<ProductSyncResult> {
  const id = productId.trim()
  if (!id) return { ok: false, message: '缺少 product_id' }
  const bodyStr = JSON.stringify({ product_id: id })
  const headers = authHeaders()
  const paths = ['/api/meoo-douyin-goods-product-sync', '/api/merchant/douyin/goods/product/sync'] as const
  const targets = merchantApiFetchUrlCandidates(paths)
  let lastStatus = 0
  for (const target of targets) {
    const res = await fetch(target, { method: 'POST', headers, body: bodyStr })
    lastStatus = res.status
    const text = await res.text()
    const ct = res.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (isLikelyRouteMiss404(res, trim, ct)) continue
    if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    if (!res.ok || data.ok === false) {
      const msg =
        (typeof data.message === 'string' && data.message) ||
        (typeof data.description === 'string' && data.description) ||
        (typeof data.err_msg === 'string' && data.err_msg) ||
        `HTTP ${res.status}`
      return { ok: false, message: msg }
    }
    const itemRaw = data.item
    let item:
      | {
          id: string
          name: string
          price: number
          store: string
          status: string
          platform: string
        }
      | undefined
    if (itemRaw && typeof itemRaw === 'object') {
      const o = itemRaw as Record<string, unknown>
      const id = String(o.id ?? '').trim()
      const name = String(o.name ?? '').trim()
      if (id && name) {
        item = {
          id,
          name,
          price: Number(o.price) || 0,
          store: String(o.store ?? '—'),
          status: String(o.status ?? '—'),
          platform: String(o.platform ?? '抖音来客'),
        }
      }
    }
    const detail =
      data.detail && typeof data.detail === 'object'
        ? (data.detail as Record<string, unknown>)
        : undefined
    return {
      ok: true,
      message: typeof data.message === 'string' ? data.message : undefined,
      ...(item ? { item } : {}),
      ...(detail ? { detail } : {}),
    }
  }
  return {
    ok: false,
    message:
      lastStatus === 404
        ? '同步接口返回 404：请部署含 /api/meoo-douyin-goods-product-sync 的版本，或检查 VITE_MERCHANT_API_BASE_URL。'
        : `HTTP ${lastStatus || 404}`,
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 查询商品线上数据列表 online.query 解析后的单行（用于团购单品匹配） */
export type DouyinOnlineProductHit = {
  product_id: string
  product_name: string
  sku_id?: string
  /** 优先 sku.actual_amount，按分→元启发式换算 */
  price_yuan?: number
  online_status?: number
  /** online：已上线；draft：草稿/审核中；local：本系统演示列表 */
  source?: 'online' | 'draft' | 'local'
}

function amountFieldToYuan(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
  if (v > 1e15) return undefined
  if (v >= 100 && v < 1e12) return Math.round(v) / 100
  if (v > 0 && v < 1e6) return v
  return undefined
}

function normalizeOnlineProductEntry(raw: unknown): DouyinOnlineProductHit | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const prod =
    row.product && typeof row.product === 'object'
      ? (row.product as Record<string, unknown>)
      : row
  /** 文档示例含 product_id / out_id / spu_id；线上列表项顶层也可能带 product_id */
  const product_id = String(
    prod.product_id ?? prod.id ?? prod.out_id ?? prod.spu_id ?? row.product_id ?? row.out_id ?? '',
  ).trim()
  const product_name = String(prod.product_name ?? prod.name ?? row.product_name ?? '').trim()
  if (!product_id && !product_name) return null
  const sku =
    row.sku && typeof row.sku === 'object' ? (row.sku as Record<string, unknown>) : null
  const skus = Array.isArray(row.skus) ? row.skus : []
  const firstSku =
    (skus[0] && typeof skus[0] === 'object' ? (skus[0] as Record<string, unknown>) : null) ?? sku
  let sku_id: string | undefined
  let price_yuan: number | undefined
  if (firstSku) {
    sku_id = String(firstSku.sku_id ?? firstSku.out_sku_id ?? '').trim() || undefined
    price_yuan =
      amountFieldToYuan(firstSku.actual_amount) ?? amountFieldToYuan(firstSku.origin_amount)
  }
  const online_status =
    typeof row.online_status === 'number' ? row.online_status : undefined
  return {
    product_id: product_id || sku_id || product_name,
    product_name: product_name || product_id,
    sku_id,
    price_yuan,
    online_status,
  }
}

function numericBizErrorCode(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

function douyinDataBizError(inner: Record<string, unknown> | undefined): string | undefined {
  if (!inner) return undefined
  const ec = numericBizErrorCode(inner.error_code)
  if (ec === undefined || ec === 0) return undefined
  return typeof inner.description === 'string' ? inner.description : `抖音 error_code=${ec}`
}

function extractProductsArrayFromDouyinPayload(data: Record<string, unknown>): unknown[] {
  const inner = data.data as Record<string, unknown> | undefined
  const arr = (inner?.products ?? inner?.product_list ?? data.products) as unknown
  if (Array.isArray(arr)) return arr
  return []
}

/** 与类目/门店等接口一致：显式传 account_id，避免仅依赖网关会话默认值与前端来客账户不一致。 */
export function appendDouyinAccountIdToQuery(qs: URLSearchParams): void {
  const id = readMerchantSession('meoo_douyin_merchant_id')
  if (id) qs.set('account_id', id)
}

function mergeDedupeProductHits(batches: DouyinOnlineProductHit[][]): DouyinOnlineProductHit[] {
  const seen = new Set<string>()
  const out: DouyinOnlineProductHit[] = []
  for (const batch of batches) {
    for (const h of batch) {
      const id = h.product_id?.trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(h)
    }
  }
  return out
}

function parseOnlineQueryResponse(
  res: Response,
  data: Record<string, unknown>,
): { hits: DouyinOnlineProductHit[]; httpErr?: string; bizErr?: string } {
  if (!res.ok) {
    return {
      hits: [],
      httpErr: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  const inner = data.data as Record<string, unknown> | undefined
  const bizErr = douyinDataBizError(inner)
  const products = extractProductsArrayFromDouyinPayload(data)
  const hits: DouyinOnlineProductHit[] = []
  for (const p of products) {
    const h = normalizeOnlineProductEntry(p)
    if (h) hits.push({ ...h, source: 'online' })
  }
  return { hits, bizErr: hits.length === 0 ? bizErr : undefined }
}

async function fetchOnlineQueryHits(
  qs: URLSearchParams,
): Promise<{ hits: DouyinOnlineProductHit[]; httpErr?: string; bizErr?: string }> {
  const q = new URLSearchParams(qs.toString())
  appendDouyinAccountIdToQuery(q)
  const qsStr = q.toString()
  const paths = [
    '/api/meoo-douyin-goods-product-online-query',
    '/api/merchant/douyin/goods/product/online/query',
  ] as const
  const headers = authHeaders()
  for (const p of paths) {
    const res = await fetch(url(`${p}?${qsStr}`), { method: 'GET', headers })
    const text = await res.text()
    const ct = res.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
    if (res.status === 404) continue
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    return parseOnlineQueryResponse(res, data)
  }
  const res = await fetch(url(`${paths[1]}?${qsStr}`), { method: 'GET', headers })
  const data = await parseJson(res)
  return parseOnlineQueryResponse(res, data)
}

async function fetchDraftQueryHitsFiltered(keyword: string, count: number): Promise<DouyinOnlineProductHit[]> {
  const q = new URLSearchParams()
  q.set('count', String(Math.min(50, Math.max(5, count))))
  appendDouyinAccountIdToQuery(q)
  const qsStr = q.toString()
  const paths = [
    '/api/meoo-douyin-goods-product-draft-query',
    '/api/merchant/douyin/goods/product/draft/query',
  ] as const
  const headers = authHeaders()
  let data: Record<string, unknown> = {}
  let res: Response | null = null
  for (const p of paths) {
    const r = await fetch(url(`${p}?${qsStr}`), { method: 'GET', headers })
    const text = await r.text()
    const ct = r.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (r.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
    if (r.status === 404) continue
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    res = r
    break
  }
  if (!res) {
    res = await fetch(url(`${paths[1]}?${qsStr}`), { method: 'GET', headers })
    data = await parseJson(res)
  }
  if (!res.ok) return []
  const inner = data.data as Record<string, unknown> | undefined
  if (inner && typeof inner.error_code === 'number' && inner.error_code !== 0) return []
  const products = extractProductsArrayFromDouyinPayload(data)
  const k = keyword.toLowerCase()
  const out: DouyinOnlineProductHit[] = []
  for (const p of products) {
    const h = normalizeOnlineProductEntry(p)
    if (!h) continue
    if (!h.product_name.toLowerCase().includes(k)) continue
    out.push({ ...h, source: 'draft' })
  }
  return out
}

/** 本系统演示商品列表（与 save 缓存同源），keyword 由网关 mock 支持 */
async function fetchLocalSavedGoodsHits(keyword: string): Promise<DouyinOnlineProductHit[]> {
  const q = new URLSearchParams({
    page: '1',
    page_size: '50',
    keyword: keyword.slice(0, 40),
  })
  appendDouyinAccountIdToQuery(q)
  const qs = `?${q}`
  const paths = [`/api/meoo-douyin-goods-products${qs}`, `/api/merchant/douyin/goods/products${qs}`] as const
  const targets = merchantApiFetchUrlCandidates(paths)
  let res: Response | undefined
  let bodyText = ''
  for (const target of targets) {
    const r = await fetch(target, { method: 'GET', headers: authHeaders() })
    const text = await r.text()
    const trim = text.trimStart()
    const ct = r.headers.get('content-type') ?? ''
    if (isLikelyRouteMiss404(r, trim, ct)) continue
    res = r
    bodyText = text
    break
  }
  if (!res) return []
  let data: Record<string, unknown> = {}
  try {
    data = (JSON.parse(bodyText || '{}') || {}) as Record<string, unknown>
  } catch {
    data = {}
  }
  if (!res.ok) return []
  const inner = data.data as Record<string, unknown> | undefined
  const items = (inner?.items ?? data.items) as unknown
  if (!Array.isArray(items)) return []
  const k = keyword.toLowerCase()
  const out: DouyinOnlineProductHit[] = []
  for (const row of items) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = String(r.id ?? '').trim()
    const name = String(r.name ?? '').trim()
    if (!id || !name.toLowerCase().includes(k)) continue
    const price = Number(r.price)
    out.push({
      product_id: id,
      product_name: name,
      price_yuan: Number.isFinite(price) ? price : undefined,
      source: 'local',
    })
  }
  return out
}

/**
 * 团购单品匹配：合并「线上商品 online.query」+「商品草稿 draft.query」（与创建/保存 goods 同源）+ 本系统已存演示列表。
 * 新建商品场景下线上库常为空，草稿列表可命中未上架的 save 结果。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/query
 */
export async function getDouyinGoodsProductOnlineQuery(params: {
  product_name: string
  count?: number
  cursor?: string
  goods_query_type?: string
}): Promise<
  | { ok: true; hits: DouyinOnlineProductHit[]; next_cursor?: string }
  | { ok: false; message: string }
> {
  const kw = params.product_name.trim()
  if (kw.length < 1) {
    return { ok: false, message: '请输入商品名称关键词后再搜索' }
  }
  const count = Math.min(50, Math.max(5, params.count ?? 12))

  const base = new URLSearchParams()
  base.set('product_name', kw.slice(0, 30))
  base.set('count', String(count))
  if (params.cursor) base.set('cursor', params.cursor)

  const editionDefaultGqt = defaultGoodsQueryType()
  const explicitGqt = params.goods_query_type?.trim()
  let onlineHits: DouyinOnlineProductHit[] = []
  let httpErr: string | undefined
  let bizErr: string | undefined

  if (editionDefaultGqt) {
    const q = new URLSearchParams(base.toString())
    q.set('goods_query_type', explicitGqt || editionDefaultGqt)
    const r = await fetchOnlineQueryHits(q)
    onlineHits = r.hits
    httpErr = r.httpErr
    bizErr = r.bizErr
  } else if (explicitGqt) {
    const q = new URLSearchParams(base.toString())
    q.set('goods_query_type', explicitGqt || '2')
    const r = await fetchOnlineQueryHits(q)
    onlineHits = r.hits
    httpErr = r.httpErr
    bizErr = r.bizErr
  } else {
    const q2 = new URLSearchParams(base.toString())
    q2.set('goods_query_type', '2')
    const q3 = new URLSearchParams(base.toString())
    q3.set('goods_query_type', '3')
    const [r2, r3] = await Promise.all([fetchOnlineQueryHits(q2), fetchOnlineQueryHits(q3)])
    onlineHits = mergeDedupeProductHits([r2.hits, r3.hits])
    httpErr = r2.httpErr && r3.httpErr ? r2.httpErr ?? r3.httpErr : undefined
    bizErr = onlineHits.length === 0 ? r2.bizErr ?? r3.bizErr : undefined

    /**
     * 文档：自研商家 goods_query_type=2、服务商=3；二者都无结果时，再试仅 goods_creator_type（不传 goods_query_type 时该字段生效）。
     * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/online.query
     */
    if (onlineHits.length === 0 && !httpErr) {
      const qMerch = new URLSearchParams(base.toString())
      qMerch.set('goods_creator_type', '1')
      const qSvc = new URLSearchParams(base.toString())
      qSvc.set('goods_creator_type', '0')
      const [rm, rs] = await Promise.all([fetchOnlineQueryHits(qMerch), fetchOnlineQueryHits(qSvc)])
      onlineHits = mergeDedupeProductHits([onlineHits, rm.hits, rs.hits])
      if (!bizErr && onlineHits.length === 0) {
        bizErr = rm.bizErr ?? rs.bizErr ?? bizErr
      }
    }
  }

  const draftHits = await fetchDraftQueryHitsFiltered(kw, count)
  let merged = mergeDedupeProductHits([onlineHits, draftHits])

  if (merged.length === 0) {
    const localHits = await fetchLocalSavedGoodsHits(kw)
    merged = mergeDedupeProductHits([merged, localHits])
  }

  if (merged.length === 0) {
    if (httpErr) return { ok: false, message: httpErr }
    if (bizErr) return { ok: false, message: bizErr }
    return { ok: true, hits: [], next_cursor: undefined }
  }

  return { ok: true, hits: merged, next_cursor: undefined }
}

/** category/get 专用：保留类目 id 精度；先尝试原样 JSON，再尝试 int64 字段加引号（避免替换破坏合法 JSON）。 */
async function parseCategoryGetJsonResponse(res: Response): Promise<{
  root: Record<string, unknown>
  parseFault?: 'read_failed' | 'empty' | 'html' | 'json_invalid'
  rawLen?: number
}> {
  let raw = ''
  try {
    raw = await res.text()
  } catch {
    return { root: {}, parseFault: 'read_failed', rawLen: 0 }
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return { root: {}, parseFault: 'empty', rawLen: raw.length }
  }
  if (trimmed.startsWith('<')) {
    return { root: {}, parseFault: 'html', rawLen: raw.length }
  }
  const variants: string[] = [raw]
  const fixed = quoteInt64CategoryIdFieldsInJson(raw)
  if (fixed !== raw) variants.push(fixed)
  for (const cand of variants) {
    try {
      const parsed = JSON.parse(cand) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { root: parsed as Record<string, unknown>, rawLen: raw.length }
      }
    } catch {
      /* try next variant */
    }
  }
  return { root: {}, parseFault: 'json_invalid', rawLen: raw.length }
}

type CategoryGetParsed = Awaited<ReturnType<typeof parseCategoryGetJsonResponse>>

/** 优先顶层 meoo 路由（与 meoo-douyin-stores 同理），404/HTML 时再试 merchant 深层路径 */
async function fetchCategoryGetPreferFlatPath(q: URLSearchParams): Promise<{
  res: Response
  parsed: CategoryGetParsed
}> {
  const qs = `?${q}`
  const paths = ['/api/meoo-douyin-goods-category-get', '/api/merchant/douyin/goods/category/get'] as const
  for (const p of paths) {
    const res = await fetch(url(`${p}${qs}`), { method: 'GET', headers: authHeaders() })
    const parsed = await parseCategoryGetJsonResponse(res)
    if (res.ok && parsed.parseFault === 'html') continue
    if (res.status === 404) continue
    return { res, parsed }
  }
  const fallback = paths[paths.length - 1]
  const res = await fetch(url(`${fallback}${qs}`), { method: 'GET', headers: authHeaders() })
  const parsed = await parseCategoryGetJsonResponse(res)
  return { res, parsed }
}

/** 行业圈定可发三级类目（网关可合并门店资质 / 类目资质结果） */
export async function getDouyinIndustryCategoryScope(): Promise<IndustryScopeResult> {
  const accountId = readMerchantSession('meoo_douyin_merchant_id')
  const q = accountId ? `?account_id=${encodeURIComponent(accountId)}` : ''
  const res = await fetch(url(`/api/merchant/douyin/goods/industry-scope${q}`), {
    method: 'GET',
    headers: authHeaders(),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  const d = data.data as Record<string, unknown> | undefined
  const industryName = typeof d?.industry_name === 'string' ? d.industry_name : '未知行业'
  const raw = d?.uploadable_leaf_category_ids
  const uploadableLeafCategoryIds = Array.isArray(raw)
    ? raw.map((x) => String(x)).filter((x) => x.length > 0)
    : []
  return { ok: true, industryName, uploadableLeafCategoryIds }
}

/** 对齐 category/get 树形结果（单请求；需补全子树请用 getDouyinGoodsCategoryTreeMerged） */
export async function getDouyinGoodsCategoryTree(): Promise<CategoryGetResult> {
  const accountId = readMerchantSession('meoo_douyin_merchant_id')
  const q = new URLSearchParams()
  q.set('query_category_type', '1')
  if (accountId) q.set('account_id', accountId)
  return requestCategoryTreeQuery(q)
}

async function requestCategoryTreeQuery(q: URLSearchParams): Promise<CategoryGetResult> {
  const { res, parsed } = await fetchCategoryGetPreferFlatPath(q)
  const { root: data, parseFault, rawLen } = parsed
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  if (parseFault) {
    const detail =
      parseFault === 'empty'
        ? '响应体为空（网关或上游未返回内容）'
        : parseFault === 'html'
          ? '返回了 HTML（多为 CDN/网关错误页，请稍后再试）'
          : parseFault === 'read_failed'
            ? '读取响应失败'
            : `无法解析为 JSON（约 ${rawLen ?? 0} 字符；可能响应过大被截断或非 JSON）`
    return {
      ok: false,
      message: `类目接口异常：${detail}。请重试或在浏览器 Network 中查看 category/get 响应。`,
    }
  }
  const d = pickCategoryGetInnerData(data)
  if (d && typeof d.error_code === 'number' && d.error_code !== 0) {
    const desc = typeof d.description === 'string' ? d.description : `error_code=${d.error_code}`
    return { ok: false, message: desc }
  }
  const tree = d ? coerceCategoryTreeRootArray(d) : undefined
  if (tree === undefined) {
    const hint =
      d && typeof d.description === 'string' && d.description.trim()
        ? d.description.trim()
        : '抖音未返回 category_tree_infos / category_infos，请确认应用具备 life.capacity.goods.query 权限或稍后重试'
    return { ok: false, message: `类目数据格式异常（${hint}）` }
  }
  const normalized = normalizeCategoryTree(tree)
  return { ok: true, category_tree_infos: normalized }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 非叶子且缺少有效子树时，需再调 category/get?category_id= 补全（抖音文档：按 id 返回直系子类目） */
function categoryNodeNeedsSubtreeFetch(n: DouyinCategoryTreeNode): boolean {
  if (n.is_leaf || !n.category_id) return false
  const subs = n.sub_tree_infos
  if (!subs || subs.length === 0) return true
  if (subs.every((s) => !s.category_id)) return true
  /** 仅有占位子节点、尚未展开真实三级 */
  if (
    subs.every(
      (s) =>
        !s.is_leaf &&
        (!s.sub_tree_infos || s.sub_tree_infos.length === 0 || s.sub_tree_infos.every((c) => !c.category_id)),
    )
  ) {
    return true
  }
  return false
}

function extractChildrenFromCategoryGetPayload(
  d: Record<string, unknown> | undefined,
  parentCategoryId: string,
): DouyinCategoryTreeNode[] {
  if (!d || typeof d !== 'object') return []
  if (typeof d.error_code === 'number' && d.error_code !== 0) return []
  const parentStr = String(parentCategoryId)
  const treeRawArr = coerceCategoryTreeRootArray(d)
  if (Array.isArray(treeRawArr) && treeRawArr.length > 0) {
    const norm = normalizeCategoryTree(treeRawArr)
    if (norm.length === 1) {
      const root = norm[0]
      if (root.category_id === parentStr && root.sub_tree_infos?.length) {
        return root.sub_tree_infos
      }
      if (root.sub_tree_infos?.length) return root.sub_tree_infos
      return norm
    }
    const hit = norm.find((n) => n.category_id === parentStr)
    if (hit?.sub_tree_infos?.length) return hit.sub_tree_infos
    return norm
  }
  const infos = d.category_infos
  if (Array.isArray(infos) && infos.length > 0) {
    const norm = normalizeCategoryTree(infos as Record<string, unknown>[])
    const byParent = norm.filter((n) => n.parent_id === parentStr)
    return byParent.length > 0 ? byParent : norm
  }
  return []
}

async function fetchCategorySubtreeByParentId(parentCategoryId: string): Promise<DouyinCategoryTreeNode[]> {
  const accountId = readMerchantSession('meoo_douyin_merchant_id')
  const parentStr = parentCategoryId.trim()
  if (!parentStr) return []

  const runQuery = async (queryCategoryType: '0' | '1'): Promise<DouyinCategoryTreeNode[]> => {
    const q = new URLSearchParams()
    q.set('query_category_type', queryCategoryType)
    q.set('category_id', parentStr)
    if (accountId) q.set('account_id', accountId)
    const { res, parsed } = await fetchCategoryGetPreferFlatPath(q)
    const { root: data } = parsed
    if (!res.ok) return []
    const d = pickCategoryGetInnerData(data)
    if (!d || (typeof d.error_code === 'number' && d.error_code !== 0)) return []

    if (queryCategoryType === '0') {
      const infos = d.category_infos
      if (Array.isArray(infos) && infos.length > 0) {
        const norm = normalizeCategoryTree(infos as Record<string, unknown>[])
        const byParent = norm.filter((n) => n.parent_id === parentStr)
        return byParent.length > 0 ? byParent : norm
      }
    }
    return extractChildrenFromCategoryGetPayload(d, parentStr)
  }

  const flat = await runQuery('0')
  if (flat.length > 0) return flat
  return runQuery('1')
}

function cloneCategoryTree(nodes: DouyinCategoryTreeNode[]): DouyinCategoryTreeNode[] {
  return nodes.map((n) => ({
    ...n,
    sub_tree_infos: n.sub_tree_infos?.length ? cloneCategoryTree(n.sub_tree_infos) : undefined,
  }))
}

function findCategoryNodeMutable(
  nodes: DouyinCategoryTreeNode[],
  id: string,
): DouyinCategoryTreeNode | null {
  for (const n of nodes) {
    if (n.category_id === id) return n
    if (n.sub_tree_infos?.length) {
      const f = findCategoryNodeMutable(n.sub_tree_infos, id)
      if (f) return f
    }
  }
  return null
}

/** 将 `category/get?category_id=<parent>` 返回的子节点合并进内存树（用于按需补全二/三级）。 */
export function mergeDouyinCategoryChildrenIntoTree(
  tree: DouyinCategoryTreeNode[],
  parentCategoryId: string,
  children: DouyinCategoryTreeNode[],
): DouyinCategoryTreeNode[] {
  const pid = parentCategoryId.trim()
  if (!pid || children.length === 0) return tree
  const next = cloneCategoryTree(tree)
  const p = findCategoryNodeMutable(next, pid)
  if (p) p.sub_tree_infos = children
  return next
}

/** 对齐文档：按 `category_id` 查询直系子类目（`query_category_type=1` 树形）。 */
export async function fetchDouyinGoodsCategoryChildren(
  parentCategoryId: string,
): Promise<DouyinCategoryTreeNode[]> {
  const id = parentCategoryId.trim()
  if (!id) return []
  return fetchCategorySubtreeByParentId(id)
}

async function enrichCategoryTreeMissingSubtrees(
  roots: DouyinCategoryTreeNode[],
  options: { maxExtraRequests: number; delayMs: number },
): Promise<void> {
  let used = 0
  const queued = new Set<string>()
  const walk = async (nodes: DouyinCategoryTreeNode[]) => {
    for (const node of nodes) {
      if (used >= options.maxExtraRequests) return
      if (categoryNodeNeedsSubtreeFetch(node) && !queued.has(node.category_id)) {
        queued.add(node.category_id)
        await sleep(options.delayMs)
        used += 1
        const children = await fetchCategorySubtreeByParentId(node.category_id)
        if (children.length > 0) {
          node.sub_tree_infos = children
        }
      }
      if (node.sub_tree_infos?.length) await walk(node.sub_tree_infos)
    }
  }
  await walk(roots)
}

/**
 * 在 `goodlife/v1/goods/category/get` 全树基础上，对仍缺少 `sub_tree_infos` 的非叶子节点按 `category_id` 逐级补拉并合并，
 * 以覆盖平台只返回浅层、需二次查询的场景（与 account_id 门店可发类目一致）。
 * 先尝试 `category_id=0` + `query_category_type=1`（文档：返回全部一级及子树），失败再回退无 category_id 请求。
 * @param maxExtraRequests 额外请求上限（默认 800，一级下二级较多时需拉高；间隔约 35ms 贴近 QPS 35）
 */
export async function getDouyinGoodsCategoryTreeMerged(
  maxExtraRequests = 800,
  delayMs = 35,
): Promise<CategoryGetResult> {
  const accountId = readMerchantSession('meoo_douyin_merchant_id')
  const q0 = new URLSearchParams()
  q0.set('query_category_type', '1')
  q0.set('category_id', '0')
  if (accountId) q0.set('account_id', accountId)
  let base = await requestCategoryTreeQuery(q0)
  if (!base.ok) {
    base = await getDouyinGoodsCategoryTree()
  }
  if (!base.ok) return base
  try {
    await enrichCategoryTreeMissingSubtrees(base.category_tree_infos, {
      maxExtraRequests,
      delayMs,
    })
  } catch {
    /* 合并失败时仍返回首包全树 */
  }
  return base
}

export async function getDouyinProductTypesForCategory(
  leafCategoryId: string,
): Promise<ProductTypesResult> {
  const qs = new URLSearchParams({ category_id: leafCategoryId }).toString()
  const paths = ['/api/meoo-douyin-goods-product-types', '/api/merchant/douyin/goods/product-types'] as const
  const headers = authHeaders()
  for (const p of paths) {
    const res = await fetch(url(`${p}?${qs}`), { method: 'GET', headers })
    const text = await res.text()
    const ct = res.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
    if (res.status === 404) continue
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    if (!res.ok) {
      return {
        ok: false,
        message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
      }
    }
    const typesRaw = data.types ?? data.data
    const types = Array.isArray(typesRaw)
      ? (typesRaw as Record<string, unknown>[])
          .map((t) => ({
            product_type: Number(t.product_type),
            label: String(t.label ?? t.name ?? ''),
            eligible: Boolean(t.eligible !== false),
          }))
          .filter((t) => t.label && Number.isFinite(t.product_type))
      : []
    return { ok: true, types }
  }
  const res = await fetch(url(`${paths[1]}?${qs}`), { method: 'GET', headers })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  const typesRaw = data.types ?? data.data
  const types = Array.isArray(typesRaw)
    ? (typesRaw as Record<string, unknown>[])
        .map((t) => ({
          product_type: Number(t.product_type),
          label: String(t.label ?? t.name ?? ''),
          eligible: Boolean(t.eligible !== false),
        }))
        .filter((t) => t.label && Number.isFinite(t.product_type))
    : []
  return { ok: true, types }
}

function mapSelectOptions(raw: unknown): TemplateSelectOption[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[])
    .map((o) => ({
      value: String(o.value ?? o.id ?? ''),
      label: String(o.label ?? o.name ?? o.value ?? ''),
    }))
    .filter((o) => o.value && o.label)
}

function defaultTradeRuleDefaults(productType: number): TradeRuleDefaults {
  const isVoucher = productType === 2
  return {
    consume_date_mode: 'days',
    consume_valid_days: isVoucher ? 365 : 90,
    non_consume_date_mode: 'all_dates',
    daily_consume_mode: 'all_day',
    purchase_limit_mode: 'none',
    purchase_limit_max: 1,
    after_sale_policy: 'refund_anytime',
    reserve_mode: isVoucher ? 'none' : 'required',
    reserve_advance_value: 1,
    reserve_advance_unit: 'day',
    reserve_channel: 'phone',
  }
}

function parseTradeRuleDefaults(raw: unknown, productType: number): TradeRuleDefaults {
  const base = defaultTradeRuleDefaults(productType)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const pickStr = (k: string, d: string) => (typeof o[k] === 'string' ? (o[k] as string) : d)
  const pickNum = (k: string, d: number) => {
    const n = Number(o[k])
    return Number.isFinite(n) ? n : d
  }
  const cdm = pickStr('consume_date_mode', base.consume_date_mode)
  const dcm = pickStr('daily_consume_mode', base.daily_consume_mode)
  const plm = pickStr('purchase_limit_mode', base.purchase_limit_mode)
  const rm = pickStr('reserve_mode', base.reserve_mode)
  const ru = pickStr('reserve_advance_unit', base.reserve_advance_unit)
  const rc = pickStr('reserve_channel', base.reserve_channel)
  const ncd = pickStr('non_consume_date_mode', base.non_consume_date_mode)
  return {
    consume_date_mode: cdm === 'calendar' ? 'calendar' : 'days',
    consume_valid_days: pickNum('consume_valid_days', base.consume_valid_days),
    non_consume_date_mode: ncd === 'partial_dates' ? 'partial_dates' : 'all_dates',
    daily_consume_mode: dcm === 'time_slots' ? 'time_slots' : 'all_day',
    purchase_limit_mode: plm === 'limited' ? 'limited' : 'none',
    purchase_limit_max: pickNum('purchase_limit_max', base.purchase_limit_max),
    after_sale_policy: pickStr('after_sale_policy', base.after_sale_policy),
    reserve_mode: rm === 'required' ? 'required' : 'none',
    reserve_advance_value: pickNum('reserve_advance_value', base.reserve_advance_value),
    reserve_advance_unit: ru === 'hour' ? 'hour' : 'day',
    reserve_channel: rc === 'online' ? 'online' : 'phone',
  }
}

function isLikelyClientFetchNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /fetch failed|failed to fetch|networkerror|network error|load failed|aborted|abort/i.test(msg)
}

function emptyTemplateOkResult(productType: number): GoodsTemplateResult {
  return {
    ok: true,
    product_attrs: [],
    sku_attrs: [],
    sales_channels: DEFAULT_TEMPLATE_SALES_CHANNELS,
    staff_sales_options: DEFAULT_STAFF_SALES_OPTIONS,
    after_sale_policies: DEFAULT_AFTER_SALE_POLICIES,
    trade_rule_defaults: defaultTradeRuleDefaults(productType),
  }
}

export async function getDouyinGoodsTemplate(params: {
  category_id: string
  product_type: number
  /**
   * 为 true 时：即使 product_attrs/sku_attrs 均为空也返回 ok。
   * 用于编辑页、或 product-types 已判定 eligible 但 template.get 无 attrs（零售代金券等）。
   */
  allowEmptyTemplate?: boolean
}): Promise<GoodsTemplateResult> {
  const q = new URLSearchParams({
    category_id: params.category_id,
    product_type: String(params.product_type),
  })
  appendDouyinAccountIdToQuery(q)
  const qs = `?${q}`
  const paths = ['/api/meoo-douyin-goods-template-get', '/api/merchant/douyin/goods/template/get'] as const
  const headers = authHeaders()
  let lastHttpMessage = ''
  let lastNetworkMessage = ''
  for (const p of paths) {
    const targets = merchantApiFetchUrlCandidates([`${p}${qs}`])
    for (const target of targets) {
      try {
        const res = await fetch(target, { method: 'GET', headers })
        const text = await res.text()
        const ct = res.headers.get('content-type') ?? ''
        const trim = text.trimStart()
        if (isLikelyRouteMiss404(res, trim, ct)) continue
        if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
        let data: Record<string, unknown> = {}
        try {
          data = JSON.parse(text || '{}') as Record<string, unknown>
        } catch {
          data = {}
        }
        if (!res.ok) {
          lastHttpMessage =
            (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`
          continue
        }
        return mapDouyinGoodsTemplatePayload(
          data,
          params.product_type,
          params.category_id,
          params.allowEmptyTemplate,
        )
      } catch (e) {
        lastNetworkMessage = e instanceof Error ? e.message : String(e)
        if (params.allowEmptyTemplate && isLikelyClientFetchNetworkError(e)) {
          return emptyTemplateOkResult(params.product_type)
        }
      }
    }
  }
  if (params.allowEmptyTemplate) {
    return emptyTemplateOkResult(params.product_type)
  }
  return {
    ok: false,
    message:
      lastNetworkMessage && isLikelyClientFetchNetworkError({ message: lastNetworkMessage })
        ? `模板接口网络异常（${lastNetworkMessage}）。请检查网络或稍后重试；若仅创建零售代金券，可刷新后重试，保存时由服务端组装模板。`
        : lastHttpMessage || lastNetworkMessage || '模板接口无法访问',
  }
}

function mapDouyinGoodsTemplatePayload(
  data: Record<string, unknown>,
  productType: number,
  categoryId: string,
  allowEmptyTemplate?: boolean,
): GoodsTemplateResult {
  const d = data.data as Record<string, unknown> | undefined
  const mapAttrs = (arr: unknown): TemplateAttr[] =>
    Array.isArray(arr)
      ? (arr as Record<string, unknown>[]).map((a) => ({
          key: String(a.key ?? ''),
          name: String(a.name ?? a.key ?? ''),
          is_required: Boolean(a.is_required),
          is_multi: Boolean(a.is_multi),
          value_type: String(a.value_type ?? 'STRING'),
          desc: typeof a.desc === 'string' ? a.desc : undefined,
        }))
      : []
  const innerEcRaw = d?.error_code ?? (d as Record<string, unknown> | undefined)?.errorCode
  const innerEc =
    typeof innerEcRaw === 'number' && Number.isFinite(innerEcRaw)
      ? innerEcRaw
      : typeof innerEcRaw === 'string' && innerEcRaw.trim() !== '' && !Number.isNaN(Number(innerEcRaw))
        ? Number(innerEcRaw)
        : undefined
  if (innerEc !== undefined && innerEc !== 0) {
    const desc = typeof d?.description === 'string' ? d.description : ''
    return { ok: false, message: desc || `抖音查询商品模板失败（error_code=${innerEc}）` }
  }
  const sales_channels =
    mapSelectOptions(d?.sales_channels).length > 0
      ? mapSelectOptions(d?.sales_channels)
      : DEFAULT_TEMPLATE_SALES_CHANNELS
  const staff_sales_options =
    mapSelectOptions(d?.staff_sales_options).length > 0
      ? mapSelectOptions(d?.staff_sales_options)
      : DEFAULT_STAFF_SALES_OPTIONS
  const after_sale_policies =
    mapSelectOptions(d?.after_sale_policies).length > 0
      ? mapSelectOptions(d?.after_sale_policies)
      : DEFAULT_AFTER_SALE_POLICIES
  let product_attrs = mapAttrs(d?.product_attrs)
  let sku_attrs = mapAttrs(d?.sku_attrs)
  if (product_attrs.length === 0) {
    const spu = mapAttrs(d?.spu_attrs ?? (d as Record<string, unknown> | undefined)?.spuAttrs)
    if (spu.length > 0) product_attrs = spu
  }
  if (!allowEmptyTemplate && product_attrs.length === 0 && sku_attrs.length === 0) {
    const ptLabel = productType === 1 ? '团购(1)' : productType === 2 ? '代金券(2)' : `类型(${productType})`
    return {
      ok: false,
      message: `「查询商品模板」未返回任何属性（category_id=${categoryId}，${ptLabel}）。该类目与商品类型在抖音侧可能没有可发模板，保存时也会提示「商品模板不存在」。请在来客后台核对**三级类目**与**团购/代金券**是否与开放平台一致，或更换类目后再试。`,
    }
  }
  const trade_rule_defaults =
    product_attrs.length === 0 && sku_attrs.length === 0
      ? defaultTradeRuleDefaults(productType)
      : parseTradeRuleDefaults(d?.trade_rule_defaults, productType)
  return {
    ok: true,
    product_attrs,
    sku_attrs,
    sales_channels,
    staff_sales_options,
    after_sale_policies,
    trade_rule_defaults,
  }
}

function parseProductSaveResponse(res: Response, data: Record<string, unknown>): ProductSaveResult {
  const numericEc = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
    return undefined
  }
  const rootEc = numericEc(data.error_code)
  if (rootEc !== undefined && rootEc !== 0) {
    return {
      ok: false,
      message: String(data.description ?? data.msg ?? `抖音根级 error_code=${rootEc}`),
    }
  }
  const extra = data.extra as Record<string, unknown> | undefined
  const extraEc = extra ? numericEc(extra.error_code) : undefined
  if (extraEc !== undefined && extraEc !== 0) {
    return {
      ok: false,
      message: String(
        (typeof extra?.description === 'string' && extra.description) ||
          data.description ||
          `抖音 extra error_code=${extraEc}`,
      ),
    }
  }
  if (!res.ok) {
    if (res.status === 504) {
      const fromBody =
        (typeof data.message === 'string' && data.message.trim()) ||
        (typeof data.description === 'string' && data.description.trim())
      return {
        ok: false,
        message:
          fromBody ||
          '网关超时（504）：多为 Vercel 函数执行超过上限，或抖音/自建中继未及时返回。请稍后重试；可先点「保存草稿」写入本机。请在 Vercel → Logs / Functions 查看；若用自建 DOUYIN_OPENAPI_BASE_URL，请检查中继延迟。可在环境变量调大 DOUYIN_GOODS_HTTP_TIMEOUT_MS，并把该 API 的 maxDuration 提到 120s（Pro 及以上）。',
      }
    }
    const msg =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.description === 'string' && data.description) ||
      (typeof data.err_msg === 'string' && data.err_msg) ||
      `HTTP ${res.status}`
    return { ok: false, message: msg }
  }
  const inner = data.data as Record<string, unknown> | undefined
  if (!inner || typeof inner !== 'object') {
    const fallback =
      (typeof data.message === 'string' && data.message) ||
      (typeof data.description === 'string' && data.description)
    if (fallback) return { ok: false, message: fallback }
    return { ok: false, message: '保存响应异常：缺少 data' }
  }
  const innerEc = numericEc(inner.error_code)
  if (innerEc !== undefined && innerEc !== 0) {
    const rootExtra = data.extra as Record<string, unknown> | undefined
    const logid = rootExtra && typeof rootExtra.logid === 'string' ? rootExtra.logid.trim() : ''
    const sub =
      rootExtra && typeof rootExtra.sub_description === 'string' && rootExtra.sub_description.trim()
        ? `（${rootExtra.sub_description.trim()}）`
        : ''
    const base =
      (typeof inner.description === 'string' && inner.description) || `抖音 data.error_code=${innerEc}`
    const logHint = logid ? ` [logid:${logid}]` : ''
    const tplHint =
      /模板不存在|无对应模板|模板不匹配|类目.*模板/i.test(base) || /模板不存在|无对应模板/i.test(sub)
        ? ' 建议：在抖音来客核对「三级类目」与「团购/代金券」是否与当前选择一致，或在来客内试发同款确认类目是否支持 OpenAPI 发品。'
        : ''
    const comboEmptyHint =
      /combo_rule.*不能为空|combo_rule.*为空/i.test(base) || /combo_rule.*不能为空|combo_rule.*为空/i.test(sub)
        ? ' 说明：团购须同时写入顶层 product.combo_rule 与 attr_key_value_map.combo_rule（ItemGroupStruct 组数组 JSON）。请部署最新网关；勿手删套餐数据。'
        : ''
    const comboHint =
      /商品组.*不能少于|商品组数量/i.test(base) || /商品组.*不能少于|商品组数量/i.test(sub)
        ? ' 说明：部分类目要求「商品组」至少 2 组；网关默认会把仅 1 组自动拆成两组（名称加 -A/-B，内容相同）。若需关闭该行为，部署环境变量 DOUYIN_GOODS_COMBO_SINGLE_GROUP_AUTO_DUP=0 后请手动配两组。'
        : ''
    const comboQtyHint =
      /数量必须大于0|单位必须为份/i.test(base) || /数量必须大于0|单位必须为份/i.test(sub)
        ? ' 说明：请核对 sku.commodity 与 attr.combo_rule 每组 item_list 是否含 count>0、unit=份、count_unit=份（见开放平台 goods/save 文档）。若手填了「字面量 JSON 覆盖」，保存时会优先采用 commodity/combo_rule 覆盖并同步顶层 product.combo_rule。模板若含 limit_rule/settle_type/use_type 须一并填写。文档：developer.open-douyin.com → 生活服务 → goods/save、template.get。'
        : ''
    const comboIllegalHint =
      /合法的combo|合法.*combo_rule/i.test(base) || /合法的combo|合法.*combo_rule/i.test(sub)
        ? ' 说明：attr 内 combo_rule/commodity 须为 ItemGroupStruct **数组** JSON（非 `{"groups":[]}` 包装）。若仍失败请查 Vercel 日志 combo_attr_json_shape。'
        : ''
    const subTitleHint =
      /subtitle|副标题/i.test(base) || /subtitle|副标题/i.test(sub)
        ? ' 说明：SubTitle 为退款/预约政策标签（如 随时退|免预约），由售后与预约选项自动生成，勿手填商品名。'
        : ''
    const showChannelHint =
      /show_channel/i.test(base) || /show_channel|投放渠道/i.test(sub)
        ? ' 说明：零售类目投放渠道通常仅支持 1（不限制）或 2（仅直播间）；若选了仅线下等选项，网关会自动改回 1。'
        : ''
    const tradeRuleHint =
      /appointment|use_time|use_date|can_no_use_date/i.test(base) ||
      /appointment|use_time|use_date|can_no_use_date|预约|使用时间/i.test(sub)
        ? ' 说明：预约/使用日期/使用时间/不可使用日期须为开放平台规定 JSON 结构；请部署最新网关或清空对应字段后一键填满。'
        : ''
    const descriptionHint =
      /description|商品描述/i.test(base) || /description|商品描述/i.test(sub)
        ? ' 说明：Description 为短描述（纯文本）；description_rich_text 等为 NOTE 富文本须 JSON 列表。请用「一键填满」。'
        : ''
    return {
      ok: false,
      message:
        base +
        logHint +
        sub +
        tplHint +
        comboEmptyHint +
        comboHint +
        comboQtyHint +
        comboIllegalHint +
        subTitleHint +
        showChannelHint +
        tradeRuleHint +
        descriptionHint,
    }
  }
  const pidRaw = inner.product_id ?? inner.productId ?? data.product_id
  const product_id =
    typeof pidRaw === 'string'
      ? pidRaw.trim()
      : typeof pidRaw === 'number' && Number.isFinite(pidRaw)
        ? String(Math.trunc(pidRaw))
        : undefined
  if (!product_id) {
    return {
      ok: false,
      message:
        '抖音返回未包含 product_id，无法确认保存成功；若网关返回 502 请检查自建 DOUYIN_OPENAPI_BASE_URL 与抖音开放平台 logid。',
    }
  }
  const message = typeof data.message === 'string' ? data.message : undefined
  return {
    ok: true,
    product_id,
    message: message ?? '已同步至抖音来客商品库（goodlife/v1/goods/product/save/ 成功）。',
  }
}

/** 与类目/线上搜品同源：优先顶层 meoo + 当前页同源，避开生产深层 /api/merchant/* 或错误 API 基址 404 */
export async function postDouyinGoodsProductSave(params: {
  mode: 'draft' | 'submit'
  detail: DouyinProductDetailPayload
}): Promise<ProductSaveResult> {
  const bodyStr = JSON.stringify({
    mode: params.mode,
    product: params.detail,
  })
  const clientTrace =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `t-${Date.now()}`
  const baseHeaders = authHeaders() as Record<string, string>
  const headers: Record<string, string> = {
    ...baseHeaders,
    'X-Meoo-Client-Trace': clientTrace,
  }
  const paths = ['/api/meoo-douyin-goods-product-save', '/api/merchant/douyin/goods/product/save'] as const
  const targets = merchantApiFetchUrlCandidates(paths)
  let lastStatus = 0
  let lastTarget = ''
  for (const target of targets) {
    lastTarget = target
    let res: Response
    try {
      res = await fetch(target, { method: 'POST', headers, body: bodyStr })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        ok: false,
        message: `保存请求未到达服务器（${msg}）。请检查网络；并在开发者工具 Network 中确认 POST 的 URL 是否为本站的 /api/meoo-douyin-goods-product-save（勿把 VITE_MERCHANT_API_BASE_URL 指到旧域名）。客户端 trace：${clientTrace}`,
      }
    }
    lastStatus = res.status
    const text = await res.text()
    const ct = res.headers.get('content-type') ?? ''
    const trim = text.trimStart()
    if (isLikelyRouteMiss404(res, trim, ct)) continue
    if (res.ok && (trim.startsWith('<') || /text\/html/i.test(ct))) continue
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text || '{}') as Record<string, unknown>
    } catch {
      data = {}
    }
    const out = parseProductSaveResponse(res, data)
    if (!out.ok && out.message) {
      return {
        ...out,
        message: `${out.message}（POST ${target} HTTP ${res.status}，trace:${clientTrace}）`,
      }
    }
    return out
  }
  return {
    ok: false,
    message:
      (lastStatus === 404
        ? '保存接口返回 404：请确认商户 ERP 已部署含「/api/meoo-douyin-goods-product-save」的版本并已 Redeploy；若配置了 VITE_MERCHANT_API_BASE_URL，请改为当前站点或留空，以免请求打到不含该接口的旧网关。'
        : `HTTP ${lastStatus || 404}`) + `（最后尝试：${lastTarget || targets[0] || '—'}，trace:${clientTrace}）`,
  }
}
