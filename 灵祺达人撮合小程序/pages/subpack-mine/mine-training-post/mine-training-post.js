const training = require('../../../utils/mpTraining.js')

Page({
  data: {
    depositOnly: false,
    paid: false,
    yuan: training.DEPOSIT_YUAN,
    advanced: false,
    title: '',
    mode: 'offline',
    city: '',
    whenText: '',
    seats: '20',
    fee: '',
    poster: '',
  },
  onLoad(q) {
    this.setData({
      depositOnly: q.deposit === '1',
      paid: training.depositPaid(),
      advanced: training.isAdvancedMember(),
    })
  },
  onPayDeposit() {
    if (!training.isAdvancedMember()) {
      wx.showModal({
        title: '请先开通高级会员',
        content: '专业版、旗舰版或企业版开通后，才能缴纳保证金并发布培训。',
        confirmText: '去开通',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
        },
      })
      return
    }
    wx.showModal({
      title: `缴纳保证金 ¥${training.DEPOSIT_YUAN}`,
      content: '保证金用于培训履约。课时费由你和学员自行结算，平台不代收。',
      confirmText: '确认缴纳',
      success: (res) => {
        if (!res.confirm) return
        training.markDepositPaid()
        this.setData({ paid: true, depositOnly: false })
        wx.showToast({ title: '保证金已记录', icon: 'success' })
      },
    })
  },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onCity(e) { this.setData({ city: e.detail.value }) },
  onWhen(e) { this.setData({ whenText: e.detail.value }) },
  onSeats(e) { this.setData({ seats: e.detail.value }) },
  onFee(e) { this.setData({ fee: e.detail.value }) },
  onMode(e) { this.setData({ mode: e.currentTarget.dataset.id }) },
  onPoster() {
    wx.chooseImage({
      count: 1,
      success: (res) => this.setData({ poster: (res.tempFilePaths || [])[0] || '' }),
    })
  },
  async onSubmit() {
    const reason = training.publishBlockReason()
    if (reason) {
      wx.showToast({ title: reason.slice(0, 18), icon: 'none' })
      return
    }
    if (!String(this.data.title || '').trim()) {
      wx.showToast({ title: '请填写课程名称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发布中', mask: true })
    try {
      await training.createCourse(this.data)
      wx.hideLoading()
      wx.showToast({ title: '已发布', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: String(e.message || '发布失败').slice(0, 18), icon: 'none' })
    }
  },
})
