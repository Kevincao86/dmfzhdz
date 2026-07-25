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
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.load()
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
    wx.showToast({ title: '完整记录请在电脑端查看', icon: 'none' })
  },

  onCardAction() {
    wx.showToast({ title: '请在电脑端完成对账', icon: 'none' })
  },

  onQuick(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'help') {
      wx.showToast({ title: '请联系在线客服', icon: 'none' })
      return
    }
    wx.showToast({ title: '请在电脑端财务模块操作', icon: 'none' })
  },
})
