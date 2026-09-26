const training = require('../../../utils/mpTraining.js')

Page({
  data: {
    filter: 'all',
    courses: [],
    shown: [],
    enrolled: [],
    loading: true,
    lecturerStatus: 'none',
    lecturerLabel: '未申请',
  },
  onShow() {
    this.load()
    this.loadProfile()
  },
  async loadProfile() {
    const profile = await training.syncProfile()
    const lecturerStatus = training.lecturerState(profile)
    const lecturerLabel = lecturerStatus === 'approved' ? '已通过' : lecturerStatus === 'pending' ? '审核中' : lecturerStatus === 'rejected' ? '未通过' : profile && profile.lecturerStatus === 'none' ? '未认证' : '未申请'
    this.setData({ lecturerStatus, lecturerLabel })
  },
  async load() {
    this.setData({ loading: true })
    try {
      const courses = await training.listCourses()
      const enrolled = await training.myEnrollments()
      this.setData({ courses, enrolled, loading: false }, () => this.applyFilter())
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
          }
        },
      })
      return
    }
    wx.navigateTo({ url: '/pages/subpack-mine/mine-training-post/mine-training-post' })
  },
})
