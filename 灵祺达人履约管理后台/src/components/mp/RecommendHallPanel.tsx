import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, Settings } from 'lucide-react'
import { fetchMpRegistry } from '../../lib/mpApi'
import { getActiveRole } from '../../lib/mpSession'
import * as hallFilters from '../../lib/mpRecruitment/hallFilters'
import * as listFilters from '../../lib/mpRecruitment/listFilters'
import { loadAllOrderRows } from '../../lib/mpRecruitment/orderCard'
import {
  filterRecommendHallOrders,
  isRecommendHallRecruitingStatus,
  matchRecommendCategoryFilter,
  matchRecommendOrderSegment,
  orderMatchesRecommendHallIdentity,
  RECOMMEND_CATEGORY_FILTERS,
  RECOMMEND_ORDER_SEGMENTS,
  sortRecommendOrderRows,
  type RecommendOrderSegment,
} from '../../lib/mpRecruitment/recommendHallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { getWorkIdentity } from '../../lib/mpWorkIdentity'
import { readMember, hasFilledPlatform, TALENT_SMART_MATCH_NEED_PROFILE_HINT } from '../../lib/mpSync/talentMember'
import { resolveOrderCoverUrl } from '../../lib/mpSync/recruitCoverLibrary'
import RecommendTalentPanel from './RecommendTalentPanel'
import RecommendOrderCard from './RecommendOrderCard'
import { EmptyState } from '../ui/MockupLayouts'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'
import { showDemoOrders } from '../../lib/mpDemoMode'

type FilterMenu = 'platform' | 'category' | 'budget' | 'city' | null

function SupplierRecommendOrders() {
  const goDetail = useRecruitmentNav()
  const workId = getWorkIdentity()
  const profileLink = workId === 'shoot' || workId === 'edit' ? '/profile/supplier' : '/profile/talent'
  const [orderSegment, setOrderSegment] = useState<RecommendOrderSegment>('match')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [priceSelected, setPriceSelected] = useState<string[]>([])
  const [openMenu, setOpenMenu] = useState<FilterMenu>(null)
  const [showPriceSheet, setShowPriceSheet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allOrderRows, setAllOrderRows] = useState<RecruitmentOrderRow[]>([])
  const [orderDisplayRows, setOrderDisplayRows] = useState<RecruitmentOrderRow[]>([])
  const [orderEmptyHint, setOrderEmptyHint] = useState('')
  const [mpById, setMpById] = useState<Map<string, Record<string, unknown>>>(new Map())
  const member = readMember()
  const talentCity = member?.city || member?.province || ''

  const cityFilterOptions = useMemo(
    () => hallFilters.buildCityFilterOptions(allOrderRows),
    [allOrderRows],
  )

  const allFiltersDefault =
    filterPlatform === '全部' &&
    filterCategory === '全部' &&
    filterCity === '全部' &&
    !priceSelected.length

  const priceFilterLabel = hallFilters.priceFilterLabel(priceSelected, '预算')
  const platformLabel = filterPlatform === '全部' ? '平台' : filterPlatform
  const categoryLabel = filterCategory === '全部' ? '品类' : filterCategory
  const cityLabel = filterCity === '全部' ? '地区' : filterCity

  const resetAllFilters = () => {
    setFilterPlatform('全部')
    setFilterCategory('全部')
    setFilterCity('全部')
    setPriceSelected([])
    setOpenMenu(null)
    setShowPriceSheet(false)
  }

  const applyOrderFilters = useCallback(async () => {
    const allowDemo = showDemoOrders()
    const memberRow = readMember()
    if (orderSegment === 'match' && !hasFilledPlatform(memberRow) && !allowDemo) {
      setOrderDisplayRows([])
      setOrderEmptyHint(TALENT_SMART_MATCH_NEED_PROFILE_HINT)
      return
    }
    let rows = allOrderRows.filter((r) => {
      if (!orderMatchesRecommendHallIdentity(r, workId)) return false
      if (!isRecommendHallRecruitingStatus(r)) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchCity(r.region, r.storeName, filterCity)) return false
      if (!matchRecommendCategoryFilter(r, filterCategory)) return false
      if (!hallFilters.matchPriceBuckets(r.priceAmount, priceSelected)) return false
      if (!matchRecommendOrderSegment(r, orderSegment, talentCity)) return false
      return true
    })
    const mocks = allowDemo ? rows.filter((r) => r.isMock) : []
    let real = rows.filter((r) => !r.isMock)
    if (real.length) {
      if (hasFilledPlatform(memberRow)) {
        real = await recruitmentAi.enrichOrderMatches(real, memberRow, { workIdentity: workId })
      } else {
        real = await recruitmentAi.enrichOrderTags(real, talentCity)
        real = real.map((r) => ({ ...r, matchScore: r.matchScore || 0, aiMatch: false }))
      }
    }
    if (orderSegment === 'match' && real.length) {
      const matched = real.filter((r) => (r.matchScore || 0) >= 40 || r.aiMatch)
      real = matched.length ? matched : real
    }
    real = sortRecommendOrderRows(real, orderSegment)
    rows = [...real, ...mocks].slice(0, 50)
    let hint = ''
    if (!rows.length) {
      if (orderSegment === 'city' && !talentCity) hint = '请先在「我的」完善城市信息'
      else if (orderSegment === 'city') hint = `暂无「${talentCity}」同城商单，可看看热门全国`
      else hint = '暂无匹配商单，试试切换分类或筛选'
    }
    setOrderDisplayRows(listFilters.attachHallSignupCountdowns(rows))
    setOrderEmptyHint(hint)
  }, [
    allOrderRows,
    orderSegment,
    filterPlatform,
    filterCategory,
    filterCity,
    priceSelected,
    workId,
    talentCity,
  ])

  useEffect(() => {
    void applyOrderFilters()
  }, [applyOrderFilters])

  useEffect(() => {
    const id = window.setInterval(() => {
      setOrderDisplayRows((prev) => listFilters.attachHallSignupCountdowns(prev))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setErr('')
      const allowDemo = showDemoOrders()
      try {
        const reg = await fetchMpRegistry()
        const mpOrders = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
        setMpById(
          new Map(
            mpOrders.map((o) => [String((o as { id?: string })?.id || ''), o as Record<string, unknown>]),
          ),
        )
        let rows = filterRecommendHallOrders(loadAllOrderRows(reg), workId)
        if (!rows.length && allowDemo) {
          rows = listFilters.buildRecommendHallDemoRows()
        } else if (allowDemo) {
          rows = listFilters.mergeHallDisplayRows(rows, { allowDemo: true })
        }
        setAllOrderRows(rows)
      } catch {
        if (allowDemo) {
          setAllOrderRows(listFilters.buildRecommendHallDemoRows())
        } else {
          setErr('请求失败，请稍后重试')
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [workId])

  function renderFilterMenu(items: string[], active: string, onPick: (v: string) => void) {
    return (
      <div className="recommend-hall-filter-menu">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className={`recommend-hall-filter-menu__item ${active === item ? 'recommend-hall-filter-menu__item--active' : ''}`}
            onClick={() => {
              onPick(item)
              setOpenMenu(null)
            }}
          >
            {item}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="recommend-hall-page">
      <div className="recommend-hall-stack">
        <header className="recommend-hall-head">
          <h1 className="recommend-hall-head__title">
            达人推荐大厅
            <Info size={16} strokeWidth={2} className="recommend-hall-head__info" aria-hidden />
          </h1>
          <div className="recommend-hall-seg" role="tablist">
            {RECOMMEND_ORDER_SEGMENTS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={orderSegment === t.id}
                className={`recommend-hall-seg__btn ${orderSegment === t.id ? 'recommend-hall-seg__btn--active' : ''}`}
                onClick={() => setOrderSegment(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <section className="recommend-hall-section">
          <div className="recommend-hall-section__row">
            <div>
              <h2 className="recommend-hall-section__title">商单推荐</h2>
              <p className="recommend-hall-section__sub">
                根据你的账号内容与受众特征，智能匹配可能适合你的商单
              </p>
            </div>
            <Link to={profileLink} className="recommend-hall-pref">
              <Settings size={15} strokeWidth={2} aria-hidden />
              我的偏好设置
            </Link>
          </div>

          <div className="recommend-hall-filter-v2">
            <button
              type="button"
              className={`recommend-hall-filter-v2__cell ${allFiltersDefault ? 'recommend-hall-filter-v2__cell--on' : ''}`}
              onClick={resetAllFilters}
            >
              全部
            </button>
            <div className="recommend-hall-filter-v2__cell recommend-hall-filter-v2__cell--picker">
              <button
                type="button"
                className={`recommend-hall-filter-v2__picker ${filterPlatform !== '全部' ? 'recommend-hall-filter-v2__picker--on' : ''}`}
                onClick={() => setOpenMenu((m) => (m === 'platform' ? null : 'platform'))}
              >
                {platformLabel}
                <span className="recommend-hall-filter-v2__arrow" aria-hidden>▾</span>
              </button>
              {openMenu === 'platform'
                ? renderFilterMenu([...hallFilters.PLATFORM_FILTERS], filterPlatform, setFilterPlatform)
                : null}
            </div>
            <div className="recommend-hall-filter-v2__cell recommend-hall-filter-v2__cell--picker">
              <button
                type="button"
                className={`recommend-hall-filter-v2__picker ${filterCategory !== '全部' ? 'recommend-hall-filter-v2__picker--on' : ''}`}
                onClick={() => setOpenMenu((m) => (m === 'category' ? null : 'category'))}
              >
                {categoryLabel}
                <span className="recommend-hall-filter-v2__arrow" aria-hidden>▾</span>
              </button>
              {openMenu === 'category'
                ? renderFilterMenu([...RECOMMEND_CATEGORY_FILTERS], filterCategory, setFilterCategory)
                : null}
            </div>
            <div className="recommend-hall-filter-v2__cell">
              <button
                type="button"
                className={`recommend-hall-filter-v2__picker ${priceSelected.length ? 'recommend-hall-filter-v2__picker--on' : ''}`}
                onClick={() => {
                  setOpenMenu(null)
                  setShowPriceSheet(true)
                }}
              >
                {priceFilterLabel}
                <span className="recommend-hall-filter-v2__arrow" aria-hidden>▾</span>
              </button>
            </div>
            <div className="recommend-hall-filter-v2__cell recommend-hall-filter-v2__cell--picker">
              <button
                type="button"
                className={`recommend-hall-filter-v2__picker ${filterCity !== '全部' ? 'recommend-hall-filter-v2__picker--on' : ''}`}
                onClick={() => setOpenMenu((m) => (m === 'city' ? null : 'city'))}
              >
                {cityLabel}
                <span className="recommend-hall-filter-v2__arrow" aria-hidden>▾</span>
              </button>
              {openMenu === 'city'
                ? renderFilterMenu(cityFilterOptions, filterCity, setFilterCity)
                : null}
            </div>
          </div>
        </section>
      </div>

      {loading ? <p className="recommend-hall-hint">智能匹配中…</p> : null}
      {err ? <p className="recommend-hall-err">{err}</p> : null}

      <div className="recommend-hall-list">
        {orderDisplayRows.map((o) => (
          <RecommendOrderCard
            key={o.id}
            row={o}
            coverUrl={resolveOrderCoverUrl(mpById.get(o.id) || { platform: o.platform })}
            onDetail={() => goDetail(o)}
          />
        ))}
      </div>

      {!loading && !orderDisplayRows.length ? (
        <EmptyState
          title={orderEmptyHint ? '暂无法匹配' : '暂无高匹配商单'}
          desc={orderEmptyHint || '可调整筛选条件后重试'}
        />
      ) : null}

      {showPriceSheet ? (
        <div
          className="recommend-hall-sheet-backdrop"
          onClick={() => setShowPriceSheet(false)}
          role="presentation"
        >
          <div className="recommend-hall-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="recommend-hall-sheet__title">预算筛选</p>
            <div className="recommend-hall-sheet__chips">
              {hallFilters.priceBucketsForView(priceSelected).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`recommend-hall-chip ${b.selected ? 'recommend-hall-chip--active' : ''}`}
                  onClick={() => setPriceSelected(hallFilters.togglePriceId(priceSelected, b.id))}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="recommend-hall-sheet__ok"
              onClick={() => setShowPriceSheet(false)}
            >
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
