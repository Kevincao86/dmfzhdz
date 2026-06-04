import { useCallback, useEffect, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as listFilters from '../../lib/mpRecruitment/listFilters'
import { splitHallRows } from '../../lib/mpRecruitment/orderCard'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import RecruitmentOrderCard from './RecruitmentOrderCard'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'

type HallTab = 'normal' | 'urgent' | 'paichian'
type PaichianSubTab = 'shoot' | 'edit' | 'ice'

function matchSearch(row: RecruitmentOrderRow, keyword: string) {
  if (!keyword) return true
  const k = keyword.toLowerCase()
  const blob = [row.title, row.merchantName, row.storeName, row.region, row.category].join(' ').toLowerCase()
  return blob.includes(k)
}

type Props = { prMode?: boolean }

export default function HallRecruitmentPanel({ prMode = false }: Props) {
  const goDetail = useRecruitmentNav()
  const [hallTab, setHallTab] = useState<HallTab>('normal')
  const [paichianSubTab, setPaichianSubTab] = useState<PaichianSubTab>('shoot')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
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
  const [cityFilters, setCityFilters] = useState<string[]>(['全部'])

  const applyFilters = useCallback(async () => {
    let rows = normalRows
    if (hallTab === 'urgent') rows = urgentRows
    else if (hallTab === 'paichian') {
      if (paichianSubTab === 'edit') rows = editRows
      else if (paichianSubTab === 'ice') rows = iceRows
      else rows = shootRows
    }
    const kw = searchKeyword.trim()
    rows = rows.filter((r) => {
      if (!matchSearch(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchCity(r.region, r.storeName, filterCity)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSelected)) return false
      return true
    })
    rows = listFilters.sortRecruitmentRows(rows, sortBy)
    const base = rows.map((r) => ({ ...r, ...recruitmentAi.fallbackTagForRow(r), aiTagSource: 'local' }))
    setDisplayRows(base)
    const enriched = await recruitmentAi.enrichOrderTags(base)
    setDisplayRows(enriched)
  }, [hallTab, paichianSubTab, urgentRows, shootRows, editRows, iceRows, normalRows, searchKeyword, filterPlatform, filterCity, priceSelected, sortBy])

  useEffect(() => {
    void applyFilters()
  }, [applyFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry()
        const { normalRows: n, urgentRows: u, shootRows: sh, editRows: ed, iceRows: i, todayCount: tc } =
          splitHallRows(reg)
        setNormalRows(n)
        setUrgentRows(u)
        setShootRows(sh)
        setEditRows(ed)
        setIceRows(i)
        setTodayCount(tc)
        setCityFilters(hallFilters.buildCityFilterOptions([...n, ...u, ...sh, ...ed, ...i]))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const tabs: { id: HallTab; label: string; count: number }[] = [
    { id: 'normal', label: '招募大厅', count: normalRows.length },
    { id: 'urgent', label: '急单大厅', count: urgentRows.length },
    {
      id: 'paichian',
      label: '拍剪任务',
      count: shootRows.length + editRows.length + iceRows.length,
    },
  ]
  const paichianSubs: { id: PaichianSubTab; label: string; count: number }[] = [
    { id: 'shoot', label: '拍摄任务', count: shootRows.length },
    { id: 'edit', label: '剪辑任务', count: editRows.length },
    { id: 'ice', label: '云剪任务', count: iceRows.length },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">招募大厅</h2>
        <p className="text-sm text-slate-400 mt-1">
          {prMode ? 'PR 视角 · 全部开放商单' : '与小程序首页大厅同源'} · 今日 {todayCount} 条
        </p>
      </div>

      <input
        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm"
        placeholder="搜索招募、门店、城市"
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
      />

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm ${
              hallTab === t.id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'
            }`}
            onClick={() => setHallTab(t.id)}
          >
            {t.label}
            {t.count > 0 ? ` ${t.count}` : ''}
          </button>
        ))}
      </div>

      {hallTab === 'paichian' ? (
        <div className="flex gap-2 flex-wrap">
          {paichianSubs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`px-3 py-1.5 rounded-full text-sm ${
                paichianSubTab === t.id ? 'bg-violet-600/80 text-white' : 'bg-white/5 text-slate-400'
              }`}
              onClick={() => setPaichianSubTab(t.id)}
            >
              {t.label}
              {t.count > 0 ? ` ${t.count}` : ''}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
        >
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>
              {p === '全部' ? '平台' : p}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
        >
          {cityFilters.map((c) => (
            <option key={c} value={c}>
              {c === '全部' ? '城市' : c}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`rounded-lg border px-2 py-1.5 ${priceSelected.length ? 'border-violet-500 text-violet-300' : 'border-white/10'}`}
          onClick={() => setShowPriceSheet(true)}
        >
          {priceFilterLabel}
        </button>
        <select
          className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5"
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

      {loading ? <p className="text-slate-400">加载招募中…</p> : null}
      {err ? <p className="text-red-400 text-sm whitespace-pre-wrap">{err}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {displayRows.map((o) => (
          <RecruitmentOrderCard
            key={o.id}
            row={o}
            onClick={() => goDetail(o)}
          />
        ))}
      </div>
      {!loading && !displayRows.length ? <p className="text-slate-500">暂无匹配招募</p> : null}

      {showPriceSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setShowPriceSheet(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[#1a1a28] p-4 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium mb-3">价格筛选（可多选）</p>
            <div className="flex flex-wrap gap-2">
              {hallFilters.priceBucketsForView(priceSelected).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`px-3 py-1.5 rounded-full text-sm ${b.selected ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => setPriceSelected(hallFilters.togglePriceId(priceSelected, b.id))}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className="flex-1 py-2 rounded-lg border border-white/10" onClick={() => setPriceSelected([])}>
                清空
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded-lg bg-violet-600"
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
