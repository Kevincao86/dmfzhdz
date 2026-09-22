const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')
const {
  QUICK_ENTRIES,
  previewReconcileCards,
  mapApiRows,
  shouldUsePreview,
} = require('../../utils/financeReconcileUiMp.js')

Page({
  data: {
    days: 14,
    loading: false,
    err: '',
    cards: [],
    quickEntries: QUICK_ENTRIES,
    showRecords: false,
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
  },

  async onPullDownRefresh() {
    try {
      await this.load()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  async load() {
    if (shouldUsePreview()) {
      this.setData({ loading: false, err: '', cards: previewReconcileCards() })
      return
    }
    this.setData({ loading: true, err: '' })
    const r = await feature.fetchFinanceReconcile(this.data.days)
    if (!r.ok) {
      this.setData({ loading: false, err: r.message, cards: [] })
      return
    }
    const cards = mapApiRows(r.rows)
    this.setData({ loading: false, err: '', cards })
  },

  onRecords() {
    this.setData({ showRecords: !this.data.showRecords })
  },

  onCardAction(e) {
    const id = e.currentTarget.dataset.id
    const row = (this.data.cards || []).find((x) => String(x.id) === String(id))
    if (!row) return
    const lines = [
      row.title,
      row.period || row.settleTime || '',
      `应结：${row.payable}`,
      `实结：${row.actual}`,
      `差异：${row.diff}`,
      row.statusText || row.tag || '',
    ]
      .filter(Boolean)
      .join('\n')
    wx.showModal({ title: '对账明细', content: lines, showCancel: false })
  },

  onQuick(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'help') {
      wx.navigateTo({ url: '/pages/support-chat/support-chat' })
      return
    }
    if (id === 'statement' || id === 'settlement' || id === 'talent') {
      this.setData({ showRecords: true })
      wx.showToast({ title: '已展开下方对账记录', icon: 'none' })
    }
  },
})
