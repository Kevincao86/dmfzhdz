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
    try {
      await training.signup(this._id, name, this.data.contact)
      wx.showToast({ title: '已报名', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.showToast({ title: String(e.message || '报名失败').slice(0, 18), icon: 'none' })
    }
  },
})
