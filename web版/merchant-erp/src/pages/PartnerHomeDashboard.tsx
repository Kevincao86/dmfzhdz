import { ArrowRight, Briefcase, Megaphone, UserPlus, Users, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePartnerClients } from '../context/PartnerClientContext'
import { usePartnerTenant } from '../context/PartnerTenantContext'
import {
  PARTNER_HOME_AGGREGATE_LABEL,
  PARTNER_HOME_AGGREGATE_LABEL_PARENT,
} from '../lib/partnerEditionConfig'
import { ensurePartnerXingxuanBootstrap } from '../lib/partnerXingxuanBootstrapClient'
import { useEffect } from 'react'

const QUICK = [
  { title: '星选达人招募', path: '/recruitment/xingxuan/hall', color: 'bg-violet-500', icon: Users },
  { title: '投流管理', path: '/advertising', color: 'bg-orange-500', icon: Megaphone },
  { title: '线索管理', path: '/leads', color: 'bg-blue-500', icon: UserPlus },
  { title: '财务对账', path: '/finance', color: 'bg-emerald-500', icon: Wallet },
]

export default function PartnerHomeDashboard() {
  const { clients, activeClient, scopeLabel } = usePartnerClients()
  const { profile } = usePartnerTenant()

  useEffect(() => {
    void ensurePartnerXingxuanBootstrap()
  }, [])

  const aggregateLabel = profile.isAgent
    ? PARTNER_HOME_AGGREGATE_LABEL
    : PARTNER_HOME_AGGREGATE_LABEL_PARENT

  const viewLabel = activeClient ? scopeLabel : aggregateLabel

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="relative pl-4">
          <span
            className="absolute left-0 top-1 h-[calc(100%-4px)] w-1 rounded-full bg-gradient-to-b from-violet-500 to-cyan-400"
            aria-hidden
          />
          <h1 className="erp-page-title">代理经营看板</h1>
          <p className="mt-1 text-sm text-slate-600">
            {viewLabel}
            {activeClient ? ' · 单客户视图' : ` · ${clients.length} 个客户`}
          </p>
        </div>
        <span className="rounded-full border border-slate-200/90 bg-white/80 px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          {profile.isAgent ? '子代理' : '总服务商'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: '负责客户', value: String(clients.length), hint: '顶栏可切换汇总/单客户' },
          {
            label: '星选招募',
            value: activeClient ? '按客户' : '汇总',
            hint: '运营 → 星选达人招募',
          },
          { label: '投流/线索', value: activeClient ? scopeLabel : '待选客户', hint: '按客户商业化账号' },
          {
            label: '积分扣费',
            value: 'fws 桶',
            hint: '套餐桶优先，再扣充值积分',
          },
        ].map((card) => (
          <div key={card.label} className="erp-panel p-5">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="erp-panel p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">快捷入口</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK.map((q) => (
            <Link
              key={q.path}
              to={q.path}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-white ${q.color}`}>
                <q.icon className="h-5 w-5" />
              </div>
              <span className="flex-1 text-sm font-medium text-slate-800">{q.title}</span>
              <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500" />
            </Link>
          ))}
        </div>
      </div>

      <div className="erp-panel border-violet-100 bg-violet-50/40 p-6">
        <div className="flex items-start gap-3">
          <Briefcase className="mt-0.5 h-5 w-5 text-violet-600" />
          <div className="text-sm text-violet-950">
            <p className="font-semibold">fws 代运营说明</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-violet-900/90">
              <li>达人招募已内嵌星选 PR 工作台，扣费走 fws 套餐桶与充值积分</li>
              <li>投流、线索、财务等模块随顶栏客户切换；子代仅见自己负责的客户</li>
              {!profile.isAgent ? (
                <li>总代可在「系统 → 代理管理」开通子代并分配权益（林客 SP 仅总代绑定）</li>
              ) : (
                <li>权益由总代分配；林客服务商应用由总代统一维护</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
