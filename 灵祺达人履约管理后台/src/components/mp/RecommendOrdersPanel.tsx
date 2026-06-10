import { useCallback, useEffect, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import { getWorkIdentity } from '../../lib/mpWorkIdentity'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as listFilters from '../../lib/mpRecruitment/listFilters'
import { loadAllOrderRows } from '../../lib/mpRecruitment/orderCard'
import { matchListKeyword } from '../../lib/mpRecruitment/listKeywordSearch'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import RecruitmentOrderCard from './RecruitmentOrderCard'
import HallCityFilter from './HallCityFilter'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'
import { readMember, hasFilledPlatform, TALENT_SMART_MATCH_NEED_PROFILE_HINT } from '../../lib/mpSync/talentMember'
import { showDemoOrders } from '../../lib/mpDemoMode'

const ORDER_SEGMENTS = [
  { id: 'match', label: '为你匹配' },
  { id: 'quality', label: '优质' },
  { id: 'hot', label: '热门全国' },
  { id: 'city', label: '同城匹配' },
] as const

function matchOrderSearch(row: RecruitmentOrderRow, keyword: string) {
  return matchListKeyword(row as unknown as Record<string, unknown>, keyword)
}

function matchOrderSegment(row: RecruitmentOrderRow, segment: string, talentCity: string) {
  if (segment === 'match') return true
  if (segment === 'quality') return row.recommended || row.urgent || (row.priceAmount || 0) >= 1000
  if (segment === 'city') {
    if (!talentCity) return false
    const region = String(row.region || '')
    if (region.includes('全国')) return false
    return region.includes(talentCity)
  }
  return true
}

export default function RecommendOrdersPanel() {
  const goDetail = useRecruitmentNav()
  const member = readMember()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [orderSegment, setOrderSegment] = useState('match')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [priceSelected, setPriceSelected] = useState<string[]>([])
  const [priceFilterLabel, setPriceFilterLabel] = useState('价格')
  const [showPriceSheet, setShowPriceSheet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allOrderRows, setAllOrderRows] = useState<RecruitmentOrderRow[]>([])
  const [orderDisplayRows, setOrderDisplayRows] = useState<RecruitmentOrderRow[]>([])
  const [orderEmptyHint, setOrderEmptyHint] = useState('')
  const talentCity = member?.city || member?.province || ''

  const applyOrderFilters = useCallback(async () => {
    const memberRow = readMember()
    if (orderSegment === 'match' && !hasFilledPlatform(memberRow)) {
      setOrderDisplayRows([])
      setOrderEmptyHint(TALENT_SMART_MATCH_NEED_PROFILE_HINT)
      return
    }
    const kw = searchKeyword.trim()
    const priceSel = priceSelected
    let rows = allOrderRows.filter((r) => {
      if (!matchOrderSearch(r, kw)) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchRegionFilter(r.region, r.storeName, filterProvince, filterCity)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSel)) return false
      if (!matchOrderSegment(r, orderSegment, talentCity)) return false
      return true
    })
    const allowDemo = showDemoOrders()
    const mocks = allowDemo ? rows.filter((r) => r.isMock) : []
    let real = rows.filter((r) => !r.isMock)
    if (memberRow && real.length) {
      real = await recruitmentAi.enrichOrderMatches(real, memberRow, { workIdentity: getWorkIdentity() })
    } else if (real.length) {
      real = await recruitmentAi.enrichOrderTags(real, talentCity)
      real = real.map((r) => ({ ...r, matchScore: 0, aiMatch: false }))
    }
    const highMatch = real.filter((r) => (r.matchScore || 0) >= 55 || r.aiMatch)
    const highIds = new Set(highMatch.map((r) => r.id))
    const otherReal = real.filter((r) => !highIds.has(r.id))
    rows = [...highMatch, ...otherReal, ...mocks]
    let hint = ''
    if (!rows.length) {
      if (orderSegment === 'city' && !talentCity) hint = '请先在「我的」完善城市信息'
      else hint = '暂无匹配商单，试试切换分类或筛选'
    }
    setOrderDisplayRows(rows.slice(0, 50))
    setOrderEmptyHint(hint)
  }, [allOrderRows, searchKeyword, orderSegment, filterPlatform, filterProvince, filterCity, priceSelected, talentCity])

  useEffect(() => {
    void applyOrderFilters()
  }, [applyOrderFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const reg = await fetchMpRegistry()
        const real = loadAllOrderRows(reg)
        const rows =
          showDemoOrders() && !real.length
            ? listFilters.buildMockRecruitmentRows()
            : showDemoOrders()
              ? [...listFilters.buildMockRecruitmentRows(), ...real]
              : real
        setAllOrderRows(rows)
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
        setAllOrderRows(showDemoOrders() ? listFilters.buildMockRecruitmentRows() : [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">推荐商单</h2>
        <p className="text-sm text-slate-400 mt-1">优质 · 热门全国 · 同城匹配</p>
      </div>
      <input
        className="w-full rounded-lg panel-input border px-3 py-2.5 text-sm"
        placeholder="搜索商单、门店、城市、单号"
        value={searchKeyword}
        onChange={(e) => setSearchKeyword(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {ORDER_SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`px-3 py-1.5 rounded-lg text-sm ${orderSegment === s.id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}
            onClick={() => setOrderSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <select className="rounded-lg panel-input border px-2 py-1.5" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
          {hallFilters.PLATFORM_FILTERS.map((p) => (
            <option key={p} value={p}>{p === '全部' ? '平台' : p}</option>
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
        <button type="button" className="rounded-lg panel-input border px-2 py-1.5" onClick={() => setShowPriceSheet(true)}>
          {priceFilterLabel}
        </button>
      </div>
      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err ? <p className="text-amber-500 text-sm">{err}</p> : null}
      {orderEmptyHint ? <p className="text-slate-500 text-sm">{orderEmptyHint}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {orderDisplayRows.map((o) => (
          <RecruitmentOrderCard key={o.id} row={o} onClick={() => goDetail(o)} />
        ))}
      </div>
      {showPriceSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4" onClick={() => setShowPriceSheet(false)}>
          <div className="w-full max-w-md rounded-2xl panel-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2">
              {hallFilters.priceBucketsForView(priceSelected).map((b) => (
                <button key={b.id} type="button" className={`px-3 py-1.5 rounded-full text-sm ${b.selected ? 'bg-violet-600' : 'bg-white/10'}`} onClick={() => setPriceSelected(hallFilters.togglePriceId(priceSelected, b.id))}>
                  {b.label}
                </button>
              ))}
            </div>
            <button type="button" className="w-full mt-4 py-2 rounded-lg bg-violet-600" onClick={() => { setPriceFilterLabel(hallFilters.priceFilterLabel(priceSelected, '价格')); setShowPriceSheet(false) }}>
              确定
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
