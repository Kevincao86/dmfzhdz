import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import HallHomeDashboard from '../components/mp/HallHomeDashboard'
import HallRecruitmentPanel from '../components/mp/HallRecruitmentPanel'
import RecommendHallPanel from '../components/mp/RecommendHallPanel'
import PrFeatureLocked from '../components/mp/PrFeatureLocked'
import { getActiveRole } from '../lib/mpSession'
import { canUsePrRecommendHall } from '../lib/prFeatureAccess'

type HallMainTab = 'home' | 'hall' | 'recommend'

const ALL_TABS: { id: HallMainTab; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'hall', label: '招募大厅' },
  { id: 'recommend', label: '推荐大厅' },
]

export default function HallPage() {
  const role = getActiveRole()
  const prRecommendEnabled = role !== 'pr' || canUsePrRecommendHall()
  const TABS = ALL_TABS.filter((t) => t.id !== 'recommend' || prRecommendEnabled)
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as HallMainTab | null
  const tab: HallMainTab =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'hall'

  useEffect(() => {
    if (!tabParam || !TABS.some((t) => t.id === tabParam)) {
      setParams({ tab: 'hall' }, { replace: true })
    }
  }, [tabParam, setParams, TABS])

  useEffect(() => {
    if (tab === 'recommend' && role === 'pr' && !prRecommendEnabled) {
      setParams({ tab: 'hall' }, { replace: true })
    }
  }, [tab, role, prRecommendEnabled, setParams])

  function selectTab(next: HallMainTab) {
    setParams({ tab: next }, { replace: true })
  }

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
        <HallRecruitmentPanel prMode={role === 'pr'} />
      </div>
      <div hidden={tab !== 'recommend'}>
        {prRecommendEnabled ? (
          <RecommendHallPanel />
        ) : (
          <PrFeatureLocked
            title="推荐大厅即将开放使用"
            desc="智能荐达人、匹配招募单与达人库检索为增值能力，需由灵祺运营在后台为您开通后方可使用。"
            bullets={['AI 智能推荐达人', '全部达人库检索', '按招募单智能匹配']}
          />
        )}
      </div>
    </div>
  )
}
