import { Link } from 'react-router-dom'
import { getActiveRole } from '../lib/mpSession'
import { getAccount } from '../lib/mpSession'
import { readApplications } from '../lib/mpSync/applicationsStore'
import PrOrdersPage from './PrOrdersPage'

/** 达人：我的履约；PR：我的发单 */
export default function OrdersPage() {
  const role = getActiveRole()
  if (role === 'pr') return <PrOrdersPage />

  const acc = getAccount()
  const apps = readApplications()

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">我的履约</h2>
      <p className="text-sm text-slate-400 mb-4">
        灵祺达人 ID：<span className="text-amber-400 font-mono">{acc?.lingqiTalentId || '—'}</span>
      </p>
      {!apps.length ? (
        <p className="text-slate-500">暂无报名记录，去招募大厅挑选商单吧。</p>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <article key={`${a.mpOrderId}-${a.applicantId}`} className="surface-card rounded-xl border p-4">
              <h3 className="font-medium">{a.title || a.mpOrderId}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {a.platform || '—'} · {a.appliedAt || ''}
              </p>
              <Link
                to={`/recruitment/${encodeURIComponent(a.mpOrderId)}?applied=1`}
                className="text-sm text-violet-400 mt-2 inline-block"
              >
                查看招募详情
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
