import { readMerchantSession } from '../lib/merchantSession'
import { getDouyinStores } from './douyinMerchantApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

/** 短时间内重复进入首页 / 商品页等共用一次探测结果，减轻抖音 shop/query 频控压力 */
const PROBE_CACHE_TTL_MS = 120_000

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

function connectivitySessionSig(): string {
  return [
    readMerchantSession('meoo_douyin_merchant_token') ?? '',
    readMerchantSession('meoo_douyin_merchant_id') ?? '',
    readMerchantSession('meoo_meituan_merchant_token') ?? '',
    readMerchantSession('meoo_xhs_merchant_token') ?? '',
  ].join('\u0001')
}

type ProbeCache = { rows: PlatformConnectivityRow[]; at: number; sig: string }

let probeCache: ProbeCache | null = null
let probeInFlight: Promise<PlatformConnectivityRow[]> | null = null

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

async function probeMerchantPlatformsUncached(): Promise<PlatformConnectivityRow[]> {
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

function cloneRows(rows: PlatformConnectivityRow[]): PlatformConnectivityRow[] {
  return rows.map((r) => ({ ...r }))
}

export type ProbeMerchantPlatformsOpts = {
  /** 为 true 时跳过缓存与进行中的软探测，重新请求各平台（如用户点击「刷新连通状态」） */
  force?: boolean
}

/**
 * 检测各平台与本地网关的连通性：抖音走门店查询；美团/小红书走轻量 connection-check；京东为未接入。
 * 默认 120s 内、且会话 token 未变时复用上次结果，并发调用合并为同一 in-flight 请求。
 */
export async function probeMerchantPlatforms(
  opts?: ProbeMerchantPlatformsOpts,
): Promise<PlatformConnectivityRow[]> {
  const force = opts?.force === true
  const sig = connectivitySessionSig()
  const now = Date.now()

  if (!force && probeCache && probeCache.sig === sig && now - probeCache.at < PROBE_CACHE_TTL_MS) {
    return cloneRows(probeCache.rows)
  }

  if (force) {
    const rows = await probeMerchantPlatformsUncached()
    probeCache = { rows: cloneRows(rows), at: Date.now(), sig: connectivitySessionSig() }
    return cloneRows(rows)
  }

  if (probeInFlight) {
    return cloneRows(await probeInFlight)
  }

  const run = async (): Promise<PlatformConnectivityRow[]> => {
    const rows = await probeMerchantPlatformsUncached()
    probeCache = { rows: cloneRows(rows), at: Date.now(), sig: connectivitySessionSig() }
    return rows
  }

  const p = run()
  probeInFlight = p
  void p.finally(() => {
    if (probeInFlight === p) probeInFlight = null
  })
  return cloneRows(await p)
}
