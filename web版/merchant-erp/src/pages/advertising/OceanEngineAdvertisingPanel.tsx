import {
  BarChart3,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'
import { isLocalPromotionBound } from '../../lib/localPromotionBinding'
import { toUserFacingError } from '../../lib/userFacingError'
import type { LocalPromotionRow, LocalProjectRow, LocalReportSummary } from '../../lib/localPromotionTypes'
import ModulePage from '../ModulePage'
import {
  fetchLocalProjects,
  fetchLocalPromotions,
  fetchLocalReportSummary,
  postAdAiInsight,
  updatePromotionStatus,
} from '../../services/localPromotionApi'

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="erp-panel p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p> : null}
    </div>
  )
}

export default function OceanEngineAdvertisingPanel() {
  const [tab, setTab] = useState<'promotions' | 'projects'>('promotions')
  const [promotions, setPromotions] = useState<LocalPromotionRow[]>([])
  const [projects, setProjects] = useState<LocalProjectRow[]>([])
  const [summary, setSummary] = useState<LocalReportSummary | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pr, pj, rep] = await Promise.all([
        fetchLocalPromotions(),
        fetchLocalProjects(),
        fetchLocalReportSummary(),
      ])
      const failures: string[] = []
      if (pr.ok) {
        setPromotions(pr.list)
      } else failures.push(pr.message)
      if (pj.ok) {
        setProjects(pj.list)
      } else failures.push(pj.message)
      if (rep.ok) {
        setSummary(rep.summary)
      } else failures.push(rep.message)
      setDemoMode(Boolean((pr.ok && pr.demoMode) || (pj.ok && pj.demoMode) || (rep.ok && rep.demoMode)))
      setError(failures.length ? failures[0]! : null)
    } catch (e) {
      setError(toUserFacingError(e, '同步投流数据'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const runAiInsight = async () => {
    if (!summary) return
    setAiBusy(true)
    setAiInsight(null)
    try {
      const r = await postAdAiInsight({ summary, promotions })
      if (r.ok) setAiInsight(r.insight)
      else setError(r.message)
    } finally {
      setAiBusy(false)
    }
  }

  const togglePromotion = async (row: LocalPromotionRow, enable: boolean) => {
    setStatusBusy(row.promotionId)
    try {
      const r = await updatePromotionStatus([row.promotionId], enable ? 'ENABLE' : 'DISABLE')
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      await reload()
    } finally {
      setStatusBusy(null)
    }
  }

  const bound = isLocalPromotionBound()

  return (
    <ModulePage
      title="投流"
      subtitle="巨量本地推：项目、广告计划与近 7 日投放数据"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            同步
          </button>
          <button
            type="button"
            onClick={() => void runAiInsight()}
            disabled={aiBusy || !summary}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 投流诊断
          </button>
        </div>
      }
    >
      {!bound ? (
        <div className="erp-panel mb-6 border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          尚未绑定本地推，当前展示演示数据。
          <Link to="/settings?tab=commercial" className="ml-1 font-medium text-cyan-700 underline">
            前往系统设置 · 商业化后台
          </Link>
          配置 Access Token 与广告主 ID。
        </div>
      ) : demoMode ? (
        <div className="erp-panel mb-6 border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-800">
          演示模式：开放平台未返回有效数据，以下为样例。请检查 Token 权限与 local_account_id。
        </div>
      ) : null}

      {error ? <p className="mb-4 text-sm text-amber-700">{error}</p> : null}

      {summary ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="消耗(元)" value={summary.statCost.toFixed(2)} sub="近7日" />
          <StatCard label="展示" value={summary.showCnt.toLocaleString()} />
          <StatCard label="点击" value={summary.clickCnt.toLocaleString()} />
          <StatCard label="转化" value={String(summary.convertCnt)} />
          <StatCard label="CTR" value={`${summary.ctr}%`} sub={summary.cpl != null ? `线索成本约 ¥${summary.cpl}` : undefined} />
        </div>
      ) : null}

      {aiInsight ? (
        <div className="erp-panel mb-6 border-violet-200 bg-violet-50/50 p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-violet-800">
            <TrendingUp className="h-3.5 w-3.5" />
            AI 投流建议
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{aiInsight}</p>
        </div>
      ) : null}

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {(['promotions', 'projects'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500',
            )}
          >
            {t === 'promotions' ? '广告计划' : '项目'}
          </button>
        ))}
      </div>

      {tab === 'promotions' ? (
        <div className="erp-panel overflow-hidden">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">广告</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">消耗</th>
                <th className="px-4 py-3">转化</th>
                <th className="px-4 py-3">CTR</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {promotions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {loading ? '加载中…' : '暂无广告计划'}
                  </td>
                </tr>
              ) : (
                promotions.map((p) => (
                  <tr key={p.promotionId} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{p.promotionName}</p>
                      <p className="text-xs text-slate-400">ID {p.promotionId}</p>
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
                    <td className="px-4 py-3">{p.ctr != null ? `${p.ctr}%` : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {p.statusFirst === 'PROMOTION_STATUS_ENABLE' ? (
                        <button
                          type="button"
                          disabled={statusBusy === p.promotionId}
                          onClick={() => void togglePromotion(p, false)}
                          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-amber-700"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          暂停
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={statusBusy === p.promotionId}
                          onClick={() => void togglePromotion(p, true)}
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
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.projectId} className="erp-panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-slate-900">{p.projectName}</p>
                <p className="text-xs text-slate-400">
                  {p.statusLabel} · {p.marketingGoal ?? '—'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <BarChart3 className="h-4 w-4 text-slate-400" />
                {p.budgetYuan != null ? `日预算 ¥${p.budgetYuan}` : '预算 —'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 erp-panel border-dashed p-4 text-xs text-slate-500">
        <p className="mb-2 font-medium text-slate-700">AI 智能体可用能力（投流）</p>
        <ul className="list-inside list-disc space-y-1">
          <li>根据近 7 日消耗、CTR、转化成本生成投放优化建议</li>
          <li>识别低效广告并建议暂停或调价（需结合报表接口）</li>
          <li>按门店/项目维度对比，推荐预算倾斜方案</li>
          <li>生成本地推广告文案与短视频脚本方向（可在 AI 智能体中描述需求）</li>
        </ul>
      </div>
    </ModulePage>
  )
}
