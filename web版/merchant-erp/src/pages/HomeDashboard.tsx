import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  MessageSquare,
  Percent,
  ShoppingCart,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { MERCHANT_PLATFORMS, type MerchantPlatformId } from '../constants/merchantPlatforms'
import { MerchantPlatformIcon } from '../lib/platformBranding'
import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../cn'
import {
  fetchHomeDashboardByPlatforms,
  type DashboardRange,
  type HomeAggregateStats,
} from '../services/merchantDashboardApi'
import { probeMerchantPlatforms, type PlatformConnectivityRow } from '../services/platformConnectivityProbe'
import AiTokenUsagePanel from '../components/home/AiTokenUsagePanel'
import MerchantShopEvalPanel from '../components/home/MerchantShopEvalPanel'
import { isPartnerEdition } from '../lib/appEdition'
import PartnerHomeDashboard from './PartnerHomeDashboard'
import type { MerchantUiOutletContext } from '../config/nav'

type PlatformId = MerchantPlatformId

const PLATFORMS = MERCHANT_PLATFORMS.map((p) => ({
  id: p.id,
  name: p.name,
  letter: p.letter,
  color: p.color,
}))

const QUICK: {
  title: string
  path: string
  color: string
  icon: typeof Users
}[] = [
  { title: '达人招募', path: '/recruitment', color: 'bg-[#1E3A5F]', icon: Users },
  { title: '投流管理', path: '/advertising', color: 'bg-[#3d4450]', icon: UserPlus },
  { title: '评论管理', path: '/operation', color: 'bg-[#1E3A5F]', icon: MessageSquare },
  { title: '线索管理', path: '/leads', color: 'bg-[#3d4450]', icon: UserPlus },
]

const SIMPLE_HOME_LINKS: { title: string; hint: string; path: string }[] = [
  { title: '上架套餐', hint: '把团购套餐上到平台', path: '/products' },
  { title: '找人拍探店', hint: '发招募，让达人来拍', path: '/recruitment' },
  { title: '出镜口播', hint: '数字人讲套餐', path: '/ai-operation/digital-human' },
  { title: '做探店视频', hint: '按门店出短片', path: '/ai-operation/video-check' },
]

const TIME_FILTERS = [
  { value: 'realtime' as const, label: '实时', icon: Clock },
  { value: 'day7' as const, label: '7日', icon: Calendar },
  { value: 'day30' as const, label: '30天', icon: Calendar },
]

const EMPTY_AGG: HomeAggregateStats = {
  totalRevenue: 0,
  totalVerify: 0,
  totalRefund: 0,
  totalOrders: 0,
  totalRefundCoupons: 0,
  conversionRate: 0,
  fansGrowth: 0,
  todayNewLeads: 0,
  pendingComments: 0,
}

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return '¥0.00'
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCount(n: number) {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('zh-CN')
}

function formatNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

type ModalMetric = 'payAmount' | 'verifyAmount' | 'refundAmount' | 'orderCount' | 'refundCouponCount'

const MODAL_METRICS: {
  key: ModalMetric
  label: string
  color: string
  money: boolean
  titleRealtime: string
  titleRange: string
}[] = [
  {
    key: 'payAmount',
    label: '营收金额',
    color: '#3b82f6',
    money: true,
    titleRealtime: '今日营收金额趋势（按小时）',
    titleRange: '营收金额趋势（当前时间维度）',
  },
  {
    key: 'verifyAmount',
    label: '核销总金额',
    color: '#0d9488',
    money: true,
    titleRealtime: '今日核销金额趋势（按小时）',
    titleRange: '核销金额趋势（当前时间维度）',
  },
  {
    key: 'refundAmount',
    label: '退款金额',
    color: '#e11d48',
    money: true,
    titleRealtime: '今日退款金额趋势（按小时）',
    titleRange: '退款金额趋势（当前时间维度）',
  },
  {
    key: 'orderCount',
    label: '成交券数',
    color: '#1E3A5F',
    money: false,
    titleRealtime: '今日成交券数趋势（按小时）',
    titleRange: '成交券数趋势（当前时间维度）',
  },
  {
    key: 'refundCouponCount',
    label: '退款券数',
    color: '#c2410c',
    money: false,
    titleRealtime: '今日退款券数趋势（按小时）',
    titleRange: '退款券数趋势（当前时间维度）',
  },
]

function scaleByWeights(weights: number[], total: number, asInt: boolean): number[] {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0
  if (weights.length === 0) return []
  if (safeTotal <= 0) return weights.map(() => 0)
  const sum = weights.reduce((acc, n) => acc + (Number.isFinite(n) ? Math.max(0, n) : 0), 0)
  if (sum <= 0) {
    const per = safeTotal / weights.length
    return weights.map(() => (asInt ? Math.round(per) : Math.round(per * 100) / 100))
  }
  const raw = weights.map((n) => ((Number.isFinite(n) ? Math.max(0, n) : 0) / sum) * safeTotal)
  if (!asInt) return raw.map((n) => Math.round(n * 100) / 100)
  const rounded = raw.map((n) => Math.round(n))
  const drift = Math.round(safeTotal) - rounded.reduce((acc, n) => acc + n, 0)
  if (rounded.length) rounded[rounded.length - 1] += drift
  return rounded
}

function readPointMetric(point: Record<string, unknown> | undefined, key: ModalMetric): number {
  const v = point?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

type DashBundle = Awaited<ReturnType<typeof fetchHomeDashboardByPlatforms>>

export default function HomeDashboard() {
  if (isPartnerEdition()) return <PartnerHomeDashboard />
  return <MerchantHomeDashboard />
}

function MerchantHomeDashboard() {
  const outlet = useOutletContext<MerchantUiOutletContext | undefined>()
  const simple = outlet?.uiDensity === 'simple'
  const setUiDensity = outlet?.setUiDensity ?? (() => {})
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [timeKey, setTimeKey] = useState<(typeof TIME_FILTERS)[number]['value']>('realtime')
  const [detailId, setDetailId] = useState<PlatformId | null>(null)
  const [modalMetric, setModalMetric] = useState<ModalMetric>('payAmount')
  const [homeEmpty, setHomeEmpty] = useState(true)
  const [dashBundle, setDashBundle] = useState<DashBundle | null>(null)
  const [probeRows, setProbeRows] = useState<PlatformConnectivityRow[]>([])

  useEffect(() => {
    let cancelled = false
    const paintTimer = window.setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 2_000)

    ;(async () => {
      setStatsLoading(true)
      try {
        const probe = await probeMerchantPlatforms()
        if (cancelled) return
        setProbeRows(probe)
        const connected = probe
          .filter((p) => p.status === 'connected')
          .map((p) => p.id as PlatformId)
        if (connected.length === 0) {
          setHomeEmpty(true)
          setDashBundle(null)
          return
        }
        setHomeEmpty(false)
        const bundle = await fetchHomeDashboardByPlatforms(connected, timeKey as DashboardRange)
        if (cancelled) return
        setDashBundle(bundle)
      } catch {
        if (!cancelled) {
          setHomeEmpty(true)
          setDashBundle(null)
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(paintTimer)
          setLoading(false)
          setStatsLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
      window.clearTimeout(paintTimer)
    }
  }, [timeKey])

  const stats = dashBundle?.aggregate ?? EMPTY_AGG

  const platformRows = useMemo(() => {
    return PLATFORMS.map((p) => {
      const st = dashBundle?.platforms.find((x) => x.id === p.id)
      const probed = probeRows.find((x) => x.id === p.id)
      const isConnected = probed?.status === 'connected' || Boolean(st?.connected)
      return {
        ...p,
        payAmount: homeEmpty && !isConnected ? 0 : (st?.metrics.payAmount ?? 0),
        verifyAmount: homeEmpty && !isConnected ? 0 : (st?.metrics.verifyAmount ?? 0),
        refundAmount: homeEmpty && !isConnected ? 0 : (st?.metrics.refundAmount ?? 0),
        refundCouponCount: homeEmpty && !isConnected ? 0 : (st?.metrics.refundCouponCount ?? 0),
        conversionRate: homeEmpty && !isConnected ? 0 : (st?.metrics.conversionRate ?? 0),
        orderCount: homeEmpty && !isConnected ? 0 : (st?.metrics.orderCount ?? 0),
        isConnected,
      }
    })
  }, [dashBundle, homeEmpty, probeRows])

  const trend = useMemo(() => {
    if (homeEmpty || !dashBundle) return []
    const { trendDates, trendByPlatform } = dashBundle
    return trendDates.map((date, i) => ({
      date,
      douyin: trendByPlatform.douyin[i] ?? 0,
      kuaishou: trendByPlatform.kuaishou[i] ?? 0,
      meituan: trendByPlatform.meituan[i] ?? 0,
      xiaohongshu: trendByPlatform.xiaohongshu[i] ?? 0,
      jd: trendByPlatform.jd[i] ?? 0,
    }))
  }, [dashBundle, homeEmpty])

  useEffect(() => {
    setModalMetric('payAmount')
  }, [detailId])

  const activeModalMetric = MODAL_METRICS.find((item) => item.key === modalMetric) ?? MODAL_METRICS[0]

  const modalTrend = useMemo(() => {
    if (!detailId || !dashBundle) return []
    const platformState = dashBundle.platforms.find((x) => x.id === detailId)
    const metrics = platformState?.metrics
    const total = metrics ? Number(metrics[modalMetric] ?? 0) : 0
    const asInt = !activeModalMetric.money
    if (timeKey === 'realtime') {
      const hourly = platformState?.metrics.hourlyTrend ?? []
      const points =
        hourly.length > 0
          ? hourly
          : Array.from({ length: 24 }, (_, hour) => ({
              hour,
              label: `${String(hour).padStart(2, '0')}:00`,
              payAmount: 0,
            }))
      const weights = points.map((h) => h.payAmount)
      const own = points.map((h) => readPointMetric(h as unknown as Record<string, unknown>, modalMetric))
      const hasOwn = modalMetric === 'payAmount' || own.some((n) => n > 0)
      const values = hasOwn ? own : scaleByWeights(weights, total, asInt)
      return points.map((h, i) => ({ name: h.label, value: values[i] ?? 0 }))
    }
    const paySeries = dashBundle.trendDates.map((_, i) => dashBundle.trendByPlatform[detailId][i] ?? 0)
    const own = (metrics?.trend ?? []).map((row) => readPointMetric(row as unknown as Record<string, unknown>, modalMetric))
    const alignedOwn = dashBundle.trendDates.map((_, i) => own[i] ?? 0)
    const hasOwn = modalMetric === 'payAmount' || alignedOwn.some((n) => n > 0)
    const values = hasOwn ? (modalMetric === 'payAmount' ? paySeries : alignedOwn) : scaleByWeights(paySeries, total, asInt)
    return dashBundle.trendDates.map((date, i) => ({
      name: date,
      value: values[i] ?? 0,
    }))
  }, [detailId, dashBundle, timeKey, modalMetric, activeModalMetric.money])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex h-24 flex-col items-center justify-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1E3A5F] border-t-transparent" />
          <span className="text-sm font-medium">加载经营数据…</span>
        </div>
        <div
          className={cn(
            'grid gap-4 opacity-60',
            simple ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 xl:grid-cols-6 lg:grid-cols-3',
          )}
        >
          {Array.from({ length: simple ? 3 : 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  const timeLabel = TIME_FILTERS.find((x) => x.value === timeKey)?.label ?? '实时'

  const modalPlatform = platformRows.find((p) => p.id === detailId)

  if (simple) {
    const pendingVerify = platformRows.reduce(
      (sum, p) => sum + Math.max(0, p.payAmount - p.verifyAmount),
      0,
    )
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-px bg-[#1E3A5F]" aria-hidden />
            <h1 className="erp-page-title">今天</h1>
            <p className="mt-1 text-sm text-slate-600">先看这三件事，其它数据可随时切回详细版</p>
          </div>
          <span className="text-xs text-slate-500">
            {statsLoading ? '正在刷新数据…' : `更新于 ${new Date().toLocaleString('zh-CN')}`}
          </span>
        </div>

        <MerchantShopEvalPanel />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              { label: '今天卖了', value: formatMoney(stats.totalRevenue) },
              { label: '待核销', value: formatMoney(pendingVerify) },
              { label: '差评', value: formatNum(stats.pendingComments) },
            ] as const
          ).map((card) => (
            <div key={card.label} className="erp-panel px-5 py-4">
              <div className="text-sm text-slate-500">{card.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="erp-panel divide-y divide-slate-100 overflow-hidden">
          {SIMPLE_HOME_LINKS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center justify-between px-5 py-3.5 text-sm transition-colors hover:bg-slate-50"
            >
              <span>
                <span className="font-medium text-slate-800">{item.title}</span>
                <span className="ml-2 text-slate-500">{item.hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setUiDensity('detailed')}
          className="text-sm text-[#1E3A5F] hover:underline"
        >
          看完整数据
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative pl-4">
          <span className="absolute left-0 top-1 h-[calc(100%-4px)] w-px bg-[#1E3A5F]" aria-hidden />
          <h1 className="erp-page-title">数据看板</h1>
          <p className="mt-1 text-sm text-slate-600">本地生活全渠道经营概览</p>
        </div>
        <span className="rounded-full border border-slate-200/90 bg-white/80 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm">
          {statsLoading ? '正在刷新数据…' : `更新于 ${new Date().toLocaleString('zh-CN')}`}
        </span>
      </div>

      <MerchantShopEvalPanel />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6 lg:grid-cols-3">
        {(
          [
            { label: '营收金额', value: formatMoney(stats.totalRevenue), icon: Wallet, color: 'ink' },
            { label: '核销总金额', value: formatMoney(stats.totalVerify), icon: Wallet, color: 'teal' },
            { label: '退款金额', value: formatMoney(stats.totalRefund), icon: Percent, color: 'ink' },
            { label: '成交券数', value: formatCount(stats.totalOrders), icon: ShoppingCart, color: 'teal' },
            { label: '退款券数', value: formatCount(stats.totalRefundCoupons), icon: ShoppingCart, color: 'ink' },
            { label: '粉丝增长', value: `+${formatNum(stats.fansGrowth)}`, icon: Users, color: 'teal' },
            { label: '今日新线索', value: stats.todayNewLeads, icon: UserPlus, color: 'ink' },
            { label: '待处理评论', value: stats.pendingComments, icon: MessageSquare, color: 'teal' },
          ] as const
        ).map((card, idx) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * idx }}
            className="erp-panel p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">{card.label}</span>
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  card.color === 'teal' && 'bg-[rgba(30,58,95,0.1)]',
                  card.color === 'ink' && 'bg-[#F2F3F0]',
                )}
              >
                <card.icon
                  className={cn(
                    'h-4 w-4',
                    card.color === 'teal' && 'text-[#1E3A5F]',
                    card.color === 'ink' && 'text-[#14181F]',
                  )}
                />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{card.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="erp-panel p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">各平台商家版数据</h3>
          <div className="relative">
            <button
              type="button"
              onClick={() => setTimeOpen((v) => !v)}
              className="flex items-center space-x-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
            >
              <Clock className="h-4 w-4" />
              <span>
                {timeLabel}数据
              </span>
              <ChevronDownMini open={timeOpen} />
            </button>
            {timeOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[100px] rounded-lg border border-gray-200 bg-white shadow-lg">
                {TIME_FILTERS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setTimeKey(opt.value)
                      setTimeOpen(false)
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <opt.icon className="mr-2 h-4 w-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {platformRows.map((p, idx) => {
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * idx }}
                className="group relative cursor-pointer rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-5 transition-all hover:shadow-lg"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <MerchantPlatformIcon
                      platformId={p.id}
                      name={p.name}
                      letter={p.letter}
                      color={p.color}
                      size="sm"
                      className="mr-3"
                    />
                    <span className="font-semibold text-gray-900">{p.name}</span>
                  </div>
                  <div
                    className={cn(
                      'rounded-full px-2 py-1 text-xs',
                      p.isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {p.isConnected ? '已连接' : '未连接'}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">营收金额</span>
                    <span className="text-lg font-bold text-gray-900">{formatMoney(p.payAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">核销总金额</span>
                    <span className="text-base font-medium text-green-600">
                      {formatMoney(p.verifyAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">退款金额</span>
                    <span className="text-base font-medium text-rose-600">{formatMoney(p.refundAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">成交券数</span>
                    <span className="text-base font-medium text-gray-700">{p.orderCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">退款券数</span>
                    <span className="text-base font-medium text-gray-700">{p.refundCouponCount}</span>
                  </div>
                </div>
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setDetailId(p.id)}
                    className="flex w-full items-center text-sm text-gray-500 transition-colors group-hover:text-blue-600"
                  >
                    <BarChart3 className="mr-1 h-4 w-4" />
                    <span>查看详情</span>
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="erp-panel p-6 lg:col-span-2">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            {timeKey === 'day30' ? '近30天' : timeKey === 'day7' ? '近7天' : '实时'}各平台营收趋势
          </h3>
          <div className="h-72 min-h-[200px]">
            {trend.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-500">
                <p>暂无营收趋势。</p>
                <p className="text-xs text-gray-400">
                  请先在「系统 → 商家版后台」绑定并接通至少一个平台；接通后系统将汇总各门店数据并在此展示图表。
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v) => formatMoney(Number(v ?? 0))}
                  />
                  <Legend />
                  <Bar dataKey="douyin" name="抖音来客" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="kuaishou" name="快手团购" fill="#ff6600" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="meituan" name="美团" fill="#eab308" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="xiaohongshu" name="小红书" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="jd" name="京东团购" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="erp-panel flex min-h-[420px] flex-col p-6">
          <AiTokenUsagePanel variant="erp" className="flex-1" />
        </div>
      </div>

      <div className="erp-panel p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">快捷入口</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {QUICK.map((e) => {
            const Icon = e.icon
            return (
              <Link
                key={e.path}
                to={e.path}
                className="group flex items-center rounded-xl border border-gray-200 p-4 transition-all hover:border-blue-300 hover:shadow-md"
              >
                <div
                  className={cn(
                    'mr-4 flex h-12 w-12 items-center justify-center rounded-xl text-white',
                    e.color,
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{e.title}</h4>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400 transition-colors group-hover:text-blue-500" />
              </Link>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {modalPlatform && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDetailId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6"
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center">
                  <MerchantPlatformIcon
                    platformId={modalPlatform.id}
                    name={modalPlatform.name}
                    letter={modalPlatform.letter}
                    color={modalPlatform.color}
                    size="md"
                    className="mr-4"
                  />
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{modalPlatform.name}</h3>
                    <div className="text-sm text-gray-500">数据详情</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-4 pt-1 sm:grid-cols-3 lg:grid-cols-5">
                {MODAL_METRICS.map((cell) => {
                  const selected = modalMetric === cell.key
                  const value = cell.money
                    ? formatMoney(Number(modalPlatform[cell.key] ?? 0))
                    : formatCount(Number(modalPlatform[cell.key] ?? 0))
                  return (
                    <motion.button
                      key={cell.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setModalMetric(cell.key)}
                      whileHover={{
                        y: -4,
                        scale: 1.04,
                        boxShadow: selected
                          ? `0 0 0 2px ${cell.color}, 0 16px 32px ${cell.color}33`
                          : `0 12px 28px ${cell.color}2e`,
                      }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                      className={cn(
                        'rounded-xl p-4 text-left transition-[background-color]',
                        selected ? 'bg-white' : 'bg-gray-50 hover:bg-white',
                      )}
                      style={{
                        boxShadow: selected
                          ? `0 0 0 2px ${cell.color}, 0 12px 24px ${cell.color}24`
                          : undefined,
                      }}
                    >
                      <p className="mb-1 text-sm text-gray-500">{cell.label}</p>
                      <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
                      <p className="mt-1 text-xs" style={{ color: selected ? cell.color : '#9ca3af' }}>
                        {selected ? '当前曲线' : timeLabel}
                      </p>
                    </motion.button>
                  )
                })}
              </div>

              <div className="h-64 min-h-[180px]">
                <h4 className="mb-3 text-sm font-medium text-gray-700">
                  {timeKey === 'realtime' ? activeModalMetric.titleRealtime : activeModalMetric.titleRange}
                </h4>
                {modalTrend.length === 0 ? (
                  <div className="flex h-[85%] items-center justify-center text-sm text-gray-500">
                    暂无细分趋势
                  </div>
                ) : timeKey === 'realtime' ? (
                  <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={modalTrend} key={modalMetric}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        fontSize={11}
                        interval={2}
                        tick={{ fill: '#64748b' }}
                      />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickFormatter={(v) =>
                          activeModalMetric.money
                            ? formatMoney(Number(v)).replace('¥', '')
                            : formatCount(Number(v))
                        }
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v) =>
                          activeModalMetric.money
                            ? formatMoney(Number(v ?? 0))
                            : formatCount(Number(v ?? 0))
                        }
                        labelFormatter={(label) => `时段 ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={activeModalMetric.label}
                        stroke={activeModalMetric.color}
                        strokeWidth={2}
                        dot={{ r: 2, fill: activeModalMetric.color }}
                        activeDot={{ r: 4 }}
                        animationDuration={520}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="85%">
                    <BarChart data={modalTrend} key={modalMetric}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickFormatter={(v) =>
                          activeModalMetric.money
                            ? formatMoney(Number(v)).replace('¥', '')
                            : formatCount(Number(v))
                        }
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v) =>
                          activeModalMetric.money
                            ? formatMoney(Number(v ?? 0))
                            : formatCount(Number(v ?? 0))
                        }
                      />
                      <Bar
                        dataKey="value"
                        name={activeModalMetric.label}
                        fill={activeModalMetric.color}
                        radius={[4, 4, 0, 0]}
                        animationDuration={520}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ChevronDownMini({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
