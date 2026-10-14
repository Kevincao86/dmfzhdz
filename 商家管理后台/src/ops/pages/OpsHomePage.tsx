import { Activity, Bot, Building2, Crown, Headphones, Loader2, Megaphone, Sparkles, UserPlus, UserRound, Users, Wallet } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import {
  computeDashboardDailySeries,
  computeDashboardStats,
  type DashboardDailyPoint,
  type DashboardStats,
} from '../opsDashboardCompute'
import { buildDashboardRange, formatRangeCaption, timestampInRange, type DashboardPreset } from '../opsDashboardRange'
import {
  computeMpUserDashboardDailySeries,
  computeMpUserDashboardStats,
  type MpUserDashboardDailyPoint,
  type MpUserDashboardStats,
} from '../opsMpUserDashboardCompute'
import { fetchOpsPaymentOrders, type OpsPaymentOrderRow } from '../opsPaymentOrdersApi'
import { fetchRegistry } from '../opsRegistryApi'
import { loadTrainingPayouts, loadTrainingReview, reviewBucket } from '../opsTrainingReviewApi'
import { fetchSupabaseTenantsForOps } from '../supabaseTenantsApi'

const PRESETS: { id: DashboardPreset; label: string }[] = [
  { id: 'today', label: '今日' },
  { id: '7d', label: '近 7 日' },
  { id: '30d', label: '近 30 日' },
  { id: 'custom', label: '自定义' },
]

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: typeof UserPlus
  iconClass: string
  label: string
  value: number
  hint: string
}) {
  return (
    <div className="ops-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{value}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{hint}</p>
        </div>
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            iconClass,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  )
}

function MpUserDailyTable({ rows }: { rows: MpUserDashboardDailyPoint[] }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-950 text-[11px] font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2.5">日期</th>
            <th className="px-3 py-2.5">达人新增注册</th>
            <th className="px-3 py-2.5">达人日活</th>
            <th className="px-3 py-2.5">PR 新增注册</th>
            <th className="px-3 py-2.5">PR 日活</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {[...rows].reverse().map((r) => (
            <tr key={r.date} className="hover:bg-slate-800/30">
              <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.date}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.talentRegistered}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.talentActive}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.prRegistered}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.prActive}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DailyTable({ rows }: { rows: DashboardDailyPoint[] }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-950 text-[11px] font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2.5">日期</th>
            <th className="px-3 py-2.5">新增注册</th>
            <th className="px-3 py-2.5">活跃用户</th>
            <th className="px-3 py-2.5">达人招募商户</th>
            <th className="px-3 py-2.5">会员版订阅</th>
            <th className="px-3 py-2.5">会员 Plus 订阅</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {[...rows].reverse().map((r) => (
            <tr key={r.date} className="hover:bg-slate-800/30">
              <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.date}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.registered}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.active}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.recruitmentMerchants}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.memberSubscribe}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.memberPlusSubscribe}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function yuanFromCents(cents: number): string {
  return `¥${Math.round(cents / 100).toLocaleString('zh-CN')}`
}

type CockpitTodo = {
  id: string
  title: string
  count: number
  detail: string
  to: string
  color: string
}

function joinNames(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean)
  if (!clean.length) return '暂无名称'
  const head = clean.slice(0, 3).join('、')
  return clean.length > 3 ? `${head} 等 ${clean.length} 条` : head
}

function ShareBars({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-slate-800">
        {parts.map((part) => (
          <div
            key={part.label}
            style={{ width: total ? `${(part.value / total) * 100}%` : '0%', background: part.color }}
            title={`${part.label} ${part.value}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex min-w-0 items-center gap-2 text-slate-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: part.color }} />
              <span className="truncate">{part.label}</span>
            </span>
            <span className="font-semibold tabular-nums text-white">{part.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">合计 {total}</p>
    </div>
  )
}

function TrendChart({
  dates,
  series,
}: {
  dates: string[]
  series: { label: string; color: string; values: number[] }[]
}) {
  if (!dates.length) return <p className="py-8 text-center text-sm text-slate-500">这个周期没有分日数据</p>
  const w = 720
  const h = 210
  const padL = 40
  const padR = 12
  const padT = 16
  const padB = 32
  const max = Math.max(1, ...series.flatMap((item) => item.values))
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const xAt = (index: number) =>
    padL + (dates.length <= 1 ? innerW / 2 : (index / (dates.length - 1)) * innerW)
  const yAt = (value: number) => padT + innerH - (value / max) * innerH
  const step = dates.length > 14 ? Math.ceil(dates.length / 7) : dates.length > 7 ? 2 : 1
  const ticks = [0, Math.round(max / 2), max]

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-72 w-full" role="img" aria-label="分日趋势">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padL}
              x2={w - padR}
              y1={yAt(tick)}
              y2={yAt(tick)}
              stroke="currentColor"
              className="text-slate-800"
            />
            <text x={4} y={yAt(tick) + 4} className="fill-slate-500 text-[11px]">
              {tick}
            </text>
          </g>
        ))}
        {series.map((item) => {
          const d = item.values
            .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(value)}`)
            .join(' ')
          const area = `${d} L ${xAt(item.values.length - 1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`
          return (
            <g key={item.label}>
              <path d={area} fill={item.color} opacity="0.16" />
              <path d={d} fill="none" stroke={item.color} strokeWidth="2.5" />
            </g>
          )
        })}
        {dates.map((date, index) =>
          index % step === 0 ? (
            <text key={date} x={xAt(index)} y={h - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function CompareBars({
  dates,
  left,
  right,
}: {
  dates: string[]
  left: { label: string; color: string; values: number[] }
  right: { label: string; color: string; values: number[] }
}) {
  const max = Math.max(1, ...left.values, ...right.values)
  const step = dates.length > 16 ? Math.ceil(dates.length / 8) : 1
  return (
    <div>
      <div className="flex h-44 items-end gap-1">
        {dates.map((date, index) => (
          <div key={date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-0.5">
              <div
                className="w-2 rounded-t"
                style={{ height: `${Math.max(4, (left.values[index]! / max) * 100)}%`, background: left.color }}
                title={`${left.label} ${left.values[index]}`}
              />
              <div
                className="w-2 rounded-t"
                style={{ height: `${Math.max(4, (right.values[index]! / max) * 100)}%`, background: right.color }}
                title={`${right.label} ${right.values[index]}`}
              />
            </div>
            {index % step === 0 ? <span className="text-[10px] text-slate-500">{date.slice(5)}</span> : <span className="text-[10px]"> </span>}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: left.color }} />
          {left.label}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: right.color }} />
          {right.label}
        </span>
      </div>
    </div>
  )
}

export default function OpsHomePage() {
  const [preset, setPreset] = useState<DashboardPreset>('7d')
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return d.toISOString().slice(0, 10)
  })
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [daily, setDaily] = useState<DashboardDailyPoint[]>([])
  const [mpStats, setMpStats] = useState<MpUserDashboardStats | null>(null)
  const [mpDaily, setMpDaily] = useState<MpUserDashboardDailyPoint[]>([])
  const [money, setMoney] = useState<{ confirmedCents: number; pendingCount: number } | null>(null)
  const [recruitCounts, setRecruitCounts] = useState<{ erp: number; mp: number } | null>(null)
  const [todos, setTodos] = useState<CockpitTodo[]>([])

  const range = useMemo(
    () => buildDashboardRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sb = await fetchSupabaseTenantsForOps()
      if (!sb.ok && sb.error !== 'not_configured') {
        setError(sb.hint ?? sb.error ?? '无法加载租户数据')
        setStats(null)
        setDaily([])
        setMpStats(null)
        setMpDaily([])
        setMoney(null)
        setRecruitCounts(null)
        setTodos([])
        return
      }
      const tenants = sb.ok ? sb.rows : []

      let recruitmentOrders: Awaited<ReturnType<typeof fetchRegistry>>['recruitmentOrders'] = []
      let mpOrders: Awaited<ReturnType<typeof fetchRegistry>>['mpRecruitmentOrders'] = []
      let mpTalentMembers: Awaited<ReturnType<typeof fetchRegistry>>['mpTalentMembers'] = []
      let mpPrUsers: Awaited<ReturnType<typeof fetchRegistry>>['mpPrUsers'] = []
      let withdraws: NonNullable<Awaited<ReturnType<typeof fetchRegistry>>['distributionWithdrawRequests']> = []
      try {
        const reg = await fetchRegistry()
        recruitmentOrders = reg.recruitmentOrders ?? []
        mpOrders = reg.mpRecruitmentOrders ?? []
        mpTalentMembers = reg.mpTalentMembers ?? []
        mpPrUsers = reg.mpPrUsers ?? []
        withdraws = reg.distributionWithdrawRequests ?? []
      } catch {
        /* 招募统计可仅用 Supabase 租户；注册表不可用时招募数为 0 */
      }

      let paymentOrders: OpsPaymentOrderRow[] = []
      const po = await fetchOpsPaymentOrders()
      if (po.ok) paymentOrders = po.rows

      const r = buildDashboardRange(preset, customStart, customEnd)
      setStats(computeDashboardStats(tenants, recruitmentOrders, mpOrders, paymentOrders, r))
      setDaily(computeDashboardDailySeries(tenants, recruitmentOrders, mpOrders, paymentOrders, r))
      setMpStats(computeMpUserDashboardStats(mpTalentMembers, mpPrUsers, r))
      setMpDaily(computeMpUserDashboardDailySeries(mpTalentMembers, mpPrUsers, r))
      let confirmedCents = 0
      let pendingCount = 0
      for (const order of paymentOrders) {
        if (order.status === 'pending' || order.status === 'amount_verified') pendingCount += 1
        if (order.status !== 'confirmed') continue
        const at = order.confirmed_at || order.verified_at || order.updated_at || order.created_at || ''
        if (!timestampInRange(at, r)) continue
        confirmedCents += order.verified_amount_cents ?? order.amount_cents ?? 0
      }
      setMoney({ confirmedCents, pendingCount })
      let erp = 0
      let mp = 0
      for (const order of recruitmentOrders ?? []) {
        if (order?.createdAt && timestampInRange(order.createdAt, r)) erp += 1
      }
      for (const order of mpOrders ?? []) {
        if (order?.createdAt && timestampInRange(order.createdAt, r)) mp += 1
      }
      setRecruitCounts({ erp, mp })

      const nextTodos: CockpitTodo[] = []
      const pushTodo = (item: CockpitTodo) => {
        if (item.count > 0) nextTodos.push(item)
      }
      const affiliateReview = withdraws.filter(
        (row) => row.ownerType === 'individual_affiliate' && row.status === 'pending_review',
      )
      const partnerReview = withdraws.filter(
        (row) => row.ownerType === 'partner_tenant' && row.status === 'pending_review',
      )
      const approvedPay = withdraws.filter((row) => row.status === 'approved')
      pushTodo({
        id: 'affiliate-review',
        title: '推广员提现待审',
        count: affiliateReview.length,
        detail: `${joinNames(affiliateReview.map((row) => row.ownerLabel))} · ${yuanFromCents(affiliateReview.reduce((sum, row) => sum + row.amountCents, 0))}`,
        to: '/distribution?tab=withdraw&owner=affiliate',
        color: '#fbbf24',
      })
      pushTodo({
        id: 'partner-review',
        title: '分销提现待审',
        count: partnerReview.length,
        detail: `${joinNames(partnerReview.map((row) => row.ownerLabel))} · ${yuanFromCents(partnerReview.reduce((sum, row) => sum + row.amountCents, 0))}`,
        to: '/distribution?tab=withdraw&owner=partner',
        color: '#fb923c',
      })
      pushTodo({
        id: 'withdraw-pay',
        title: '提现已通过待打款',
        count: approvedPay.length,
        detail: `${joinNames(approvedPay.map((row) => row.ownerLabel))} · ${yuanFromCents(approvedPay.reduce((sum, row) => sum + row.amountCents, 0))}`,
        to: '/distribution?tab=withdraw',
        color: '#f97316',
      })
      const payPending = paymentOrders.filter((order) => order.status === 'pending' || order.status === 'amount_verified')
      pushTodo({
        id: 'pay-orders',
        title: '商家订单待确认',
        count: payPending.length,
        detail: `${joinNames(payPending.map((order) => order.merchant_name || order.tenant_login_name || ''))} · ${yuanFromCents(payPending.reduce((sum, order) => sum + (order.verified_amount_cents ?? order.amount_cents ?? 0), 0))}`,
        to: '/payment-orders',
        color: '#34d399',
      })
      const erpPending = (recruitmentOrders ?? []).filter((order) => order.status === 'pending')
      pushTodo({
        id: 'erp-recruit',
        title: '商家招募待处理',
        count: erpPending.length,
        detail: joinNames(erpPending.map((order) => order.customerName || order.storeName || '')),
        to: '/recruitment-orders',
        color: '#a78bfa',
      })
      const mpOpen = (mpOrders ?? []).filter(
        (order) => order.status === 'open' || order.status === 'collecting' || order.status === 'pending_settlement',
      )
      pushTodo({
        id: 'mp-recruit',
        title: '小程序招募进行中',
        count: mpOpen.length,
        detail: joinNames(mpOpen.map((order) => order.title || order.storeName || order.customerName || '')),
        to: '/mp-recruitment-orders',
        color: '#818cf8',
      })
      const confirmApplicants = (mpOrders ?? []).flatMap((order) =>
        (order.applicants ?? []).filter((person) => person.taskStatus === 'pending_confirm' || person.taskStatus === 'applied'),
      )
      pushTodo({
        id: 'applicants',
        title: '达人报名待确认',
        count: confirmApplicants.length,
        detail: joinNames(confirmApplicants.map((person) => person.name || person.platformNickname || '')),
        to: '/mp-recruitment-orders',
        color: '#22d3ee',
      })
      try {
        const [review, payouts] = await Promise.all([loadTrainingReview(), loadTrainingPayouts()])
        const lecturers = review.lecturers.filter(
          (row) => row.lecturerStatus && row.lecturerStatus !== 'none' && reviewBucket(row.lecturerStatus) === 'pending',
        )
        const courses = review.courses.filter((row) => reviewBucket(row.reviewStatus) === 'pending')
        const unpaid = payouts.filter((row) => row.status === 'pending')
        pushTodo({
          id: 'lecturer',
          title: '讲师待审核',
          count: lecturers.length,
          detail: joinNames(lecturers.map((row) => row.name || '')),
          to: '/lecturer-review',
          color: '#f472b6',
        })
        pushTodo({
          id: 'course',
          title: '培训课程待审核',
          count: courses.length,
          detail: joinNames(courses.map((row) => row.title || row.hostName || '')),
          to: '/training-review',
          color: '#e879f9',
        })
        pushTodo({
          id: 'lesson-pay',
          title: '课时费待打款',
          count: unpaid.length,
          detail: `${joinNames(unpaid.map((row) => row.name))} · ${yuanFromCents(unpaid.reduce((sum, row) => sum + Math.round(row.net * 100), 0))}`,
          to: '/training-payouts',
          color: '#facc15',
        })
      } catch {
        /* 培训接口不可用时，其余待办仍显示 */
      }
      nextTodos.sort((a, b) => b.count - a.count)
      setTodos(nextTodos)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStats(null)
      setDaily([])
      setMpStats(null)
      setMpDaily([])
      setMoney(null)
      setRecruitCounts(null)
      setTodos([])
    } finally {
      setLoading(false)
    }
  }, [preset, customStart, customEnd])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">驾驶舱</h1>
        <p className="mt-1 text-sm text-slate-400">
          {formatRangeCaption(range)} · 商户、招募、订阅和达人 / PR 都来自现有统计，点卡片进入对应功能
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                preset === p.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200"
            />
            <span>至</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-200"
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          刷新
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载看板数据…
        </div>
      ) : stats ? (
        <>
          <section className="ops-card p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">待办</h2>
                <p className="mt-1 text-xs text-slate-500">只列出还没处理完的事项，点进去就是原来的处理页</p>
              </div>
              <p className="text-3xl font-semibold tabular-nums text-amber-300">{todos.reduce((sum, item) => sum + item.count, 0)}</p>
            </div>
            {todos.length ? (
              <>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-800">
                  {todos.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        width: `${(item.count / todos.reduce((sum, row) => sum + row.count, 0)) * 100}%`,
                        background: item.color,
                      }}
                      title={`${item.title} ${item.count}`}
                    />
                  ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {todos.map((item) => (
                    <Link
                      key={item.id}
                      to={item.to}
                      className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 hover:border-amber-400/40"
                    >
                      <span className="w-14 text-center text-3xl font-semibold tabular-nums text-white">{item.count}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                          {item.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-400">{item.detail}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
                当前没有待办。提现、审核、招募和待确认订单都已清空。
              </p>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              icon={UserPlus}
              iconClass="bg-emerald-500/15 text-emerald-400"
              label="注册用户数"
              value={stats.registeredUsers}
              hint="统计周期内新完成注册的商户租户数"
            />
            <StatCard
              icon={Activity}
              iconClass="bg-sky-500/15 text-sky-400"
              label="活跃使用用户数"
              value={stats.activeUsers}
              hint="周期内有业务资料更新或使用的商户（以租户更新时间为准）"
            />
            <StatCard
              icon={Megaphone}
              iconClass="bg-violet-500/15 text-violet-400"
              label="调用达人招募商户数"
              value={stats.recruitmentMerchants}
              hint="周期内发起商家招募或小程序招募订单的去重商户数"
            />
            <StatCard
              icon={Crown}
              iconClass="bg-amber-500/15 text-amber-400"
              label="订阅会员版用户数"
              value={stats.memberSubscribeUsers}
              hint="周期内确认会员版订阅或运营开通会员档位的去重商户数"
            />
            <StatCard
              icon={Sparkles}
              iconClass="bg-fuchsia-500/15 text-fuchsia-400"
              label="订阅会员 Plus 用户数"
              value={stats.memberPlusSubscribeUsers}
              hint="周期内确认会员 Plus 订阅或运营开通 Plus 档位的去重商户数"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link to="/payment-orders" className="ops-card flex gap-3 p-4 hover:border-indigo-500/40">
              <Wallet className="mt-0.5 h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-xs text-slate-500">钱 · 确认入账</p>
                <p className="mt-1 text-2xl font-semibold text-white">{yuanFromCents(money?.confirmedCents ?? 0)}</p>
                <p className="mt-1 text-[11px] text-slate-500">待确认订单 {money?.pendingCount ?? 0}</p>
              </div>
            </Link>
            <Link to="/talent-library" className="ops-card flex gap-3 p-4 hover:border-indigo-500/40">
              <Users className="mt-0.5 h-5 w-5 text-cyan-400" />
              <div>
                <p className="text-xs text-slate-500">人 · 达人 / PR</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {(mpStats?.talentRegistered ?? 0) + (mpStats?.prRegistered ?? 0)}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  达人新增 {mpStats?.talentRegistered ?? 0} · PR 新增 {mpStats?.prRegistered ?? 0}
                </p>
              </div>
            </Link>
            <Link to="/recruitment-orders" className="ops-card flex gap-3 p-4 hover:border-indigo-500/40">
              <Megaphone className="mt-0.5 h-5 w-5 text-violet-400" />
              <div>
                <p className="text-xs text-slate-500">单 · 招募</p>
                <p className="mt-1 text-2xl font-semibold text-white">{(recruitCounts?.erp ?? 0) + (recruitCounts?.mp ?? 0)}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  商家 {recruitCounts?.erp ?? 0} · 小程序 {recruitCounts?.mp ?? 0} · 去重商户 {stats.recruitmentMerchants}
                </p>
              </div>
            </Link>
            <Link to="/customers" className="ops-card flex gap-3 p-4 hover:border-indigo-500/40">
              <Building2 className="mt-0.5 h-5 w-5 text-sky-400" />
              <div>
                <p className="text-xs text-slate-500">人 · 商家</p>
                <p className="mt-1 text-2xl font-semibold text-white">{stats.registeredUsers}</p>
                <p className="mt-1 text-[11px] text-slate-500">周期内新注册 · 活跃 {stats.activeUsers}</p>
              </div>
            </Link>
          </div>

          <section className="grid gap-4 lg:grid-cols-5">
            <div className="ops-card p-5 lg:col-span-3">
              <h2 className="text-sm font-semibold text-slate-100">商户趋势</h2>
              <p className="mt-1 text-xs text-slate-500">新注册、活跃、发起招募的商户，按天叠在一起看</p>
              <div className="mt-3">
                <TrendChart
                  dates={daily.map((row) => row.date)}
                  series={[
                    { label: '新注册', color: '#34d399', values: daily.map((row) => row.registered) },
                    { label: '活跃', color: '#38bdf8', values: daily.map((row) => row.active) },
                    { label: '招募商户', color: '#a78bfa', values: daily.map((row) => row.recruitmentMerchants) },
                  ]}
                />
              </div>
            </div>
            <div className="ops-card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-slate-100">这一周期的构成</h2>
              <p className="mt-1 text-xs text-slate-500">色块越长，这项人数越多</p>
              <div className="mt-4">
                <ShareBars
                  parts={[
                    { label: '新注册商家', value: stats.registeredUsers, color: '#34d399' },
                    { label: '活跃商家', value: stats.activeUsers, color: '#38bdf8' },
                    { label: '招募商户', value: stats.recruitmentMerchants, color: '#a78bfa' },
                    { label: '会员版', value: stats.memberSubscribeUsers, color: '#fbbf24' },
                    { label: '会员 Plus', value: stats.memberPlusSubscribeUsers, color: '#e879f9' },
                    { label: '达人新增', value: mpStats?.talentRegistered ?? 0, color: '#22d3ee' },
                    { label: 'PR 新增', value: mpStats?.prRegistered ?? 0, color: '#fb7185' },
                  ]}
                />
              </div>
            </div>
          </section>

          <section className="ops-card p-5">
            <h2 className="text-sm font-semibold text-slate-100">订阅开通</h2>
            <p className="mt-1 text-xs text-slate-500">
              会员版 {stats.memberSubscribeUsers} · 会员 Plus {stats.memberPlusSubscribeUsers}
            </p>
            <div className="mt-3">
              <TrendChart
                dates={daily.map((row) => row.date)}
                series={[
                  { label: '会员版', color: '#fbbf24', values: daily.map((row) => row.memberSubscribe) },
                  { label: '会员 Plus', color: '#e879f9', values: daily.map((row) => row.memberPlusSubscribe) },
                ]}
              />
            </div>
          </section>

          {mpDaily.length ? (
            <section className="ops-card p-5">
              <h2 className="text-sm font-semibold text-slate-100">达人与 PR 新增</h2>
              <p className="mt-1 text-xs text-slate-500">
                达人日活 {mpStats?.talentActive ?? 0} · PR 日活 {mpStats?.prActive ?? 0}
              </p>
              <div className="mt-3">
                <CompareBars
                  dates={mpDaily.map((row) => row.date)}
                  left={{ label: '达人新增', color: '#22d3ee', values: mpDaily.map((row) => row.talentRegistered) }}
                  right={{ label: 'PR 新增', color: '#fb7185', values: mpDaily.map((row) => row.prRegistered) }}
                />
              </div>
            </section>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/announcements" className="ops-card p-4 text-sm text-slate-200 hover:border-indigo-500/40">
              <Megaphone className="mb-2 h-4 w-4 text-amber-300" />
              增长 · 公告与活动
            </Link>
            <Link to="/lecturer-review" className="ops-card p-4 text-sm text-slate-200 hover:border-indigo-500/40">
              <UserRound className="mb-2 h-4 w-4 text-amber-300" />
              审核 · 讲师与培训
            </Link>
            <Link to="/ai-models" className="ops-card p-4 text-sm text-slate-200 hover:border-indigo-500/40">
              <Bot className="mb-2 h-4 w-4 text-indigo-300" />
              AI · 模型与线路
            </Link>
            <Link to="/support?channel=erp" className="ops-card p-4 text-sm text-slate-200 hover:border-indigo-500/40">
              <Headphones className="mb-2 h-4 w-4 text-sky-300" />
              服务 · 在线客服
            </Link>
          </div>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Users className="h-4 w-4 text-indigo-400" />
              商户分日明细
            </h2>
            <DailyTable rows={daily} />
          </section>

          {mpStats ? (
            <>
              <section className="space-y-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <UserRound className="h-4 w-4 text-cyan-400" />
                  达人 / PR 小程序用户
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    icon={UserPlus}
                    iconClass="bg-cyan-500/15 text-cyan-400"
                    label="达人新增注册"
                    value={mpStats.talentRegistered}
                    hint="统计周期内新完成注册的小程序达人会员数"
                  />
                  <StatCard
                    icon={Activity}
                    iconClass="bg-teal-500/15 text-teal-400"
                    label="达人日活"
                    value={mpStats.talentActive}
                    hint="周期内有资料或业务更新的达人（以会员 updatedAt 为准）"
                  />
                  <StatCard
                    icon={UserPlus}
                    iconClass="bg-pink-500/15 text-pink-400"
                    label="PR 新增注册"
                    value={mpStats.prRegistered}
                    hint="统计周期内新完成注册的 PR 用户数"
                  />
                  <StatCard
                    icon={Activity}
                    iconClass="bg-rose-500/15 text-rose-400"
                    label="PR 日活"
                    value={mpStats.prActive}
                    hint="周期内有资料或业务更新的 PR（以 updatedAt 为准）"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-200">达人 / PR 分日明细</h2>
                <MpUserDailyTable rows={mpDaily} />
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
