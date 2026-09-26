const training = require('../../../utils/mpTraining.js')

Page({
  data: {
    filter: 'all',
    courses: [],
    shown: [],
    loading: true,
    lecturerStatus: 'none',
    lecturerLabel: '未申请',
    payoutLabel: '待开通',
  },
  onShow() {
    this.load()
    this.loadProfile()
  },
  async loadProfile() {
    const profile = await training.syncProfile()
    const lecturerStatus = training.lecturerState(profile)
    const lecturerLabel = lecturerStatus === 'approved' ? '已通过' : lecturerStatus === 'pending' ? '审核中' : lecturerStatus === 'rejected' ? '未通过' : profile && profile.lecturerStatus === 'none' ? '未认证' : '未申请'
    const payoutLabel = lecturerStatus !== 'approved' ? '待开通' : profile && profile.bankNo ? '已认证' : '未填写'
    this.setData({ lecturerStatus, lecturerLabel, payoutLabel })
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
  onApply() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=apply' })
  },
  onAccount() {
    if (this.data.lecturerStatus !== 'approved') {
      wx.showModal({
        title: '请先申请讲师',
        content: '讲师申请审核通过后，才能填写收款认证。',
        confirmText: '去申请',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=apply' })
          }
        },
      })
      return
    }
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=payout' })
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
        confirmText: reason.indexOf('会员') >= 0 ? '去开通' : reason.indexOf('保证金') >= 0 ? '去缴纳' : reason.indexOf('审核中') >= 0 ? '知道了' : '去填写',
        success: (res) => {
          if (!res.confirm) return
          if (reason.indexOf('会员') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
          } else if (reason.indexOf('保证金') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-wallet/mine-wallet' })
          } else if (reason.indexOf('审核中') >= 0) {
            return
          } else if (reason.indexOf('讲师') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=apply' })
          } else if (reason.indexOf('认证') >= 0) {
            wx.navigateTo({ url: '/pages/subpack-mine/mine-training-account/mine-training-account?mode=payout' })
          }
        },
      })
      return
    }
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-post/mine-training-post' })
  },
})
