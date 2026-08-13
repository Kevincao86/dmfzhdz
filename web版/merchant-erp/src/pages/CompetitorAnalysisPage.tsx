import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CompetitorTargetPicker from '../components/store/CompetitorTargetPicker'
import {
  competitorDisplayLabel,
  competitorReportKeyForTarget,
  latestCompetitorReportForTarget,
  loadCompetitorReports,
  loadSelectedCompetitorTarget,
  saveCompetitorReport,
  saveSelectedCompetitorTarget,
  type CompetitorReport,
  type CompetitorTarget,
} from '../lib/competitorStorage'
import { loadStoreMenuRecord, menuItemsSummary } from '../lib/storeMenuStorage'
import { readStoreMarginConfig } from '../lib/storeMarginsRead'
import {
  competitorIndustrySourceLabel,
  resolveCompetitorAnalysisIndustry,
} from '../lib/competitorIndustry'
import FootTrafficHeatPanel from '../components/store/FootTrafficHeatPanel'
import { analyzeCompetitors } from '../services/storeIntelApi'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { pullMarginConfigFromCloud } from '../lib/tenantStoreIntelCloud'

export default function CompetitorAnalysisPage() {
  const [target, setTarget] = useState<CompetitorTarget | null>(null)
  const [report, setReport] = useState<CompetitorReport | null>(null)
  const [history, setHistory] = useState<CompetitorReport[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** 触发重新 resolve 经营类目（云端拉取 / 商品页保存后） */
  const [industryTick, setIndustryTick] = useState(0)
  const industryNameForResolve =
    target?.mode === 'brand' ? target.brandName : target?.storeName
  const boundIndustry = useMemo(
    () => resolveCompetitorAnalysisIndustry(industryNameForResolve),
    [industryNameForResolve, industryTick],
  )

  useEffect(() => {
    const t = loadSelectedCompetitorTarget()
    setTarget(t)
    setHistory(loadCompetitorReports())
    setReport(latestCompetitorReportForTarget(t))
  }, [])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    const client = supabase
    void pullMarginConfigFromCloud(client).then((cfg) => {
      if (cfg?.industry?.path || cfg?.industry?.name || cfg?.industry?.leafCategoryId) {
        setIndustryTick((n) => n + 1)
        setErr((prev) =>
          prev?.includes('门店毛利配置') ? null : prev,
        )
      }
    })
  }, [])

  useEffect(() => {
    const refreshIndustry = () => {
      setIndustryTick((n) => n + 1)
      const ind = resolveCompetitorAnalysisIndustry(
        target?.mode === 'brand' ? target.brandName : target?.storeName,
      )
      if (ind.path) {
        setErr((prev) => (prev?.includes('门店毛利配置') ? null : prev))
      }
    }
    window.addEventListener('meoo-store-margin-config-changed', refreshIndustry)
    window.addEventListener('meoo-active-tenant-changed', refreshIndustry)
    window.addEventListener('focus', refreshIndustry)
    return () => {
      window.removeEventListener('meoo-store-margin-config-changed', refreshIndustry)
      window.removeEventListener('meoo-active-tenant-changed', refreshIndustry)
      window.removeEventListener('focus', refreshIndustry)
    }
  }, [target])

  const onSelectTarget = (next: CompetitorTarget | null) => {
    setTarget(next)
    saveSelectedCompetitorTarget(next)
    setReport(latestCompetitorReportForTarget(next))
    setErr(null)
  }

  const runAnalysis = useCallback(async () => {
    if (!target) {
      setErr('请先选择门店或品牌')
      return
    }
    const address =
      target.mode === 'brand' ? target.anchorAddress : target.address
    if (!address?.trim()) {
      setErr('所选目标缺少可用地址，请换一家带地址的门店或品牌')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const industry = resolveCompetitorAnalysisIndustry(
        target.mode === 'brand' ? target.brandName : target.storeName,
      )
      if (!industry.path) {
        setErr(
          '请先在「商品 → 门店毛利配置」中选择经营类目（如 购物 > 商超便利 或 购物 > 数码家电），再进行分析',
        )
        return
      }
      const menu = loadStoreMenuRecord()
      const menuSummary = menu?.items?.length ? menuItemsSummary(menu.items, 30) : ''
      const { margins } = readStoreMarginConfig()
      const displayName =
        target.mode === 'brand' ? target.brandName : target.storeName
      const r = await analyzeCompetitors({
        storeName: displayName,
        address: address.trim(),
        city: target.mode === 'brand' ? target.anchorCity : target.city,
        industryPath: industry.path,
        industryName: industry.name,
        industryHint: industry.path,
        menuSummary: menuSummary || undefined,
        margins,
        marginSummary: `抖音 ${margins.douyin}%、美团 ${margins.meituan}%、小红书 ${margins.xhs}%`,
        analysisMode: target.mode,
        brandName: target.mode === 'brand' ? target.brandName : undefined,
        storeCount: target.mode === 'brand' ? target.storeCount : undefined,
        storeLocations:
          target.mode === 'brand'
            ? target.stores
                .map((s) => `${s.storeName}：${s.address}${s.city ? `（${s.city}）` : ''}`)
                .join('\n')
            : undefined,
      })
      if (!r.ok) {
        setErr(r.message)
        return
      }
      const reportKey = competitorReportKeyForTarget(target)
      const next: CompetitorReport = {
        id: `cmp-${Date.now()}`,
        poiId: reportKey,
        storeName: displayName,
        address: address.trim(),
        brandName: target.mode === 'brand' ? target.brandName : undefined,
        storeCount: target.mode === 'brand' ? target.storeCount : undefined,
        industryHint: industry.path,
        analyzedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        summary: r.summary,
        competitors: r.competitors,
        suggestions: r.suggestions,
        bundleSuggestions: r.bundleSuggestions,
        ...(r.mapSource ? { mapSource: r.mapSource } : {}),
        ...(typeof r.mapMeta?.poiCount === 'number' ? { mapPoiCount: r.mapMeta.poiCount } : {}),
        ...(r.footTrafficHeat ? { footTrafficHeat: r.footTrafficHeat } : {}),
      }
      saveCompetitorReport(next)
      setReport(next)
      setHistory(loadCompetitorReports())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [target])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="erp-page-title">竞争对手分析</h1>
        <p className="mt-1 text-sm text-gray-500">
          根据所选门店或<strong className="font-medium text-gray-700">连锁品牌</strong>与
          <Link to="/store/menu" className="mx-1 text-indigo-600 underline">
            菜单价目表
          </Link>
          、
          <Link to="/products" className="mx-1 text-indigo-600 underline">
            商品毛利率
          </Link>
          ，优先用高德地图检索周边同业 POI（失败时回退百度），再由 AI 分析定价带与组品建议。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <CompetitorTargetPicker value={target} onChange={onSelectTarget} disabled={loading} />

        {target && (
          <p className="text-sm text-gray-600">
            当前：
            <span className="font-medium text-gray-900">{competitorDisplayLabel(target)}</span>
            {target.mode === 'brand' ? (
              <span className="ml-1 text-xs text-indigo-600">· 品牌统筹分析</span>
            ) : null}
            <br />
            {target.mode === 'brand' ? (
              <>
                <span className="text-xs text-gray-500">
                  统筹地址（参考 {target.anchorStoreName ?? '首店'}）：{target.anchorAddress}
                </span>
                <br />
                <span className="text-xs text-gray-500">
                  含分店：
                  {target.stores
                    .slice(0, 4)
                    .map((s) => s.storeName)
                    .join('、')}
                  {target.stores.length > 4 ? ` 等 ${target.storeCount} 家` : ''}
                </span>
              </>
            ) : (
              target.address
            )}
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
          disabled={loading || !target}
          onClick={() => void runAnalysis()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? '分析中…' : target?.mode === 'brand' ? '开始品牌周边竞品分析' : '开始周边竞品分析'}
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
          {report.brandName && report.storeCount && report.storeCount > 1 ? (
            <p className="text-xs font-medium text-violet-800">
              分析范围：{report.brandName} · {report.storeCount} 家门店（品牌统筹）
            </p>
          ) : null}
          <p className="text-sm leading-relaxed text-gray-800">{report.summary}</p>
          {report.industryHint && (
            <p className="text-xs text-gray-500">分析类目：{report.industryHint}</p>
          )}
          {report.footTrafficHeat ? (
            <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3">
              <FootTrafficHeatPanel heat={report.footTrafficHeat} />
            </div>
          ) : null}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {report.mapSource === 'amap' || report.mapSource === 'baidu'
                ? `${report.mapSource === 'amap' ? '高德' : '百度'}地图实查${
                    typeof report.mapPoiCount === 'number' ? `（${report.mapPoiCount} 家）` : ''
                  }`
                : '周边竞品（推断）'}
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
                      <p className="text-[11px] font-medium text-amber-900">
                        热销团购/外卖（推断，供 AI 组品参考）
                      </p>
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
          {report.bundleSuggestions && report.bundleSuggestions.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                组品建议（AI · 毛利 + 菜单 + 竞品）
              </h3>
              <ul className="space-y-3">
                {report.bundleSuggestions.map((b, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-gray-800"
                  >
                    <p className="font-medium text-emerald-950">{b.title}</p>
                    {b.comboLines?.length ? (
                      <p className="mt-1 text-xs text-gray-700">
                        组合：{b.comboLines.join(' + ')}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-gray-600">
                      {b.suggestedPriceYuan != null ? (
                        <span className="font-medium text-emerald-800">
                          建议售价 ¥{b.suggestedPriceYuan}
                        </span>
                      ) : null}
                      {b.originYuan != null ? (
                        <span className="ml-2 text-gray-500">面值 ¥{b.originYuan}</span>
                      ) : null}
                      {b.targetMarginNote ? (
                        <span className="ml-2 text-gray-500">· {b.targetMarginNote}</span>
                      ) : null}
                    </p>
                    {b.competitorRef ? (
                      <p className="mt-0.5 text-xs text-gray-500">竞品对标：{b.competitorRef}</p>
                    ) : null}
                    {b.rationale ? (
                      <p className="mt-1 text-xs leading-relaxed text-gray-700">{b.rationale}</p>
                    ) : null}
                  </li>
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
                  {h.brandName && h.storeCount && h.storeCount > 1
                    ? `${h.brandName}（${h.storeCount}店）`
                    : h.storeName}{' '}
                  · {h.analyzedAt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
