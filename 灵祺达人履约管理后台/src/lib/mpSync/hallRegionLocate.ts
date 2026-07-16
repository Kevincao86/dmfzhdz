/**
 * 星选 Web 大厅：GPS 优先 → IP 兜底；用户手动筛选写入 localStorage。
 */
import { buildMpErpApiUrl, mpErpApiBase } from '../mpApiBase'
import { findProvinceForCity } from './chinaRegion'

const STORAGE_KEY = 'hall_region_filter_v1'

export type HallRegionHit = {
  province: string
  city: string
  source: string
}

export function readStoredHallRegion(): HallRegionHit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { province?: string; city?: string }
    const province = String(o.province || '').trim()
    const city = String(o.city || '').trim()
    if (!province && !city) return null
    if (province === '全部' && (!city || city === '全部')) return null
    return { province: province || '全部', city: city || '全部', source: 'stored' }
  } catch {
    return null
  }
}

export function writeStoredHallRegion(province: string, city: string): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ province, city, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function clearStoredHallRegion(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

async function fetchLocate(lat?: number, lng?: number): Promise<HallRegionHit | null> {
  const qs =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? `?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      : ''
  const base = mpErpApiBase()
  if (!base) return null
  const url = buildMpErpApiUrl(base, `/api/meoo-mp-region-locate${qs}`)
  const res = await fetch(url, { method: 'GET' })
  const data = (await res.json()) as {
    ok?: boolean
    province?: string
    city?: string
    source?: string
  }
  if (!data?.ok) return null
  const province = String(data.province || '').trim()
  const city = String(data.city || '').trim()
  if (!province && !city) return null
  return {
    province: province || findProvinceForCity(city) || '全部',
    city: city || '全部',
    source: String(data.source || 'api'),
  }
}

function getBrowserLatLng(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  })
}

/** GPS → IP；有本地偏好时直接返回偏好 */
export async function resolveHallRegionFilter(): Promise<HallRegionHit | null> {
  const stored = readStoredHallRegion()
  if (stored) return stored

  try {
    const coords = await getBrowserLatLng()
    if (coords) {
      const hit = await fetchLocate(coords.lat, coords.lng)
      if (hit) return hit
    }
  } catch {
    /* fall through */
  }

  try {
    return await fetchLocate()
  } catch {
    return null
  }
}
