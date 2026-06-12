/** 与发招募页一致（勿 require publishFormOptions，避免小程序分包/循环加载） */
const PLATFORM_LIST = ['抖音', '小红书', '大众点评', '快手', '微信视频号']
const PLATFORM_FILTERS = ['全部', ...PLATFORM_LIST]

/** id 勿含 + / -，避免 WXML 表达式误解析 */
const PRICE_BUCKETS = [
  { id: 'p0_49', label: '0-49', min: 0, max: 49 },
  { id: 'p50_99', label: '50-99', min: 50, max: 99 },
  { id: 'p100_149', label: '100-149', min: 100, max: 149 },
  { id: 'p150_199', label: '150-199', min: 150, max: 199 },
  { id: 'p200_499', label: '200-499', min: 200, max: 499 },
  { id: 'p500_799', label: '500-799', min: 500, max: 799 },
  { id: 'p800_up', label: '800以上', min: 800, max: Infinity },
]

const HOT_CITIES = [
  '北京市',
  '上海市',
  '广州市',
  '深圳市',
  '杭州市',
  '成都市',
  '重庆市',
  '武汉市',
  '西安市',
  '南京市',
  '苏州市',
  '宁波市',
  '天津市',
  '青岛市',
  '长沙市',
  '郑州市',
  '合肥市',
  '福州市',
  '厦门市',
  '昆明市',
  '大连市',
  '沈阳市',
  '哈尔滨市',
  '济南市',
  '无锡市',
  '佛山市',
  '东莞市',
  '南宁市',
  '贵阳市',
  '石家庄市',
]

const PLATFORM_ICONS = {
  抖音: '/images/platforms/douyin.png',
  小红书: '/images/platforms/xiaohongshu.png',
  大众点评: '/images/platforms/dianping.png',
  快手: '/images/platforms/kuaishou-local.png',
  微信视频号: '/images/platforms/wechat.png',
  美团: '/images/platforms/meituan-waimai.png',
}

function normalizeHallPlatform(raw) {
  const s = String(raw || '').trim()
  if (!s) return '抖音'
  if (s.includes('红') || s.includes('小红书')) return '小红书'
  if (s.includes('点评') || s.includes('大众')) return '大众点评'
  if (s.includes('快手')) return '快手'
  if (s.includes('视频号')) return '微信视频号'
  if (s.includes('美团')) return '美团'
  if (s.includes('抖')) return '抖音'
  for (const p of PLATFORM_LIST) {
    if (s === p || s.includes(p)) return p
  }
  return s
}

function platformIcon(platform) {
  const p = normalizeHallPlatform(platform)
  return PLATFORM_ICONS[p] || PLATFORM_ICONS['抖音']
}

function matchPlatform(rowPlatform, filterPlatform) {
  if (!filterPlatform || filterPlatform === '全部') return true
  return normalizeHallPlatform(rowPlatform) === normalizeHallPlatform(filterPlatform)
}

/** 城市：支持「宁波市」、region 含城市名、门店名含城市 */
function matchCity(region, storeName, cityFilter) {
  if (!cityFilter || cityFilter === '全部') return true
  const blob = [region, storeName].filter(Boolean).join(' ')
  if (!blob || blob === '—') return false
  const cf = String(cityFilter).trim()
  if (blob.includes(cf)) return true
  const short = cf.replace(/市$/, '')
  if (short.length >= 2 && blob.includes(short)) return true
  if (cf.endsWith('市') && blob.includes(cf.slice(0, -1))) return true
  return false
}

function matchPriceBuckets(amount, selectedIds) {
  const ids = Array.isArray(selectedIds) ? selectedIds : []
  if (!ids.length) return true
  const n = Number(amount) || 0
  if (n <= 0) return false
  return ids.some((id) => {
    const b = PRICE_BUCKETS.find((x) => x.id === id)
    if (!b) return false
    if (b.max === Infinity) return n >= b.min
    return n >= b.min && n <= b.max
  })
}

function priceFilterLabel(selectedIds, emptyLabel) {
  const ids = Array.isArray(selectedIds) ? selectedIds : []
  const empty = emptyLabel || '价格筛选'
  if (!ids.length) return empty
  if (ids.length === 1) {
    const b = PRICE_BUCKETS.find((x) => x.id === ids[0])
    return b ? b.label : '已选 1 项'
  }
  return `价格·${ids.length}项`
}

/** 供 WXML 使用 item.selected，勿用 map[key] 动态下标 */
function priceBucketsForView(selectedIds) {
  const set = new Set(selectedIds || [])
  return PRICE_BUCKETS.map((b) => ({ ...b, selected: set.has(b.id) }))
}

function togglePriceId(selectedIds, id) {
  const set = new Set(selectedIds || [])
  if (set.has(id)) set.delete(id)
  else set.add(id)
  return [...set]
}

function extractCitiesFromRows(rows) {
  const out = new Set()
  for (const r of rows || []) {
    const region = String(r.region || '').trim()
    if (region && region !== '—' && region !== '全国') {
      out.add(region)
      region.split(/[·\/\s,，]+/).forEach((part) => {
        const p = String(part || '').trim()
        if (p.length < 2) return
        out.add(/市$/.test(p) ? p : `${p}市`)
      })
    }
    const sn = String(r.storeName || '').trim()
    const m = sn.match(/([\u4e00-\u9fa5]{2,10}市)/)
    if (m) out.add(m[1])
  }
  return out
}

function buildCityFilterOptions(rows, max = 56) {
  const fromRows = extractCitiesFromRows(rows)
  const list = ['全部']
  for (const c of HOT_CITIES) {
    if (list.length >= max) break
    if (!list.includes(c)) list.push(c)
  }
  const rest = [...fromRows].filter((c) => c && c !== '全部' && !list.includes(c)).sort()
  for (const c of rest) {
    if (list.length >= max) break
    list.push(c)
  }
  return list
}

module.exports = {
  PLATFORM_FILTERS,
  PRICE_BUCKETS,
  PLATFORM_ICONS,
  normalizeHallPlatform,
  platformIcon,
  matchPlatform,
  matchCity,
  matchPriceBuckets,
  priceFilterLabel,
  priceBucketsForView,
  togglePriceId,
  buildCityFilterOptions,
}
