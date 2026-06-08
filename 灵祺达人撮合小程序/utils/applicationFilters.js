const APPLICATION_TIME_FILTERS = [
  { id: 'all', label: '全部时间' },
  { id: '7d', label: '近7天' },
  { id: '30d', label: '近30天' },
  { id: 'older', label: '更早' },
]

const CATEGORY_FILTERS = [
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
]

function parseAppliedAtMs(appliedAt) {
  if (!appliedAt) return 0
  const t = Date.parse(String(appliedAt).replace(/\//g, '-'))
  return Number.isFinite(t) ? t : 0
}

function matchApplicationTimeFilter(appliedAtMs, filter) {
  if (!filter || filter === 'all') return true
  const ms = appliedAtMs || 0
  if (!ms) return false
  const now = Date.now()
  if (filter === '7d') return ms >= now - 7 * 86400000
  if (filter === '30d') return ms >= now - 30 * 86400000
  return ms < now - 30 * 86400000
}

function matchCategory(category, filterCategory) {
  if (!filterCategory || filterCategory === '全部') return true
  const c = String(category || '').trim() || '其他'
  if (filterCategory === '其他') {
    return !CATEGORY_FILTERS.slice(1, -1).some((cat) => c.includes(cat))
  }
  return c.includes(filterCategory) || filterCategory.includes(c)
}

function parseRegionParts(region) {
  const s = String(region || '').trim()
  if (!s || s === '—' || s === '全国') return { province: '', city: '' }
  const m = s.match(/^(.+?省|.+?自治区|北京市|上海市|天津市|重庆市)(.*)$/)
  if (m) {
    const prov = m[1]
    const rest = String(m[2] || '').trim()
    const city = rest || (prov.endsWith('市') ? prov : '')
    return { province: prov, city }
  }
  if (/市$/.test(s)) return { province: '', city: s }
  return { province: s, city: '' }
}

function matchRegionFilter(region, filterProvince, filterCity) {
  const fp = String(filterProvince || '全部').trim()
  const fc = String(filterCity || '全部').trim()
  if (fp === '全部' && fc === '全部') return true
  const { province, city } = parseRegionParts(region)
  const blob = [region, province, city].filter(Boolean).join(' ')
  if (fp !== '全部' && !blob.includes(fp)) return false
  if (fc !== '全部' && !blob.includes(fc)) {
    const short = fc.replace(/市$/, '')
    if (!(short.length >= 2 && blob.includes(short))) return false
  }
  return true
}

function filterApplicationRows(rows, opts) {
  const timeFilter = (opts && opts.timeFilter) || 'all'
  const category = (opts && opts.category) || '全部'
  const province = (opts && opts.province) || '全部'
  const city = (opts && opts.city) || '全部'
  return (rows || []).filter((r) => {
    if (!matchApplicationTimeFilter(parseAppliedAtMs(r.appliedAt), timeFilter)) return false
    if (!matchCategory(r.category, category)) return false
    if (!matchRegionFilter(r.region, province, city)) return false
    return true
  })
}

module.exports = {
  APPLICATION_TIME_FILTERS,
  CATEGORY_FILTERS,
  parseAppliedAtMs,
  matchApplicationTimeFilter,
  matchCategory,
  matchRegionFilter,
  filterApplicationRows,
}
