import { ArrowRight, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { GeoScoreSnapshot } from '../../lib/geoPersist'
import {
  geoOptimizationPlaybook,
  type GeoStoreDiagnosticRow,
} from '../../lib/geoStoreDiagnostics'
import { GEO_HEALTH_SCORE } from '../../lib/geoModuleSpec'

export function GeoScoreTrendCard({ snapshot }: { snapshot: GeoScoreSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
        完成一次「同步来客并 AI 综合评分」后，将在此记录健康分快照，便于对比优化效果。
      </div>
    )
  }
  const prev = snapshot.history?.[snapshot.history.length - 1]
  const delta = prev ? snapshot.healthScore - prev.healthScore : null
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-blue-900">上次评分快照</p>
        <span className="text-xs text-gray-500">{snapshot.savedAt}</span>
      </div>
      <p className="mt-2 text-sm text-gray-700">
        {snapshot.scopeLabel} · {snapshot.storeCount} 店 ·{' '}
        {snapshot.scoreSource === 'ai' ? 'AI 综合' : '规则回退'}
      </p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-3xl font-bold text-gray-900">{snapshot.healthScore}</span>
        <span className="pb-1 text-sm text-gray-500">/ {GEO_HEALTH_SCORE.fullScore}</span>
        {delta != null ? (
          <span
            className={`mb-1 inline-flex items-center text-sm font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-amber-700'}`}
          >
            <TrendingUp className="mr-0.5 h-4 w-4" />
            {delta >= 0 ? '+' : ''}
            {delta} 较上回
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function GeoStoreBreakdownTable({ rows }: { rows: GeoStoreDiagnosticRow[] }) {
  if (rows.length <= 1) return null
  const weak = rows.filter((r) => r.completenessPercent < 100)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">各店信息完整度（拆分）</h3>
      <p className="mt-1 text-sm text-gray-500">
        多店/品牌场景下，优先补齐完整度最低的门店，可快速提升账户级 GEO 健康分。
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-700">门店</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">完整度</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700">待补项</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.poiId}>
                <td className="px-3 py-2 text-gray-900">
                  {r.name}
                  {r.brandName ? (
                    <span className="ml-1 text-xs text-gray-500">· {r.brandName}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.completenessPercent >= 100 ? 'text-emerald-600' : 'text-amber-700'
                    }
                  >
                    {r.completenessPercent}%
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {r.missingFields.length ? r.missingFields.join('、') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weak.length > 0 ? (
        <p className="mt-3 text-xs text-amber-800">
          建议优先处理：{weak.slice(0, 3).map((r) => r.name).join('、')}
          {weak.length > 3 ? ` 等 ${weak.length} 家` : ''}
        </p>
      ) : null}
    </div>
  )
}

export function GeoOptimizationRoadmap({ healthScore }: { healthScore: number }) {
  const phases = geoOptimizationPlaybook(healthScore)
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">GEO 优化路线图</h3>
      <p className="mt-1 text-sm text-gray-500">
        按周推进：事实库 → 内容与问法 → 监测闭环；与下方待办联动执行。
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {phases.map((p) => (
          <div key={p.phase} className="rounded-lg border border-white bg-white/80 p-4">
            <p className="text-sm font-semibold text-indigo-900">{p.phase}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-gray-700">
              {p.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Link
        to="/operation/competitors"
        className="mt-4 inline-flex items-center text-sm font-medium text-indigo-700 hover:underline"
      >
        结合竞争对手分析制定差异化
        <ArrowRight className="ml-1 h-4 w-4" />
      </Link>
    </div>
  )
}
