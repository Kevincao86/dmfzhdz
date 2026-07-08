const api = require('../../utils/api.js')
const briefStore = require('../../utils/kolBriefStorageMp.js')

Page({
  data: {
    records: [],
  },

  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
    try {
      const records = briefStore.readRecords().map((r, i) => {
        const p0 = Array.isArray(r.previews) ? String(r.previews[0] || '').trim() : ''
        return Object.assign({}, r, {
          _sn: `${i}_${r.id || r.createdAt || i}`,
          tags: Array.isArray(r.tags) ? r.tags : [],
          prevSnippet: p0.slice(0, 160) + (p0.length > 160 ? '…' : ''),
        })
      })
      this.setData({ records })
    } catch (_) {
      this.setData({ records: [] })
    }
  },

  goWizard() {
    wx.navigateTo({ url: '/pages/recruit-brief-wizard/recruit-brief-wizard' })
  },

  goHub() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-hub/recruit-hub' }) })
  },

  copyVariant(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const v = Number(e.currentTarget.dataset.v) || 0
    const rec = this.data.records.find((x) => x.id === id)
    if (!rec || !Array.isArray(rec.previews)) return
    const txt = String(rec.previews[v] || '').trim()
    if (!txt) {
      wx.showToast({ title: '无内容', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: txt })
  },

  pickForRecruit(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const v = Number(e.currentTarget.dataset.v) || 0
    const rec = this.data.records.find((x) => x.id === id)
    if (!rec || !Array.isArray(rec.previews)) return
    const text = String(rec.previews[v] || '').trim()
    if (!text) {
      wx.showToast({ title: '无内容', icon: 'none' })
      return
    }
    briefStore.writeSelectedBrief({
      recordId: rec.id || '',
      variantIndex: v,
      text,
      platform: rec.platform || '',
      mainProductName: rec.mainProductName || '',
      tags: Array.isArray(rec.tags) ? rec.tags : [],
    })
    wx.showToast({ title: '已写入招募引用', icon: 'success' })
  },
})
