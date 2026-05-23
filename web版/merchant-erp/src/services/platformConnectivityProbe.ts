import { readMerchantSession } from '../lib/merchantSession'
import { hydrateDouyinBindingsFromCloud } from '../lib/merchantDouyinCloudBinding'
import { hydrateKuaishouBindingsFromCloud } from '../lib/merchantKuaishouCloudBinding'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { getDouyinStores } from './douyinMerchantApi'
import { getKuaishouStores } from './kuaishouMerchantApi'

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
    readMerchantSession('meoo_kuaishou_merchant_token') ?? '',
    readMerchantSession('meoo_kuaishou_merchant_id') ?? '',
    readMerchantSession('meoo_meituan_merchant_token') ?? '',
    readMerchantSession('meoo_xhs_merchant_token') ?? '',
    readMerchantSession('meoo_eleme_merchant_token') ?? '',
    readMerchantSession('meoo_meituan_waimai_merchant_token') ?? '',
    readMerchantSession('meoo_jd_waimai_merchant_token') ?? '',
  ].join('\u0001')
}

async function probeWaimai(id: 'eleme' | 'meituan_waimai' | 'jd_waimai', name: string) {
  const lastChecked = formatNow()
  const tokenKey =
    id === 'eleme'
      ? 'meoo_eleme_merchant_token'
      : id === 'meituan_waimai'
        ? 'meoo_meituan_waimai_merchant_token'
        : 'meoo_jd_waimai_merchant_token'
  const tok = readMerchantSession(tokenKey)
  let row: PlatformConnectivityRow = { id, name, status: 'error', lastChecked }
  if (tok) {
    const ok = await checkBearerGateway(`/api/merchant/${id}/connection-check`, tok)
    row = { ...row, status: ok ? 'connected' : 'error', lastChecked: formatNow() }
  }
  return row
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

/** 门店查询失败但不像凭证失效（限流/网关/HTML 等）时，仍视为已绑定 */
function douyinStoreErrorLooksLikeAuthFailure(message: string): boolean {
  const c = message ?? ''
  const m = c.toLowerCase()
  if (/\b401\b|\b403\b/.test(c)) return true
  if (
    /未授权|无权|拒绝访问|token无效|access[_-]?token过期|access_token过期|token过期|请刷新或重新授权|请重新授权|会话|解密失败|凭证无效|授权失效|已过期|expired|invalid.*token|鉴权失败/.test(
      m,
    )
  )
    return true
  return false
}

async function probeDouyinConnectivity(lastChecked: string): Promise<PlatformConnectivityRow> {
  let douyin: PlatformConnectivityRow = {
    id: 'douyin',
    name: '抖音来客',
    status: 'error',
    lastChecked,
  }
  const dyTok = readMerchantSession('meoo_douyin_merchant_token')
  const dyMid = readMerchantSession('meoo_douyin_merchant_id')
  if (!dyTok) return douyin

  const r = await getDouyinStores({
    accessToken: dyTok,
    page: 1,
    pageSize: 1,
    merchantId: dyMid ?? undefined,
  })
  const checkedAt = formatNow()
  if (r.ok) {
    return { ...douyin, status: 'connected', lastChecked: checkedAt }
  }
  if (douyinStoreErrorLooksLikeAuthFailure(r.message ?? '')) {
    return { ...douyin, status: 'error', lastChecked: checkedAt }
  }
  /** 与设置页一致：有有效 binding 凭证即视为已连接，看板数据走独立 summary 接口 */
  return { ...douyin, status: 'connected', lastChecked: checkedAt }
}

async function probeKuaishouConnectivity(lastChecked: string): Promise<PlatformConnectivityRow> {
  let kuaishou: PlatformConnectivityRow = {
    id: 'kuaishou',
    name: '快手团购',
    status: 'error',
    lastChecked,
  }
  const ksTok = readMerchantSession('meoo_kuaishou_merchant_token')
  const ksMid = readMerchantSession('meoo_kuaishou_merchant_id')
  if (!ksTok) return kuaishou

  const r = await getKuaishouStores({
    accessToken: ksTok,
    page: 1,
    pageSize: 1,
    merchantId: ksMid ?? undefined,
  })
  const checkedAt = formatNow()
  if (r.ok) {
    return { ...kuaishou, status: 'connected', lastChecked: checkedAt }
  }
  if (douyinStoreErrorLooksLikeAuthFailure(r.message ?? '')) {
    return { ...kuaishou, status: 'error', lastChecked: checkedAt }
  }
  return { ...kuaishou, status: 'connected', lastChecked: checkedAt }
}

async function probeMerchantPlatformsUncached(): Promise<PlatformConnectivityRow[]> {
  if (supabaseConfigured && supabase) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user) {
        await hydrateDouyinBindingsFromCloud(supabase)
        await hydrateKuaishouBindingsFromCloud(supabase)
      }
    } catch {
      /* 云端绑定恢复失败时仍用本地 session 探测 */
    }
  }

  const lastChecked = formatNow()

  const jd: PlatformConnectivityRow = {
    id: 'jd',
    name: '京东本地生活',
    status: 'opening',
    lastChecked,
  }

  const douyin = await probeDouyinConnectivity(lastChecked)
  const kuaishou = await probeKuaishouConnectivity(lastChecked)

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

  const eleme = await probeWaimai('eleme', '淘宝闪购')
  const meituanWaimai = await probeWaimai('meituan_waimai', '美团外卖')
  const jdWaimai = await probeWaimai('jd_waimai', '京东外卖')

  return [
    douyin,
    kuaishou,
    meituan,
    xiaohongshu,
    { ...jd, lastChecked: formatNow() },
    eleme,
    meituanWaimai,
    jdWaimai,
  ]
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
