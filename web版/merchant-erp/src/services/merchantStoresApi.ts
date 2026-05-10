/**
 * 多平台门店列表：经网关代理各平台「门店查询 / 门店认领」等 OpenAPI，与店铺信息、店铺装修页共用。
 *
 * - 抖音：`GET /api/merchant/douyin/stores`（已有，见 douyinMerchantApi）
 * - 美团：`GET /api/merchant/meituan/stores`（Bearer，Query: page, pageSize, keyword）
 * - 小红书：`GET /api/merchant/xhs/stores`（同上）
 */

import { readMerchantSession } from '../lib/merchantSession'
import {
  adaptMerchantStoresPayload,
  getDouyinStores,
  type DouyinStoresResult,
} from './douyinMerchantApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type StorePlatformTab = 'douyin' | 'meituan' | 'xiaohongshu' | 'jd'

export function storeTabToken(tab: StorePlatformTab): string | null {
  if (tab === 'douyin') return readMerchantSession('meoo_douyin_merchant_token')
  if (tab === 'meituan') return readMerchantSession('meoo_meituan_merchant_token')
  if (tab === 'xiaohongshu') return readMerchantSession('meoo_xhs_merchant_token')
  return null
}

export function storeTabApiSegment(tab: Exclude<StorePlatformTab, 'jd'>): string {
  if (tab === 'xiaohongshu') return 'xhs'
  return tab
}

async function fetchBearerStoresJson(
  segment: string,
  token: string,
  params: { page: number; pageSize: number; keyword?: string },
): Promise<DouyinStoresResult> {
  const q = new URLSearchParams({
    page: String(params.page),
    pageSize: String(Math.min(100, Math.max(1, params.pageSize))),
  })
  const kw = params.keyword?.trim()
  if (kw) q.set('keyword', kw)

  try {
    const res = await fetch(url(`/api/merchant/${segment}/stores?${q}`), {
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
    return { ok: true, ...adaptMerchantStoresPayload(data) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '网络错误'
    return { ok: false, message: msg }
  }
}

export async function fetchStoresForPlatform(
  tab: StorePlatformTab,
  params: {
    page: number
    pageSize: number
    keyword?: string
    /** 仅抖音：与网关 claimScope 一致，服务端分页 */
    claimScope?: 'claimed' | 'claiming'
    relationType?: '0' | '1' | '2' | 'all'
    refresh?: boolean
    provinceCity?: string
    claimStatusFilter?:
      | 'all'
      | 'store_auditing'
      | 'store_audit_fail'
      | 'pending_qual'
      | 'reviewing'
    businessStatusFilter?: 'all' | 'open' | 'rest' | 'closed'
    storeBrand?: string
  },
): Promise<DouyinStoresResult> {
  if (tab === 'jd') {
    return { ok: false, message: '京东本地生活门店接口尚未接入，请在系统设置关注开通进度。' }
  }
  const token = storeTabToken(tab)
  if (!token) {
    return { ok: false, message: '请先在「系统 → 商家版后台」完成该平台绑定。' }
  }
  if (tab === 'douyin') {
    return getDouyinStores({
      accessToken: token,
      page: params.page,
      pageSize: params.pageSize,
      keyword: params.keyword,
      merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
      claimScope: params.claimScope,
      relationType: params.relationType,
      refresh: params.refresh,
      provinceCity: params.provinceCity,
      claimStatusFilter: params.claimStatusFilter,
      businessStatusFilter: params.businessStatusFilter,
      storeBrand: params.storeBrand,
    })
  }
  return fetchBearerStoresJson(storeTabApiSegment(tab), token, params)
}
