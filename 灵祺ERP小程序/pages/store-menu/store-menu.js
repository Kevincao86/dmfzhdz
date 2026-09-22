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

  async onPullDownRefresh() {
    try {
      this.reload()
    } finally {
      wx.stopPullDownRefresh()
    }
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

  async persist(items, storeName) {
    this.setData({ busy: true })
    const r = await feat.saveStoreMenu({ storeName, items })
    this.setData({ busy: false })
    this.reload()
    if (!r.ok) {
      wx.showToast({ title: r.message || '云端保存失败', icon: 'none', duration: 2500 })
      return false
    }
    wx.showToast({ title: r.localOnly ? '已存本地' : '已同步云端', icon: 'success' })
    return true
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
    void this.persist(items, this.data.storeName)
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
    this.setData({ editing: false })
    void this.persist(items, this.data.storeName)
  },

  onSaveStoreName() {
    void this.persist(this.data.items, this.data.storeName)
  },

  applyRecognized(incoming, notes) {
    const items = feat.mergeMenuItems(this.data.items, incoming || [])
    const added = items.length - this.data.items.length
    wx.showModal({
      title: `识别到 ${incoming.length} 条`,
      content: `${notes ? notes + '\n' : ''}将合并新增 ${added} 条到价目表。`,
      success: (res) => {
        if (!res.confirm) return
        void this.persist(items, this.data.storeName)
      },
    })
  },

  onPhoto() {
    if (this.data.busy) return
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) return
        const run = (filePath) => {
          wx.getFileSystemManager().readFile({
            filePath,
            encoding: 'base64',
            success: (rr) => {
              const dataUrl = `data:image/jpeg;base64,${rr.data || ''}`
              this.setData({ busy: true })
              wx.showLoading({ title: '识别中…', mask: true })
              void (async () => {
                const r = await feat.recognizeStoreMenuImage(dataUrl, this.data.storeName)
                wx.hideLoading()
                this.setData({ busy: false })
                if (!r.ok) {
                  wx.showModal({ title: '识别失败', content: r.message || '', showCancel: false })
                  return
                }
                this.applyRecognized(r.items, r.notes)
              })()
            },
            fail: () => wx.showToast({ title: '读取图片失败', icon: 'none' }),
          })
        }
        if (wx.compressImage) {
          wx.compressImage({
            src: path,
            quality: 70,
            success: (c) => run(c.tempFilePath || path),
            fail: () => run(path),
          })
        } else run(path)
      },
    })
  },

  onExcel() {
    if (this.data.busy) return
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls', 'csv'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.path) return
        if (f.size > 6 * 1024 * 1024) {
          wx.showToast({ title: '文件需小于 6MB', icon: 'none' })
          return
        }
        const name = String(f.name || 'menu.xlsx')
        const lower = name.toLowerCase()
        wx.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: lower.endsWith('.csv') ? 'utf-8' : 'base64',
          success: (rr) => {
            this.setData({ busy: true })
            wx.showLoading({ title: '识别表格…', mask: true })
            void (async () => {
              let r
              if (lower.endsWith('.csv')) {
                const rows = feat.parseCsvToRows(rr.data || '')
                r = await feat.recognizeStoreMenuExcel({
                  rows,
                  fileName: name,
                  storeName: this.data.storeName,
                })
              } else {
                r = await feat.recognizeStoreMenuExcel({
                  fileBase64: rr.data || '',
                  fileName: name,
                  storeName: this.data.storeName,
                })
              }
              wx.hideLoading()
              this.setData({ busy: false })
              if (!r.ok) {
                wx.showModal({ title: '识别失败', content: r.message || '', showCancel: false })
                return
              }
              this.applyRecognized(r.items, r.notes)
            })()
          },
          fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' }),
        })
      },
    })
  },

  noop() {},
})
