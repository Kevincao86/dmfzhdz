const feat = require('../../utils/merchantFeatureApisMp.js')

const PLATFORMS = [
  { id: 'douyin', label: '抖音' },
  { id: 'meituan', label: '美团' },
  { id: 'xiaohongshu', label: '小红书' },
]

function monthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { periodStart: fmt(start), periodEnd: fmt(end) }
}

function mapPlatforms(selected) {
  const set = new Set(selected || [])
  return PLATFORMS.map((p) => ({ ...p, on: set.has(p.id) }))
}

Page({
  data: {
    platforms: mapPlatforms(['douyin', 'meituan']),
    selectedPlatforms: ['douyin', 'meituan'],
    budgetYuan: '30000',
    periodStart: '',
    periodEnd: '',
    storeName: '',
    goalsNote: '',
    busy: false,
    err: '',
    plan: null,
    pointsHint: '',
  },

  onLoad() {
    const range = monthRange()
    const menu = feat.readStoreMenu()
    let displayName = ''
    try {
      displayName = String(wx.getStorageSync('meoo_erp_merchant_display_name') || '').trim()
    } catch (_) {}
    this.setData({
      periodStart: range.periodStart,
      periodEnd: range.periodEnd,
      storeName: menu.storeName || displayName,
    })
  },

  onTogglePlatform(e) {
    const id = e.currentTarget.dataset.id
    let selected = [...this.data.selectedPlatforms]
    if (selected.includes(id)) selected = selected.filter((x) => x !== id)
    else selected.push(id)
    this.setData({ selectedPlatforms: selected, platforms: mapPlatforms(selected) })
  },

  onBudget(e) {
    this.setData({ budgetYuan: e.detail.value })
  },
  onPeriodStart(e) {
    this.setData({ periodStart: e.detail.value })
  },
  onPeriodEnd(e) {
    this.setData({ periodEnd: e.detail.value })
  },
  onStoreName(e) {
    this.setData({ storeName: e.detail.value })
  },
  onGoalsNote(e) {
    this.setData({ goalsNote: e.detail.value })
  },

  onGenerate() {
    if (!this.data.selectedPlatforms.length) {
      wx.showToast({ title: '请至少选一个平台', icon: 'none' })
      return
    }
    const budgetYuan = Number(this.data.budgetYuan)
    if (!Number.isFinite(budgetYuan) || budgetYuan <= 0) {
      wx.showToast({ title: '请填写有效预算', icon: 'none' })
      return
    }
    this.setData({ busy: true, err: '', plan: null, pointsHint: '' })
    void (async () => {
      const menu = feat.readStoreMenu()
      const r = await feat.generateAiOpsPlan({
        platforms: this.data.selectedPlatforms,
        budgetYuan,
        periodStart: this.data.periodStart,
        periodEnd: this.data.periodEnd,
        goalsNote: String(this.data.goalsNote || '').trim() || undefined,
        storeName: String(this.data.storeName || '').trim() || undefined,
        menuSummary: feat.menuSummaryLines(menu.items) || undefined,
        margins: feat.readMargins(),
        industryPath: feat.readIndustryPath() || undefined,
      })
      if (!r.ok) {
        this.setData({ busy: false, err: r.message || '生成失败' })
        return
      }
      let pointsHint = ''
      if (r.pointsCharged != null) {
        pointsHint =
          `已扣 ${r.pointsCharged} 积分` + (r.pointsBalance != null ? ` · 余额 ${r.pointsBalance}` : '')
      }
      this.setData({ busy: false, plan: r.plan, pointsHint })
    })()
  },
})
