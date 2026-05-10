import { readMerchantSession } from '../lib/merchantSession'
import { getDouyinStores } from './douyinMerchantApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function merchantUrl(path: string): string {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type PlatformConnStatus = 'connected' | 'error' | 'pending' | 'opening'

export type PlatformConnectivityRow = {
  id: string
  name: string
  status: PlatformConnStatus
  /** 展示用：最后检测时间 */
  lastChecked: string
}

function formatNow(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function checkBearerGateway(path: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(merchantUrl(path), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: unknown }
    return data.ok === true
  } catch {
    return false
  }
}

/**
 * 检测各平台与本地网关的连通性：抖音走门店查询；美团/小红书走轻量 connection-check；京东为未接入。
 */
export async function probeMerchantPlatforms(): Promise<PlatformConnectivityRow[]> {
  const lastChecked = formatNow()

  const jd: PlatformConnectivityRow = {
    id: 'jd',
    name: '京东本地生活',
    status: 'opening',
    lastChecked,
  }

  const dyTok = readMerchantSession('meoo_douyin_merchant_token')
  const dyMid = readMerchantSession('meoo_douyin_merchant_id')
  let douyin: PlatformConnectivityRow = {
    id: 'douyin',
    name: '抖音来客',
    status: 'error',
    lastChecked,
  }
  if (dyTok) {
    const r = await getDouyinStores({
      accessToken: dyTok,
      page: 1,
      pageSize: 1,
      merchantId: dyMid ?? undefined,
    })
    douyin = {
      ...douyin,
      status: r.ok ? 'connected' : 'error',
      lastChecked: formatNow(),
    }
  }

  const mtTok = readMerchantSession('meoo_meituan_merchant_token')
  let meituan: PlatformConnectivityRow = {
    id: 'meituan',
    name: '美团点评',
    status: 'error',
    lastChecked,
  }
  if (mtTok) {
    const ok = await checkBearerGateway('/api/merchant/meituan/connection-check', mtTok)
    meituan = {
      ...meituan,
      status: ok ? 'connected' : 'error',
      lastChecked: formatNow(),
    }
  }

  const xhsTok = readMerchantSession('meoo_xhs_merchant_token')
  let xiaohongshu: PlatformConnectivityRow = {
    id: 'xiaohongshu',
    name: '小红书',
    status: 'error',
    lastChecked,
  }
  if (xhsTok) {
    const ok = await checkBearerGateway('/api/merchant/xhs/connection-check', xhsTok)
    xiaohongshu = {
      ...xiaohongshu,
      status: ok ? 'connected' : 'error',
      lastChecked: formatNow(),
    }
  }

  return [douyin, meituan, xiaohongshu, { ...jd, lastChecked: formatNow() }]
}
