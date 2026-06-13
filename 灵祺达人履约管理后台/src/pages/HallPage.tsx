import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import HallHomeDashboard from '../components/mp/HallHomeDashboard'
import HallRecruitmentPanel from '../components/mp/HallRecruitmentPanel'
import RecommendHallPanel from '../components/mp/RecommendHallPanel'
import { getActiveRole } from '../lib/mpSession'

type HallMainTab = 'home' | 'hall' | 'recommend'

const TABS: { id: HallMainTab; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'hall', label: '招募大厅' },
  { id: 'recommend', label: '推荐大厅' },
]

export default function HallPage() {
  const role = getActiveRole()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as HallMainTab | null
  const tab: HallMainTab =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'hall'

  useEffect(() => {
    if (!tabParam || !TABS.some((t) => t.id === tabParam)) {
      setParams({ tab: 'hall' }, { replace: true })
    }
  }, [tabParam, setParams])

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
        <RecommendHallPanel />
      </div>
    </div>
  )
}
