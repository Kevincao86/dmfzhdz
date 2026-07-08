const api = require('../../utils/api.js')
const { readPlatformToken } = require('../../utils/platformTokensMp.js')
const devAuth = require('../../utils/devAuth.js')
const feature = require('../../utils/merchantFeatureMp.js')
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

    const r = await feature.fetchStoresForPlatform(this.data.platform)
    const items = r.ok ? r.items : []
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
      err: r.ok ? '' : r.message,
      items,
      activePlatform,
      platCard,
    })
  },
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
