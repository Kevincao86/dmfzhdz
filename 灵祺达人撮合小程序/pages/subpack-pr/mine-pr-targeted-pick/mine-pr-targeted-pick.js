const ops = require('../../../utils/opsRegistryTalentMp.js')
const prBoard = require('../../../utils/prRecommendBoard.js')
const mpTargetedRecruitApi = require('../../../utils/mpTargetedRecruitApi.js')
const publishOpts = require('../../../utils/publishFormOptions.js')
const regionFilterPicker = require('../../../utils/regionFilterPicker.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')

const PLATFORM_OPTS = ['全部'].concat(publishOpts.PLATFORMS || [])
const SALES_LEVEL_OPTS = ['全部'].concat(
  (publishOpts.DOUYIN_SALES_LEVELS || []).filter((x) => x && x !== '不限'),
)

function normalizeSalesLevel(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  const m = s.match(/Lv\d+/i)
  return m ? m[0].replace(/^lv/i, 'Lv') : s
}

function matchRow(row, kw, platform, province, city, salesLevel) {
  if (!row || row.isPreview) return false
  if (platform && platform !== '全部' && row.platform !== platform) return false
  if (province && province !== '全部') {
    const rowProv = String(row.province || '').trim()
    const region = String(row.region || '').trim()
    if (rowProv !== province && !region.startsWith(province)) return false
  }
  if (city && city !== '全部') {
    const rowCity = String(row.city || '').trim()
    const region = String(row.region || '').trim()
    if (rowCity !== city && !region.includes(city)) return false
  }
  if (salesLevel && salesLevel !== '全部') {
    const lv = normalizeSalesLevel(row.douyinSalesLevel || row.salesGrade || '')
    if (lv !== salesLevel && !String(row.salesGrade || '').includes(salesLevel)) return false
  }
  const k = String(kw || '').trim().toLowerCase()
  if (!k) return true
  const blob = [row.name, row.id, row.region, row.city, row.province, (row.accountTags || []).join(' ')]
    .join(' ')
    .toLowerCase()
  return blob.includes(k)
}

function collectSalesLevelOptions(rows) {
  const set = new Set()
  for (const r of rows || []) {
    const lv = normalizeSalesLevel(r.douyinSalesLevel || r.salesGrade || '')
    if (lv && /^Lv\d+$/i.test(lv)) set.add(lv.replace(/^lv/i, 'Lv'))
  }
  const ordered = SALES_LEVEL_OPTS.filter((x) => x === '全部' || set.has(x))
  for (const x of set) {
    if (!ordered.includes(x)) ordered.push(x)
  }
  return ordered.length > 1 ? ordered : SALES_LEVEL_OPTS
}

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    mpOrderId: '',
    inviteResponseHours: 72,
    keyword: '',
    filterPlatform: '全部',
    filterProvince: '全部',
    filterCity: '全部',
    filterSalesLevel: '全部',
    platformOpts: PLATFORM_OPTS,
    salesLevelOpts: SALES_LEVEL_OPTS,
    filterPlatformIndex: 0,
    filterSalesLevelIndex: 0,
    regionFilterLabel: '城市 · 全部',
    regionMultiRange: [['全部'], ['全部']],
    regionMultiValue: [0, 0],
    allRows: [],
    displayRows: [],
    selectedMap: {},
    selectedCount: 0,
    loading: true,
    err: '',
    sending: false,
  },
  onLoad(query) {
    prepareMineSubPage('pr')
    const mpOrderId = String((query && query.id) || '').trim()
    const hours = Number((query && query.hours) || 72) || 72
    this.setData({
      mpOrderId,
      inviteResponseHours: hours,
      ...regionFilterPicker.initRegionFilterState('全部', '全部'),
    })
    this.loadPool()
  },
  async loadPool() {
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry({ includeRecommendPool: true })
      const pool = prBoard.buildBoardPool(reg, 'talent')
      const rows = pool.filter((r) => r && r.id && !r.isPreview)
      const salesLevelOpts = collectSalesLevelOptions(rows)
      this.setData({ allRows: rows, salesLevelOpts, loading: false })
      this.applyFilter()
    } catch (e) {
      this.setData({ loading: false, err: String((e && e.message) || e || '加载失败') })
    }
  },
  applyFilter() {
    const { allRows, keyword, filterPlatform, filterProvince, filterCity, filterSalesLevel } = this.data
    const displayRows = (allRows || []).filter((r) =>
      matchRow(r, keyword, filterPlatform, filterProvince, filterCity, filterSalesLevel),
    )
    this.setData({ displayRows })
  },
  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
    this.applyFilter()
  },
  onFilterPlatformChange(e) {
    const idx = Number(e.detail.value) || 0
    const opts = this.data.platformOpts || PLATFORM_OPTS
    this.setData({
      filterPlatformIndex: idx,
      filterPlatform: opts[idx] || '全部',
    })
    this.applyFilter()
  },
  onRegionFilterColumnChange(e) {
    const next = regionFilterPicker.onRegionFilterColumnChange(
      {
        filterProvince: this.data.filterProvince,
        filterCity: this.data.filterCity,
        regionMultiRange: this.data.regionMultiRange,
      },
      e.detail.column,
      e.detail.value,
    )
    this.setData(next)
  },
  onRegionFilterChange(e) {
    const next = regionFilterPicker.onRegionFilterChange(
      {
        filterProvince: this.data.filterProvince,
        filterCity: this.data.filterCity,
        regionMultiRange: this.data.regionMultiRange,
      },
      e.detail.value,
    )
    this.setData(next)
    this.applyFilter()
  },
  onFilterSalesLevelChange(e) {
    const idx = Number(e.detail.value) || 0
    const opts = this.data.salesLevelOpts || SALES_LEVEL_OPTS
    this.setData({
      filterSalesLevelIndex: idx,
      filterSalesLevel: opts[idx] || '全部',
    })
    this.applyFilter()
  },
  onClearFilters() {
    this.setData({
      keyword: '',
      filterPlatform: '全部',
      filterSalesLevel: '全部',
      filterPlatformIndex: 0,
      filterSalesLevelIndex: 0,
      ...regionFilterPicker.initRegionFilterState('全部', '全部'),
    })
    this.applyFilter()
  },
  onToggle(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const map = { ...(this.data.selectedMap || {}) }
    if (map[id]) delete map[id]
    else map[id] = true
    this.setData({ selectedMap: map, selectedCount: Object.keys(map).length })
  },
  async onSend() {
    const { mpOrderId, selectedMap, inviteResponseHours, sending } = this.data
    if (sending || !mpOrderId) return
    const ids = Object.keys(selectedMap || {}).filter((k) => selectedMap[k])
    if (!ids.length) {
      wx.showToast({ title: '请选择达人', icon: 'none' })
      return
    }
    this.setData({ sending: true })
    try {
      const res = await mpTargetedRecruitApi.sendInvites(mpOrderId, ids, inviteResponseHours)
      wx.showToast({ title: `已邀约 ${res.added || ids.length} 人`, icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/subpack-pr/mine-pr-targeted-manage/mine-pr-targeted-manage?id=${encodeURIComponent(mpOrderId)}`,
        })
      }, 400)
    } catch (e) {
      wx.showToast({ title: String((e && e.message) || e || '发送失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ sending: false })
    }
  },
})
