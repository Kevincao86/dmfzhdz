import { Check, Loader2, Pause, Play, Sparkles, TrendingUp } from 'lucide-react'
import { cn } from '../../cn'
import {
  LOCAL_PROMOTION_AI_MODES,
  type LocalPromotionAiAction,
  type LocalPromotionAiMode,
  type LocalPromotionAiPane,
} from '../../lib/localPromotionTypes'

type Props = {
  pane: LocalPromotionAiPane
  paneLabel: string
  mode: LocalPromotionAiMode
  onModeChange: (mode: LocalPromotionAiMode) => void
  insight: string | null
  actions: LocalPromotionAiAction[]
  busy: boolean
  applyingId: string | null
  onRunAi: () => void
  onApplyAction: (action: LocalPromotionAiAction) => void
  dataReady?: boolean
}

export default function LocalPromotionAiModePanel({
  paneLabel,
  mode,
  onModeChange,
  insight,
  actions,
  busy,
  applyingId,
  onRunAi,
  onApplyAction,
  dataReady = true,
}: Props) {
  const showInsight = mode !== 'manual'
  const showActions = mode === 'auto_adjust' && actions.length > 0
  const showRunButton = showInsight && mode === 'assisted'

  return (
    <div className="erp-panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">AI 投流助手 · {paneLabel}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            支持手动调整、AI 辅助分析、全面介入与自动调计划（启停需确认后写入）
          </p>
        </div>
        {showRunButton ? (
          <button
            type="button"
            onClick={onRunAi}
            disabled={busy || !dataReady}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            生成分析
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {LOCAL_PROMOTION_AI_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            title={m.hint}
            onClick={() => onModeChange(m.value)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              mode === m.value
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'manual' ? (
        <p className="text-xs text-slate-500">
          当前为手动模式：请在下方表格/列表中直接暂停、启用或跟进线索。
        </p>
      ) : null}

      {showInsight ? (
        busy && !insight ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI 正在分析 {paneLabel} 数据…
          </div>
        ) : insight ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-violet-800">
              <TrendingUp className="h-3.5 w-3.5" />
              {mode === 'auto_adjust' ? 'AI 分析与建议动作' : 'AI 分析建议'}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{insight}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {mode === 'full_ai' || mode === 'auto_adjust'
              ? '切换板块或同步数据后将自动分析…'
              : '点击「生成分析」获取优化建议。'}
          </p>
        )
      ) : null}

      {showActions ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-700">待确认计划调整</p>
          {actions.map((a) => (
            <div
              key={a.actionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {a.promotionName ?? a.promotionId ?? '计划建议'}
                  {a.actionType === 'enable' ? (
                    <span className="ml-2 text-xs text-emerald-700">启用</span>
                  ) : a.actionType === 'disable' ? (
                    <span className="ml-2 text-xs text-amber-700">暂停</span>
                  ) : (
                    <span className="ml-2 text-xs text-slate-500">备注</span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{a.reason}</p>
              </div>
              {a.actionType === 'enable' || a.actionType === 'disable' ? (
                <button
                  type="button"
                  disabled={!a.promotionId || applyingId === a.actionId}
                  onClick={() => onApplyAction(a)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  {applyingId === a.actionId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : a.actionType === 'enable' ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                  确认执行
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Check className="h-3 w-3" />
                  仅建议
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
