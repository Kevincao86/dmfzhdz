/**
 * 地图服务统一入口：优先高德 Web 服务，失败/未配置时回退百度。
 * 同一请求内不混用两套坐标系（GCJ-02 / bd09ll）。
 */
import {
  amapFetchNearbyCompetitorsForStore,
  amapFetchSiteAmenityContext,
  amapOffsetLatLng,
  amapPlaceNearby,
  amapQueryForIndustry,
  amapReverseGeocode,
  isAmapMapConfigured,
  type AmapLatLng,
  type AmapNearbyPoi,
} from './amapMapClient.js'
import {
  baiduFetchNearbyCompetitorsForStore,
  baiduFetchSiteAmenityContext,
  baiduOffsetLatLng,
  baiduPlaceNearby,
  baiduQueryForIndustry,
  baiduReverseGeocode,
  isBaiduMapConfigured,
  type BaiduLatLng,
  type BaiduNearbyPoi,
} from './baiduMapClient.js'

export type MapProviderId = 'amap' | 'baidu'
export type MapLatLng = AmapLatLng | BaiduLatLng
export type MapNearbyPoi = AmapNearbyPoi | BaiduNearbyPoi
export type MapEnv = Record<string, string | undefined>

export function isMapServiceConfigured(env: MapEnv): boolean {
  return isAmapMapConfigured(env) || isBaiduMapConfigured(env)
}

/** 主：高德；副：百度 */
export function resolvePreferredMapProvider(env: MapEnv): MapProviderId | null {
  if (isAmapMapConfigured(env)) return 'amap'
  if (isBaiduMapConfigured(env)) return 'baidu'
  return null
}

export function mapProviderLabel(provider: MapProviderId): string {
  return provider === 'amap' ? '高德地图' : '百度地图'
}

export function mapQueryForIndustry(industryPathOrName: string, provider: MapProviderId): string {
  return provider === 'amap'
    ? amapQueryForIndustry(industryPathOrName)
    : baiduQueryForIndustry(industryPathOrName)
}

export function mapOffsetLatLng(
  location: MapLatLng,
  metersNorth: number,
  metersEast: number,
): MapLatLng {
  return amapOffsetLatLng(location, metersNorth, metersEast)
}

export async function mapPlaceNearby(
  env: MapEnv,
  provider: MapProviderId,
  opts: {
    location: MapLatLng
    query: string
    radiusM?: number
    pageSize?: number
  },
): Promise<{ ok: true; pois: MapNearbyPoi[]; total?: number } | { ok: false; message: string }> {
  if (provider === 'amap') {
    return amapPlaceNearby(env, opts)
  }
  return baiduPlaceNearby(env, opts)
}

export async function mapReverseGeocode(
  env: MapEnv,
  provider: MapProviderId,
  location: MapLatLng,
): Promise<
  | { ok: true; address: string; city?: string; district?: string; street?: string }
  | { ok: false; message: string }
> {
  if (provider === 'amap') return amapReverseGeocode(env, location)
  return baiduReverseGeocode(env, location)
}

export async function mapFetchNearbyCompetitorsForStore(
  env: MapEnv,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | {
      ok: true
      provider: MapProviderId
      location: MapLatLng
      query: string
      radiusM: number
      pois: MapNearbyPoi[]
      linesForPrompt: string
    }
  | { ok: false; message: string; tried?: MapProviderId[] }
> {
  const tried: MapProviderId[] = []
  if (isAmapMapConfigured(env)) {
    tried.push('amap')
    const hit = await amapFetchNearbyCompetitorsForStore(env, opts)
    if (hit.ok) return { ...hit, provider: 'amap' }
    if (!isBaiduMapConfigured(env)) {
      return { ok: false, message: hit.message, tried }
    }
  }
  if (isBaiduMapConfigured(env)) {
    tried.push('baidu')
    const hit = await baiduFetchNearbyCompetitorsForStore(env, opts)
    if (hit.ok) return { ...hit, provider: 'baidu' }
    return { ok: false, message: hit.message, tried }
  }
  return { ok: false, message: '未配置 AMAP_WEB_KEY 或 BAIDU_MAP_AK', tried }
}

export async function mapFetchSiteAmenityContext(
  env: MapEnv,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | {
      ok: true
      provider: MapProviderId
      location: MapLatLng
      radiusM: number
      competitorQuery: string
      competitorPois: MapNearbyPoi[]
      buckets: Record<
        'transit' | 'office' | 'residential' | 'mall' | 'school',
        MapNearbyPoi[]
      >
      counts: {
        transit: number
        office: number
        residential: number
        mall: number
        school: number
        competitor: number
      }
    }
  | { ok: false; message: string; tried?: MapProviderId[] }
> {
  const tried: MapProviderId[] = []
  if (isAmapMapConfigured(env)) {
    tried.push('amap')
    const hit = await amapFetchSiteAmenityContext(env, opts)
    if (hit.ok) return { ...hit, provider: 'amap' }
    if (!isBaiduMapConfigured(env)) {
      return { ok: false, message: hit.message, tried }
    }
  }
  if (isBaiduMapConfigured(env)) {
    tried.push('baidu')
    const hit = await baiduFetchSiteAmenityContext(env, opts)
    if (hit.ok) return { ...hit, provider: 'baidu' }
    return { ok: false, message: hit.message, tried }
  }
  return { ok: false, message: '未配置 AMAP_WEB_KEY 或 BAIDU_MAP_AK', tried }
}

/** 兼容旧命名：偏移公式与百度实现相同 */
export { baiduOffsetLatLng }
