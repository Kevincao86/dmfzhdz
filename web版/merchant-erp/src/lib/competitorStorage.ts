/**
 * 竞争对手分析结果（按租户 localStorage）。
 */
import { tenantLocalKey } from './tenantLocalState'

const BASE_KEY = 'meoo_competitor_reports_v1'
const SELECTED_POI_KEY = 'meoo_competitor_selected_poi_v1'

export type CompetitorEntry = {
  name: string
  distanceHint?: string
  category?: string
  priceRange?: string
  highlights?: string
}

export type CompetitorReport = {
  id: string
  poiId: string
  storeName: string
  address: string
  industryHint?: string
  analyzedAt: string
  summary: string
  competitors: CompetitorEntry[]
  suggestions: string[]
}

export type SelectedStoreRef = {
  poiId: string
  storeName: string
  address: string
  city?: string
}

function reportsKey(): string {
  return tenantLocalKey(BASE_KEY)
}

function selectedKey(): string {
  return tenantLocalKey(SELECTED_POI_KEY)
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

export function loadSelectedCompetitorStore(): SelectedStoreRef | null {
  try {
    const raw = window.localStorage.getItem(selectedKey())
    if (!raw) return null
    const j = JSON.parse(raw) as SelectedStoreRef
    return j?.poiId ? j : null
  } catch {
    return null
  }
}

export function saveSelectedCompetitorStore(ref: SelectedStoreRef | null): void {
  try {
    if (!ref?.poiId) window.localStorage.removeItem(selectedKey())
    else window.localStorage.setItem(selectedKey(), JSON.stringify(ref))
  } catch {
    /* ignore */
  }
}

export function competitorReportSummary(r: CompetitorReport | null, maxCompetitors = 8): string {
  if (!r) return ''
  const lines = [
    `门店：${r.storeName}（${r.address}）`,
    r.industryHint ? `行业：${r.industryHint}` : '',
    `摘要：${r.summary}`,
    ...r.competitors.slice(0, maxCompetitors).map(
      (c, i) =>
        `${i + 1}. ${c.name}${c.distanceHint ? ` · ${c.distanceHint}` : ''}${c.priceRange ? ` · ${c.priceRange}` : ''}${c.highlights ? ` — ${c.highlights}` : ''}`,
    ),
    ...(r.suggestions.length ? [`建议：${r.suggestions.join('；')}`] : []),
  ]
  return lines.filter(Boolean).join('\n')
}
