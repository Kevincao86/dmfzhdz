import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as listFilters from '../../lib/mpRecruitment/listFilters'
import { loadAllOrderRows } from '../../lib/mpRecruitment/orderCard'
import {
  matchListKeyword,
  matchesOrderIdKeyword,
  looksLikeOrderNoSearch,
} from '../../lib/mpRecruitment/listKeywordSearch'
import {
  matchStatusLabel,
  splitRoleHallRows,
  STATUS_FILTER_OPTIONS,
  HALL_DEFAULT_STATUS_FILTER,
} from '../../lib/mpRecruitment/roleHallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { getWorkIdentity, WORK_EDITION_LABEL, workIdentityLabel } from '../../lib/mpWorkIdentity'
import { getActiveRole } from '../../lib/mpSession'
import RecruitmentOrderCard from './RecruitmentOrderCard'
import HallCityFilter from './HallCityFilter'
import HallToolbarCard from './HallToolbarCard'
import PageHero from '../ui/PageHero'
import { showDemoOrders } from '../../lib/mpDemoMode'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'

type HallTab = 'normal' | 'urgent' | 'paichian'
type PaichianSubTab = 'shoot' | 'edit' | 'ice'

function filterHallRows(
  rows: RecruitmentOrderRow[],
  opts: {
    keyword: string
    filterPlatform: string
    filterProvince: string
    filterCity: string
    filterCategory: string
    filterStatus: string
    priceSelected: string[]
  },
  forTabCount = false,
): RecruitmentOrderRow[] {
  const kw = opts.keyword.trim()
  const searchByOrderNo = looksLikeOrderNoSearch(kw)
  return rows.filter((r) => {
    if (!showDemoOrders() && r.isMock) return false
    const row = r as unknown as Record<string, unknown>
    if (!matchListKeyword(row, kw)) return false
    if (!hallFilters.matchPlatform(r.platform, opts.filterPlatform)) return false
    if (!hallFilters.matchRegionFilter(r.region, r.storeName, opts.filterProvince, opts.filterCity)) return false
    if (!hallFilters.matchCategory(r.category, opts.filterCategory)) return false
    if (!hallFilters.matchPriceBuckets(r.priceAmount, opts.priceSelected)) return false
    if (searchByOrderNo && matchesOrderIdKeyword(row, kw)) return true
    // Tab 角标：统计该分类招募单总数，不受状态筛选项影响
    if (!forTabCount && !matchStatusLabel(r, opts.filterStatus)) return false
    return true
  })
}

type Props = { prMode?: boolean }

export default function HallRecruitmentPanel({ prMode = false }: Props) {
  const goDetail = useRecruitmentNav()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const hallIdentity = prMode || role === 'pr' ? 'pr' : workId
  const [hallTab, setHallTab] = useState<HallTab>('normal')
  const [paichianSubTab, setPaichianSubTab] = useState<PaichianSubTab>('shoot')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [filterStatus, setFilterStatus] = useState(HALL_DEFAULT_STATUS_FILTER)
  const [filterCategory, setFilterCategory] = useState('全部')
  const [priceSelected, setPriceSelected] = useState<string[]>([])
  const [priceFilterLabel, setPriceFilterLabel] = useState('价格筛选')
  const [showPriceSheet, setShowPriceSheet] = useState(false)
  const [sortBy, setSortBy] = useState<string>('发布时间')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [normalRows, setNormalRows] = useState<RecruitmentOrderRow[]>([])
  const [urgentRows, setUrgentRows] = useState<RecruitmentOrderRow[]>([])
  const [shootRows, setShootRows] = useState<RecruitmentOrderRow[]>([])
  const [editRows, setEditRows] = useState<RecruitmentOrderRow[]>([])
  const [iceRows, setIceRows] = useState<RecruitmentOrderRow[]>([])
  const [displayRows, setDisplayRows] = useState<RecruitmentOrderRow[]>([])

  const filterOpts = useMemo(
    () => ({
      keyword: debouncedSearchKeyword,
      filterPlatform,
      filterProvince,
      filterCity,
      filterCategory,
      filterStatus,
      priceSelected,
    }),
    [
      debouncedSearchKeyword,
      filterPlatform,
      filterProvince,
      filterCity,
      filterCategory,
      filterStatus,
      priceSelected,
    ],
  )

  const tabCounts = useMemo(() => {
    const normal = filterHallRows(normalRows, filterOpts, true).length
    const urgent = filterHallRows(urgentRows, filterOpts, true).length
    const shoot = filterHallRows(shootRows, filterOpts, true).length
    const edit = filterHallRows(editRows, filterOpts, true).length
    const ice = filterHallRows(iceRows, filterOpts, true).length
    return { normal, urgent, paichian: shoot + edit + ice, shoot, edit, ice }
  }, [normalRows, urgentRows, shootRows, editRows, iceRows, filterOpts])

  const applyFilters = useCallback(async () => {
    let rows = normalRows
    if (hallTab === 'urgent') rows = urgentRows
    else if (hallTab === 'paichian') {
      if (paichianSubTab === 'edit') rows = editRows
      else if (paichianSubTab === 'ice') rows = iceRows
      else rows = shootRows
    }
    rows = filterHallRows(rows, filterOpts)
    rows = listFilters.sortHallRecruitmentRows(rows, sortBy)
    const base = rows.map((r) => ({ ...r, ...recruitmentAi.fallbackTagForRow(r), aiTagSource: 'local' }))
    setDisplayRows(base)
    const enriched = await recruitmentAi.enrichOrderTags(base)
    setDisplayRows(enriched)
  }, [
    hallTab,
    paichianSubTab,
    urgentRows,
    shootRows,
    editRows,
    iceRows,
    normalRows,
    filterOpts,
    filterStatus,
    sortBy,
  ])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchKeyword(searchKeyword), 300)
    return () => clearTimeout(t)
  }, [searchKeyword])

  useEffect(() => {
    void applyFilters()
  }, [applyFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry()
        const mapped = loadAllOrderRows(reg)
        const { normalRows: n, urgentRows: u, shootRows: sh, editRows: ed, iceRows: i, todayCount: tc } =
          splitRoleHallRows(mapped, hallIdentity)
        setNormalRows(listFilters.mergeHallDisplayRows(n, { allowDemo: showDemoOrders() }))
        setUrgentRows(u)
        setShootRows(sh)
        setEditRows(ed)
        setIceRows(i)
        setTodayCount(tc)
        if (hallIdentity === 'edit') setPaichianSubTab('edit')
        else if (hallIdentity === 'shoot') setPaichianSubTab('shoot')
        else if (hallIdentity === 'talent' && !sh.length && !ed.length && i.length) setPaichianSubTab('ice')
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [hallIdentity])

  const roleHint =
    hallIdentity === 'pr'
      ? 'PR 视角 · 全部开放商单'
      : `${WORK_EDITION_LABEL[hallIdentity]} · ${workIdentityLabel(hallIdentity)}招募 + 云剪任务`

  const tabs: { id: HallTab; label: string; count: number }[] = [
    { id: 'normal', label: '招募大厅', count: tabCounts.normal },
    { id: 'urgent', label: '急单大厅', count: tabCounts.urgent },
    {
      id: 'paichian',
      label: '拍剪任务',
      count: tabCounts.paichian,
    },
  ]
  const paichianSubs: { id: PaichianSubTab; label: string; count: number }[] = [
    { id: 'shoot', label: '拍摄任务', count: tabCounts.shoot },
    { id: 'edit', label: '剪辑任务', count: tabCounts.edit },
    { id: 'ice', label: '云剪任务', count: tabCounts.ice },
  ]

  const heroBadgeCount = useMemo(() => {
    if (hallTab === 'urgent') return tabCounts.urgent
    if (hallTab === 'paichian') {
      if (paichianSubTab === 'edit') return tabCounts.edit
      if (paichianSubTab === 'ice') return tabCounts.ice
      return tabCounts.shoot
    }
    return tabCounts.normal
  }, [hallTab, paichianSubTab, tabCounts])

  const listTwoCol = displayRows.length > 1

  return (
    <div className="hall-page">
      <HallToolbarCard>
        <PageHero
          inset
          title="招募大厅"
          subtitle={`${roleHint} · 今日 ${todayCount} 条新单 · 支持平台、城市、类目与价格筛选`}
          badge={`${heroBadgeCount} 条`}
        />

        <input
          className="hall-search-input panel-input"
          placeholder="搜索招募、门店、城市、单号"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />

        <div className="hall-segment-row">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm ${hallTab === t.id ? 'panel-tab-active' : 'panel-tab'}`}
            onClick={() => setHallTab(t.id)}
          >
            {t.label}
            {t.count > 0 ? ` ${t.count}` : ''}
          </button>
        ))}
      </div>

      {hallTab === 'paichian' ? (
        <div className="hall-segment-row">
          {paichianSubs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-1.5 rounded-full text-sm ${paichianSubTab === t.id ? 'panel-tab-active' : 'panel-tab'}`}
              onClick={() => setPaichianSubTab(t.id)}
            >
              {t.label}
              {t.count > 0 ? ` ${t.count}` : ''}
            </button>
          ))}
        </div>
      ) : null}

      <div className="hall-filter-row">
        <select
          className="rounded-lg panel-select px-2 py-1.5"
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
        >
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>
              {p === '全部' ? '平台' : p}
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
        <select
          className="rounded-lg panel-select px-2 py-1.5"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          {hallFilters.CATEGORY_FILTERS.map((c) => (
            <option key={c} value={c}>
              {c === '全部' ? '类目' : c}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg panel-select px-2 py-1.5"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          {STATUS_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === '全部' ? '招募单状态' : s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`rounded-lg border px-2 py-1.5 ${
            priceSelected.length ? 'border-violet-500 text-violet-500' : 'border-[var(--shell-border)]'
          }`}
          onClick={() => setShowPriceSheet(true)}
        >
          {priceFilterLabel}
        </button>
        <select
          className="rounded-lg panel-select px-2 py-1.5"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          {listFilters.SORT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      </HallToolbarCard>

      {loading ? <p className="text-[var(--shell-muted)]">加载招募中…</p> : null}
      {err ? <p className="text-red-500 text-sm whitespace-pre-wrap">{err}</p> : null}

      <div className={`hall-list${listTwoCol ? ' hall-list--two-col' : ''}`}>
        {displayRows.map((o) => (
          <RecruitmentOrderCard
            key={o.id}
            row={o}
            onClick={() => goDetail(o)}
          />
        ))}
      </div>
      {!loading && !displayRows.length ? <p className="text-[var(--shell-muted)]">暂无匹配招募</p> : null}

      {showPriceSheet ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--panel-overlay)] p-4"
          onClick={() => setShowPriceSheet(false)}
        >
          <div className="w-full max-w-md rounded-2xl panel-card p-4" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium mb-3 text-[var(--shell-text)]">价格筛选（可多选）</p>
            <div className="flex flex-wrap gap-2">
              {hallFilters.priceBucketsForView(priceSelected).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`px-3 py-1.5 rounded-full text-sm ${b.selected ? 'panel-tab-active' : 'panel-tab'}`}
                  onClick={() => setPriceSelected(hallFilters.togglePriceId(priceSelected, b.id))}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className="flex-1 py-2 rounded-lg border border-[var(--shell-border)]" onClick={() => setPriceSelected([])}>
                清空
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded-lg panel-tab-active"
                onClick={() => {
                  setPriceFilterLabel(hallFilters.priceFilterLabel(priceSelected))
                  setShowPriceSheet(false)
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
