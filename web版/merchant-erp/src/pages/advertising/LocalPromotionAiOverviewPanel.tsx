import { TrendingUp } from 'lucide-react'
import type { LocalPromotionChannelStats } from '../../lib/localPromotionAnalytics'
import { buildLeadsFunnelMetrics, formatReportRange } from '../../lib/localPromotionAnalytics'
import type {
  LocalClueRow,
  LocalPromotionAiAction,
  LocalPromotionAiMode,
  LocalPromotionRow,
  LocalReportSummary,
} from '../../lib/localPromotionTypes'
import LocalPromotionAiModePanel from './LocalPromotionAiModePanel'

type Props = {
  summary: LocalReportSummary | null
  channelStats: LocalPromotionChannelStats[]
  promotions: LocalPromotionRow[]
  clues: LocalClueRow[]
  aiMode: LocalPromotionAiMode
  onAiModeChange: (mode: LocalPromotionAiMode) => void
  aiInsight: string | null
  aiActions: LocalPromotionAiAction[]
  aiBusy: boolean
  aiApplyingId: string | null
  onRunAi: () => void
  onApplyAiAction: (action: LocalPromotionAiAction) => void
  loading: boolean
}

export default function LocalPromotionAiOverviewPanel({
  summary,
  channelStats,
  promotions,
  clues,
  aiMode,
  onAiModeChange,
  aiInsight,
  aiActions,
  aiBusy,
  aiApplyingId,
  onRunAi,
  onApplyAiAction,
  loading,
}: Props) {
  const funnel = buildLeadsFunnelMetrics({ promotions, clues, summary })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">AI 整体分析</h3>
        <p className="mt-1 text-sm text-slate-500">
          汇总直播间、短视频投流与线索承接，生成可执行优化建议与计划调整动作。
        </p>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">总消耗</p>
            <p className="mt-1 text-xl font-semibold">¥{summary.statCost.toFixed(2)}</p>
            <p className="text-[10px] text-slate-400">{formatReportRange(summary)}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">线索得到</p>
            <p className="mt-1 text-xl font-semibold text-cyan-700">{funnel.clueCount}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">线索成本</p>
            <p className="mt-1 text-xl font-semibold">
              {funnel.leadCpl != null ? `¥${funnel.leadCpl}` : '—'}
            </p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">总转化</p>
            <p className="mt-1 text-xl font-semibold">{summary.convertCnt}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">线索/转化比</p>
            <p className="mt-1 text-xl font-semibold text-violet-700">
              {funnel.cluePerConvertPct != null ? `${funnel.cluePerConvertPct}%` : '—'}
            </p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">广告计划</p>
            <p className="mt-1 text-xl font-semibold">{promotions.length}</p>
          </div>
        </div>
      ) : null}

      <LocalPromotionAiModePanel
        pane="ai"
        paneLabel="AI 整体分析"
        mode={aiMode}
        onModeChange={onAiModeChange}
        insight={aiInsight}
        actions={aiActions}
        busy={aiBusy}
        applyingId={aiApplyingId}
        onRunAi={onRunAi}
        onApplyAction={onApplyAiAction}
        dataReady={!loading && Boolean(summary)}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {channelStats
          .filter((c) => c.channel !== 'other' || c.promotionCount > 0 || c.clueCount > 0)
          .map((c) => (
            <div key={c.channel} className="erp-panel p-4">
              <p className="font-medium text-slate-900">{c.label}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                <li>在投 {c.activeCount} / 共 {c.promotionCount} 条计划</li>
                <li>消耗 ¥{c.statCost.toFixed(2)} · 转化 {c.convertCnt}</li>
                <li>线索 {c.clueCount} 条（待跟进 {c.newClueCount}）</li>
                <li>CTR {c.ctr}%</li>
              </ul>
            </div>
          ))}
      </div>

      {aiInsight && aiMode === 'manual' ? (
        <div className="erp-panel border-violet-200 bg-violet-50/50 p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-violet-800">
            <TrendingUp className="h-3.5 w-3.5" />
            历史分析（切换 AI 模式可重新生成）
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiInsight}</p>
        </div>
      ) : null}
    </div>
  )
}
