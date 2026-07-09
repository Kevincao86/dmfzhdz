import { Link } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { usePartnerClients } from '../context/PartnerClientContext'
import { isPartnerClientScopedPath } from '../lib/partnerEditionConfig'
import { isPartnerEdition } from '../lib/appEdition'

/** fws 代操模块：提示顶栏客户范围 */
export default function PartnerScopedBanner() {
  const { pathname } = useLocation()
  const { activeClient, scopeLabel, clients } = usePartnerClients()

  if (!isPartnerEdition() || !isPartnerClientScopedPath(pathname)) return null

  if (!activeClient) {
    return (
      <div className="mb-6 rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-950">
        当前为<strong>客户汇总视图</strong>（{clients.length} 个客户）。
        进行投流、财务、商品等代操时，建议在顶栏切换为<strong>单一客户</strong>后再操作。
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
      代运营客户：<span className="font-semibold text-slate-900">{scopeLabel}</span>
      {' · '}
      <Link to="/settings" className="text-cyan-700 hover:underline">
        客户商家设置
      </Link>
    </div>
  )
}
