import { ChevronDown, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../cn'
import { usePartnerClients } from '../context/PartnerClientContext'
import { usePartnerTenant } from '../context/PartnerTenantContext'
import {
  PARTNER_HOME_AGGREGATE_LABEL,
  PARTNER_HOME_AGGREGATE_LABEL_PARENT,
} from '../lib/partnerEditionConfig'
import { isPartnerEdition } from '../lib/appEdition'

/** 服务商版顶栏：切换「全部客户」或单一客户数据视图 */
export default function PartnerClientScopeBar() {
  const enabled = isPartnerEdition()
  const { clients, activeClientId, scopeLabel, setActiveClient, loading } = usePartnerClients()
  const { profile } = usePartnerTenant()
  const [open, setOpen] = useState(false)

  const aggregateLabel = profile.isAgent
    ? PARTNER_HOME_AGGREGATE_LABEL
    : PARTNER_HOME_AGGREGATE_LABEL_PARENT

  const grouped = useMemo(() => {
    const map = new Map<string, typeof clients>()
    for (const c of clients) {
      const list = map.get(c.provider) ?? []
      list.push(c)
      map.set(c.provider, list)
    }
    return map
  }, [clients])

  if (!enabled) return null

  const providerLabel: Record<string, string> = {
    douyin: '抖音来客',
    kuaishou: '快手本地',
    local_promotion: '巨量本地推',
    xhs_commercial: '小红书商业化',
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex max-w-[min(100%,280px)] items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:border-cyan-200',
          loading && 'opacity-60',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Users className="h-3.5 w-3.5 shrink-0 text-cyan-600" aria-hidden />
        <span className="min-w-0 truncate">{activeClientId ? scopeLabel : aggregateLabel}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-slate-400', open && 'rotate-180')} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="关闭客户选择"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute right-0 z-50 mt-1 max-h-72 w-[min(100vw-2rem,320px)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            <li>
              <button
                type="button"
                role="option"
                aria-selected={activeClientId == null}
                className={cn(
                  'w-full px-3 py-2 text-left text-xs hover:bg-slate-50',
                  activeClientId == null && 'bg-cyan-50 font-semibold text-cyan-800',
                )}
                onClick={() => {
                  setActiveClient(null)
                  setOpen(false)
                }}
              >
                {aggregateLabel}
              </button>
            </li>
            {[...grouped.entries()].map(([provider, rows]) => (
              <li key={provider}>
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {providerLabel[provider] ?? provider}
                </p>
                {rows.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={activeClientId === c.id}
                    className={cn(
                      'w-full px-3 py-2 text-left text-xs hover:bg-slate-50',
                      activeClientId === c.id && 'bg-cyan-50 font-semibold text-cyan-800',
                    )}
                    onClick={() => {
                      setActiveClient(c.id)
                      setOpen(false)
                    }}
                  >
                    {c.clientLabel || c.accountDisplayName || c.merchantAccountId}
                  </button>
                ))}
              </li>
            ))}
            {clients.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-500">请先在设置中绑定客户商家账号</li>
            ) : null}
          </ul>
        </>
      ) : null}
    </div>
  )
}
