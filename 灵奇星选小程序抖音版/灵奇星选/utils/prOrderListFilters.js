const hallFilters = require('./recruitmentHallFilters.js')
const listKeywordSearch = require('./listKeywordSearch.js')
const mpOrderStatus = require('./mpOrderStatus.js')

const TARGET_FILTERS = [
  { id: 'all', label: '全部身份' },
  { id: 'talent', label: '达人' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
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

const HALL_TYPE_FILTERS = ['全部', '招募大厅', '急单大厅', '云剪任务']

const STATUS_FILTERS = mpOrderStatus.HALL_STATUS_FILTERS

function matchCategory(rowCategory, filterCategory) {
  if (!filterCategory || filterCategory === '全部') return true
  const c = String(rowCategory || '').trim() || '其他'
  if (filterCategory === '其他') {
    return !CATEGORY_FILTERS.slice(1, -1).some((cat) => c.includes(cat))
  }
  return c.includes(filterCategory) || filterCategory.includes(c)
}

function matchHallType(hallLabel, filterHall) {
  if (!filterHall || filterHall === '全部') return true
  return String(hallLabel || '').trim() === filterHall
}

function applicantVideoUrl(a) {
  return String((a && (a.videoUrl || a.douyinPublishUrl)) || '').trim()
}

function countPendingVideos(mp) {
  if (!mp || !Array.isArray(mp.applicants)) return 0
  return mp.applicants.filter((a) => {
    if (!a || !applicantVideoUrl(a)) return false
    const s = String(a.videoStatus || '').trim()
    if (s === 'draft') return false
    return s === 'pending' || !s
  }).length
}

function countVideos(mp) {
  if (!mp || !Array.isArray(mp.applicants)) return 0
  return mp.applicants.filter((a) => {
    if (!a || !applicantVideoUrl(a)) return false
    return String(a.videoStatus || '').trim() !== 'draft'
  }).length
}

function filterPrOrderRows(rows, opts) {
  const filterTarget = (opts && opts.filterTarget) || 'all'
  const filterPlatform = (opts && opts.filterPlatform) || '全部'
  const filterCategory = (opts && opts.filterCategory) || '全部'
  const filterHall = (opts && opts.filterHall) || '全部'
  const filterProvince = (opts && opts.filterProvince) || '全部'
  const filterCity = (opts && opts.filterCity) || '全部'
  const filterStatus = (opts && opts.filterStatus) || mpOrderStatus.HALL_DEFAULT_STATUS_FILTER
  const keyword = (opts && opts.keyword) || ''
  const tab = (opts && opts.tab) || 'published'

  return (rows || []).filter((row) => {
    if (tab !== 'published') {
      return listKeywordSearch.matchListKeyword(row, keyword)
    }
    if (filterTarget !== 'all' && row.recruitTarget !== filterTarget) return false
    if (!hallFilters.matchPlatform(row.platform, filterPlatform)) return false
    if (!matchCategory(row.category, filterCategory)) return false
    if (!matchHallType(row.hallLabel, filterHall)) return false
    if (!hallFilters.matchRegionFilter(row.region, '', filterProvince, filterCity)) return false
    if (
      filterStatus === mpOrderStatus.HALL_DEFAULT_STATUS_FILTER &&
      row.isRemovedFromRegistry
    ) {
      return false
    }
    if (!mpOrderStatus.matchHallStatusFilter(String(row.statusLabel || ''), filterStatus)) {
      return false
    }
    if (!listKeywordSearch.matchListKeyword(row, keyword)) return false
    return true
  })
}

module.exports = {
  TARGET_FILTERS,
  CATEGORY_FILTERS,
  HALL_TYPE_FILTERS,
  STATUS_FILTERS,
  filterPrOrderRows,
  countPendingVideos,
  countVideos,
}
