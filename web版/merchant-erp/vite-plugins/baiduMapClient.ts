/**
 * 百度地图 Web 服务（地理编码 + 周边 POI）
 * Key：BAIDU_MAP_AK / MERCHANT_AI_BAIDU_MAP_AK（仅服务端环境变量，勿写入前端）
 */
export type BaiduMapEnv = Record<string, string | undefined>

export type BaiduLatLng = { lat: number; lng: number }

export type BaiduNearbyPoi = {
  name: string
  address: string
  distanceM?: number
  tag?: string
  overallRating?: string
  telephone?: string
  location?: BaiduLatLng
}

function resolveBaiduMapAk(env: BaiduMapEnv): string {
  return (
    env.BAIDU_MAP_AK?.trim() ||
    env.MERCHANT_AI_BAIDU_MAP_AK?.trim() ||
    env.BAIDU_AK?.trim() ||
    ''
  )
}

export function isBaiduMapConfigured(env: BaiduMapEnv): boolean {
  return Boolean(resolveBaiduMapAk(env))
}

/** 经营类目 → 百度周边检索关键字（可多关键字 $ 分隔） */
export function baiduQueryForIndustry(industryPathOrName: string): string {
  const s = industryPathOrName.trim()
  if (!s) return '休闲娱乐'
  if (/足疗|足浴|足道|按摩|推拿|SPA|汤泉|洗浴|汗蒸|采耳/.test(s)) {
    return '足疗$足浴$按摩$SPA'
  }
  if (/美发|美容|美甲|美睫|丽人|皮肤管理|纹绣/.test(s)) {
    return '美容美发$美甲$皮肤管理'
  }
  if (/数码|家电|3C|手机|电脑/.test(s)) {
    return '数码家电$手机店$电脑店'
  }
  if (/商超|便利|超市|生鲜/.test(s)) {
    return '便利店$超市$生鲜'
  }
  if (/餐饮|火锅|烧烤|小吃|中餐|西餐|快餐/.test(s)) {
    return '餐饮$美食'
  }
  if (/饮品|奶茶|咖啡|茶饮/.test(s)) {
    return '奶茶$咖啡$茶饮'
  }
  if (/休闲|娱乐/.test(s)) {
    return '休闲娱乐'
  }
  // 取路径末段作检索词
  const leaf = s.split(/[>/／、]/).map((x) => x.trim()).filter(Boolean).pop()
  return leaf || s.slice(0, 20)
}

async function baiduGetJson(
  url: string,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  let res: Response
  try {
    res = await fetch(url, { method: 'GET' })
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, message: `百度地图 HTTP ${res.status}` }
  }
  const status = Number(json.status)
  if (!res.ok || status !== 0) {
    const msg = String(json.message ?? json.msg ?? `status=${status}`)
    return { ok: false, message: msg }
  }
  return { ok: true, json }
}

/** 地址 → 百度坐标（bd09ll） */
export async function baiduGeocodeAddress(
  env: BaiduMapEnv,
  address: string,
  city?: string,
): Promise<{ ok: true; location: BaiduLatLng; precise?: number } | { ok: false; message: string }> {
  const ak = resolveBaiduMapAk(env)
  if (!ak) return { ok: false, message: '未配置 BAIDU_MAP_AK' }
  const addr = address.trim()
  if (!addr) return { ok: false, message: '地址为空' }
  const qs = new URLSearchParams({
    address: addr,
    output: 'json',
    ak,
  })
  if (city?.trim()) qs.set('city', city.trim())
  const r = await baiduGetJson(`https://api.map.baidu.com/geocoding/v3/?${qs.toString()}`)
  if (!r.ok) return r
  const result = r.json.result as { location?: { lat?: number; lng?: number }; precise?: number } | undefined
  const lat = Number(result?.location?.lat)
  const lng = Number(result?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, message: '地理编码未返回坐标' }
  }
  return {
    ok: true,
    location: { lat, lng },
    ...(typeof result?.precise === 'number' ? { precise: result.precise } : {}),
  }
}

/** 周边圆形检索 */
export async function baiduPlaceNearby(
  env: BaiduMapEnv,
  opts: {
    location: BaiduLatLng
    query: string
    radiusM?: number
    pageSize?: number
  },
): Promise<{ ok: true; pois: BaiduNearbyPoi[]; total?: number } | { ok: false; message: string }> {
  const ak = resolveBaiduMapAk(env)
  if (!ak) return { ok: false, message: '未配置 BAIDU_MAP_AK' }
  const query = opts.query.trim()
  if (!query) return { ok: false, message: '检索关键字为空' }
  const radius = Math.min(Math.max(Math.floor(opts.radiusM ?? 3000), 500), 50000)
  const pageSize = Math.min(Math.max(Math.floor(opts.pageSize ?? 15), 1), 20)
  const qs = new URLSearchParams({
    query,
    location: `${opts.location.lat},${opts.location.lng}`,
    radius: String(radius),
    radius_limit: 'true',
    output: 'json',
    scope: '2',
    page_size: String(pageSize),
    page_num: '0',
    /** 传入坐标按百度经纬度理解（地理编码 v3 默认 bd09ll） */
    coord_type: '3',
    ak,
  })
  const r = await baiduGetJson(`https://api.map.baidu.com/place/v2/search?${qs.toString()}`)
  if (!r.ok) return r
  const results = Array.isArray(r.json.results) ? r.json.results : []
  const pois: BaiduNearbyPoi[] = []
  for (const row of results) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    const detail = (o.detail_info && typeof o.detail_info === 'object'
      ? (o.detail_info as Record<string, unknown>)
      : {}) as Record<string, unknown>
    const distanceRaw = detail.distance ?? o.distance
    const distanceM = Number(distanceRaw)
    const loc = o.location && typeof o.location === 'object' ? (o.location as Record<string, unknown>) : null
    const lat = Number(loc?.lat)
    const lng = Number(loc?.lng)
    pois.push({
      name,
      address: String(o.address ?? '').trim(),
      ...(Number.isFinite(distanceM) ? { distanceM } : {}),
      ...(String(o.tag ?? detail.tag ?? '').trim()
        ? { tag: String(o.tag ?? detail.tag).trim() }
        : {}),
      ...(String(detail.overall_rating ?? '').trim()
        ? { overallRating: String(detail.overall_rating).trim() }
        : {}),
      ...(String(o.telephone ?? detail.telephone ?? '').trim()
        ? { telephone: String(o.telephone ?? detail.telephone).trim() }
        : {}),
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { location: { lat, lng } } : {}),
    })
  }
  const total = Number(r.json.total)
  return {
    ok: true,
    pois,
    ...(Number.isFinite(total) ? { total } : {}),
  }
}

/** 门店地址 → 周边同业 POI 摘要（供竞品分析注入 LLM） */
export async function baiduFetchNearbyCompetitorsForStore(
  env: BaiduMapEnv,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | {
      ok: true
      location: BaiduLatLng
      query: string
      radiusM: number
      pois: BaiduNearbyPoi[]
      linesForPrompt: string
    }
  | { ok: false; message: string }
> {
  if (!isBaiduMapConfigured(env)) {
    return { ok: false, message: '未配置 BAIDU_MAP_AK' }
  }
  const geo = await baiduGeocodeAddress(env, opts.address, opts.city)
  if (!geo.ok) return geo
  const query = baiduQueryForIndustry(opts.industryPathOrName ?? '')
  const radiusM = opts.radiusM ?? 3000
  const nearby = await baiduPlaceNearby(env, {
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
          `【百度地图周边实查 · 半径 ${Math.round(radiusM / 1000)}km · 关键字「${query}」】`,
          `中心坐标：${geo.location.lat.toFixed(6)},${geo.location.lng.toFixed(6)}（bd09ll）`,
          ...lines,
          '请优先基于以上真实门店名单做竞品分析；可补充定价带与组品建议，但不得编造不在列表中的店名（除非明确标注为「补充推断」）。',
        ].join('\n')
      : [
          `【百度地图周边实查】半径 ${Math.round(radiusM / 1000)}km、关键字「${query}」未召回 POI。`,
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

export type BaiduAmenityBucket =
  | 'transit'
  | 'office'
  | 'residential'
  | 'mall'
  | 'school'
  | 'competitor'

const AMENITY_QUERIES: Record<Exclude<BaiduAmenityBucket, 'competitor'>, string> = {
  transit: '地铁站$公交站',
  office: '写字楼$办公楼',
  residential: '住宅区$小区',
  mall: '购物中心$商场$百货',
  school: '学校$大学$中学',
}

/** 选址：并行检索竞品 + 交通/写字楼/住宅/商场/学校 */
export async function baiduFetchSiteAmenityContext(
  env: BaiduMapEnv,
  opts: {
    address: string
    city?: string
    industryPathOrName?: string
    radiusM?: number
  },
): Promise<
  | {
      ok: true
      location: BaiduLatLng
      radiusM: number
      competitorQuery: string
      competitorPois: BaiduNearbyPoi[]
      buckets: Record<Exclude<BaiduAmenityBucket, 'competitor'>, BaiduNearbyPoi[]>
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
  if (!isBaiduMapConfigured(env)) {
    return { ok: false, message: '未配置 BAIDU_MAP_AK' }
  }
  const geo = await baiduGeocodeAddress(env, opts.address, opts.city)
  if (!geo.ok) return geo
  const radiusM = opts.radiusM ?? 1500
  const competitorQuery = baiduQueryForIndustry(opts.industryPathOrName ?? '')
  const keys = Object.keys(AMENITY_QUERIES) as Array<keyof typeof AMENITY_QUERIES>
  const [comp, ...rest] = await Promise.all([
    baiduPlaceNearby(env, {
      location: geo.location,
      query: competitorQuery,
      radiusM,
      pageSize: 20,
    }),
    ...keys.map((k) =>
      baiduPlaceNearby(env, {
        location: geo.location,
        query: AMENITY_QUERIES[k],
        radiusM,
        pageSize: 15,
      }),
    ),
  ])
  if (!comp.ok) return comp
  const buckets = {} as Record<Exclude<BaiduAmenityBucket, 'competitor'>, BaiduNearbyPoi[]>
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
