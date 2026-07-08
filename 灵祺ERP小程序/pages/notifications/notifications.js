const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const feature = require('../../utils/merchantFeatureMp.js')
const { enrichNotification, PREVIEW_ITEMS } = require('../../utils/notificationsUiMp.js')

Page({
  data: { items: [] },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.refresh()
    if (!devAuth.isDevSkipLogin() && !feature.loadNotifications().length) {
      feature.pushNotification({
        title: '欢迎使用灵祺商家小程序',
        body: '评论、招募、财务等动态将在此展示；与商家后台同一账号。',
      })
      this.refresh()
    }
  },

  refresh() {
    let raw = feature.loadNotifications()
    if (devAuth.isDevSkipLogin() && !raw.length) raw = PREVIEW_ITEMS
    const items = raw.map(enrichNotification)
    this.setData({ items })
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id
    const row = this.data.items.find((x) => x.id === id)
    if (!row) return
    wx.showModal({
      title: row.title,
      content: row.desc || '暂无详情',
      showCancel: false,
    })
  },

  onClear() {
    try {
      const kept = feature.loadNotifications().filter((n) => !n.read)
      wx.setStorageSync('meoo_mp_notifications', kept)
    } catch (_) {}
    this.refresh()
  },
})
