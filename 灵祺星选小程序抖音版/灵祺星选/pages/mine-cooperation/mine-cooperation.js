const { prepareXingxuanSubPage } = require('../../utils/pageIdentityChrome.js')
const xingxuan = require('../../utils/xingxuanEnhanceApi.js')

Page({
  data: {
    entries: [],
    syncing: false,
  },
  async onShow() {
    const ready = await prepareXingxuanSubPage(this)
    if (!ready) return
    await this.load()
  },
  async load() {
    try {
      const res = await xingxuan.getCooperationPool()
      this.setData({ entries: res.pool || [] })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
  async sync() {
    this.setData({ syncing: true })
    try {
      await xingxuan.syncCooperationPool()
      wx.showToast({ title: '已同步合作池' })
      await this.load()
    } catch (e) {
      wx.showToast({ title: e.message || '同步失败', icon: 'none' })
    } finally {
      this.setData({ syncing: false })
    }
  },
  remove(e) {
    const entryId = e.currentTarget.dataset.id
    if (!entryId) return
    wx.showModal({
      title: '移出合作池',
      content: '确定移出该达人？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await xingxuan.removeCooperation(entryId)
          await this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      },
    })
  },
  onEditTags(e) {
    const entryId = e.currentTarget.dataset.id
    const idx = Number(e.currentTarget.dataset.idx)
    const entry = (this.data.entries || [])[idx]
    if (!entry) return
    const presets = ['转化好', '配合度高', '出片快', '已合作', '性价比高']
    wx.showActionSheet({
      itemList: presets,
      success: async (res) => {
        const tag = presets[res.tapIndex]
        if (!tag) return
        const tags = [...new Set([...(entry.tags || []), tag])]
        try {
          await xingxuan.upsertCooperation({ ...entry, id: entryId, tags })
          await this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      },
    })
  },
})
