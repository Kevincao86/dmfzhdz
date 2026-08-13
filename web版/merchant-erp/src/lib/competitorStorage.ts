/**
 * 竞争对手分析结果（按租户 localStorage）。
 */
import { tenantLocalKey } from './tenantLocalState'

const BASE_KEY = 'meoo_competitor_reports_v1'
const SELECTED_KEY = 'meoo_competitor_selected_target_v1'
const LEGACY_POI_KEY = 'meoo_competitor_selected_poi_v1'

export type CompetitorHotProduct = {
  name: string
  priceYuan?: number
  channel?: '团购' | '外卖' | '到店'
  note?: string
}

/** AI 组品建议（结合毛利、菜单价、竞品） */
export type CompetitorBundleSuggestion = {
  title: string
  comboLines: string[]
  suggestedPriceYuan?: number
  originYuan?: number
  targetMarginNote?: string
  competitorRef?: string
  rationale?: string
}

export type CompetitorEntry = {
  name: string
  distanceHint?: string
  category?: string
  priceRange?: string
  highlights?: string
  hotProducts?: CompetitorHotProduct[]
}

export type CompetitorFootTrafficHeat = {
  source: 'estimated_proxy'
  disclaimer: string
  radiusM: number
  location: { lat: number; lng: number }
  days: Array<{
    date: string
    weekday: string
    avgIndex: number
    peakSlot: string
    peakIndex: number
    slots: Array<{
      key: 'morning' | 'noon' | 'evening' | 'night'
      label: string
      index: number
    }>
  }>
  insight: string
  drivers: string[]
}

export type CompetitorReport = {
  id: string
  /** store: 单店 poiId；brand: `brand:${brandKey}` */
  poiId: string
  storeName: string
  address: string
  /** brand 模式下记录品牌名 */
  brandName?: string
  storeCount?: number
  industryHint?: string
  analyzedAt: string
  summary: string
  competitors: CompetitorEntry[]
  suggestions: string[]
  /** AI 组品建议（毛利 + 菜单 + 竞品） */
  bundleSuggestions?: CompetitorBundleSuggestion[]
  /** amap/baidu：周边实查；*_error/none：区位推断 */
  mapSource?: 'amap' | 'baidu' | 'amap_error' | 'baidu_error' | 'none'
  mapPoiCount?: number
  footTrafficHeat?: CompetitorFootTrafficHeat
}

export type CompetitorTarget =
  | {
      mode: 'store'
      poiId: string
      storeName: string
      address: string
      city?: string
    }
  | {
      mode: 'brand'
      brandKey: string
      brandName: string
      storeCount: number
      stores: Array<{ poiId: string; storeName: string; address: string; city?: string }>
      anchorAddress: string
      anchorCity?: string
      anchorStoreName?: string
    }

/** @deprecated 兼容旧引用 */
export type SelectedStoreRef = {
  poiId: string
  storeName: string
  address: string
  city?: string
}

export function competitorReportKeyForTarget(t: CompetitorTarget): string {
  return t.mode === 'brand' ? `brand:${t.brandKey}` : t.poiId
}

export function competitorDisplayLabel(t: CompetitorTarget): string {
  if (t.mode === 'brand') return `${t.brandName}（${t.storeCount} 家门店）`
  return t.storeName
}

function reportsKey(): string {
  return tenantLocalKey(BASE_KEY)
}

function selectedKey(): string {
  return tenantLocalKey(SELECTED_KEY)
}

function legacySelectedKey(): string {
  return tenantLocalKey(LEGACY_POI_KEY)
}

export function loadCompetitorReports(): CompetitorReport[] {
  try {
    const raw = window.localStorage.getItem(reportsKey())
    if (!raw) return []
    const arr = JSON.parse(raw) as CompetitorReport[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function saveCompetitorReport(report: CompetitorReport): void {
  const list = loadCompetitorReports().filter((r) => r.id !== report.id)
  list.unshift(report)
  try {
    window.localStorage.setItem(reportsKey(), JSON.stringify(list.slice(0, 20)))
  } catch {
    /* ignore */
  }
}

export function latestCompetitorReportForPoi(poiId: string): CompetitorReport | null {
  const id = poiId.trim()
  if (!id) return null
  return loadCompetitorReports().find((r) => r.poiId === id) ?? null
}

export function latestCompetitorReportForTarget(t: CompetitorTarget | null): CompetitorReport | null {
  if (!t) return null
  return latestCompetitorReportForPoi(competitorReportKeyForTarget(t))
}

function parseLegacyStore(raw: string): CompetitorTarget | null {
  try {
    const j = JSON.parse(raw) as SelectedStoreRef
    if (!j?.poiId || !j.address?.trim()) return null
    return {
      mode: 'store',
      poiId: j.poiId,
      storeName: j.storeName,
      address: j.address.trim(),
      city: j.city?.trim(),
    }
  } catch {
    return null
  }
}

export function loadSelectedCompetitorTarget(): CompetitorTarget | null {
  try {
    const raw = window.localStorage.getItem(selectedKey())
    if (raw) {
      const j = JSON.parse(raw) as CompetitorTarget
      if (j?.mode === 'brand' && j.brandKey && j.brandName && j.anchorAddress?.trim()) return j
      if (j?.mode === 'store' && j.poiId && j.address?.trim()) return j
    }
    const legacy = window.localStorage.getItem(legacySelectedKey())
    if (legacy) return parseLegacyStore(legacy)
    return null
  } catch {
    return null
  }
}

export function saveSelectedCompetitorTarget(ref: CompetitorTarget | null): void {
  try {
    if (!ref) {
      window.localStorage.removeItem(selectedKey())
      return
    }
    window.localStorage.setItem(selectedKey(), JSON.stringify(ref))
  } catch {
    /* ignore */
  }
}

/** @deprecated 使用 loadSelectedCompetitorTarget */
export function loadSelectedCompetitorStore(): SelectedStoreRef | null {
  const t = loadSelectedCompetitorTarget()
  if (!t || t.mode !== 'store') return null
  return { poiId: t.poiId, storeName: t.storeName, address: t.address, city: t.city }
}

/** @deprecated 使用 saveSelectedCompetitorTarget */
export function saveSelectedCompetitorStore(ref: SelectedStoreRef | null): void {
  if (!ref?.poiId) {
    saveSelectedCompetitorTarget(null)
    return
  }
  saveSelectedCompetitorTarget({
    mode: 'store',
    poiId: ref.poiId,
    storeName: ref.storeName,
    address: ref.address,
    city: ref.city,
  })
}

export function competitorReportSummary(r: CompetitorReport | null, maxCompetitors = 8): string {
  if (!r) return ''
  const scope =
    r.brandName && r.storeCount && r.storeCount > 1
      ? `品牌：${r.brandName}（${r.storeCount} 店，统筹分析）`
      : `门店：${r.storeName}（${r.address}）`
  const lines = [
    scope,
    r.industryHint ? `行业：${r.industryHint}` : '',
    `摘要：${r.summary}`,
    ...r.competitors.slice(0, maxCompetitors).map((c, i) => {
      const base = `${i + 1}. ${c.name}${c.distanceHint ? ` · ${c.distanceHint}` : ''}${c.priceRange ? ` · ${c.priceRange}` : ''}${c.highlights ? ` — ${c.highlights}` : ''}`
      const hot =
        c.hotProducts?.length
          ? `\n   热销：${c.hotProducts
              .slice(0, 5)
              .map((p) => {
                const price = p.priceYuan != null ? `¥${p.priceYuan}` : ''
                const ch = p.channel ? `[${p.channel}]` : ''
                return `${p.name}${price ? price : ''}${ch}${p.note ? `(${p.note})` : ''}`
              })
              .join('；')}`
          : ''
      return base + hot
    }),
    ...(r.suggestions.length ? [`建议：${r.suggestions.join('；')}`] : []),
    ...(r.bundleSuggestions?.length
      ? [
          '组品建议：',
          ...r.bundleSuggestions.slice(0, 6).map((b, i) => {
            const price =
              b.suggestedPriceYuan != null ? `售价¥${b.suggestedPriceYuan}` : ''
            const origin = b.originYuan != null ? `面值¥${b.originYuan}` : ''
            const combo = b.comboLines?.length ? b.comboLines.join('+') : ''
            return `${i + 1}. ${b.title}${price ? ` ${price}` : ''}${origin ? `/${origin}` : ''}${combo ? `（${combo}）` : ''}${b.rationale ? ` — ${b.rationale}` : ''}`
          }),
        ]
      : []),
  ]
  return lines.filter(Boolean).join('\n')
}
