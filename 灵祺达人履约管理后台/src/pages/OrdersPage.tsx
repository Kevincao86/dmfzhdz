import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { readApplications, type ApplicationLocal } from '../lib/mpSync/applicationsStore'
import {
  APPLICATION_TIME_FILTERS,
  matchApplicationTimeFilter,
  parseAppliedAtMs,
  type ApplicationTimeFilterId,
} from '../lib/mpRecruitment/applicationFilters'
import * as hallFilters from '../lib/mpRecruitment/hallFilters'
import { mapMpOrderRow } from '../lib/mpRecruitment/orderCard'
import PrOrdersPage from './PrOrdersPage'
import PageHero from '../components/ui/PageHero'
import HallCityFilter from '../components/mp/HallCityFilter'

type EnrichedApplication = ApplicationLocal & {
  region?: string
  category?: string
  statusLabel?: string
}

/** 达人：我的报名；PR：我的发单 */
export default function OrdersPage() {
  const role = getActiveRole()
  if (role === 'pr') return <PrOrdersPage />
  return <TalentApplicationsPage />
}

function TalentApplicationsPage() {
  const acc = getAccount()
  const [apps, setApps] = useState<EnrichedApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTime, setFilterTime] = useState<ApplicationTimeFilterId>('all')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const local = readApplications()
      try {
        const reg = await fetchMpRegistry()
        const mpList = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<
          string,
          unknown
        >[]
        const enriched: EnrichedApplication[] = local.map((a) => {
          const mp = mpList.find((o) => o && String(o.id) === a.mpOrderId)
          if (!mp) return { ...a }
          const row = mapMpOrderRow(mp, reg)
          return {
            ...a,
            title: a.title || row.title,
            platform: a.platform || row.platform,
            region: row.region,
            category: row.category,
            statusLabel: row.statusLabel,
          }
        })
        if (!cancelled) setApps(enriched)
      } catch {
        if (!cancelled) setApps(local)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      const ms = parseAppliedAtMs(a.appliedAt)
      if (!matchApplicationTimeFilter(ms, filterTime)) return false
      if (!hallFilters.matchCategory(a.category || '', filterCategory)) return false
      if (!hallFilters.matchRegionFilter(a.region || '', '', filterProvince, filterCity)) return false
      return true
    })
  }, [apps, filterTime, filterCategory, filterProvince, filterCity])

  return (
    <div className="max-w-3xl space-y-4">
      <PageHero
        title="我的报名"
        subtitle="查看已提交的招募报名，可按时间、类目与城市筛选，快速回到商单详情。"
        badge={`${filtered.length} 条记录`}
      >
        <Link
          to="/hall"
          className="inline-flex items-center px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          去招募大厅
        </Link>
      </PageHero>

      <p className="text-sm text-[var(--shell-muted)] px-1">
        灵祺达人 ID：<span className="text-amber-500 font-mono">{acc?.lingqiTalentId || '—'}</span>
      </p>

      {apps.length > 0 ? (
        <div className="filter-strip rounded-xl border p-3 flex flex-wrap gap-2 items-center text-sm">
          <span className="text-xs text-[var(--shell-muted)] mr-1">筛选</span>
          <select
            className="rounded-lg panel-input border px-2 py-1.5"
            value={filterTime}
            onChange={(e) => setFilterTime(e.target.value as ApplicationTimeFilterId)}
          >
            {APPLICATION_TIME_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg panel-input border px-2 py-1.5"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            {hallFilters.CATEGORY_FILTERS.map((c) => (
              <option key={c} value={c}>
                {c === '全部' ? '全部类目' : c}
              </option>
            ))}
          </select>
          <HallCityFilter
            compact
            province={filterProvince}
            city={filterCity}
            onChange={(prov, c) => {
              setFilterProvince(prov)
              setFilterCity(c)
            }}
          />
        </div>
      ) : null}

      {loading ? <p className="text-[var(--shell-muted)] text-sm px-1">加载报名记录…</p> : null}

      {!loading && !apps.length ? (
        <div className="surface-card rounded-xl border p-8 text-center">
          <p className="text-[var(--shell-muted)]">暂无报名记录</p>
          <p className="text-xs text-[var(--shell-muted)] mt-2">去招募大厅挑选商单，一键提交报名后会出现在这里</p>
          <Link
            to="/hall"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500"
          >
            浏览招募大厅
          </Link>
        </div>
      ) : null}

      {!loading && apps.length && !filtered.length ? (
        <p className="text-sm text-[var(--shell-muted)] text-center py-8">当前筛选条件下暂无报名</p>
      ) : null}

      <div className="space-y-3">
        {filtered.map((a) => (
          <article
            key={`${a.mpOrderId}-${a.applicantId}`}
            className="surface-card rounded-xl border p-4 hover-panel flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {a.platform ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600">{a.platform}</span>
                ) : null}
                {a.category ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{a.category}</span>
                ) : null}
                {a.statusLabel ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">
                    {a.statusLabel}
                  </span>
                ) : null}
              </div>
              <h3 className="font-semibold text-[var(--shell-text)] truncate">{a.title || a.mpOrderId}</h3>
              <p className="text-xs text-[var(--shell-muted)] mt-1.5">
                {a.region || '—'} · 报名于 {a.appliedAt || '—'}
              </p>
            </div>
            <Link
              to={`/recruitment/${encodeURIComponent(a.mpOrderId)}?applied=1`}
              className="shrink-0 text-sm px-4 py-2 rounded-lg border border-violet-500/40 text-violet-600 hover:bg-violet-50 text-center"
            >
              查看招募详情
            </Link>
          </article>
        ))}
      </div>
    </div>
  )
}
