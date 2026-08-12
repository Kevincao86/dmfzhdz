import { Loader2, MapPin, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FootTrafficHeatPanel from '../components/store/FootTrafficHeatPanel'
import SiteSelectionHeatMap from '../components/store/SiteSelectionHeatMap'
import SiteSelectionScoreCard from '../components/store/SiteSelectionScoreCard'
import {
  competitorIndustrySourceLabel,
  resolveCompetitorAnalysisIndustry,
} from '../lib/competitorIndustry'
import { readStoreMarginConfig } from '../lib/storeMarginsRead'
import { groupStoresByBrand, type BrandGroupStore } from '../lib/storeBrandGroup'
import { readMerchantSession } from '../lib/merchantSession'
import { fetchAllDouyinClaimedStoresPages } from '../services/douyinMerchantApi'
import { runSiteSelection, type SiteSelectionResult } from '../services/storeIntelApi'
import { pullMarginConfigFromCloud } from '../lib/tenantStoreIntelCloud'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'

export default function SiteSelectionPage() {
  const [spotAddress, setSpotAddress] = useState('')
  const [spotCity, setSpotCity] = useState('')
  const [spotLabel, setSpotLabel] = useState('')
  const [loading, setLoading] = useState(false)
  const [brandLoading, setBrandLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<SiteSelectionResult | null>(null)
  const [brandName, setBrandName] = useState('')
  const [brandStoreCount, setBrandStoreCount] = useState(0)
  const [industryTick, setIndustryTick] = useState(0)

  const boundIndustry = useMemo(() => resolveCompetitorAnalysisIndustry(brandName), [brandName, industryTick])
  const margins = useMemo(() => readStoreMarginConfig().margins, [industryTick])

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    void pullMarginConfigFromCloud(supabase).then(() => setIndustryTick((n) => n + 1))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBrandLoading(true)
      try {
        const tok = readMerchantSession('meoo_douyin_merchant_token')
        if (!tok) {
          if (!cancelled) {
            setBrandName('')
            setBrandStoreCount(0)
          }
          return
        }
        const r = await fetchAllDouyinClaimedStoresPages({
          accessToken: tok,
          merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
        })
        if (!r.ok) {
          if (!cancelled) {
            setBrandName('')
            setBrandStoreCount(0)
          }
          return
        }
        const stores: BrandGroupStore[] = r.items.map((x) => ({
          id: x.id,
          name: x.name,
          address: x.address,
          city: x.city,
          brandName: x.brandName,
        }))
        const groups = groupStoresByBrand(stores)
        const top = groups[0]
        if (!cancelled && top) {
          setBrandName(top.brandDisplayName)
          setBrandStoreCount(top.stores.length)
        }
      } catch {
        if (!cancelled) {
          setBrandName('')
          setBrandStoreCount(0)
        }
      } finally {
        if (!cancelled) setBrandLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const run = async () => {
    const address = spotAddress.trim()
    if (!address) {
      setErr('请填写预想点位地址')
      return
    }
    if (!boundIndustry.path) {
      setErr('请先在「商品 → 门店毛利配置」绑定经营类目，系统才能理解品牌业态')
      return
    }
    setLoading(true)
    setErr(null)
    const r = await runSiteSelection({
      address,
      city: spotCity.trim() || undefined,
      spotLabel: spotLabel.trim() || undefined,
      brandName: brandName || undefined,
      brandStoreCount: brandStoreCount || undefined,
      industryPath: boundIndustry.path,
      industryName: boundIndustry.name,
      industryHint: boundIndustry.path,
      margins,
      brandNotes: brandStoreCount
        ? `来客认领门店归并品牌，约 ${brandStoreCount} 家在营点`
        : undefined,
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
          系统先理解已绑定的品牌/类目属性，你只需填写预想点位；输出地图热力、图文综合评分，并推荐附近 2–3
          个备选点。热力为区位代理指数（非慧眼信令）。可对照
          <Link to="/operation/competitors" className="mx-1 text-indigo-600 underline">
            竞争对手分析
          </Link>
          。
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 text-sm text-indigo-950">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">已绑定品牌属性</p>
          {brandLoading ? (
            <p className="mt-1 flex items-center gap-2 text-xs text-indigo-800/80">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在读取来客品牌与经营类目…
            </p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              <li>
                品牌：
                <span className="font-medium">
                  {brandName || '未从来客归并到品牌（仍可按经营类目评估）'}
                </span>
                {brandStoreCount > 0 ? (
                  <span className="text-indigo-700/80"> · 约 {brandStoreCount} 家门店</span>
                ) : null}
              </li>
              <li>
                经营类目：
                {boundIndustry.path ? (
                  <>
                    <span className="font-medium text-indigo-900">{boundIndustry.path}</span>
                    <span className="text-indigo-700/70">
                      {' '}
                      · {competitorIndustrySourceLabel(boundIndustry.source)}
                    </span>
                  </>
                ) : (
                  <Link to="/products" className="text-amber-700 underline">
                    未配置 · 请至商品页绑定
                  </Link>
                )}
              </li>
              <li className="text-xs text-indigo-800/80">
                毛利目标：抖音 {margins.douyin}% · 美团 {margins.meituan}% · 小红书 {margins.xhs}%
              </li>
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-gray-600">预想点位地址</span>
            <input
              value={spotAddress}
              onChange={(e) => setSpotAddress(e.target.value)}
              disabled={loading}
              placeholder="例如：杭州市西湖区文三路 478 号附近"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-600">城市（可选，提升地理编码精度）</span>
            <input
              value={spotCity}
              onChange={(e) => setSpotCity(e.target.value)}
              disabled={loading}
              placeholder="杭州"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none ring-indigo-500 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-600">点位备注名（可选）</span>
            <input
              value={spotLabel}
              onChange={(e) => setSpotLabel(e.target.value)}
              disabled={loading}
              placeholder="文三路候选 A"
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
          {loading ? '评估中…' : '评估预想点位'}
        </button>
        {err ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {err}
          </p>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-4">
          <SiteSelectionScoreCard
            overall={result.score.overall}
            verdict={result.score.verdict}
            dimensions={result.score.dimensions}
            scoreStory={result.scoreStory}
            brandUnderstanding={result.brandUnderstanding}
          />

          {result.heatMapGrid?.length ? (
            <SiteSelectionHeatMap
              center={result.location}
              heatMapGrid={result.heatMapGrid}
              recommendations={result.recommendations}
              candidateLabel={result.spotLabel || '预想点位'}
            />
          ) : null}

          <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-5 shadow-sm">
            <FootTrafficHeatPanel heat={result.footTrafficHeat} />
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <Sparkles className="h-4 w-4" />
              附近合适点位推荐（2–3 个）
            </h2>
            <ul className="mt-3 space-y-3">
              {(result.recommendations ?? []).map((r) => (
                <li
                  key={`${r.rank}-${r.address}`}
                  className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-gray-900">
                      荐{r.rank} · {r.label}
                      <span className="ml-2 text-xs font-normal text-emerald-800">
                        {r.score} 分 · {r.verdict}
                      </span>
                    </p>
                    <span className="text-xs text-gray-500">
                      约 {r.distanceM} m · {r.direction}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{r.address}</p>
                  <p className="mt-1 text-xs text-emerald-900/90">{r.reason}</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    同业 {r.counts.competitor} · 交通 {r.counts.transit} · 商场 {r.counts.mall}
                  </p>
                </li>
              ))}
              {!result.recommendations?.length ? (
                <li className="text-xs text-gray-500">暂未召回备选点，可调整地址后再试</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">
                同业密度（{result.counts.competitor}）
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-800">
                {result.competitors.slice(0, 8).map((c, i) => (
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
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">落地核对清单</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-700">
                {result.checklist.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
