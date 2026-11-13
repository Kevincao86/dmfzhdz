const training = require('../../../utils/mpTraining.js')

function hostLabel(role) {
  if (role === 'pr') return 'PR'
  if (role === 'shoot') return '拍摄'
  if (role === 'edit') return '剪辑'
  return '达人'
}

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

function coverOf(course) {
  const list = [course && course.detailCover, course && course.poster, course && course.posterMp]
  return list.find((src) => /^data:image\/|^https?:\/\//i.test(String(src || ''))) || ''
}

function meetingCodeOf(text) {
  const raw = String(text || '')
  const compact = raw.replace(/[\s-]/g, '')
  if (/^\d{9,12}$/.test(compact)) return compact
  const labeled = raw.match(/会议号[:：\s]*([\d\s-]{9,24})/)
  if (!labeled) return ''
  const digits = labeled[1].replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 12 ? digits : ''
}

function meetingPwdOf(text) {
  const found = String(text || '').match(/密码[:：\s]*([A-Za-z0-9]{4,6})/)
  return found ? found[1] : ''
}

function liveOf(course) {
  const url = String((course && course.liveUrl) || '').trim()
  if (!course || course.mode === 'offline') return ''
  return url
}

function liveButtonOf(course) {
  const platform = course && course.livePlatform
  if (platform === 'channels') return '进入视频号直播'
  if (platform === 'douyin') return '进入抖音直播'
  if (platform === 'meeting') return '进入腾讯会议'
  return '进入直播间'
}

function safeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '')
}

function articleBlocks(html) {
  const src = safeHtml(html)
  if (!src.trim()) return []
  const blocks = []
  const re = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi
  let last = 0
  let match = re.exec(src)
  while (match) {
    const before = src.slice(last, match.index).trim()
    if (before) blocks.push({ id: `h${blocks.length}`, type: 'html', html: before })
    const img = String(match[1] || '')
    if (/^https:\/\/[^\s"'<>]+$/i.test(img) || /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(img)) {
      blocks.push({ id: `i${blocks.length}`, type: 'img', src: img })
    }
    last = match.index + match[0].length
    match = re.exec(src)
  }
  const tail = src.slice(last).trim()
  if (tail) blocks.push({ id: `h${blocks.length}`, type: 'html', html: tail })
  return blocks
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
  data: { course: null, cover: '', liveUrl: '', livePlatform: '', liveButton: '进入直播间', modeLabel: '', articleBlocks: [], fields: DEFAULT_FIELDS.map((field) => ({ ...field, value: '' })), modePick: 'online', parts: null, formErr: '', ownCourse: false, hostLabel: '达人' },
  onLoad(q) {
    this._id = q.id || ''
  },
  async onShow() {
    const list = await training.listCourses()
    const course = (list || []).find((c) => c.id === this._id) || null
    const ownCourse = training.isOwnCourse(course)
    const offline = course && course.mode === 'offline'
    this.setData({
      course,
      cover: coverOf(course),
      liveUrl: liveOf(course),
      livePlatform: (course && course.livePlatform) || '',
      liveButton: liveButtonOf(course),
      modeLabel: offline ? `线下${course && course.city ? ' · ' + course.city : ''}` : '线上 · 全国',
      articleBlocks: articleBlocks(course && course.detailBody),
      ownCourse,
      hostLabel: hostLabel(course && course.hostRole),
      fields: fieldsFrom(course),
      formErr: ownCourse ? '这是你发布的课程，不能报名自己的课。其他人发布的课程可以报名。' : '',
      parts: null,
      modePick: offline ? 'offline' : 'online',
    })
  },
  onLive() {
    const raw = String(this.data.liveUrl || '').trim()
    const platform = this.data.livePlatform || ''
    if (!raw) return
    if (platform === 'meeting' || (!platform && /meeting\.tencent\.com/i.test(raw))) {
      const code = meetingCodeOf(raw)
      const pwd = meetingPwdOf(raw)
      const path = `pages/index/index?chn=Lingqi${code ? `&code=${code}` : ''}${pwd ? `&pwd=${encodeURIComponent(pwd)}` : ''}`
      wx.navigateToMiniProgram({
        appId: 'wx33fd6cdc62520063',
        path,
        fail: (err) => {
          if (/cancel|取消/i.test(String(err && err.errMsg || ''))) return
          this.copyLive(raw, '进入腾讯会议', '没有打开腾讯会议，内容已复制。')
        },
      })
      return
    }
    if (platform === 'channels') {
      const id = (raw.match(/sph[a-zA-Z0-9_-]{3,}/) || [])[0]
      if (!id || !wx.openChannelsLive) {
        this.copyLive(raw, '视频号直播', '当前微信不能打开视频号，ID 已复制。')
        return
      }
      wx.openChannelsLive({
        finderUserName: id,
        fail: (err) => {
          if (/cancel|取消/i.test(String(err && err.errMsg || ''))) return
          this.copyLive(id, '视频号直播', '微信没有打开这个视频号。需要和本小程序关联主体后才能跳转，ID 已复制。')
        },
      })
      return
    }
    this.copyLive(raw, platform === 'douyin' ? '抖音直播' : '进入直播间', platform === 'douyin' ? '链接已复制。微信里不能直接打开抖音，请到抖音粘贴进入。' : '链接已复制。请到对应 App 或浏览器打开。')
  },
  copyLive(data, title, content) {
    wx.setClipboardData({
      data: String(data || ''),
      success: () => wx.showModal({ title, content, showCancel: false }),
    })
  },
  onField(e) {
    const key = e.currentTarget.dataset.key
    const fields = (this.data.fields || []).map((field) => (field.key === key ? { ...field, value: e.detail.value } : field))
    this.setData({ fields, formErr: '' })
  },
  async onSignup() {
    if (this.data.ownCourse) {
      this.setData({ formErr: '不能报名自己发布的课程。其他人发布的课程可以报名。' })
      return
    }
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
