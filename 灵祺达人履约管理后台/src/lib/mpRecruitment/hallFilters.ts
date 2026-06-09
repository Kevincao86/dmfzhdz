export const PLATFORM_FILTERS = ['全部', '抖音', '小红书', '大众点评', '快手', '微信视频号'] as const

export const CATEGORY_FILTERS = [
  '全部',
  '餐饮美食',
  '本地生活',
  '酒旅',
  '母婴',
  '美妆时尚',
  '家居家装',
  '数码科技',
  '汽车',
  '教育',
  '其他',
] as const

export const HALL_TYPE_FILTERS = ['全部', '招募大厅', '急单大厅', '云剪任务'] as const

export const PRICE_BUCKETS = [
  { id: 'p0_49', label: '0-49', min: 0, max: 49 },
  { id: 'p50_99', label: '50-99', min: 50, max: 99 },
  { id: 'p100_149', label: '100-149', min: 100, max: 149 },
  { id: 'p150_199', label: '150-199', min: 150, max: 199 },
  { id: 'p200_499', label: '200-499', min: 200, max: 499 },
  { id: 'p500_799', label: '500-799', min: 500, max: 799 },
  { id: 'p800_up', label: '800以上', min: 800, max: Infinity },
] as const

const HOT_CITIES = [
  '北京市', '上海市', '广州市', '深圳市', '杭州市', '成都市', '重庆市', '武汉市',
  '西安市', '南京市', '苏州市', '宁波市', '天津市', '青岛市', '长沙市', '郑州市',
]

export function normalizeHallPlatform(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!s) return '抖音'
  if (s.includes('红')) return '小红书'
  if (s.includes('点评') || s.includes('大众')) return '大众点评'
  if (s.includes('快手')) return '快手'
  if (s.includes('视频号')) return '微信视频号'
  if (s.includes('抖')) return '抖音'
  for (const p of PLATFORM_FILTERS) {
    if (p !== '全部' && (s === p || s.includes(p))) return p
  }
  return s
}

export function matchPlatform(rowPlatform: string, filterPlatform: string): boolean {
  if (!filterPlatform || filterPlatform === '全部') return true
  return normalizeHallPlatform(rowPlatform) === normalizeHallPlatform(filterPlatform)
}

export function matchCategory(rowCategory: string, filterCategory: string): boolean {
  if (!filterCategory || filterCategory === '全部') return true
  const c = String(rowCategory || '').trim() || '其他'
  if (filterCategory === '其他') return !CATEGORY_FILTERS.slice(1, -1).some((cat) => c.includes(cat))
  return c.includes(filterCategory) || filterCategory.includes(c)
}

export function matchHallType(hallLabel: string, filterHall: string): boolean {
  if (!filterHall || filterHall === '全部') return true
  return String(hallLabel || '').trim() === filterHall
}

export function matchCity(region: string, storeName: string, cityFilter: string): boolean {
  if (!cityFilter || cityFilter === '全部') return true
  const blob = [region, storeName].filter(Boolean).join(' ')
  if (!blob || blob === '—') return false
  const cf = cityFilter.trim()
  if (blob.includes(cf)) return true
  const short = cf.replace(/市$/, '')
  if (short.length >= 2 && blob.includes(short)) return true
  if (cf.endsWith('市') && blob.includes(cf.slice(0, -1))) return true
  return false
}

/** 省 + 市筛选（与发布招募 RegionSelect 一致） */
export function matchRegionFilter(region: string, storeName: string, province: string, city: string): boolean {
  const prov = String(province || '').trim()
  const c = String(city || '').trim()
  const provAll = !prov || prov === '全部' || prov === '全部省份'
  const cityAll = !c || c === '全部' || c === '全部城市'
  if (provAll && cityAll) return true
  const blob = [region, storeName].filter(Boolean).join(' ')
  if (!blob || blob === '—') return false
  if (!provAll) {
    const pShort = prov.replace(/省$|市$|自治区$|壮族$|回族$|维吾尔$/, '').trim()
    if (pShort.length >= 2 && !blob.includes(pShort) && !blob.includes(prov)) return false
  }
  if (!cityAll) return matchCity(region, storeName, c)
  return true
}

export function matchPriceBuckets(amount: number, selectedIds: string[]): boolean {
  if (!selectedIds.length) return true
  const n = Number(amount) || 0
  if (n <= 0) return false
  return selectedIds.some((id) => {
    const b = PRICE_BUCKETS.find((x) => x.id === id)
    if (!b) return false
    if (b.max === Infinity) return n >= b.min
    return n >= b.min && n <= b.max
  })
}

export function priceFilterLabel(selectedIds: string[], emptyLabel = '价格筛选'): string {
  if (!selectedIds.length) return emptyLabel
  if (selectedIds.length === 1) {
    const b = PRICE_BUCKETS.find((x) => x.id === selectedIds[0])
    return b ? b.label : '已选 1 项'
  }
  return `价格·${selectedIds.length}项`
}

export function priceBucketsForView(selectedIds: string[]) {
  const set = new Set(selectedIds)
  return PRICE_BUCKETS.map((b) => ({ ...b, selected: set.has(b.id) }))
}

export function togglePriceId(selectedIds: string[], id: string): string[] {
  const set = new Set(selectedIds)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return [...set]
}

export function buildCityFilterOptions(rows: { region?: string; storeName?: string }[], max = 56): string[] {
  const fromRows = new Set<string>()
  for (const r of rows) {
    const region = String(r.region || '').trim()
    if (region && region !== '—' && region !== '全国') {
      fromRows.add(region)
      region.split(/[·/\s,，]+/).forEach((part) => {
        const p = part.trim()
        if (p.length >= 2) fromRows.add(/市$/.test(p) ? p : `${p}市`)
      })
    }
    const sn = String(r.storeName || '').trim()
    const m = sn.match(/([\u4e00-\u9fa5]{2,10}市)/)
    if (m) fromRows.add(m[1])
  }
  const list = ['全部']
  for (const c of HOT_CITIES) {
    if (list.length >= max) break
    if (!list.includes(c)) list.push(c)
  }
  for (const c of [...fromRows].filter((x) => x && !list.includes(x)).sort()) {
    if (list.length >= max) break
    list.push(c)
  }
  return list
}
