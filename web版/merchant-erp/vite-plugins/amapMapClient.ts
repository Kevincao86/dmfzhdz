/**
 * 高德地图 Web 服务（地理编码 + 周边 POI）
 * Key：AMAP_WEB_KEY / AMAP_MAP_KEY / GAODE_MAP_KEY（仅服务端，勿写入前端）
 * 坐标：GCJ-02；接口 location 参数为「经度,纬度」
 */
export type AmapMapEnv = Record<string, string | undefined>

export type AmapLatLng = { lat: number; lng: number }

export type AmapNearbyPoi = {
  name: string
  address: string
  distanceM?: number
  tag?: string
  overallRating?: string
  telephone?: string
  location?: AmapLatLng
}

function resolveAmapWebKey(env: AmapMapEnv): string {
  return (
    env.AMAP_WEB_KEY?.trim() ||
    env.AMAP_MAP_KEY?.trim() ||
    env.GAODE_MAP_KEY?.trim() ||
    env.MERCHANT_AI_AMAP_KEY?.trim() ||
    ''
  )
}

export function isAmapMapConfigured(env: AmapMapEnv): boolean {
  return Boolean(resolveAmapWebKey(env))
}

/** 经营类目 → 高德周边检索关键字（| 分隔多关键字） */
export function amapQueryForIndustry(industryPathOrName: string): string {
  const s = industryPathOrName.trim()
  if (!s) return '休闲娱乐'
  if (/足疗|足浴|足道|按摩|推拿|SPA|汤泉|洗浴|汗蒸|采耳/.test(s)) {
    return '足疗|足浴|按摩|SPA'
  }
  if (/美发|美容|美甲|美睫|丽人|皮肤管理|纹绣/.test(s)) {
    return '美容美发|美甲|皮肤管理'
  }
  if (/数码|家电|3C|手机|电脑/.test(s)) {
    return '数码家电|手机店|电脑店'
  }
  if (/商超|便利|超市|生鲜/.test(s)) {
    return '便利店|超市|生鲜'
  }
  if (/餐饮|火锅|烧烤|小吃|中餐|西餐|快餐/.test(s)) {
    return '餐饮|美食'
  }
  if (/饮品|奶茶|咖啡|茶饮/.test(s)) {
    return '奶茶|咖啡|茶饮'
  }
  if (/休闲|娱乐/.test(s)) {
    return '休闲娱乐'
  }
  const leaf = s.split(/[>/／、]/).map((x) => x.trim()).filter(Boolean).pop()
  return leaf || s.slice(0, 20)
}

const AMAP_FETCH_TIMEOUT_MS = 12_000

function amapFetchSignal(): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(AMAP_FETCH_TIMEOUT_MS)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), AMAP_FETCH_TIMEOUT_MS)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

async function amapGetJson(
  url: string,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  let res: Response
  try {
    res = await fetch(url, { method: 'GET', signal: amapFetchSignal() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, message: `高德地图请求超时（>${AMAP_FETCH_TIMEOUT_MS / 1000}s）` }
    }
    return { ok: false, message: msg }
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, message: `高德地图 HTTP ${res.status}` }
  }
  const status = String(json.status ?? '')
  if (!res.ok || status !== '1') {
    const msg = String(json.info ?? json.message ?? `status=${status}`)
    return { ok: false, message: msg }
  }
  return { ok: true, json }
}

function parseLngLat(raw: unknown): AmapLatLng | null {
  if (typeof raw === 'string') {
    const [lngS, latS] = raw.split(',')
    const lng = Number(lngS)
    const lat = Number(latS)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    return null
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const lat = Number(o.lat)
    const lng = Number(o.lng ?? o.lon)
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

/** 地址 → 高德坐标（GCJ-02） */
export async function amapGeocodeAddress(
  env: AmapMapEnv,
  address: string,
  city?: string,
): Promise<{ ok: true; location: AmapLatLng } | { ok: false; message: string }> {
  const key = resolveAmapWebKey(env)
  if (!key) return { ok: false, message: '未配置 AMAP_WEB_KEY' }
  const addr = address.trim()
  if (!addr) return { ok: false, message: '地址为空' }
  const qs = new URLSearchParams({
    address: addr,
    key,
    output: 'JSON',
  })
  if (city?.trim()) qs.set('city', city.trim())
  const r = await amapGetJson(`https://restapi.amap.com/v3/geocode/geo?${qs.toString()}`)
  if (!r.ok) return r
  const geos = Array.isArray(r.json.geocodes) ? r.json.geocodes : []
  const first = geos[0] as { location?: string } | undefined
  const location = parseLngLat(first?.location)
  if (!location) return { ok: false, message: '地理编码未返回坐标' }
  return { ok: true, location }
}

/** 周边圆形检索 */
export async function amapPlaceNearby(
  env: AmapMapEnv,
  opts: {
    location: AmapLatLng
    query: string
    radiusM?: number
    pageSize?: number
  },
): Promise<{ ok: true; pois: AmapNearbyPoi[]; total?: number } | { ok: false; message: string }> {
  const key = resolveAmapWebKey(env)
  if (!key) return { ok: false, message: '未配置 AMAP_WEB_KEY' }
  const query = opts.query.trim()
  if (!query) return { ok: false, message: '检索关键字为空' }
  const radius = Math.min(Math.max(Math.floor(opts.radiusM ?? 3000), 500), 50000)
  const pageSize = Math.min(Math.max(Math.floor(opts.pageSize ?? 15), 1), 25)
  const qs = new URLSearchParams({
    key,
    location: `${opts.location.lng},${opts.location.lat}`,
    keywords: query,
    radius: String(radius),
    sortrule: 'distance',
    offset: String(pageSize),
    page: '1',
    extensions: 'all',
    output: 'JSON',
  })
  const r = await amapGetJson(`https://restapi.amap.com/v3/place/around?${qs.toString()}`)
  if (!r.ok) return r
  const results = Array.isArray(r.json.pois) ? r.json.pois : []
  const pois: AmapNearbyPoi[] = []
  for (const row of results) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    const distanceM = Number(o.distance)
    const loc = parseLngLat(o.location)
    const biz = o.biz_ext && typeof o.biz_ext === 'object' ? (o.biz_ext as Record<string, unknown>) : {}
    const rating = String(biz.rating ?? o.rating ?? '').trim()
    const typeTag = String(o.type ?? o.typecode ?? '').trim()
    pois.push({
      name,
      address: String(o.address ?? o.pname ?? '').trim(),
      ...(Number.isFinite(distanceM) ? { distanceM } : {}),
      ...(typeTag ? { tag: typeTag.split(';').filter(Boolean).slice(0, 2).join('/') } : {}),
      ...(rating && rating !== '[]' ? { overallRating: rating } : {}),
      ...(String(o.tel ?? '').trim() && String(o.tel) !== '[]'
        ? { telephone: String(o.tel).trim() }
        : {}),
      ...(loc ? { location: loc } : {}),
    })
  }
  const total = Number(r.json.count)
  return {
    ok: true,
    pois,
    ...(Number.isFinite(total) ? { total } : {}),
  }
}

/** 门店地址 → 周边同业 POI 摘要（供竞品分析注入 LLM） */
export async function amapFetchNearbyCompetitorsForStore(
  env: AmapMapEnv,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | {
      ok: true
      location: AmapLatLng
      query: string
      radiusM: number
      pois: AmapNearbyPoi[]
      linesForPrompt: string
    }
  | { ok: false; message: string }
> {
  if (!isAmapMapConfigured(env)) {
    return { ok: false, message: '未配置 AMAP_WEB_KEY' }
  }
  const geo = await amapGeocodeAddress(env, opts.address, opts.city)
  if (!geo.ok) return geo
  const query = amapQueryForIndustry(opts.industryPathOrName ?? '')
  const radiusM = opts.radiusM ?? 3000
  const nearby = await amapPlaceNearby(env, {
    location: geo.location,
    query,
    radiusM,
    pageSize: 15,
  })
  if (!nearby.ok) return nearby
  const lines = nearby.pois.map((p, i) => {
    const dist =
      p.distanceM != null
        ? p.distanceM >= 1000
          ? `约 ${(p.distanceM / 1000).toFixed(1)} 公里`
          : `约 ${Math.round(p.distanceM)} 米`
        : '距离未知'
    const bits = [
      `${i + 1}. ${p.name}`,
      dist,
      p.tag ? `标签:${p.tag}` : '',
      p.overallRating ? `评分:${p.overallRating}` : '',
      p.address ? `地址:${p.address}` : '',
    ].filter(Boolean)
    return bits.join(' · ')
  })
  const linesForPrompt =
    lines.length > 0
      ? [
          `【高德地图周边实查 · 半径 ${Math.round(radiusM / 1000)}km · 关键字「${query}」】`,
          `中心坐标：${geo.location.lat.toFixed(6)},${geo.location.lng.toFixed(6)}（GCJ-02）`,
          ...lines,
          '请优先基于以上真实门店名单做竞品分析；可补充定价带与组品建议，但不得编造不在列表中的店名（除非明确标注为「补充推断」）。',
        ].join('\n')
      : [
          `【高德地图周边实查】半径 ${Math.round(radiusM / 1000)}km、关键字「${query}」未召回 POI。`,
          '请在 summary 中说明实查为空，再基于区位常识做谨慎推断，并标注非实时抓取。',
        ].join('\n')
  return {
    ok: true,
    location: geo.location,
    query,
    radiusM,
    pois: nearby.pois,
    linesForPrompt,
  }
}

export type AmapAmenityBucket =
  | 'transit'
  | 'office'
  | 'residential'
  | 'mall'
  | 'school'
  | 'competitor'

const AMENITY_QUERIES: Record<Exclude<AmapAmenityBucket, 'competitor'>, string> = {
  transit: '地铁站|公交站',
  office: '写字楼|办公楼',
  residential: '住宅区|小区',
  mall: '购物中心|商场|百货',
  school: '学校|大学|中学',
}

/** 坐标近似平移（米 → 经纬度） */
export function amapOffsetLatLng(
  location: AmapLatLng,
  metersNorth: number,
  metersEast: number,
): AmapLatLng {
  const dLat = metersNorth / 111_320
  const cos = Math.cos((location.lat * Math.PI) / 180)
  const dLng = metersEast / (111_320 * Math.max(cos, 0.2))
  return { lat: location.lat + dLat, lng: location.lng + dLng }
}

/** 逆地理：坐标 → 结构化地址 */
export async function amapReverseGeocode(
  env: AmapMapEnv,
  location: AmapLatLng,
): Promise<
  | { ok: true; address: string; city?: string; district?: string; street?: string }
  | { ok: false; message: string }
> {
  const key = resolveAmapWebKey(env)
  if (!key) return { ok: false, message: '未配置 AMAP_WEB_KEY' }
  const qs = new URLSearchParams({
    key,
    location: `${location.lng},${location.lat}`,
    extensions: 'base',
    output: 'JSON',
  })
  const r = await amapGetJson(`https://restapi.amap.com/v3/geocode/regeo?${qs.toString()}`)
  if (!r.ok) return r
  const regeo = r.json.regeocode as
    | {
        formatted_address?: string
        addressComponent?: {
          city?: string | string[]
          district?: string
          township?: string
          streetNumber?: { street?: string }
        }
      }
    | undefined
  const address = String(regeo?.formatted_address ?? '').trim()
  if (!address) return { ok: false, message: '逆地理未返回地址' }
  const cityRaw = regeo?.addressComponent?.city
  const city =
    (Array.isArray(cityRaw) ? String(cityRaw[0] ?? '') : String(cityRaw ?? '')).trim() || undefined
  const district = String(regeo?.addressComponent?.district ?? '').trim() || undefined
  const street =
    String(
      regeo?.addressComponent?.streetNumber?.street ?? regeo?.addressComponent?.township ?? '',
    ).trim() || undefined
  return { ok: true, address, city, district, street }
}

/** 选址：并行检索竞品 + 交通/写字楼/住宅/商场/学校 */
export async function amapFetchSiteAmenityContext(
  env: AmapMapEnv,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | {
      ok: true
      location: AmapLatLng
      radiusM: number
      competitorQuery: string
      competitorPois: AmapNearbyPoi[]
      buckets: Record<Exclude<AmapAmenityBucket, 'competitor'>, AmapNearbyPoi[]>
      counts: {
        transit: number
        office: number
        residential: number
        mall: number
        school: number
        competitor: number
      }
    }
  | { ok: false; message: string }
> {
  if (!isAmapMapConfigured(env)) {
    return { ok: false, message: '未配置 AMAP_WEB_KEY' }
  }
  const geo = await amapGeocodeAddress(env, opts.address, opts.city)
  if (!geo.ok) return geo
  const radiusM = opts.radiusM ?? 1500
  const competitorQuery = amapQueryForIndustry(opts.industryPathOrName ?? '')
  const keys = Object.keys(AMENITY_QUERIES) as Array<keyof typeof AMENITY_QUERIES>
  const [comp, ...rest] = await Promise.all([
    amapPlaceNearby(env, {
      location: geo.location,
      query: competitorQuery,
      radiusM,
      pageSize: 20,
    }),
    ...keys.map((k) =>
      amapPlaceNearby(env, {
        location: geo.location,
        query: AMENITY_QUERIES[k],
        radiusM,
        pageSize: 15,
      }),
    ),
  ])
  if (!comp.ok) return comp
  const buckets = {} as Record<Exclude<AmapAmenityBucket, 'competitor'>, AmapNearbyPoi[]>
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!
    const hit = rest[i]
    buckets[k] = hit && hit.ok ? hit.pois : []
  }
  return {
    ok: true,
    location: geo.location,
    radiusM,
    competitorQuery,
    competitorPois: comp.pois,
    buckets,
    counts: {
      competitor: comp.pois.length,
      transit: buckets.transit.length,
      office: buckets.office.length,
      residential: buckets.residential.length,
      mall: buckets.mall.length,
      school: buckets.school.length,
    },
  }
}
