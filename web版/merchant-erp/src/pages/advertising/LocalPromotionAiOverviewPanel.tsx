import { Loader2, Sparkles, TrendingUp } from 'lucide-react'
import type { LocalPromotionChannelStats } from '../../lib/localPromotionAnalytics'
import { formatReportRange } from '../../lib/localPromotionAnalytics'
import type { LocalClueRow, LocalPromotionRow, LocalReportSummary } from '../../lib/localPromotionTypes'

type Props = {
  summary: LocalReportSummary | null
  channelStats: LocalPromotionChannelStats[]
  promotions: LocalPromotionRow[]
  clues: LocalClueRow[]
  aiInsight: string | null
  aiBusy: boolean
  onRunAi: () => void
}

export default function LocalPromotionAiOverviewPanel({
  summary,
  channelStats,
  promotions,
  clues,
  aiInsight,
  aiBusy,
  onRunAi,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">AI 整体分析</h3>
          <p className="mt-1 text-sm text-slate-500">
            汇总直播间、短视频投流与线索承接，生成可执行优化建议。
          </p>
        </div>
        <button
          type="button"
          onClick={onRunAi}
          disabled={aiBusy || !summary}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          生成整体分析
        </button>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">总消耗</p>
            <p className="mt-1 text-xl font-semibold">¥{summary.statCost.toFixed(2)}</p>
            <p className="text-[10px] text-slate-400">{formatReportRange(summary)}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">总转化</p>
            <p className="mt-1 text-xl font-semibold">{summary.convertCnt}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">线索总量</p>
            <p className="mt-1 text-xl font-semibold">{clues.length}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">广告计划</p>
            <p className="mt-1 text-xl font-semibold">{promotions.length}</p>
          </div>
          <div className="erp-panel p-4">
            <p className="text-xs text-slate-500">线索成本</p>
            <p className="mt-1 text-xl font-semibold">
              {summary.cpl != null ? `¥${summary.cpl}` : '—'}
            </p>
          </div>
        </div>
      ) : null}

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

      {aiInsight ? (
        <div className="erp-panel border-violet-200 bg-violet-50/50 p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-violet-800">
            <TrendingUp className="h-3.5 w-3.5" />
            AI 投流 + 线索整体建议
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiInsight}</p>
        </div>
      ) : (
        <div className="erp-panel border-dashed p-6 text-center text-sm text-slate-500">
          点击「生成整体分析」，AI 将综合直播间、短视频与线索数据给出本周优先动作。
        </div>
      )}
    </div>
  )
}
