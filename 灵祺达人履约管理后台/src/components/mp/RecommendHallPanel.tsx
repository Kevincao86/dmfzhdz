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
  matchRecommendHallSegment,
  matchTalentTagFilter,
  orderMatchesRecommendHallIdentity,
  RECOMMEND_HALL_SEGMENTS,
  segmentEmptyHint,
  segmentSectionSub,
  type RecommendHallSegment,
} from '../../lib/mpRecruitment/recommendHallFilters'
import * as recruitmentAi from '../../lib/mpRecruitment/recruitmentAi'
import type { RecruitmentOrderRow } from '../../lib/mpRecruitment/types'
import { getWorkIdentity } from '../../lib/mpWorkIdentity'
import { PLATFORMS, TALENT_TAGS } from '../../lib/mpSync/publishFormOptions'
import { readMember, hasFilledPlatform, TALENT_SMART_MATCH_NEED_PROFILE_HINT } from '../../lib/mpSync/talentMember'
import { resolveOrderCoverUrl } from '../../lib/mpSync/recruitCoverLibrary'
import RecommendTalentPanel from './RecommendTalentPanel'
import RecommendOrderCard from './RecommendOrderCard'
import HallCityFilter from './HallCityFilter'
import { EmptyState } from '../ui/MockupLayouts'
import { useRecruitmentNav } from '../../lib/useRecruitmentNav'
import { showDemoOrders } from '../../lib/mpDemoMode'

const PRIMARY_TAG_CHIPS = ['美食', '母婴', '美妆时尚', '家居家装', '科技数码'] as const

const MORE_TALENT_TAGS = TALENT_TAGS.filter((t) => !PRIMARY_TAG_CHIPS.includes(t as (typeof PRIMARY_TAG_CHIPS)[number]))

function sortRecommendRows(rows: RecruitmentOrderRow[], segment: RecommendHallSegment) {
  return [...rows].sort((a, b) => {
    if (segment === 'match' || segment === 'quality') {
      const d = (b.matchScore || 0) - (a.matchScore || 0)
      if (d !== 0) return d
      if (segment === 'quality') {
        const p = (b.priceAmount || 0) - (a.priceAmount || 0)
        if (p !== 0) return p
      }
    }
    if (segment === 'hot') {
      const h = (b.applicantCount || 0) - (a.applicantCount || 0)
      if (h !== 0) return h
    }
    if (segment === 'city') {
      if (b.urgent !== a.urgent) return b.urgent ? 1 : -1
    }
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
}

function SupplierRecommendOrders() {
  const goDetail = useRecruitmentNav()
  const workId = getWorkIdentity()
  const profileLink = workId === 'shoot' || workId === 'edit' ? '/profile/supplier' : '/profile/talent'
  const [orderSegment, setOrderSegment] = useState<RecommendHallSegment>('match')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterTag, setFilterTag] = useState('全部')
  const [filterProvince, setFilterProvince] = useState('全部')
  const [filterCity, setFilterCity] = useState('全部')
  const [showMoreTag, setShowMoreTag] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allOrderRows, setAllOrderRows] = useState<RecruitmentOrderRow[]>([])
  const [orderDisplayRows, setOrderDisplayRows] = useState<RecruitmentOrderRow[]>([])
  const [orderEmptyHint, setOrderEmptyHint] = useState('')
  const [mpById, setMpById] = useState<Map<string, Record<string, unknown>>>(new Map())
  const member = readMember()
  const talentCity = member?.city || member?.province || ''

  const applyOrderFilters = useCallback(async () => {
    if (orderSegment === 'match' && !hasFilledPlatform(readMember())) {
      setOrderDisplayRows([])
      setOrderEmptyHint(TALENT_SMART_MATCH_NEED_PROFILE_HINT)
      return
    }
    const memberRow = readMember()
    let rows = allOrderRows.filter((r) => {
      if (!orderMatchesRecommendHallIdentity(r, workId)) return false
      if (!isRecommendHallRecruitingStatus(r)) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchRegionFilter(r.region, r.storeName, filterProvince, filterCity)) return false
      if (!matchTalentTagFilter(r, filterTag)) return false
      if (!matchRecommendHallSegment(r, orderSegment, talentCity)) return false
      return true
    })
    const allowDemo = showDemoOrders()
    const mocks = allowDemo ? rows.filter((r) => r.isMock) : []
    let real = rows.filter((r) => !r.isMock)
    if (real.length) {
      real = await recruitmentAi.enrichOrderMatches(real, memberRow, { workIdentity: workId })
    }
    if (orderSegment === 'match' && real.length) {
      const matched = real.filter((r) => (r.matchScore || 0) >= 40 || r.aiMatch)
      real = matched.length ? matched : real
    }
    real = sortRecommendRows(real, orderSegment)
    rows = [...real, ...mocks].slice(0, 50)
    setOrderDisplayRows(listFilters.attachHallSignupCountdowns(rows))
    setOrderEmptyHint(rows.length ? '' : segmentEmptyHint(orderSegment, talentCity))
  }, [allOrderRows, orderSegment, filterPlatform, filterTag, filterProvince, filterCity, workId, talentCity])

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
      try {
        const reg = await fetchMpRegistry()
        const mpOrders = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
        setMpById(
          new Map(
            mpOrders.map((o) => [String((o as { id?: string })?.id || ''), o as Record<string, unknown>]),
          ),
        )
        const rows = filterRecommendHallOrders(loadAllOrderRows(reg), workId)
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

  const isMoreTagActive = filterTag !== '全部' && !PRIMARY_TAG_CHIPS.includes(filterTag as (typeof PRIMARY_TAG_CHIPS)[number])

  const activeTagLabel = useMemo(() => {
    if (filterTag === '全部') return '更多'
    return filterTag
  }, [filterTag])

  return (
    <div className="recommend-hall-page">
      <header className="recommend-hall-head">
        <h1 className="recommend-hall-head__title">
          达人推荐大厅
          <Info size={16} strokeWidth={2} className="recommend-hall-head__info" aria-hidden />
        </h1>
        <div className="recommend-hall-tabs" role="tablist">
          {RECOMMEND_HALL_SEGMENTS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={orderSegment === t.id}
              className={`recommend-hall-tabs__btn ${orderSegment === t.id ? 'recommend-hall-tabs__btn--active' : ''}`}
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
            <p className="recommend-hall-section__sub">{segmentSectionSub(orderSegment)}</p>
          </div>
          <Link to={profileLink} className="recommend-hall-pref">
            <Settings size={15} strokeWidth={2} aria-hidden />
            我的偏好设置
          </Link>
        </div>

        <div className="recommend-hall-filters">
          <div className="recommend-hall-filters__row">
            <button
              type="button"
              className={`recommend-hall-chip ${filterPlatform === '全部' ? 'recommend-hall-chip--active' : ''}`}
              onClick={() => setFilterPlatform('全部')}
            >
              全部平台
            </button>
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                className={`recommend-hall-chip ${filterPlatform === p ? 'recommend-hall-chip--active' : ''}`}
                onClick={() => setFilterPlatform(p)}
              >
                {p === '微信视频号' ? '视频号' : p}
              </button>
            ))}
          </div>
          <div className="recommend-hall-filters__row">
            <button
              type="button"
              className={`recommend-hall-chip ${filterTag === '全部' ? 'recommend-hall-chip--active' : ''}`}
              onClick={() => {
                setFilterTag('全部')
                setShowMoreTag(false)
              }}
            >
              全部品类
            </button>
            {PRIMARY_TAG_CHIPS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`recommend-hall-chip ${filterTag === tag ? 'recommend-hall-chip--active' : ''}`}
                onClick={() => {
                  setFilterTag(tag)
                  setShowMoreTag(false)
                }}
              >
                {tag}
              </button>
            ))}
            <div className="recommend-hall-more">
              <button
                type="button"
                className={`recommend-hall-chip ${isMoreTagActive ? 'recommend-hall-chip--active' : ''}`}
                onClick={() => setShowMoreTag((v) => !v)}
              >
                {isMoreTagActive ? activeTagLabel : '更多'}
                <span className="recommend-hall-more__caret" aria-hidden>▾</span>
              </button>
              {showMoreTag ? (
                <div className="recommend-hall-more__menu recommend-hall-more__menu--wide">
                  {MORE_TALENT_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`recommend-hall-more__item ${filterTag === tag ? 'recommend-hall-more__item--active' : ''}`}
                      onClick={() => {
                        setFilterTag(tag)
                        setShowMoreTag(false)
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="recommend-hall-filters__row recommend-hall-filters__row--region">
            <span className="recommend-hall-filters__label">区域</span>
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
        </div>
      </section>

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
