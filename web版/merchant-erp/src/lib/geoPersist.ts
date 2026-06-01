import type { GeoHealthInputs } from './geoModuleSpec'
import { tenantLocalKey } from './tenantLocalState'

const KEY = 'meoo_geo_score_snapshot_v1'

export type GeoScoreSnapshot = {
  savedAt: string
  scope: 'account' | 'brand' | 'single'
  brandKeyword?: string
  scopeLabel: string
  storeCount: number
  healthScore: number
  inputs: GeoHealthInputs
  scoreSource: 'ai' | 'deterministic'
  scoreRationale?: string
  history?: Array<{ savedAt: string; healthScore: number }>
}

function storageKey(): string {
  return tenantLocalKey(KEY)
}

export function loadGeoScoreSnapshot(): GeoScoreSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) return null
    const j = JSON.parse(raw) as GeoScoreSnapshot
    if (!j?.savedAt || typeof j.healthScore !== 'number') return null
    return j
  } catch {
    return null
  }
}

export function saveGeoScoreSnapshot(next: Omit<GeoScoreSnapshot, 'history'>): void {
  const prev = loadGeoScoreSnapshot()
  const history = [
    ...(prev?.history ?? []),
    ...(prev?.savedAt
      ? [{ savedAt: prev.savedAt, healthScore: prev.healthScore }]
      : []),
  ].slice(-11)
  const payload: GeoScoreSnapshot = { ...next, history }
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}
