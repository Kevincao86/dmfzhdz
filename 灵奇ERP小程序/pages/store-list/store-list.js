const api = require('../../utils/api.js')
const { readPlatformToken } = require('../../utils/platformTokensMp.js')
const devAuth = require('../../utils/devAuth.js')
const feature = require('../../utils/merchantFeatureMp.js')
const contact = require('../../utils/storeContactOverrideMp.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const {
  buildStorePlatformTabs,
  findStorePlatformTab,
  platformCardStatus,
  isPlatformConnected,
} = require('../../utils/storePlatformUiMp.js')

Page({
  data: {
    mode: 'info',
    platform: 'douyin',
    tabs: [],
    activePlatform: null,
    platCard: null,
    loading: false,
    err: '',
    items: [],
    showNotice: true,
    keyword: '',
    editOpen: false,
    editId: '',
    editName: '',
    editPhone: '',
    editHours: '',
    decoBusy: false,
  },

  onLoad(q) {
    const mode = q && q.mode === 'decoration' ? 'decoration' : 'info'
    wx.setNavigationBarTitle({
      title: mode === 'decoration' ? '店铺装修' : '店铺信息',
    })
    this.setData({ mode })
  },

  onShow() {
    if (!api.canAccessPage()) {
      api.goLogin()
      return
    }
    this.refreshTabs()
    void this.load()
  },

  async onPullDownRefresh() {
    try {
      await this.load()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value || '' })
  },

  onSearchConfirm() {
    void this.load()
  },

  refreshTabs() {
    const tabs = buildStorePlatformTabs()
    const activePlatform = findStorePlatformTab(this.data.platform) || tabs[0] || null
    this.setData({
      tabs,
      activePlatform,
      platform: activePlatform ? activePlatform.id : 'douyin',
    })
  },

  onCloseNotice() {
    this.setData({ showNotice: false })
  },

  onTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.platform) return
    const activePlatform = findStorePlatformTab(id)
    this.setData({ platform: id, activePlatform })
    void this.load()
  },

  async load() {
    const activePlatform = findStorePlatformTab(this.data.platform)
    if (!activePlatform) return

    if (!isPlatformConnected(activePlatform.id)) {
      const platCard = {
        ...activePlatform,
        ...platformCardStatus(activePlatform.id, false, false),
        title: activePlatform.name,
      }
      this.setData({
        loading: false,
        err: '',
        items: [],
        activePlatform,
        platCard,
      })
      return
    }

    this.setData({ loading: true, err: '' })

    if (devAuth.isDevSkipLogin() && isPlatformConnected(activePlatform.id) && !readPlatformToken(activePlatform.id)) {
      const preview = previewPlatformCard(activePlatform)
      this.setData({
        loading: false,
        err: '',
        items: preview.items,
        activePlatform: { ...activePlatform, connected: true, showLogo: Boolean(activePlatform.logo) },
        platCard: preview.platCard,
      })
      return
    }

    let items = []
    let err = ''
    try {
      const kw = this.data.keyword
      if (this.data.mode === 'decoration') {
        const r = await feature.fetchStoreDecorations(this.data.platform, kw)
        if (r && r.ok && r.items && r.items.length) {
          items = r.items
        } else {
          const s = await feature.fetchStoresForPlatform(this.data.platform, kw)
          items = s && s.ok ? s.items || [] : []
          err = items.length ? '' : (r && r.message) || (s && s.message) || ''
        }
      } else {
        const r = await feature.fetchStoresForPlatform(this.data.platform, kw)
        items = r && r.ok ? r.items || [] : []
        err = r && r.ok ? '' : (r && r.message) || '门店列表拉取失败'
      }
    } catch (e) {
      err = (e && e.message) || '门店列表拉取失败'
    }
    items = items.map((it) => contact.applyToItem(it, this.data.platform))
    const platCard = {
      ...activePlatform,
      ...platformCardStatus(activePlatform.id, true, items.length > 0),
      title:
        items.length > 0
          ? `${activePlatform.name} · ${items[0].name || '门店'}`
          : activePlatform.name,
      meta: items.length > 0 && items[0].address ? items[0].address : platCardMetaPreview(activePlatform.id),
    }
    this.setData({
      loading: false,
      err,
      items,
      activePlatform,
      platCard,
    })
  },

  onEditContact(e) {
    const id = e.currentTarget.dataset.id
    const row = (this.data.items || []).find((x) => x.id === id)
    if (!row) return
    const o = contact.getOverride(this.data.platform, id) || {}
    this.setData({
      editOpen: true,
      editId: id,
      editName: row.name || '',
      editPhone: row.phone || o.phone || '',
      editHours: row.businessHours || o.businessHours || '',
    })
  },

  onEditPhone(e) {
    this.setData({ editPhone: e.detail.value })
  },
  onEditHours(e) {
    this.setData({ editHours: e.detail.value })
  },
  onEditCancel() {
    this.setData({ editOpen: false })
  },
  onEditSave() {
    contact.saveOverride(this.data.platform, this.data.editId, {
      phone: this.data.editPhone,
      businessHours: this.data.editHours,
    })
    this.setData({ editOpen: false })
    wx.showToast({ title: '已保存联系方式', icon: 'none' })
    void this.load()
  },

  onDecorate(e) {
    if (this.data.platform !== 'douyin') {
      wx.showToast({ title: '五连图头图目前仅抖音来客', icon: 'none' })
      return
    }
    const poiId = e.currentTarget.dataset.id
    if (!poiId || this.data.decoBusy) return
    wx.chooseImage({
      count: 5,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFilePaths || []).slice(0, 5)
        if (!paths.length) return
        this.setData({ decoBusy: true })
        void (async () => {
          wx.showLoading({ title: '上传头图…', mask: true })
          const urls = []
          for (let i = 0; i < paths.length; i++) {
            const up = await douyin.uploadProductImage(paths[i])
            if (!up.ok) {
              wx.hideLoading()
              this.setData({ decoBusy: false })
              wx.showToast({ title: up.message || '上传失败', icon: 'none' })
              return
            }
            urls.push(up.url)
          }
          wx.showLoading({ title: '提交装修…', mask: true })
          const r = await feature.postDouyinPoiDecorate(poiId, urls)
          wx.hideLoading()
          this.setData({ decoBusy: false })
          wx.showToast({ title: r.ok ? '已提交装修' : r.message || '失败', icon: r.ok ? 'success' : 'none' })
        })()
      },
    })
  },

  noop() {},
})

function previewPlatformCard(activePlatform) {
  const storeName = '上德银泰城'
  const items =
    activePlatform.id === 'douyin'
      ? [{ id: '7165', name: storeName, address: '浙江省宁波市鄞州区' }]
      : activePlatform.id === 'xiaohongshu'
        ? [{ id: 'poi-1', name: `${storeName} POI`, address: '已关联门店 POI' }]
        : []
  const status = platformCardStatus(activePlatform.id, true, items.length > 0)
  if (activePlatform.id === 'meituan') {
    status.statusText = '待完善'
    status.statusClass = 'warn'
    status.actionLabel = '去完善'
  }
  if (activePlatform.id === 'xiaohongshu') {
    status.statusText = '已关联'
  }
  const platCard = {
    ...activePlatform,
    connected: true,
    showLogo: Boolean(activePlatform.logo),
    ...status,
    title:
      activePlatform.id === 'douyin'
        ? `抖音来客 · ${storeName}`
        : activePlatform.id === 'xiaohongshu'
          ? `小红书 POI · ${storeName}`
          : activePlatform.name,
    meta: platCardMetaPreview(activePlatform.id),
  }
  return { platCard, items }
}

function platCardMetaPreview(platformId) {
  if (devAuth.isDevSkipLogin()) {
    if (platformId === 'douyin') return '抖音号：7165XXXXXX · 上德银泰城'
    if (platformId === 'xiaohongshu') return '小红书 POI 已关联'
  }
  return ''
}
