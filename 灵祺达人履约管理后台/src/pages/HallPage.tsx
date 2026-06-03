import { useState } from 'react'
import HallRecruitmentPanel from '../components/mp/HallRecruitmentPanel'
import RecommendOrdersPanel from '../components/mp/RecommendOrdersPanel'
import { getActiveRole } from '../lib/mpSession'

type TalentTab = 'hall' | 'recommend'

export default function HallPage() {
  const role = getActiveRole()
  const [talentTab, setTalentTab] = useState<TalentTab>('hall')

  if (role === 'pr') {
    return <HallRecruitmentPanel prMode />
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${talentTab === 'hall' ? 'bg-violet-600/30 text-white' : 'text-slate-400'}`}
          onClick={() => setTalentTab('hall')}
        >
          招募大厅
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${talentTab === 'recommend' ? 'bg-violet-600/30 text-white' : 'text-slate-400'}`}
          onClick={() => setTalentTab('recommend')}
        >
          推荐商单
        </button>
      </div>
      {talentTab === 'hall' ? <HallRecruitmentPanel /> : <RecommendOrdersPanel />}
    </div>
  )
}
