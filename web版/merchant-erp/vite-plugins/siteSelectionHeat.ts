/**
 * 近 7 日人流热度指数（区位代理模型）
 * 说明：百度慧眼信令客流需独立商业开通；当前用周边 POI + 业态时段曲线生成可复现指数，供 MVP 决策参考。
 */
import type { BaiduLatLng, BaiduNearbyPoi } from './baiduMapClient.js'

export type FootTrafficSlot = {
  key: 'morning' | 'noon' | 'evening' | 'night'
  label: string
  index: number
}

export type FootTrafficDaySummary = {
  date: string
  weekday: string
  avgIndex: number
  peakSlot: string
  peakIndex: number
  slots: FootTrafficSlot[]
}

export type FootTrafficHeatReport = {
  source: 'estimated_proxy'
  disclaimer: string
  radiusM: number
  location: BaiduLatLng
  days: FootTrafficDaySummary[]
  insight: string
  drivers: string[]
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** 业态 → 四个时段权重（相对） */
export function industrySlotWeights(industryPathOrName: string): Record<FootTrafficSlot['key'], number> {
  const s = industryPathOrName
  if (/足疗|足浴|按摩|SPA|推拿|洗浴|汗蒸|采耳/.test(s)) {
    return { morning: 0.35, noon: 0.55, evening: 1.15, night: 1.05 }
  }
  if (/美发|美容|美甲|丽人|皮肤管理/.test(s)) {
    return { morning: 0.45, noon: 0.7, evening: 1.1, night: 0.55 }
  }
  if (/餐饮|火锅|烧烤|小吃|中餐|西餐|快餐/.test(s)) {
    return { morning: 0.4, noon: 1.15, evening: 1.2, night: 0.7 }
  }
  if (/饮品|奶茶|咖啡|茶饮/.test(s)) {
    return { morning: 0.75, noon: 1.05, evening: 1.1, night: 0.45 }
  }
  if (/商超|便利|超市|生鲜/.test(s)) {
    return { morning: 1.05, noon: 0.85, evening: 1.15, night: 0.65 }
  }
  if (/数码|家电|3C|手机|电脑/.test(s)) {
    return { morning: 0.55, noon: 0.95, evening: 1.1, night: 0.4 }
  }
  return { morning: 0.6, noon: 0.95, evening: 1.05, night: 0.55 }
}

function avgRating(pois: BaiduNearbyPoi[]): number {
  const nums = pois
    .map((p) => Number(p.overallRating))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!nums.length) return 3.6
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 基于坐标 + 周边 POI + 业态，生成最近 7 天（含今天）四时段热度指数。
 */
export function buildFootTrafficHeat7d(opts: {
  location: BaiduLatLng
  industryPathOrName?: string
  competitorPois?: BaiduNearbyPoi[]
  amenityCounts?: {
    transit: number
    office: number
    residential: number
    mall: number
    school: number
  }
  radiusM?: number
  now?: Date
}): FootTrafficHeatReport {
  const now = opts.now ?? new Date()
  const radiusM = opts.radiusM ?? 1500
  const industry = String(opts.industryPathOrName ?? '').trim()
  const weights = industrySlotWeights(industry)
  const pois = opts.competitorPois ?? []
  const amenity = opts.amenityCounts ?? {
    transit: 0,
    office: 0,
    residential: 0,
    mall: 0,
    school: 0,
  }

  const densityBoost = clamp(pois.length / 12, 0, 1.2)
  const ratingBoost = clamp((avgRating(pois) - 3.2) / 1.6, -0.15, 0.35)
  const amenityBoost =
    clamp(amenity.transit / 6, 0, 0.35) +
    clamp(amenity.mall / 4, 0, 0.25) +
    clamp(amenity.office / 8, 0, 0.2) +
    clamp(amenity.residential / 10, 0, 0.2) +
    clamp(amenity.school / 4, 0, 0.1)

  const base =
    42 +
    densityBoost * 18 +
    ratingBoost * 20 +
    amenityBoost * 28 +
    (industry ? 4 : 0)

  const seed = hashSeed(
    `${opts.location.lat.toFixed(5)},${opts.location.lng.toFixed(5)}|${industry}|${pois.length}`,
  )
  const rnd = mulberry32(seed)

  const slotDefs: Array<{ key: FootTrafficSlot['key']; label: string }> = [
    { key: 'morning', label: '早高峰' },
    { key: 'noon', label: '午间' },
    { key: 'evening', label: '晚高峰' },
    { key: 'night', label: '夜间' },
  ]

  const days: FootTrafficDaySummary[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const wd = d.getDay()
    const isWeekend = wd === 0 || wd === 6
    const dayMult = isWeekend
      ? /写字|办公|数码|3C/.test(industry)
        ? 0.78
        : 1.12
      : /足疗|餐饮|饮品|美发|便利/.test(industry)
        ? 1
        : 1.02

    const slots: FootTrafficSlot[] = slotDefs.map((def) => {
      const noise = (rnd() - 0.5) * 10
      const officeDayBoost =
        !isWeekend && amenity.office >= 3 && (def.key === 'noon' || def.key === 'evening')
          ? 6
          : 0
      const weekendNightBoost =
        isWeekend && (def.key === 'evening' || def.key === 'night') && /足疗|餐饮|娱乐/.test(industry)
          ? 7
          : 0
      const index = Math.round(
        clamp(
          (base * weights[def.key] * dayMult + noise + officeDayBoost + weekendNightBoost) *
            (0.92 + rnd() * 0.12),
          8,
          98,
        ),
      )
      return { key: def.key, label: def.label, index }
    })

    const avgIndex = Math.round(slots.reduce((a, s) => a + s.index, 0) / slots.length)
    const peak = slots.reduce((a, s) => (s.index > a.index ? s : a), slots[0]!)
    days.push({
      date: ymdLocal(d),
      weekday: `周${WEEKDAY_CN[wd]}`,
      avgIndex,
      peakSlot: peak.label,
      peakIndex: peak.index,
      slots,
    })
  }

  const bestDay = days.reduce((a, b) => (b.avgIndex > a.avgIndex ? b : a), days[0]!)
  const worstDay = days.reduce((a, b) => (b.avgIndex < a.avgIndex ? b : a), days[0]!)
  const peakSlotOverall = days
    .flatMap((d) => d.slots)
    .reduce((a, b) => (b.index > a.index ? b : a))

  const drivers: string[] = []
  if (pois.length >= 8) drivers.push(`同业 POI 较密（约 ${pois.length} 家/检索半径）`)
  else if (pois.length <= 2) drivers.push('同业 POI 偏少，客流竞争压力相对较低')
  if (amenity.transit >= 3) drivers.push(`公交/地铁可达性较好（约 ${amenity.transit} 个站点）`)
  if (amenity.mall >= 2) drivers.push('周边商场/综合体可贡献连带客流')
  if (amenity.office >= 4) drivers.push('写字楼集聚，工作日午晚高峰更明显')
  if (amenity.residential >= 5) drivers.push('住宅配套较足，社区型到店潜力更高')
  if (!drivers.length) drivers.push('区位信号一般，建议结合实地蹲点与租金测算')

  const insight = [
    `近 7 日综合热度约 ${Math.round(days.reduce((a, d) => a + d.avgIndex, 0) / days.length)}（0–100）。`,
    `相对最旺：${bestDay.date}（${bestDay.weekday}，日均 ${bestDay.avgIndex}）；偏低：${worstDay.date}（${worstDay.weekday}）。`,
    `时段峰值多出现在「${peakSlotOverall.label}」。`,
    '以上为区位代理指数，非手机信令级真实客流；开通百度慧眼后可替换为实测热力。',
  ].join(' ')

  return {
    source: 'estimated_proxy',
    disclaimer:
      '人流热度基于百度周边 POI、业态时段规律与区位配套估算，非百度慧眼信令客流；仅供选址/运营参考。',
    radiusM,
    location: opts.location,
    days,
    insight,
    drivers,
  }
}
