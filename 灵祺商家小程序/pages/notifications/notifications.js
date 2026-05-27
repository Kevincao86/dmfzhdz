const api = require('../../utils/api.js')
const feature = require('../../utils/merchantFeatureMp.js')

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const m = d.getMonth() + 1
    const day = d.getDate()
    const h = d.getHours()
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${m}/${day} ${h}:${min}`
  } catch (_) {
    return iso
  }
}

Page({
  data: { items: [] },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.refresh()
    if (!feature.loadNotifications().length) {
      feature.pushNotification({
        title: '欢迎使用灵祺商家小程序',
        body: '评论、招募、财务等动态将在此展示；与商家后台同一账号。',
      })
      this.refresh()
    }
  },
  refresh() {
    const items = feature.loadNotifications().map((n) => ({
      ...n,
      timeLabel: formatTime(n.time),
    }))
    this.setData({ items })
  },
  onClear() {
    try {
      const kept = feature.loadNotifications().filter((n) => !n.read)
      wx.setStorageSync('meoo_mp_notifications', kept)
    } catch (_) {}
    this.refresh()
  },
})
