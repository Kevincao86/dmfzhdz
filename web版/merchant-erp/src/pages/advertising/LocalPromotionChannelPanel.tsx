import { BarChart3, Pause, Play } from 'lucide-react'
import { cn } from '../../cn'
import { marketingGoalLabel } from '../../lib/localPromotionAnalytics'
import type {
  LocalProjectRow,
  LocalPromotionAiAction,
  LocalPromotionAiMode,
  LocalPromotionRow,
} from '../../lib/localPromotionTypes'
import LocalPromotionAiModePanel from './LocalPromotionAiModePanel'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="erp-panel p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p> : null}
    </div>
  )
}

type Props = {
  title: string
  description: string
  pane: 'live' | 'video'
  promotions: LocalPromotionRow[]
  projects: LocalProjectRow[]
  loading: boolean
  statusBusy: string | null
  onToggle: (row: LocalPromotionRow, enable: boolean) => void
  aiMode: LocalPromotionAiMode
  onAiModeChange: (mode: LocalPromotionAiMode) => void
  aiInsight: string | null
  aiActions: LocalPromotionAiAction[]
  aiBusy: boolean
  aiApplyingId: string | null
  onRunAi: () => void
  onApplyAiAction: (action: LocalPromotionAiAction) => void
  aiRunning?: boolean
  onAiStart?: () => void
  onAiStop?: () => void
}

export default function LocalPromotionChannelPanel({
  title,
  description,
  pane,
  promotions,
  projects,
  loading,
  statusBusy,
  onToggle,
  aiMode,
  onAiModeChange,
  aiInsight,
  aiActions,
  aiBusy,
  aiApplyingId,
  onRunAi,
  onApplyAiAction,
  aiRunning,
  onAiStart,
  onAiStop,
}: Props) {
  const statCost = promotions.reduce((s, p) => s + (p.statCost ?? 0), 0)
  const convertCnt = promotions.reduce((s, p) => s + (p.convertCnt ?? 0), 0)
  const showCnt = promotions.reduce((s, p) => s + (p.showCnt ?? 0), 0)
  const clickCnt = promotions.reduce((s, p) => s + (p.clickCnt ?? 0), 0)
  const ctr = showCnt > 0 ? Math.round((clickCnt / showCnt) * 10000) / 100 : 0
  const active = promotions.filter((p) => p.statusFirst === 'PROMOTION_STATUS_ENABLE').length

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="在投计划" value={String(active)} sub={`共 ${promotions.length} 条`} />
        <StatCard label="消耗(元)" value={statCost.toFixed(2)} sub="近7日" />
        <StatCard label="展示" value={showCnt.toLocaleString()} />
        <StatCard label="转化" value={String(convertCnt)} />
        <StatCard label="CTR" value={`${ctr}%`} />
      </div>

      <LocalPromotionAiModePanel
        pane={pane}
        paneLabel={title}
        mode={aiMode}
        onModeChange={onAiModeChange}
        insight={aiInsight}
        actions={aiActions}
        busy={aiBusy}
        applyingId={aiApplyingId}
        onRunAi={onRunAi}
        onApplyAction={onApplyAiAction}
        dataReady={!loading && promotions.length > 0}
        aiRunning={aiRunning}
        onAiStart={onAiStart}
        onAiStop={onAiStop}
      />

      <div className="erp-panel overflow-hidden">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">广告计划</th>
              <th className="px-4 py-3">投放类型</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">消耗</th>
              <th className="px-4 py-3">转化</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {loading ? '加载中…' : '该渠道暂无广告计划'}
                </td>
              </tr>
            ) : (
              promotions.map((p) => (
                <tr key={p.promotionId} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.promotionName}</p>
                    <p className="text-xs text-slate-400">ID {p.promotionId}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {marketingGoalLabel(p.marketingGoal)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        p.statusFirst === 'PROMOTION_STATUS_ENABLE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {p.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.statCost != null ? `¥${p.statCost.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">{p.convertCnt ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {p.statusFirst === 'PROMOTION_STATUS_ENABLE' ? (
                      <button
                        type="button"
                        disabled={statusBusy === p.promotionId}
                        onClick={() => onToggle(p, false)}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-amber-700"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        暂停
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={statusBusy === p.promotionId}
                        onClick={() => onToggle(p, true)}
                        className="inline-flex items-center gap-1 text-xs text-cyan-700 hover:underline"
                      >
                        <Play className="h-3.5 w-3.5" />
                        启用
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {projects.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">关联项目</p>
          {projects.map((p) => (
            <div key={p.projectId} className="erp-panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900">{p.projectName}</p>
                <p className="text-xs text-slate-400">
                  {p.statusLabel} · {marketingGoalLabel(p.marketingGoal)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <BarChart3 className="h-4 w-4 text-slate-400" />
                {p.budgetYuan != null ? `日预算 ¥${p.budgetYuan}` : '预算 —'}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
