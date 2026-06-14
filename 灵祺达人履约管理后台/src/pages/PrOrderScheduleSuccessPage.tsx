import { Link, useLocation, useParams } from 'react-router-dom'
import PageHero from '../components/ui/PageHero'

type LocationState = {
  orderTitle?: string
  talentCount?: number
}

export default function PrOrderScheduleSuccessPage() {
  const { id: mpOrderId = '' } = useParams()
  const location = useLocation()
  const state = (location.state || {}) as LocationState
  const title = state.orderTitle || mpOrderId
  const talentCount = Number(state.talentCount) || 0

  return (
    <div className="page-content-shell page-content-shell--narrow">
      <PageHero title="排期成功" subtitle={title} />
      <div className="card mx-4 my-6 space-y-4 text-center">
        <div className="text-5xl" aria-hidden>
          ✓
        </div>
        <h2 className="text-lg font-semibold text-emerald-800">探店排期已确认并通知达人</h2>
        <p className="text-sm text-[var(--shell-muted)]">
          {talentCount > 0
            ? `已向 ${talentCount} 位达人下发探店日期与时段，达人可在小程序「我的报名 → 待探店」查看并签到。`
            : '达人可在小程序「我的报名 → 待探店」查看排期详情，探店日当天完成签到后进入待传视频。'}
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link
            to="/orders?tab=pending_video_review"
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm"
          >
            查看待视频审核
          </Link>
          <Link
            to={`/orders/${encodeURIComponent(mpOrderId)}/applicants`}
            className="px-4 py-2 rounded-xl border text-sm"
          >
            报名管理
          </Link>
          <Link to="/orders?tab=pending_schedule" className="px-4 py-2 rounded-xl border text-sm">
            返回发单列表
          </Link>
        </div>
      </div>
    </div>
  )
}
