import { Activity, Loader2, Megaphone, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  computeDashboardDailySeries,
  computeDashboardStats,
  type DashboardDailyPoint,
  type DashboardStats,
} from '../opsDashboardCompute'
import { buildDashboardRange, formatRangeCaption, type DashboardPreset } from '../opsDashboardRange'
import { fetchRegistry } from '../opsRegistryApi'
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
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
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

function DailyTable({ rows }: { rows: DashboardDailyPoint[] }) {
  if (rows.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-950 text-[11px] font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2.5">日期</th>
            <th className="px-3 py-2.5">新增注册</th>
            <th className="px-3 py-2.5">活跃用户</th>
            <th className="px-3 py-2.5">达人招募商户</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {[...rows].reverse().map((r) => (
            <tr key={r.date} className="hover:bg-slate-800/30">
              <td className="px-3 py-2 font-mono text-xs text-slate-300">{r.date}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.registered}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.active}</td>
              <td className="px-3 py-2 tabular-nums text-slate-200">{r.recruitmentMerchants}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
        return
      }
      const tenants = sb.ok ? sb.rows : []

      let recruitmentOrders: Awaited<ReturnType<typeof fetchRegistry>>['recruitmentOrders'] = []
      let mpOrders: Awaited<ReturnType<typeof fetchRegistry>>['mpRecruitmentOrders'] = []
      try {
        const reg = await fetchRegistry()
        recruitmentOrders = reg.recruitmentOrders ?? []
        mpOrders = reg.mpRecruitmentOrders ?? []
      } catch {
        /* 招募统计可仅用 Supabase 租户；注册表不可用时招募数为 0 */
      }

      const r = buildDashboardRange(preset, customStart, customEnd)
      setStats(computeDashboardStats(tenants, recruitmentOrders, mpOrders, r))
      setDaily(computeDashboardDailySeries(tenants, recruitmentOrders, mpOrders, r))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStats(null)
      setDaily([])
    } finally {
      setLoading(false)
    }
  }, [preset, customStart, customEnd])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">运营首页</h1>
        <p className="mt-1 text-sm text-slate-500">
          数据看板汇总商户注册、活跃与达人招募使用情况（统计周期：{formatRangeCaption(range)}）
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Users className="h-4 w-4 text-indigo-400" />
              分日明细
            </h2>
            <DailyTable rows={daily} />
          </section>
        </>
      ) : null}
    </div>
  )
}
