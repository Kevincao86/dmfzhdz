import { useEffect, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import { buildHallDashboardStats, type HallDashboardStats } from '../../lib/mpRecruitment/hallDashboard'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../../lib/mpWorkIdentity'
import { getActiveRole } from '../../lib/mpSession'

const METRIC_CARDS: { key: keyof HallDashboardStats; label: string; color: string }[] = [
  { key: 'total', label: '撮合单总量', color: 'from-blue-500 to-blue-600' },
  { key: 'recruiting', label: '招募中', color: 'from-violet-500 to-violet-600' },
  { key: 'collecting', label: '收集中', color: 'from-indigo-500 to-indigo-600' },
  { key: 'todayNew', label: '今日新增', color: 'from-cyan-500 to-cyan-600' },
]

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="stat-bar-row flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-[var(--shell-muted)] truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--shell-hover)] overflow-hidden">
        <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${Math.max(pct, count ? 8 : 0)}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-[var(--shell-text)]">{count}</span>
    </div>
  )
}

function DonutChart({ items }: { items: { platform: string; count: number }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0) || 1
  const colors = ['#8b5cf6', '#3b82f6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899']
  let offset = 0
  const segments = items
    .filter((i) => i.count > 0)
    .map((item, idx) => {
      const pct = (item.count / total) * 100
      const seg = { ...item, pct, color: colors[idx % colors.length], offset }
      offset += pct
      return seg
    })

  if (!segments.length) {
    return (
      <div className="flex items-center justify-center h-40 text-[var(--shell-muted)] text-sm">
        暂无平台分布数据
      </div>
    )
  }

  const gradient = segments.map((s) => `${s.color} ${s.offset}% ${s.offset + s.pct}%`).join(', ')

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div
        className="w-36 h-36 rounded-full shrink-0"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <ul className="space-y-2 text-sm flex-1">
        {segments.map((s) => (
          <li key={s.platform} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-[var(--shell-text)]">{s.platform}</span>
            <span className="text-[var(--shell-muted)] ml-auto">{s.count} · {Math.round(s.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function HallHomeDashboard() {
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const edition = role === 'pr' ? 'PR 版' : WORK_EDITION_LABEL[workId]
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<HallDashboardStats | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry()
        const identity = role === 'pr' ? 'pr' : workId
        setStats(buildHallDashboardStats(reg, identity))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [role, workId])

  const maxPlatform = Math.max(...(stats?.platformCounts.map((p) => p.count) || [1]), 1)
  const maxCategory = Math.max(...(stats?.categoryCounts.map((c) => c.count) || [1]), 1)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--shell-text)]">首页</h2>
        <p className="text-sm text-[var(--shell-muted)] mt-1">
          {edition} · 各平台撮合单发布与进展概览
        </p>
      </div>

      {loading ? <p className="text-[var(--shell-muted)]">加载数据中…</p> : null}
      {err ? <p className="text-red-500 text-sm">{err}</p> : null}

      {stats ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {METRIC_CARDS.map((c) => (
              <div
                key={c.key}
                className={`metric-card rounded-xl bg-gradient-to-br ${c.color} p-4 text-white shadow-sm`}
              >
                <p className="text-sm opacity-90">{c.label}</p>
                <p className="text-3xl font-bold mt-2">{stats[c.key] as number}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel-card hover-panel rounded-xl p-4 lg:col-span-1">
              <h3 className="font-semibold text-[var(--shell-text)] mb-4">平台发布分布</h3>
              <ul className="space-y-3">
                {stats.platformCounts.map((p) => (
                  <BarRow key={p.platform} label={p.platform} count={p.count} max={maxPlatform} />
                ))}
              </ul>
            </div>

            <div className="panel-card hover-panel rounded-xl p-4 lg:col-span-1">
              <h3 className="font-semibold text-[var(--shell-text)] mb-4">撮合单平台占比</h3>
              <DonutChart items={stats.platformCounts} />
            </div>

            <div className="panel-card hover-panel rounded-xl p-4 lg:col-span-1">
              <h3 className="font-semibold text-[var(--shell-text)] mb-4">品类分布</h3>
              <ul className="space-y-3">
                {stats.categoryCounts.length ? (
                  stats.categoryCounts.map((c) => (
                    <BarRow key={c.category} label={c.category} count={c.count} max={maxCategory} />
                  ))
                ) : (
                  <p className="text-sm text-[var(--shell-muted)]">暂无品类数据</p>
                )}
              </ul>
            </div>
          </div>

          <div className="panel-card hover-panel rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="font-semibold text-[var(--shell-text)]">撮合进展</h3>
              <div className="flex flex-wrap gap-3 text-sm text-[var(--shell-muted)]">
                <span>急单 {stats.urgent}</span>
                <span>云剪 {stats.ice}</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {stats.statusCounts.map((s) => (
                <div key={s.label} className="status-tile rounded-lg bg-[var(--shell-hover)] px-4 py-3">
                  <p className="text-xs text-[var(--shell-muted)]">{s.label}</p>
                  <p className="text-2xl font-bold text-[var(--shell-text)] mt-1">{s.count}</p>
                </div>
              ))}
            </div>
            {!stats.statusCounts.length ? (
              <p className="text-sm text-[var(--shell-muted)] py-8 text-center">暂无进展数据</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
