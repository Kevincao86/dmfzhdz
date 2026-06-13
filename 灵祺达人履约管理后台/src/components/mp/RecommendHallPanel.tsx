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
  orderMatchesRecommendHallIdentity,
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

const LIST_TABS = [
  { id: 'recommend', label: '推荐' },
  { id: 'latest', label: '最新' },
] as const

type ListTab = (typeof LIST_TABS)[number]['id']

const PLATFORM_CHIPS = [
  { id: '全部', label: '全部平台' },
  { id: '抖音', label: '抖音' },
  { id: '小红书', label: '小红书' },
  { id: 'B站', label: 'B站' },
  { id: '微信视频号', label: '视频号' },
  { id: '快手', label: '快手' },
  { id: '微博', label: '微博' },
] as const

const CATEGORY_CHIPS = [
  { id: '全部', label: '全部品类' },
  { id: '美妆时尚', label: '美妆个护' },
  { id: '本地生活', label: '服饰穿搭' },
  { id: '餐饮美食', label: '食品饮料' },
  { id: '数码科技', label: '3C数码' },
] as const

const MORE_CATEGORIES = hallFilters.CATEGORY_FILTERS.filter(
  (c) => c !== '全部' && !CATEGORY_CHIPS.some((x) => x.id === c),
)

function SupplierRecommendOrders() {
  const goDetail = useRecruitmentNav()
  const workId = getWorkIdentity()
  const profileLink = workId === 'shoot' || workId === 'edit' ? '/profile/supplier' : '/profile/talent'
  const [listTab, setListTab] = useState<ListTab>('recommend')
  const [filterPlatform, setFilterPlatform] = useState('全部')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [showMoreCategory, setShowMoreCategory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [allOrderRows, setAllOrderRows] = useState<RecruitmentOrderRow[]>([])
  const [orderDisplayRows, setOrderDisplayRows] = useState<RecruitmentOrderRow[]>([])
  const [orderEmptyHint, setOrderEmptyHint] = useState('')
  const [mpById, setMpById] = useState<Map<string, Record<string, unknown>>>(new Map())
  const member = readMember()
  const talentCity = member?.city || member?.province || ''

  const applyOrderFilters = useCallback(async () => {
    const allowDemo = showDemoOrders()
    const memberRow = readMember()
    if (listTab === 'recommend' && !hasFilledPlatform(memberRow) && !allowDemo) {
      setOrderDisplayRows([])
      setOrderEmptyHint(TALENT_SMART_MATCH_NEED_PROFILE_HINT)
      return
    }
    let rows = allOrderRows.filter((r) => {
      if (!orderMatchesRecommendHallIdentity(r, workId)) return false
      if (!isRecommendHallRecruitingStatus(r)) return false
      if (!hallFilters.matchPlatform(r.platform, filterPlatform)) return false
      if (!hallFilters.matchCategory(r.category, filterCategory)) return false
      return true
    })
    const mocks = allowDemo ? rows.filter((r) => r.isMock) : []
    let real = rows.filter((r) => !r.isMock)
    if (real.length && (hasFilledPlatform(memberRow) || listTab === 'latest')) {
      real = await recruitmentAi.enrichOrderMatches(real, memberRow, { workIdentity: workId })
    }
    if (listTab === 'recommend') {
      real.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    } else {
      real.sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
    }
    rows = [...real, ...mocks].slice(0, 50)
    setOrderDisplayRows(listFilters.attachHallSignupCountdowns(rows))
    setOrderEmptyHint(rows.length ? '' : talentCity ? '可切换平台或品类筛选' : '请先在「我的」完善资料，以获得更精准推荐')
  }, [allOrderRows, listTab, filterPlatform, filterCategory, workId, talentCity])

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

  const isMoreCategoryActive =
    filterCategory !== '全部' && !CATEGORY_CHIPS.some((x) => x.id === filterCategory)

  const activeCategoryLabel = useMemo(() => {
    const hit = CATEGORY_CHIPS.find((x) => x.id === filterCategory)
    if (hit) return hit.label
    if (filterCategory === '全部') return '更多'
    return filterCategory
  }, [filterCategory])

  return (
    <div className="recommend-hall-page">
      <div className="recommend-hall-stack">
        <header className="recommend-hall-head">
          <h1 className="recommend-hall-head__title">
            达人推荐大厅
            <Info size={16} strokeWidth={2} className="recommend-hall-head__info" aria-hidden />
          </h1>
          <div className="recommend-hall-tabs" role="tablist">
            {LIST_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={listTab === t.id}
                className={`recommend-hall-tabs__btn ${listTab === t.id ? 'recommend-hall-tabs__btn--active' : ''}`}
                onClick={() => setListTab(t.id)}
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

          <div className="recommend-hall-filters">
          <div className="recommend-hall-filters__row">
            {PLATFORM_CHIPS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`recommend-hall-chip ${filterPlatform === p.id ? 'recommend-hall-chip--active' : ''}`}
                onClick={() => setFilterPlatform(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="recommend-hall-filters__row">
            {CATEGORY_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`recommend-hall-chip ${filterCategory === c.id ? 'recommend-hall-chip--active' : ''}`}
                onClick={() => {
                  setFilterCategory(c.id)
                  setShowMoreCategory(false)
                }}
              >
                {c.label}
              </button>
            ))}
            <div className="recommend-hall-more">
              <button
                type="button"
                className={`recommend-hall-chip ${isMoreCategoryActive ? 'recommend-hall-chip--active' : ''}`}
                onClick={() => setShowMoreCategory((v) => !v)}
              >
                {isMoreCategoryActive ? activeCategoryLabel : '更多'}
                <span className="recommend-hall-more__caret" aria-hidden>▾</span>
              </button>
              {showMoreCategory ? (
                <div className="recommend-hall-more__menu">
                  {MORE_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`recommend-hall-more__item ${filterCategory === c ? 'recommend-hall-more__item--active' : ''}`}
                      onClick={() => {
                        setFilterCategory(c)
                        setShowMoreCategory(false)
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
