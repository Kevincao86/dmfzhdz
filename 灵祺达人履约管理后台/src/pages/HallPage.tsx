import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import HallHomeDashboard from '../components/mp/HallHomeDashboard'
import HallRecruitmentPanel from '../components/mp/HallRecruitmentPanel'
import RecommendHallPanel from '../components/mp/RecommendHallPanel'
import PrFeatureLocked from '../components/mp/PrFeatureLocked'
import RecruitmentDetailPage from './RecruitmentDetailPage'
import { getActiveRole } from '../lib/mpSession'
import { canUsePrRecommendHall } from '../lib/prFeatureAccess'
import type { RecruitmentOrderRow } from '../lib/mpRecruitment/types'

type HallMainTab = 'home' | 'hall' | 'recommend'

const ALL_TABS: { id: HallMainTab; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'hall', label: '招募大厅' },
  { id: 'recommend', label: '推荐大厅' },
]

type CardBox = { top: number; left: number; width: number; height: number }
type ExpandPhase = 'opening' | 'open' | 'closing'
type ExpandState = { id: string; origin: CardBox; phase: ExpandPhase }

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function measureCard(id: string): CardBox | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"')
  const nodes = document.querySelectorAll(`[data-order-expand="${escaped}"]`)
  for (const el of nodes) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }
  }
  return null
}

function largeCardBox(): CardBox {
  const width = Math.min(960, window.innerWidth - 32)
  const height = Math.min(window.innerHeight * 0.88, window.innerHeight - 48)
  return {
    top: Math.max(24, (window.innerHeight - height) / 2),
    left: Math.max(16, (window.innerWidth - width) / 2),
    width,
    height,
  }
}

export default function HallPage() {
  const role = getActiveRole()
  const prRecommendEnabled = role !== 'pr' || canUsePrRecommendHall()
  const TABS = ALL_TABS
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as HallMainTab | null
  const tab: HallMainTab =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'hall'

  useEffect(() => {
    if (!tabParam || !TABS.some((t) => t.id === tabParam)) {
      setParams({ tab: 'hall' }, { replace: true })
    }
  }, [tabParam, setParams, TABS])

  const [expand, setExpand] = useState<ExpandState | null>(null)

  function selectTab(next: HallMainTab) {
    setParams({ tab: next }, { replace: true })
  }

  function openOrder(row: RecruitmentOrderRow) {
    if (row.isMock) {
      window.alert('演示商单，仅供预览')
      return
    }
    const origin = measureCard(row.id) || {
      top: window.innerHeight / 2,
      left: window.innerWidth / 2,
      width: 0,
      height: 0,
    }
    setExpand({ id: row.id, origin, phase: prefersReducedMotion() ? 'open' : 'opening' })
  }

  function closeOrder() {
    setExpand((cur) => {
      if (!cur || cur.phase === 'closing') return cur
      if (prefersReducedMotion()) return null
      return { ...cur, origin: measureCard(cur.id) || cur.origin, phase: 'closing' }
    })
  }

  useEffect(() => {
    if (!expand || expand.phase !== 'opening') return
    const id = expand.id
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setExpand((cur) => (cur && cur.id === id && cur.phase === 'opening' ? { ...cur, phase: 'open' } : cur))
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [expand])

  useEffect(() => {
    if (!expand || expand.phase !== 'closing') return
    const timer = window.setTimeout(() => setExpand(null), 340)
    return () => window.clearTimeout(timer)
  }, [expand])

  useEffect(() => {
    if (!expand) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeOrder()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [expand?.id])

  const expandedId = expand?.id || ''
  const cardBox = expand ? (expand.phase === 'open' ? largeCardBox() : expand.origin) : null

  return (
    <div className="page-content-shell page-content-shell--wide hall-page-shell">
      <div className="hall-tab-strip">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`hall-tab-btn ${tab === t.id ? 'hall-tab-btn--active' : ''}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* 保持挂载，切换 tab 不重载 registry / 智能匹配缓存 */}
      <div hidden={tab !== 'home'}>
        <HallHomeDashboard />
      </div>
      <div hidden={tab !== 'hall'}>
        <HallRecruitmentPanel prMode={role === 'pr'} expandedId={expandedId} onOpenOrder={openOrder} />
      </div>
      <div hidden={tab !== 'recommend'}>
        {prRecommendEnabled ? (
          <RecommendHallPanel expandedId={expandedId} onOpenOrder={openOrder} />
        ) : (
          <PrFeatureLocked
            title="推荐大厅需开通后使用"
            desc="智能荐达人、匹配招募单与达人库检索为增值能力，需由灵祺运营在后台为您开通后方可使用。"
            bullets={['AI 智能推荐达人', '全部达人库检索', '按招募单智能匹配']}
          />
        )}
      </div>
      {expand && cardBox
        ? createPortal(
            <div
              className={`order-expand-backdrop${expand.phase === 'open' ? ' order-expand-backdrop--open' : ''}`}
              onClick={closeOrder}
              role="presentation"
            >
              <div
                className={`order-expand-card${expand.phase === 'open' ? ' order-expand-card--open' : ''}`}
                style={{ top: cardBox.top, left: cardBox.left, width: cardBox.width, height: cardBox.height }}
                role="dialog"
                aria-modal="true"
                aria-label="商单详情"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="order-expand-card__bar">
                  <button type="button" className="order-expand-card__close" onClick={closeOrder}>
                    关闭
                  </button>
                </div>
                <div className="order-expand-card__body">
                  <RecruitmentDetailPage orderId={expand.id} embedded />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
