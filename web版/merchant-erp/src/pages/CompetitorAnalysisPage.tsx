import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DouyinStorePickerTrigger, type DouyinStoreRow } from '../components/store/DouyinStorePickerModal'
import {
  latestCompetitorReportForPoi,
  loadCompetitorReports,
  loadSelectedCompetitorStore,
  saveCompetitorReport,
  saveSelectedCompetitorStore,
  type CompetitorReport,
  type SelectedStoreRef,
} from '../lib/competitorStorage'
import { loadStoreMenuRecord, menuItemsSummary } from '../lib/storeMenuStorage'
import {
  competitorIndustrySourceLabel,
  resolveCompetitorAnalysisIndustry,
} from '../lib/competitorIndustry'
import { analyzeCompetitors } from '../services/storeIntelApi'

export default function CompetitorAnalysisPage() {
  const [selected, setSelected] = useState<SelectedStoreRef | null>(null)
  const [report, setReport] = useState<CompetitorReport | null>(null)
  const [history, setHistory] = useState<CompetitorReport[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const boundIndustry = resolveCompetitorAnalysisIndustry(selected?.storeName)

  useEffect(() => {
    setSelected(loadSelectedCompetitorStore())
    setHistory(loadCompetitorReports())
  }, [])

  useEffect(() => {
    if (selected?.poiId) {
      setReport(latestCompetitorReportForPoi(selected.poiId))
    }
  }, [selected?.poiId])

  const onSelectStore = (poiId: string | null, row: DouyinStoreRow | null): boolean | void => {
    if (!poiId) {
      setSelected(null)
      saveSelectedCompetitorStore(null)
      setReport(null)
      setErr(null)
      return
    }
    if (!row?.address?.trim()) {
      setErr('所选门店缺少地址，请换一家带地址的门店')
      return false
    }
    const ref: SelectedStoreRef = {
      poiId: row.id,
      storeName: row.name,
      address: row.address.trim(),
    }
    setSelected(ref)
    saveSelectedCompetitorStore(ref)
    setReport(latestCompetitorReportForPoi(row.id))
    setErr(null)
  }

  const runAnalysis = useCallback(async () => {
    if (!selected?.address) {
      setErr('请先选择带地址的门店')
      return
    }
    setLoading(true)
    setErr(null)
    const industry = resolveCompetitorAnalysisIndustry(selected.storeName)
    if (!industry.path) {
      setLoading(false)
      setErr('请先在「商品 → 门店毛利配置」中选择经营类目（如 购物 > 商超便利 或 购物 > 数码家电），再进行分析')
      return
    }
    const menu = loadStoreMenuRecord()
    const menuSummary = menu?.items?.length ? menuItemsSummary(menu.items, 30) : ''
    const r = await analyzeCompetitors({
      storeName: selected.storeName,
      address: selected.address,
      city: selected.city,
      industryPath: industry.path,
      industryName: industry.name,
      industryHint: industry.path,
      menuSummary: menuSummary || undefined,
    })
    setLoading(false)
    if (!r.ok) {
      setErr(r.message)
      return
    }
    const next: CompetitorReport = {
      id: `cmp-${Date.now()}`,
      poiId: selected.poiId,
      storeName: selected.storeName,
      address: selected.address,
      industryHint: industry.path,
      analyzedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      summary: r.summary,
      competitors: r.competitors,
      suggestions: r.suggestions,
    }
    saveCompetitorReport(next)
    setReport(next)
    setHistory(loadCompetitorReports())
  }, [selected])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">竞争对手分析</h1>
        <p className="mt-1 text-sm text-gray-500">
          根据所选门店地址与
          <Link to="/store/menu" className="mx-1 text-indigo-600 underline">
            菜单价目表
          </Link>
          、
          <Link to="/products" className="mx-1 text-indigo-600 underline">
            商品毛利率
          </Link>
          ，由 AI 推断周边同业格局（基于区位与行业常识，非实时地图抓取）。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <DouyinStorePickerTrigger
            label="选择门店"
            value={selected?.poiId ?? null}
            valueLabel={
              selected
                ? `${selected.storeName}${selected.address ? ` — ${selected.address.slice(0, 36)}` : ''}`
                : ''
            }
            placeholder="请选择已认领门店"
            pickerTitle="选择门店"
            onChange={onSelectStore}
          />
        </div>

        {selected && (
          <p className="text-sm text-gray-600">
            当前：<span className="font-medium text-gray-900">{selected.storeName}</span>
            <br />
            {selected.address}
            <br />
            <span className="text-xs text-gray-500">
              分析类目：
              {boundIndustry.path ? (
                <>
                  <span className="font-medium text-indigo-700">{boundIndustry.path}</span>
                  <span className="text-gray-400">
                    {' '}
                    · {competitorIndustrySourceLabel(boundIndustry.source)}
                  </span>
                </>
              ) : (
                <Link to="/products" className="text-amber-700 underline">
                  未配置 · 请至商品页选择经营类目
                </Link>
              )}
            </span>
          </p>
        )}

        <button
          type="button"
          disabled={loading || !selected}
          onClick={() => void runAnalysis()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? '分析中…' : '开始周边竞品分析'}
        </button>

        {err && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {err}
          </p>
        )}
      </div>

      {report && (
        <div className="space-y-4 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-violet-900">最新分析报告</h2>
            <span className="text-xs text-gray-500">{report.analyzedAt}</span>
          </div>
          <p className="text-sm leading-relaxed text-gray-800">{report.summary}</p>
          {report.industryHint && (
            <p className="text-xs text-gray-500">分析类目：{report.industryHint}</p>
          )}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              周边竞品（推断）
            </h3>
            <ul className="space-y-2">
              {report.competitors.map((c, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm text-gray-800"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.distanceHint ? (
                    <span className="text-gray-500"> · {c.distanceHint}</span>
                  ) : null}
                  {c.priceRange ? (
                    <span className="text-gray-500"> · {c.priceRange}</span>
                  ) : null}
                  {c.highlights ? (
                    <p className="mt-1 text-xs text-gray-600">{c.highlights}</p>
                  ) : null}
                  {c.hotProducts && c.hotProducts.length > 0 ? (
                    <div className="mt-2 rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5">
                      <p className="text-[11px] font-medium text-amber-900">热销团购/外卖（推断，供 AI 组品参考）</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-amber-950">
                        {c.hotProducts.slice(0, 6).map((p, j) => (
                          <li key={j}>
                            {p.name}
                            {p.priceYuan != null ? (
                              <span className="font-medium"> · ¥{p.priceYuan}</span>
                            ) : null}
                            {p.channel ? (
                              <span className="text-amber-800/80"> · {p.channel}</span>
                            ) : null}
                            {p.note ? <span className="text-amber-800/70"> — {p.note}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {report.suggestions.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                经营建议
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                {report.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => void runAnalysis()}
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新分析
          </button>
        </div>
      )}

      {history.length > 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">历史记录</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {history.slice(0, 5).map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="text-left hover:text-indigo-600"
                  onClick={() => setReport(h)}
                >
                  {h.storeName} · {h.analyzedAt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
