const training = require('../../../utils/mpTraining.js')

Page({
  data: { course: null, name: '', contact: '', modePick: 'online', parts: null },
  onLoad(q) {
    this._id = q.id || ''
  },
  async onShow() {
    const list = await training.listCourses()
    const course = (list || []).find((c) => c.id === this._id) || null
    this.setData({
      course,
      parts: course ? training.splitFee(course.fee) : null,
      modePick: course && course.mode === 'offline' ? 'offline' : 'online',
    })
  },
  onName(e) { this.setData({ name: e.detail.value }) },
  onContact(e) { this.setData({ contact: e.detail.value }) },
  onMode(e) { this.setData({ modePick: e.currentTarget.dataset.id }) },
  async onSignup() {
    const name = String(this.data.name || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (this._paying) return
    this._paying = true
    wx.showLoading({ title: '拉起微信支付', mask: true })
    try {
      const pre = await training.prepay({ purpose: 'course', courseId: this._id, name, contact: this.data.contact })
      const payApi = require('../../../utils/mpMembershipApi.js')
      await payApi.requestWxPayment(pre.jsapiParams)
      const q = await training.payQuery(pre.outTradeNo)
      wx.hideLoading()
      if (!q.paid) throw new Error('支付结果确认中，请稍后刷新')
      wx.showToast({ title: '已支付并报名', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.hideLoading()
      const msg = String(e && e.message || '支付未完成')
      if (!/cancel|取消/i.test(msg)) wx.showToast({ title: msg.slice(0, 18), icon: 'none' })
    } finally {
      this._paying = false
    }
  },
})
