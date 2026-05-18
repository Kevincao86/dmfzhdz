const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')

Page({
  data: {
    id: '',
    loading: true,
    err: '',
    view: null,
    applied: false,
  },
  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : ''
    const applied = options && options.applied === '1'
    this.setData({ id, applied })
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
      this.setData({ view, loading: false })
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
  goApply() {
    const v = this.data.view
    if (!v || !this.data.id) return
    const q = [
      `mpId=${encodeURIComponent(this.data.id)}`,
      `merchantOrderNo=${encodeURIComponent(v.merchantOrderNo || '')}`,
      `platform=${encodeURIComponent(v.platform || '抖音')}`,
    ].join('&')
    wx.navigateTo({ url: `/pages/apply/apply?${q}` })
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
})
