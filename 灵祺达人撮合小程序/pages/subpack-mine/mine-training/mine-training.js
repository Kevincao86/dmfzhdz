const training = require('../../../utils/mpTraining.js')

Page({
  data: {
    filter: 'all',
    courses: [],
    shown: [],
    loading: true,
  },
  onShow() {
    this.load()
  },
  async load() {
    this.setData({ loading: true })
    try {
      const courses = await training.listCourses()
      this.setData({ courses, loading: false }, () => this.applyFilter())
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },
  applyFilter() {
    const f = this.data.filter
    const shown = (this.data.courses || []).filter((c) => f === 'all' || c.mode === f)
    this.setData({ shown })
  },
  onFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.id }, () => this.applyFilter())
  },
  onOpen(e) {
    wx.navigateTo({
      url: `/pages/subpack-mine/mine-training-detail/mine-training-detail?id=${e.currentTarget.dataset.id}`,
    })
  },
  onAccount() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account' })
  },
  onSettle() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-settle/mine-training-settle' })
  },
  onPost() {
    const reason = training.publishBlockReason()
    if (reason) {
      wx.showModal({
        title: '还不能发布',
        content: reason + (reason.indexOf('保证金') >= 0 ? `（¥${training.DEPOSIT_YUAN}）` : ''),
        confirmText: reason.indexOf('会员') >= 0 ? '去开通' : reason.indexOf('保证金') >= 0 ? '去缴纳' : '知道了',
        success: (res) => {
          if (!res.confirm) return
          if (reason.indexOf('会员') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
          } else if (reason.indexOf('保证金') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-training-post/mine-training-post?deposit=1' })
          } else if (reason.indexOf('认证') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account' })
          }
        },
      })
      return
    }
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-post/mine-training-post' })
  },
})
