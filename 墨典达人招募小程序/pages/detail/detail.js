const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')

const PLATFORMS = ['抖音', '小红书']
const DOUYIN_LEVELS = ['LV0', 'LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6', 'LV7', '暂无等级']

Page({
  data: {
    id: '',
    loading: true,
    err: '',
    view: null,
    showApply: false,
    platforms: PLATFORMS,
    douyinLevels: DOUYIN_LEVELS,
    platformIndex: 0,
    platform: '抖音',
    platformAccount: '',
    platformNickname: '',
    followers: '',
    douyinSalesLevel: '',
    douyinLevelIndex: 0,
    contact: '',
    wechatId: '',
    quotePrice: '',
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    alipayAccount: '',
    submitting: false,
    applied: false,
  },
  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : ''
    this.setData({ id })
    if (id) this.loadOrder(id)
    else this.setData({ loading: false, err: '缺少招募单号' })
  },
  onShareAppMessage() {
    const v = this.data.view
    return {
      title: v ? v.title : '墨典达人招募',
      path: `/pages/detail/detail?id=${encodeURIComponent(this.data.id)}`,
    }
  },
  async loadOrder(id) {
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, err: '未配置后台地址' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const list = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const mp = list.find((o) => o && o.id === id)
      if (!mp) {
        this.setData({ loading: false, err: '招募单不存在或已结束' })
        return
      }
      if (mp.status === 'closed' || mp.status === 'done') {
        this.setData({ loading: false, err: '该招募已结束' })
        return
      }
      const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
      const view = display.enrichMpOrder(mp, merchantOrder)
      const pIdx = Math.max(0, PLATFORMS.indexOf(view.platform || '抖音'))
      this.setData({
        view,
        loading: false,
        platform: PLATFORMS[pIdx] || '抖音',
        platformIndex: pIdx >= 0 ? pIdx : 0,
      })
    } catch (e) {
      const msg = String(e.message || e)
      const hint = msg.includes('fail')
        ? '无法加载订单，请确认 dev 服务已启动且已勾选「不校验合法域名」'
        : msg
      this.setData({ loading: false, err: hint })
    }
  },
  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },
  scrollToApply() {
    this.setData({ showApply: true })
    wx.pageScrollTo({ selector: '#apply-block', duration: 300 })
  },
  copyTask() {
    const v = this.data.view
    if (!v) return
    wx.setClipboardData({
      data: v.taskDetail || '',
      success: () => wx.showToast({ title: '已复制任务详情', icon: 'success' }),
    })
  },
  copyOrderNo() {
    const v = this.data.view
    if (!v) return
    wx.setClipboardData({
      data: v.merchantOrderNo || '',
      success: () => wx.showToast({ title: '已复制订单号', icon: 'success' }),
    })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [k]: e.detail.value })
  },
  onPlatformChange(e) {
    const i = Number(e.detail.value)
    this.setData({
      platformIndex: i,
      platform: PLATFORMS[i] || '抖音',
    })
  },
  onDouyinLevelChange(e) {
    const i = Number(e.detail.value)
    this.setData({
      douyinLevelIndex: i,
      douyinSalesLevel: DOUYIN_LEVELS[i] || '',
    })
  },
  onVisitDateChange(e) {
    this.setData({ visitDate: e.detail.value })
  },
  onVisitTimeStartChange(e) {
    this.setData({ visitTimeStart: e.detail.value })
  },
  onVisitTimeEndChange(e) {
    this.setData({ visitTimeEnd: e.detail.value })
  },
  validateForm() {
    const platformAccount = String(this.data.platformAccount || '').trim()
    const platformNickname = String(this.data.platformNickname || '').trim()
    const contact = String(this.data.contact || '').trim()
    const wechatId = String(this.data.wechatId || '').trim()
    const quotePrice = String(this.data.quotePrice || '').trim()
    const visitDate = String(this.data.visitDate || '').trim()
    const visitTimeStart = String(this.data.visitTimeStart || '').trim()
    const visitTimeEnd = String(this.data.visitTimeEnd || '').trim()
    const alipayAccount = String(this.data.alipayAccount || '').trim()

    if (!platformAccount) return '请填写抖音/小红书号'
    if (!platformNickname) return '请填写抖音/小红书昵称'
    const followers = Number.parseInt(String(this.data.followers || '').replace(/,/g, ''), 10)
    if (!Number.isFinite(followers) || followers <= 0) return '请填写有效粉丝数'
    if (this.data.platform === '抖音' && !String(this.data.douyinSalesLevel || '').trim()) {
      return '请选择抖音带货等级'
    }
    if (!contact) return '请填写联系方式'
    if (!wechatId) return '请填写微信号'
    if (!quotePrice) return '请填写报价'
    if (!visitDate || !visitTimeStart || !visitTimeEnd) return '请选择探店日期与时间段'
    if (visitTimeStart >= visitTimeEnd) return '探店结束时间须晚于开始时间'
    if (!alipayAccount) return '请填写支付宝账号'

    return null
  },
  async onSubmit() {
    const errMsg = this.validateForm()
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' })
      return
    }

    const platformNickname = String(this.data.platformNickname || '').trim()
    const visitTimeSlot = `${this.data.visitDate} ${this.data.visitTimeStart}-${this.data.visitTimeEnd}`
    let followers = Number.parseInt(String(this.data.followers || '').replace(/,/g, ''), 10)

    this.setData({ submitting: true })
    try {
      const applicant = {
        id: `app-${Date.now()}`,
        name: platformNickname,
        platform: this.data.platform,
        platformAccount: String(this.data.platformAccount || '').trim(),
        platformNickname,
        followers: Math.max(0, followers),
        douyinSalesLevel:
          this.data.platform === '抖音' ? String(this.data.douyinSalesLevel || '').trim() : undefined,
        contact: String(this.data.contact || '').trim(),
        wechatId: String(this.data.wechatId || '').trim(),
        quotePrice: String(this.data.quotePrice || '').trim(),
        visitTimeSlot,
        alipayAccount: String(this.data.alipayAccount || '').trim(),
        appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      }
      await ops.applyToMpOrder(this.data.id, applicant)
      this.setData({ applied: true, submitting: false, showApply: true })
      wx.showToast({ title: '报名成功', icon: 'success' })
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: String(e.message || e).slice(0, 40), icon: 'none' })
    }
  },
})
