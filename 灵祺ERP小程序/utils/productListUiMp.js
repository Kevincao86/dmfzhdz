/** 商品列表 — 平台 Tab 与展示字段 */
const { GROUPBUY_OPTIONS } = require('./productCreatePlatformsMp.js')
const devAuth = require('./devAuth.js')

const LIST_TABS = GROUPBUY_OPTIONS.filter((p) => !p.comingSoon && p.id !== 'jd').map((p) => ({
  id: p.id,
  label: p.id === 'douyin' ? '抖音' : p.id === 'meituan' ? '美团' : p.id === 'xiaohongshu' ? '小红书' : p.id === 'kuaishou' ? '快手' : p.name.slice(0, 2),
  logo: p.logo || '',
}))

const STATUS_FILTERS = [
  { id: 'all', label: '全部状态' },
  { id: 'onsale', label: '在售' },
  { id: 'review', label: '审核中' },
  { id: 'draft', label: '草稿' },
]

function normalizeStatus(item) {
  const raw = String(item.status || item.statusLabel || item.state || '').toLowerCase()
  const label = String(item.statusLabel || item.status || '')
  if (/在售|上架|online|onsale|active/.test(raw) || label.includes('在售')) return { key: 'onsale', label: '在售', cls: 'onsale' }
  if (/审核|review|pending/.test(raw) || label.includes('审核')) return { key: 'review', label: '审核中', cls: 'review' }
  if (/草稿|draft/.test(raw) || label.includes('草稿')) return { key: 'draft', label: '草稿', cls: 'draft' }
  return { key: 'other', label: label || '未知', cls: 'draft' }
}

function enrichProductRow(item, platformId) {
  const st = normalizeStatus(item)
  const price = item.priceYuan ?? item.price_yuan ?? item.price
  let priceText = '—'
  if (price != null && price !== '') {
    const n = Number(price)
    priceText = Number.isFinite(n) ? `¥${n % 1 === 0 ? n : n.toFixed(2)}` : String(price)
  }
  return {
    id: String(item.id || item.product_id || ''),
    name: String(item.name || item.title || '未命名商品'),
    productId: String(item.productId || item.product_id || item.id || ''),
    priceText,
    statusKey: st.key,
    statusLabel: st.label,
    statusClass: st.cls,
    thumb: item.image || item.head_url || item.cover || '',
    platformId,
  }
}

function previewProducts(platformId) {
  const base = [
    { id: '7381294829201', name: '双人街舞体验课', priceYuan: 99, statusLabel: '在售', image: '' },
    { id: '7381294829202', name: '商场美食套餐', priceYuan: 128, statusLabel: '审核中', image: '' },
    { id: '7381294829203', name: '亲子探店券', priceYuan: 59, statusLabel: '草稿', image: '' },
  ]
  return base.map((x) => enrichProductRow(x, platformId))
}

const SORT_OPTIONS = [
  { id: 'default', label: '默认排序' },
  { id: 'price_asc', label: '价格升序' },
  { id: 'price_desc', label: '价格降序' },
  { id: 'name', label: '名称排序' },
]

const PREVIEW_STORES = [
  { id: '', name: '全部门店' },
  { id: 'poi_001', name: '灵祺体验中心（徐汇店）' },
  { id: 'poi_002', name: '灵祺体验中心（浦东店）' },
]

function syncButtonLabel(platformId) {
  if (platformId === 'douyin') return '同步至来客'
  if (platformId === 'meituan') return '同步至美团'
  if (platformId === 'xiaohongshu') return '同步至小红书'
  return '同步平台'
}

function applyFilters(items, opts) {
  const kw = String(opts.keyword || '').trim().toLowerCase()
  const status = opts.statusFilter || 'all'
  const storeId = opts.storeId || ''
  let rows = items.slice()
  if (status !== 'all') rows = rows.filter((x) => x.statusKey === status)
  if (storeId) rows = rows.filter((x) => !x.storeId || x.storeId === storeId)
  if (kw) rows = rows.filter((x) => String(x.name || '').toLowerCase().includes(kw))
  const sort = opts.sortBy || 'default'
  if (sort === 'price_asc') rows.sort((a, b) => parsePrice(a) - parsePrice(b))
  else if (sort === 'price_desc') rows.sort((a, b) => parsePrice(b) - parsePrice(a))
  else if (sort === 'name') rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
  return rows
}

function parsePrice(row) {
  const m = String(row.priceText || '').replace(/[^\d.]/g, '')
  const n = Number(m)
  return Number.isFinite(n) ? n : 0
}

function shouldUsePreview() {
  return devAuth.isDevSkipLogin()
}

module.exports = {
  LIST_TABS,
  STATUS_FILTERS,
  SORT_OPTIONS,
  PREVIEW_STORES,
  enrichProductRow,
  previewProducts,
  syncButtonLabel,
  applyFilters,
  shouldUsePreview,
}
