import { Loader2, MapPin, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FootTrafficHeatPanel from '../components/store/FootTrafficHeatPanel'
import CompetitorTargetPicker from '../components/store/CompetitorTargetPicker'
import {
  competitorDisplayLabel,
  loadSelectedCompetitorTarget,
  saveSelectedCompetitorTarget,
  type CompetitorTarget,
} from '../lib/competitorStorage'
import {
  competitorIndustrySourceLabel,
  resolveCompetitorAnalysisIndustry,
} from '../lib/competitorIndustry'
import { runSiteSelection, type SiteSelectionResult } from '../services/storeIntelApi'

export default function SiteSelectionPage() {
  const [target, setTarget] = useState<CompetitorTarget | null>(() => loadSelectedCompetitorTarget())
  const [manualAddress, setManualAddress] = useState('')
  const [manualCity, setManualCity] = useState('')
  const [manualName, setManualName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<SiteSelectionResult | null>(null)

  const industryNameForResolve =
    target?.mode === 'brand' ? target.brandName : target?.storeName || manualName
  const boundIndustry = useMemo(
    () => resolveCompetitorAnalysisIndustry(industryNameForResolve),
    [industryNameForResolve],
  )

  const onSelectTarget = (next: CompetitorTarget | null) => {
    setTarget(next)
    saveSelectedCompetitorTarget(next)
    setErr(null)
  }

  const run = async () => {
    const address =
      manualAddress.trim() ||
      (target?.mode === 'brand' ? target.anchorAddress : target?.address)?.trim() ||
      ''
    if (!address) {
      setErr('请填写候选地址，或选择带地址的门店/品牌')
      return
    }
    if (!boundIndustry.path) {
      setErr('请先在「商品 → 门店毛利配置」中选择经营类目，便于同业与热度估算')
      return
    }
    setLoading(true)
    setErr(null)
    const storeName =
      manualName.trim() ||
      (target ? competitorDisplayLabel(target) : '') ||
      '候选点位'
    const city =
      manualCity.trim() ||
      (target?.mode === 'brand' ? target.anchorCity : target?.city) ||
      undefined
    const r = await runSiteSelection({
      address,
      city,
      storeName,
      industryPath: boundIndustry.path,
      industryName: boundIndustry.name,
      industryHint: boundIndustry.path,
      radiusM: 1500,
    })
    setLoading(false)
    if (!r.ok) {
      setErr(r.message)
      return
    }
    setResult(r)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">选址参考</h1>
        <p className="mt-1 text-sm text-gray-500">
          对齐市面选址产品常见能力：点位打分、竞品密度、交通/聚客配套、近 7 日热度与建议清单。数据基于百度地图周边
          POI；人流热度为区位代理指数（非慧眼信令客流）。可与
          <Link to="/operation/competitors" className="mx-1 text-indigo-600 underline">
            竞争对手分析
          </Link>
          对照使用。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <CompetitorTargetPicker value={target} onChange={onSelectTarget} disabled={loading} />
        {target ? (
          <p className="text-sm text-gray-600">
            已选：<span className="font-medium text-gray-900">{competitorDisplayLabel(target)}</span>
            <span className="ml-2 text-xs text-gray-500">
              分析类目：{boundIndustry.path || '未配置'}
              {boundIndustry.path
                ? `（${competitorIndustrySourceLabel(boundIndustry.source)}）`
                : ''}
            </span>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              候选地址（可覆盖已选门店，用于评估新点位）
            </span>
            <input
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              disabled={loading}
              placeholder="例如：上海市静安区南京西路1788号"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-600">城市（可选）</span>
            <input
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              disabled={loading}
              placeholder="上海"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-600">点位备注名（可选）</span>
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              disabled={loading}
              placeholder="静安寺候选点 A"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {loading ? '评估中…' : '开始选址评估'}
        </button>
        {err ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {err}
          </p>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">点位综合分</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-900">
                  {result.score.overall}
                  <span className="ml-1 text-base font-medium text-emerald-700/80">/100</span>
                </p>
                <p className="mt-1 text-sm text-emerald-800">结论：{result.score.verdict}</p>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-gray-700">{result.summary}</p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {result.score.dimensions.map((d) => (
                <div key={d.key} className="rounded-lg border border-emerald-100 bg-white/80 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-800">{d.label}</span>
                    <span className="tabular-nums text-emerald-800">{d.score}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">{d.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-5 shadow-sm">
            <FootTrafficHeatPanel heat={result.footTrafficHeat} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">
                同业竞品密度（{result.counts.competitor}）
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-800">
                {result.competitors.slice(0, 10).map((c, i) => (
                  <li key={`${c.name}-${i}`} className="rounded-lg border border-gray-100 px-3 py-2">
                    <span className="font-medium">{c.name}</span>
                    {c.distanceM != null ? (
                      <span className="text-gray-500">
                        {' '}
                        ·{' '}
                        {c.distanceM >= 1000
                          ? `${(c.distanceM / 1000).toFixed(1)} km`
                          : `${Math.round(c.distanceM)} m`}
                      </span>
                    ) : null}
                  </li>
                ))}
                {!result.competitors.length ? (
                  <li className="text-xs text-gray-500">半径内未召回同业 POI</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">交通与聚客配套</h2>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
                {(
                  [
                    ['transit', '交通站点', result.counts.transit],
                    ['office', '写字楼', result.counts.office],
                    ['residential', '住宅', result.counts.residential],
                    ['mall', '商场', result.counts.mall],
                    ['school', '学校', result.counts.school],
                  ] as const
                ).map(([key, label, count]) => (
                  <div key={key} className="rounded-lg border border-gray-100 px-2.5 py-2">
                    <dt className="text-gray-500">
                      {label} · {count}
                    </dt>
                    <dd className="mt-1 line-clamp-3 text-gray-800">
                      {(result.amenities[key] || []).slice(0, 3).join('、') || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-900">
              <Sparkles className="h-4 w-4" />
              选址建议
            </h2>
            {result.aiAdvice ? (
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {result.aiAdvice}
              </pre>
            ) : null}
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {result.checklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              本页覆盖的市面常见能力
            </h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {result.marketFeatures.map((f) => (
                <li key={f.name} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{f.name}</span> — {f.desc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
