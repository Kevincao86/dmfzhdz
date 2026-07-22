const feat = require('../../utils/merchantFeatureApisMp.js')

Page({
  data: {
    storeName: '',
    items: [],
    updatedAt: '',
    editing: false,
    editIndex: -1,
    formName: '',
    formPrice: '',
    formCategory: '',
    busy: false,
  },

  onShow() {
    this.reload()
  },

  reload() {
    const menu = feat.readStoreMenu()
    this.setData({
      storeName: menu.storeName,
      items: menu.items,
      updatedAt: menu.updatedAt ? String(menu.updatedAt).slice(0, 19).replace('T', ' ') : '',
    })
  },

  onStoreName(e) {
    this.setData({ storeName: e.detail.value })
  },

  onSyncCloud() {
    this.setData({ busy: true })
    void (async () => {
      try {
        const app = getApp()
        if (app && typeof app.syncMerchantSession === 'function') {
          await app.syncMerchantSession({ force: true })
        }
        this.reload()
        wx.showToast({ title: '已同步', icon: 'success' })
      } catch (e) {
        wx.showToast({ title: (e && e.message) || '同步失败', icon: 'none' })
      } finally {
        this.setData({ busy: false })
      }
    })()
  },

  onAdd() {
    this.setData({
      editing: true,
      editIndex: -1,
      formName: '',
      formPrice: '',
      formCategory: '',
    })
  },

  onEdit(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const it = this.data.items[idx]
    if (!it) return
    this.setData({
      editing: true,
      editIndex: idx,
      formName: String(it.name || ''),
      formPrice: it.priceYuan != null ? String(it.priceYuan) : '',
      formCategory: String(it.category || ''),
    })
  },

  onDelete(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const items = this.data.items.slice()
    items.splice(idx, 1)
    feat.writeStoreMenu({ storeName: this.data.storeName, items })
    this.reload()
  },

  onFormName(e) {
    this.setData({ formName: e.detail.value })
  },
  onFormPrice(e) {
    this.setData({ formPrice: e.detail.value })
  },
  onFormCategory(e) {
    this.setData({ formCategory: e.detail.value })
  },

  onCancelEdit() {
    this.setData({ editing: false })
  },

  onSaveItem() {
    const name = String(this.data.formName || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写名称', icon: 'none' })
      return
    }
    const priceYuan = Number(this.data.formPrice)
    const row = {
      name,
      priceYuan: Number.isFinite(priceYuan) ? priceYuan : 0,
      category: String(this.data.formCategory || '').trim(),
    }
    const items = this.data.items.slice()
    if (this.data.editIndex >= 0) items[this.data.editIndex] = Object.assign({}, items[this.data.editIndex], row)
    else items.push(row)
    feat.writeStoreMenu({ storeName: this.data.storeName, items })
    this.setData({ editing: false })
    this.reload()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onSaveStoreName() {
    feat.writeStoreMenu({ storeName: this.data.storeName, items: this.data.items })
    wx.showToast({ title: '已保存', icon: 'success' })
    this.reload()
  },
})
