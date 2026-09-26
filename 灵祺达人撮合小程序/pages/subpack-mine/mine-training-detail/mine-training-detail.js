const training = require('../../../utils/mpTraining.js')

const DEFAULT_FIELDS = [
  { key: 'name', label: '姓名', kind: 'name' },
  { key: 'idNo', label: '身份证号', kind: 'idNo' },
  { key: 'phone', label: '手机号', kind: 'phone' },
]

function fieldsFrom(course) {
  const raw = course && Array.isArray(course.signupFields) && course.signupFields.length ? course.signupFields : DEFAULT_FIELDS
  return raw.map((field) => ({
    key: field.key,
    label: field.label || '资料',
    kind: field.kind || 'text',
    value: '',
  }))
}

function fieldError(fields) {
  for (const field of fields || []) {
    const value = String(field.value || '').trim()
    if (!value) return `请填写${field.label}`
    if (field.kind === 'idNo' && !/^(\d{15}|\d{17}[\dXx])$/.test(value)) return '请填写正确的身份证号'
    if (field.kind === 'phone' && !/^1\d{10}$/.test(value)) return '请填写正确的手机号'
  }
  return ''
}

Page({
  data: { course: null, fields: DEFAULT_FIELDS.map((field) => ({ ...field, value: '' })), modePick: 'online', parts: null, formErr: '' },
  onLoad(q) {
    this._id = q.id || ''
  },
  async onShow() {
    const list = await training.listCourses()
    const course = (list || []).find((c) => c.id === this._id) || null
    this.setData({
      course,
      fields: fieldsFrom(course),
      formErr: '',
      parts: course ? training.splitFee(course.fee) : null,
      modePick: course && course.mode === 'offline' ? 'offline' : 'online',
    })
  },
  onField(e) {
    const key = e.currentTarget.dataset.key
    const fields = (this.data.fields || []).map((field) => (field.key === key ? { ...field, value: e.detail.value } : field))
    this.setData({ fields, formErr: '' })
  },
  onMode(e) { this.setData({ modePick: e.currentTarget.dataset.id }) },
  async onSignup() {
    const reason = fieldError(this.data.fields)
    if (reason) {
      this.setData({ formErr: reason })
      return
    }
    if (this._paying) return
    this._paying = true
    const answers = {}
    for (const field of this.data.fields) answers[field.key] = String(field.value || '').trim()
    wx.showLoading({ title: '拉起微信支付', mask: true })
    try {
      const pre = await training.prepay({
        purpose: 'course',
        courseId: this._id,
        name: answers.name || '',
        contact: answers.phone || '',
        answers,
      })
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
      if (!/cancel|取消/i.test(msg)) this.setData({ formErr: msg })
    } finally {
      this._paying = false
    }
  },
})
