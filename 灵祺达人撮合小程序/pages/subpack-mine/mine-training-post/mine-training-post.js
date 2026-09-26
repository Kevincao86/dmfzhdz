const training = require('../../../utils/mpTraining.js')

function blankForm() {
  return { editingId: '', title: '', mode: 'offline', city: '', whenText: '', seats: '20', fee: '', poster: '', note: '' }
}

function statusText(course) {
  if (course.reviewStatus === 'rejected') return '未通过'
  if (course.reviewStatus === 'pending') return '审核中'
  return '已通过'
}

Page({
  data: {
    view: 'list',
    depositOnly: false,
    paid: false,
    yuan: training.DEPOSIT_YUAN,
    advanced: false,
    loading: true,
    mine: [],
    ...blankForm(),
  },
  onLoad(q) {
    this.setData({
      depositOnly: q.deposit === '1',
      paid: training.depositPaid(),
      advanced: training.isAdvancedMember(),
    })
  },
  async onShow() {
    let paid = training.depositPaid()
    try { paid = await training.syncDeposit() } catch (_) {}
    this.setData({
      paid,
      advanced: training.isAdvancedMember(),
    })
    if (this.data.view !== 'form') this.loadMine()
  },
  async loadMine() {
    this.setData({ loading: true })
    try {
      const mine = await training.listMine()
      this.setData({
        loading: false,
        mine: (mine || []).map((c) => ({
          ...c,
          statusText: statusText(c),
          statusKey: c.reviewStatus === 'rejected' || c.reviewStatus === 'pending' ? c.reviewStatus : 'approved',
          modeText: c.mode === 'offline' ? '线下' : '线上',
        })),
      })
    } catch (e) {
      this.setData({ loading: false })
    }
  },
  onOpenMember() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
  },
  async onPayDeposit() {
    if (!training.isAdvancedMember()) {
      this.onOpenMember()
      return
    }
    if (this._paying) return
    this._paying = true
    wx.showLoading({ title: '拉起微信支付', mask: true })
    try {
      const pre = await training.prepay({ purpose: 'deposit' })
      const payApi = require('../../../utils/mpMembershipApi.js')
      await payApi.requestWxPayment(pre.jsapiParams)
      const q = await training.payQuery(pre.outTradeNo)
      wx.hideLoading()
      if (!q.paid) throw new Error('支付结果确认中，请稍后下拉刷新')
      this.setData({ paid: true, depositOnly: false })
      wx.showToast({ title: '保证金已支付', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      const msg = String(e && e.message || '支付未完成')
      if (!/cancel|取消/i.test(msg)) wx.showToast({ title: msg.slice(0, 18), icon: 'none' })
    } finally {
      this._paying = false
    }
  },
  onCreate() {
    const reason = training.publishBlockReason()
    if (reason) {
      wx.showToast({ title: reason.slice(0, 18), icon: 'none' })
      return
    }
    this.setData({ view: 'form', ...blankForm() })
    wx.setNavigationBarTitle({ title: '新增培训' })
  },
  onEdit(e) {
    const course = (this.data.mine || []).find((c) => c.id === e.currentTarget.dataset.id)
    if (!course) return
    this.setData({
      view: 'form',
      editingId: course.id,
      title: course.title || '',
      mode: course.mode === 'online' ? 'online' : 'offline',
      city: course.city || '',
      whenText: course.whenText || '',
      seats: String(course.seats || 20),
      fee: course.fee || '',
      poster: course.poster || '',
      note: course.note || '',
    })
    wx.setNavigationBarTitle({ title: '编辑培训' })
  },
  onBack() {
    this.setData({ view: 'list', ...blankForm() })
    wx.setNavigationBarTitle({ title: '发布培训' })
    this.loadMine()
  },
  onTitle(e) { this.setData({ title: e.detail.value }) },
  onCity(e) { this.setData({ city: e.detail.value }) },
  onWhen(e) { this.setData({ whenText: e.detail.value }) },
  onSeats(e) { this.setData({ seats: e.detail.value }) },
  onFee(e) { this.setData({ fee: e.detail.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },
  onMode(e) { this.setData({ mode: e.currentTarget.dataset.id }) },
  onPoster() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const path = (res.tempFilePaths || [])[0]
        if (!path) return
        const finish = (filePath) => {
          wx.getFileSystemManager().readFile({
            filePath,
            encoding: 'base64',
            success: (file) => this.setData({ poster: `data:image/jpeg;base64,${file.data}` }),
            fail: () => wx.showToast({ title: '海报读取失败', icon: 'none' }),
          })
        }
        if (wx.compressImage) {
          wx.compressImage({ src: path, quality: 60, success: (c) => finish(c.tempFilePath || path), fail: () => finish(path) })
        } else {
          finish(path)
        }
      },
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
    if (!String(this.data.poster || '').startsWith('data:image/')) {
      wx.showToast({ title: '请上传宣传海报', icon: 'none' })
      return
    }
    wx.showLoading({ title: '提交中', mask: true })
    try {
      if (this.data.editingId) await training.updateCourse(this.data)
      else await training.createCourse(this.data)
      wx.hideLoading()
      wx.showToast({ title: '已提交审核', icon: 'success' })
      this.setData({ view: 'list', ...blankForm() })
      wx.setNavigationBarTitle({ title: '发布培训' })
      this.loadMine()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: String(e.message || '提交失败').slice(0, 18), icon: 'none' })
    }
  },
})
