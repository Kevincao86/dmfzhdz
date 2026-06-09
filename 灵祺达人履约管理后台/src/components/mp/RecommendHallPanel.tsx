import { useCallback, useEffect, useState } from 'react'
import { fetchMpRegistry } from '../../lib/mpApi'
import { getActiveRole } from '../../lib/mpSession'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as listFilters from '../../lib/mpRecruitment/listFilters'
import { loadOpenOrderRows } from '../../lib/mpRecruitment/orderCard'
import { orderVisibleToWorkIdentity } from '../../lib/mpRecruitment/roleHallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../../lib/mpWorkIdentity'
import { readMember, hasFilledPlatform, TALENT_SMART_MATCH_NEED_PROFILE_HINT } from '../../lib/mpSync/talentMember'
import RecruitmentOrderCard from './RecruitmentOrderCard'
import HallCityFilter from './HallCityFilter'
import HallToolbarCard from './HallToolbarCard'
import RecommendTalentPanel from './RecommendTalentPanel'
import PageHero from '../ui/PageHero'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'
import { showDemoOrders } from '../../lib/mpDemoMode'

function SupplierRecommendOrders() {
  const goDetail = useRecruitmentNav()
  const workId = getWorkIdentity()
  const [searchKeyword, setSearchKeyword] = useState('')
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
  const member = readMember()
  const talentCity = member?.city || member?.province || ''

  const applyOrderFilters = useCallback(async () => {
    if (!hasFilledPlatform(readMember())) {
      setOrderDisplayRows([])
      setOrderEmptyHint(TALENT_SMART_MATCH_NEED_PROFILE_HINT)
      return
    }
    const memberRow = readMember()
    const kw = searchKeyword.trim()
    let rows = allOrderRows.filter((r) => {
      if (!orderVisibleToWorkIdentity(r, workId)) return false
      const blob = [r.title, r.merchantName, r.region, r.platform].join(' ').toLowerCase()
      if (kw && !blob.includes(kw.toLowerCase())) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchRegionFilter(r.region, r.storeName, filterProvince, filterCity)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSelected)) return false
      return true
    })
    const allowDemo = showDemoOrders()
    const mocks = allowDemo ? rows.filter((r) => r.isMock) : []
    let real = rows.filter((r) => !r.isMock)
    if (real.length) {
      real = await recruitmentAi.enrichOrderMatches(real, memberRow, { workIdentity: workId })
    }
    setOrderDisplayRows([...real, ...mocks].slice(0, 50))
    setOrderEmptyHint('')
  }, [allOrderRows, searchKeyword, filterPlatform, filterProvince, filterCity, priceSelected, workId])

  useEffect(() => {
    void applyOrderFilters()
  }, [applyOrderFilters])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const reg = await fetchMpRegistry()
        const rows = loadOpenOrderRows(reg).filter((r) => orderVisibleToWorkIdentity(r, workId))
        setAllOrderRows(
          rows.length || !showDemoOrders()
            ? rows
            : listFilters.buildMockRecruitmentRows(),
        )
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [workId])

  const listTwoCol = orderDisplayRows.length > 1

  return (
    <div className="hall-page">
      <HallToolbarCard>
        <PageHero
          inset
          title="推荐大厅"
          subtitle={`AI 识别 ${WORK_EDITION_LABEL[workId]} 身份 · 结合标签与报名习惯匹配 · 按匹配分从高到低排序`}
          badge="智能推荐"
        />
        <input
          className="hall-search-input panel-input"
          placeholder="搜索商单、门店、城市"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
        />
        <div className="hall-filter-row">
        <select className="rounded-lg panel-select px-2 py-1.5" value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value)}>
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
        <button type="button" className="rounded-lg border border-[var(--shell-border)] px-2 py-1.5" onClick={() => setShowPriceSheet(true)}>
          {priceFilterLabel}
        </button>
        </div>
      </HallToolbarCard>
      {loading ? <p className="text-[var(--shell-muted)]">智能匹配中…</p> : null}
      {err ? <p className="text-amber-600 text-sm">{err}</p> : null}
      {!loading && !orderDisplayRows.length ? (
        <p className="text-[var(--shell-muted)] text-sm">
          {orderEmptyHint || (talentCity ? '暂无高匹配商单，可调整筛选条件' : '请先在「我的」完善资料，以获得更精准推荐')}
        </p>
      ) : null}
      <div className={`hall-list${listTwoCol ? ' hall-list--two-col' : ''}`}>
        {orderDisplayRows.map((o) => (
          <RecruitmentOrderCard key={o.id} row={o} showMatchScore onClick={() => goDetail(o)} />
        ))}
      </div>
      {showPriceSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--panel-overlay)] p-4" onClick={() => setShowPriceSheet(false)}>
          <div className="w-full max-w-md rounded-2xl panel-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2">
              {hallFilters.priceBucketsForView(priceSelected).map((b) => (
                <button key={b.id} type="button" className={`px-3 py-1.5 rounded-full text-sm ${b.selected ? 'panel-tab-active' : 'panel-tab'}`} onClick={() => setPriceSelected(hallFilters.togglePriceId(priceSelected, b.id))}>
                  {b.label}
                </button>
              ))}
            </div>
            <button type="button" className="w-full mt-4 py-2 rounded-lg panel-tab-active" onClick={() => { setPriceFilterLabel(hallFilters.priceFilterLabel(priceSelected, '价格')); setShowPriceSheet(false) }}>
              确定
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function RecommendHallPanel() {
  const role = getActiveRole()
  if (role === 'pr') {
    return <RecommendTalentPanel embedded />
  }
  return <SupplierRecommendOrders />
}
