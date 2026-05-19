import { Check, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../cn'

export type PlatformAccountListItem = {
  id: string
  accountId: string
  displayName: string
  subLabel?: string
  badge?: string
  isActive: boolean
  demoMode?: boolean
}

export default function MerchantPlatformAccountsPanel({
  accounts,
  maxAccounts = 5,
  planHint,
  emptyHint,
  onSelectActive,
  onRemove,
  onAddClick,
}: {
  accounts: PlatformAccountListItem[]
  maxAccounts?: number
  /** 当前套餐绑定上限说明 */
  planHint?: string
  emptyHint: string
  onSelectActive: (id: string) => void
  onRemove: (id: string) => void
  onAddClick: () => void
}) {
  const atLimit = accounts.length >= maxAccounts

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          <p>
            已绑定 {accounts.length} / {maxAccounts} 个账号
          </p>
          {planHint ? <p className="mt-0.5 text-slate-400">{planHint}</p> : null}
        </div>
        <button
          type="button"
          disabled={atLimit}
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          添加账号
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">
          {emptyHint}
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5',
                a.isActive ? 'border-cyan-300 bg-cyan-50/50' : 'border-slate-200 bg-white',
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{a.displayName}</p>
                <p className="truncate font-mono text-[11px] text-slate-500">{a.accountId}</p>
                {a.subLabel ? (
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{a.subLabel}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.badge ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {a.badge}
                  </span>
                ) : null}
                {a.demoMode ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                    演示
                  </span>
                ) : null}
                {a.isActive ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-cyan-700">
                    <Check className="h-3 w-3" />
                    当前使用
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectActive(a.id)}
                    className="text-[10px] font-medium text-cyan-700 hover:underline"
                  >
                    设为当前
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                  aria-label="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
