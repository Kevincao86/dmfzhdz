const api = require('../../utils/api.js')
const briefAi = require('../../utils/viralBriefMp.js')
const points = require('../../utils/erpPointsSpendMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')

Page({
  data: {
    platformOptions: briefAi.PLATFORM_OPTIONS,
    styleOptions: briefAi.STYLE_OPTIONS,
    platform: 'douyin',
    style: 'review',
    copyMode: false,
    title: '',
    category: '',
    region: '',
    content: '',
    extraHint: '',
    busy: false,
    progress: '',
    err: '',
    pointsTip: '',
    affordHint: '',
    result: null,
    resultMd: '',
    briefPoints: economics.MP_POINTS_BRIEF_PER_USE,
  },

  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },

  onPlatform(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ platform: id, copyMode: briefAi.isCopyManuscriptPlatform(id) })
  },

  onStyle(e) {
    const id = e.currentTarget.dataset.id
    if (id) this.setData({ style: id })
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },
  onCategory(e) {
    this.setData({ category: e.detail.value })
  },
  onRegion(e) {
    this.setData({ region: e.detail.value })
  },
  onContent(e) {
    this.setData({ content: e.detail.value })
  },
  onExtra(e) {
    this.setData({ extraHint: e.detail.value })
  },

  goRecharge() {
    wx.navigateTo({ url: '/pages/wallet/wallet' }).catch(() => {
      wx.showToast({ title: '请在「我的」充值积分', icon: 'none' })
    })
  },

  async onGenerate() {
    const title = String(this.data.title || '').trim()
    const content = String(this.data.content || '').trim()
    if (title.length < 2 || content.length < 8) {
      wx.showToast({ title: '标题至少 2 字，需求描述至少 8 字', icon: 'none' })
      return
    }
    this.setData({ busy: true, err: '', progress: '校验积分…', result: null, resultMd: '' })
    try {
      const afford = await points.checkAddonPointsAffordable('brief')
      if (!afford.ok) {
        this.setData({ busy: false, err: afford.message, affordHint: afford.message, progress: '' })
        wx.showModal({
          title: '积分不足',
          content: afford.message,
          confirmText: '去充值',
          success: (res) => {
            if (res.confirm) this.goRecharge()
          },
        })
        return
      }
      this.setData({ progress: '正在生成 Brief 文字版…' })
      const r = await briefAi.generateViralBriefText({
        source: {
          title,
          category: String(this.data.category || '').trim(),
          region: String(this.data.region || '').trim(),
          content,
        },
        platform: this.data.platform,
        style: this.data.style,
        extraHint: this.data.extraHint,
      })
      if (!r.ok) {
        this.setData({ busy: false, err: r.message || '生成失败', progress: '' })
        return
      }
      const spend = await points.spendAddonPoints({
        kind: 'brief',
        idempotencyKey: `erp-brief-${Date.now()}`,
        note: `爆款Brief:${title.slice(0, 24)}`,
      })
      let pointsTip = `已扣 ${spend.pointsCharged || economics.MP_POINTS_BRIEF_PER_USE} 积分`
      if (spend.balance != null) pointsTip += ` · 余额 ${spend.balance}`
      this.setData({
        busy: false,
        progress: '',
        result: r.result,
        resultMd: r.result.fullMarkdown || '',
        pointsTip,
      })
    } catch (e) {
      this.setData({
        busy: false,
        progress: '',
        err: briefAi.formatBriefUserError((e && e.message) || e),
      })
    }
  },

  copyMd() {
    const t = this.data.resultMd
    if (!t) return
    wx.setClipboardData({ data: t })
  },

  copyBlock(e) {
    const t = String(e.currentTarget.dataset.text || '')
    if (!t) return
    wx.setClipboardData({ data: t })
  },
})
