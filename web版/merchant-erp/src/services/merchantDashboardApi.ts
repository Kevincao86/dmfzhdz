/**
 * 首页数据看板：按时间维度拉取各平台真实经营指标，经网关代理各平台 OpenAPI。
 *
 * `GET /api/merchant/{douyin|meituan|xhs}/dashboard/summary?range=realtime|day7|day30`
 * Header: `Authorization: Bearer <platform_token>`
 *
 * 响应约定（JSON）：
 * {
 *   "payAmount": number,
 *   "verifyAmount": number,
 *   "conversionRate": number,
 *   "orderCount": number,
 *   "trend": [{ "date": "MM-DD", "payAmount": number }]  // 与 range 对应长度，缺省则前端补零
 * }
 *
 * 首页在「无任何平台探测为已连接」时不请求本接口，并展示清空态。
 */

import { readMerchantSession } from '../lib/merchantSession'
import { storeTabApiSegment, storeTabToken, type StorePlatformTab } from './merchantStoresApi'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function url(path: string) {
  const b = apiBase().replace(/\/$/, '')
  return `${b}${path}`
}

export type DashboardRange = 'realtime' | 'day7' | 'day30'

export type PlatformDashboardMetrics = {
  payAmount: number
  verifyAmount: number
  conversionRate: number
  orderCount: number
  trend: { date: string; payAmount: number }[]
}

export type HomeDashboardPlatformState = {
  id: StorePlatformTab
  connected: boolean
  metrics: PlatformDashboardMetrics
}

export type HomeAggregateStats = {
  totalRevenue: number
  totalOrders: number
  conversionRate: number
  fansGrowth: number
  todayNewLeads: number
  pendingComments: number
}

function emptyMetrics(): PlatformDashboardMetrics {
  return {
    payAmount: 0,
    verifyAmount: 0,
    conversionRate: 0,
    orderCount: 0,
    trend: [],
  }
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

function lastNDates(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push(`${mm}-${dd}`)
  }
  return out
}

async function fetchPlatformDashboard(
  tab: Exclude<StorePlatformTab, 'jd'>,
  token: string,
  range: DashboardRange,
): Promise<PlatformDashboardMetrics> {
  const segment = storeTabApiSegment(tab)
  const q = new URLSearchParams({ range })
  try {
    const res = await fetch(url(`/api/merchant/${segment}/dashboard/summary?${q}`), {
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
      return emptyMetrics()
    }
    if (!res.ok) return emptyMetrics()

    const inner = data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data

    const payAmount = num(inner.payAmount ?? inner.pay_amount ?? inner.totalPay)
    const verifyAmount = num(inner.verifyAmount ?? inner.verify_amount ?? inner.verifyTotal)
    const conversionRate = num(inner.conversionRate ?? inner.conversion_rate)
    const orderCount = num(inner.orderCount ?? inner.order_count ?? inner.orders)

    let trendRaw = inner.trend
    if (!Array.isArray(trendRaw) && inner.series && Array.isArray(inner.series)) {
      trendRaw = inner.series
    }
    const days = range === 'realtime' ? 1 : range === 'day7' ? 7 : 30
    const labels = lastNDates(days)

    let trend: { date: string; payAmount: number }[] = []
    if (Array.isArray(trendRaw)) {
      trend = trendRaw.map((p, i) => {
        if (!p || typeof p !== 'object') return { date: labels[i] ?? '', payAmount: 0 }
        const o = p as Record<string, unknown>
        const date = typeof o.date === 'string' ? o.date : labels[i] ?? ''
        const pa = num(o.payAmount ?? o.pay_amount ?? o.value)
        return { date, payAmount: pa }
      })
    }
    if (trend.length === 0 && days > 0) {
      trend = labels.map((date) => ({ date, payAmount: range === 'realtime' ? payAmount : 0 }))
      if (range !== 'realtime' && payAmount > 0) {
        const per = payAmount / days
        trend = labels.map((date) => ({ date, payAmount: Math.round(per) }))
      }
    }

    return {
      payAmount,
      verifyAmount,
      conversionRate,
      orderCount,
      trend,
    }
  } catch {
    return emptyMetrics()
  }
}

export async function fetchHomeDashboardByPlatforms(
  tabsConnected: StorePlatformTab[],
  range: DashboardRange,
): Promise<{
  platforms: HomeDashboardPlatformState[]
  aggregate: HomeAggregateStats
  trendByPlatform: Record<StorePlatformTab, number[]>
  trendDates: string[]
}> {
  const allTabs: StorePlatformTab[] = [
    'douyin',
    'meituan',
    'xiaohongshu',
    'jd',
    'eleme',
    'meituan_waimai',
    'jd_waimai',
  ]
  const days = range === 'realtime' ? 1 : range === 'day7' ? 7 : 30
  const trendDates = lastNDates(days)

  const trendByPlatform: Record<StorePlatformTab, number[]> = {
    douyin: Array(days).fill(0),
    meituan: Array(days).fill(0),
    xiaohongshu: Array(days).fill(0),
    jd: Array(days).fill(0),
    eleme: Array(days).fill(0),
    meituan_waimai: Array(days).fill(0),
    jd_waimai: Array(days).fill(0),
  }

  const three = ['douyin', 'meituan', 'xiaohongshu'] as const
  const loaded = await Promise.all(
    three.map(async (id) => {
      const connected = tabsConnected.includes(id)
      const tok = storeTabToken(id)
      if (!connected || !tok) {
        return { id, connected: false as const, metrics: emptyMetrics() }
      }
      const metrics = await fetchPlatformDashboard(id, tok, range)
      return { id, connected: true as const, metrics }
    }),
  )

  const platforms: HomeDashboardPlatformState[] = []
  for (const id of allTabs) {
    if (id === 'jd') {
      platforms.push({ id, connected: false, metrics: emptyMetrics() })
      continue
    }
    const hit = loaded.find((x) => x.id === id)!
    platforms.push({ id: hit.id, connected: hit.connected, metrics: hit.metrics })
    const series = trendDates.map((d, idx) => {
      const t = hit.metrics.trend.find((x) => x.date === d)
      if (t) return t.payAmount
      return hit.metrics.trend[idx]?.payAmount ?? 0
    })
    trendByPlatform[id] = series
  }

  const connectedPlats = platforms.filter((p) => p.connected)
  const totalRevenue = connectedPlats.reduce((s, p) => s + p.metrics.payAmount, 0)
  const totalOrders = connectedPlats.reduce((s, p) => s + p.metrics.orderCount, 0)
  const avgConv =
    connectedPlats.length > 0
      ? connectedPlats.reduce((s, p) => s + p.metrics.conversionRate, 0) / connectedPlats.length
      : 0

  const extra = await fetchHomeExtraStatsOnce()

  const aggregate: HomeAggregateStats = {
    totalRevenue,
    totalOrders,
    conversionRate: Math.round(avgConv * 10) / 10,
    fansGrowth: extra.fansGrowth,
    todayNewLeads: extra.todayNewLeads,
    pendingComments: extra.pendingComments,
  }

  return { platforms, aggregate, trendByPlatform, trendDates }
}

/** 可选：GET /api/merchant/home/extra-stats；未实现或非 200 时返回 0 */
async function fetchHomeExtraStatsOnce(): Promise<
  Pick<HomeAggregateStats, 'fansGrowth' | 'todayNewLeads' | 'pendingComments'>
> {
  const zero = { fansGrowth: 0, todayNewLeads: 0, pendingComments: 0 }
  const tok = readMerchantSession('meoo_douyin_merchant_token')
  if (!tok) return zero
  try {
    const res = await fetch(url('/api/merchant/home/extra-stats'), {
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
    })
    if (!res.ok) return zero
    const data = (await res.json()) as Record<string, unknown>
    const inner = data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : data
    return {
      fansGrowth: num(inner.fansGrowth ?? inner.fans_growth),
      todayNewLeads: num(inner.todayNewLeads ?? inner.today_new_leads),
      pendingComments: num(inner.pendingComments ?? inner.pending_comments),
    }
  } catch {
    return zero
  }
}
