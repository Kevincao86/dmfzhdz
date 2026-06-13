const orderFavorites = require('../../utils/orderFavorites.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const orderCard = require('../../utils/recruitmentOrderCard.js')
const api = require('../../utils/api.js')
const auth = require('../../utils/auth.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

Page({
  data: {
    rows: [],
    loading: true,
  },
  onShow() {
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin('/pages/mine-favorites/mine-favorites')
      return
    }
    this.load()
  },
  async load() {
    const ids = [...orderFavorites.readIdSet()]
    if (!ids.length) {
      this.setData({ rows: [], loading: false })
      return
    }
    this.setData({ loading: true })
    if (!api.hasApi()) {
      const rows = ids.map((id) => ({
        id,
        title: id,
        missing: true,
        platformIcon: '/images/platforms/douyin.png',
      }))
      this.setData({ rows, loading: false })
      return
    }
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: ids, includeLocalContext: true })
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const rows = ids.map((id) => {
        const mp = mpList.find((o) => o && String(o.id) === String(id))
        if (!mp) {
          return {
            id,
            title: id,
            missing: true,
            platformIcon: '/images/platforms/douyin.png',
          }
        }
        return orderCard.mapMpOrderRow(mp, reg)
      })
      this.setData({ rows, loading: false })
    } catch (e) {
      console.warn('[mine-favorites] load', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },
  onUnfavorite(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    orderFavorites.toggleFavorite(id)
    const rows = this.data.rows.filter((r) => r && r.id !== id)
    this.setData({ rows })
    wx.showToast({ title: '已取消收藏', icon: 'none' })
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    const missing = e.currentTarget.dataset.missing
    if (!id) return
    if (missing) {
      wx.showToast({ title: '商单已结束', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
