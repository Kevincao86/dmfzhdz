import { Loader2, RefreshCw, Sparkles, TrendingUp } from 'lucide-react'
import {
  buildLeadsFunnelMetrics,
  buildPlanRoiInsights,
  formatReportRange,
} from '../../lib/localPromotionAnalytics'
import type { LocalClueRow, LocalPromotionRow, LocalReportSummary } from '../../lib/localPromotionTypes'

type Props = {
  summary: LocalReportSummary | null
  promotions: LocalPromotionRow[]
  clues: LocalClueRow[]
  aiInsight: string | null
  aiBusy: boolean
  onRunAi: () => void
  loading: boolean
}

const gradeClass: Record<string, string> = {
  优: 'bg-emerald-100 text-emerald-800',
  良: 'bg-amber-100 text-amber-800',
  差: 'bg-rose-100 text-rose-800',
  '—': 'bg-slate-100 text-slate-500',
}

export default function LocalPromotionAiOverviewPanel({
  summary,
  promotions,
  clues,
  aiInsight,
  aiBusy,
  onRunAi,
  loading,
}: Props) {
  const funnel = buildLeadsFunnelMetrics({ promotions, clues, summary })
  const planInsights = buildPlanRoiInsights(promotions, clues)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">AI 整体分析</h3>
          <p className="mt-1 text-sm text-slate-500">
            汇总直播间、短视频与线索各计划的投产情况，给出调整建议，供新建计划时参考。
          </p>
        </div>
        <button
          type="button"
          onClick={onRunAi}
          disabled={aiBusy || loading || !summary}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {aiInsight ? '重新分析' : '生成分析'}
        </button>
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

      <div className="erp-panel overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">各计划投产一览</p>
          <p className="text-xs text-slate-500">按直播间 / 短视频板块归类，便于对照历史表现新建计划</p>
        </div>
        {planInsights.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {loading ? '同步数据中…' : '暂无广告计划数据，绑定账号并同步后查看投产分析'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">计划</th>
                  <th className="px-4 py-2 text-left font-medium">板块</th>
                  <th className="px-4 py-2 text-right font-medium">消耗</th>
                  <th className="px-4 py-2 text-right font-medium">转化</th>
                  <th className="px-4 py-2 text-right font-medium">线索</th>
                  <th className="px-4 py-2 text-right font-medium">单转化成本</th>
                  <th className="px-4 py-2 text-right font-medium">单线索成本</th>
                  <th className="px-4 py-2 text-center font-medium">投产</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {planInsights.map((row) => (
                  <tr key={row.promotionId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{row.promotionName}</p>
                      <p className="text-[10px] text-slate-400">{row.statusLabel}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{row.channelLabel}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">¥{row.statCost.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.convertCnt}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.clueCount}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.costPerConvert != null ? `¥${row.costPerConvert}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.costPerClue != null ? `¥${row.costPerClue}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${gradeClass[row.roiGrade] ?? gradeClass['—']}`}
                      >
                        {row.roiGrade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aiBusy && !aiInsight ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          AI 正在分析各计划投产并生成参考建议…
        </div>
      ) : aiInsight ? (
        <div className="erp-panel border-violet-200 bg-violet-50/50 p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-violet-800">
            <TrendingUp className="h-3.5 w-3.5" />
            整体调整建议（新建计划参考）
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiInsight}</p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          点击「生成分析」获取 AI 对各计划投产评价与新建计划参考要点。
        </p>
      )}

      {!loading && summary && !aiInsight && !aiBusy ? (
        <p className="flex items-center gap-1 text-[10px] text-slate-400">
          <RefreshCw className="h-3 w-3" />
          数据更新后请重新生成分析
        </p>
      ) : null}
    </div>
  )
}
