import { useEffect, useState } from 'react'
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
  const [tab, setTab] = useState<HallMainTab>(() =>
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'home',
  )

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam) && tabParam !== tab) {
      setTab(tabParam)
    }
  }, [tabParam, tab])

  function selectTab(next: HallMainTab) {
    setTab(next)
    setParams(next === 'home' ? {} : { tab: next }, { replace: true })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2 border-b border-[var(--shell-border)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              tab === t.id ? 'panel-tab-active' : 'panel-tab'
            }`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'home' ? <HallHomeDashboard /> : null}
      {tab === 'hall' ? <HallRecruitmentPanel prMode={role === 'pr'} /> : null}
      {tab === 'recommend' ? <RecommendHallPanel /> : null}
    </div>
  )
}
