const api = require('../../utils/api.js')
const listing = require('../../utils/productListingMp.js')
const { requestVoiceDraft } = require('../../utils/voiceDraft.js')
const { optimizeVoiceProductDraft } = require('../../utils/productVoiceAiMp.js')
const {
  selectablePlatformRows,
  findPlatformOption,
} = require('../../utils/productCreatePlatformsMp.js')

function withShortHint(rows) {
  return rows.map((p) => ({
    ...p,
    status: p.comingSoon ? '暂未开放' : p.selectable ? '已接通' : '未绑定',
  }))
}

function platformName(id) {
  const o = findPlatformOption(id)
  return o ? o.name : id
}

Page({
  data: {
    phase: 'platform',
    groupbuyRows: [],
    waimaiRows: [],
    platformId: '',
    platformLabel: '',
    recording: false,
    busy: false,
    requiredOk: false,
    title: '',
    priceYuan: '',
    description: '',
    subtitle: '',
    tags: '',
    originYuan: '',
    rawText: '',
    aiNote: '',
    publishTip: '',
  },

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.setData({
      groupbuyRows: withShortHint(selectablePlatformRows('groupbuy')),
      waimaiRows: withShortHint(selectablePlatformRows('waimai')),
    })
  },

  onLoad() {
    this.rm = wx.getRecorderManager()
    this.rm.onStop((res) => {
      this.setData({ recording: false })
      void this.processFile(res.tempFilePath)
    })
    this.rm.onError(() => {
      wx.showToast({ title: '录音失败', icon: 'none' })
      this.setData({ recording: false })
    })
  },

  onPickPlatform(e) {
    const id = e.currentTarget.dataset.id
    const hit = [...(this.data.groupbuyRows || []), ...(this.data.waimaiRows || [])].find((x) => x.id === id)
    if (!hit || !hit.selectable) {
      wx.showToast({ title: hit && hit.comingSoon ? '即将支持' : '请先绑定该平台', icon: 'none' })
      return
    }
    this.setData({ platformId: id, platformLabel: platformName(id) })
  },

  onConfirmPlatform() {
    if (!this.data.platformId) {
      wx.showToast({ title: '请先选择要上架的平台', icon: 'none' })
      return
    }
    this.setData({ phase: 'record' })
  },

  toggleRecord() {
    if (this.data.busy) return
    if (!this.data.platformId) {
      wx.showToast({ title: '请先选择平台', icon: 'none' })
      this.setData({ phase: 'platform' })
      return
    }
    if (!this.data.recording) {
      this.setData({ recording: true })
      this.rm.start({ format: 'mp3', sampleRate: 16000 })
    } else {
      this.rm.stop()
    }
  },

  async processFile(tempFilePath) {
    this.setData({ busy: true })
    wx.showLoading({ title: '识别中…', mask: true })
    try {
      const draft = await requestVoiceDraft('product', tempFilePath)
      wx.hideLoading()
      wx.showLoading({ title: 'AI 优化选填…', mask: true })
      const opt = await optimizeVoiceProductDraft(draft, this.data.platformLabel)
      this.setData({
        phase: 'confirm',
        title: opt.title,
        priceYuan: opt.priceYuan,
        description: opt.description,
        subtitle: opt.subtitle,
        tags: opt.tags,
        originYuan: opt.originYuan,
        rawText: opt.rawText,
        aiNote: opt.aiNote,
        requiredOk: false,
        publishTip: '',
      })
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '生成草稿失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },

  async useMock() {
    if (!this.data.platformId) {
      wx.showToast({ title: '请先选择平台', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    wx.showLoading({ title: 'AI 优化选填…', mask: true })
    try {
      const draft = await requestVoiceDraft('product', 'mock')
      const opt = await optimizeVoiceProductDraft(draft, this.data.platformLabel)
      this.setData({
        phase: 'confirm',
        title: opt.title,
        priceYuan: opt.priceYuan,
        description: opt.description,
        subtitle: opt.subtitle,
        tags: opt.tags,
        originYuan: opt.originYuan,
        rawText: opt.rawText,
        aiNote: opt.aiNote,
        requiredOk: false,
      })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },

  onField(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    this.setData({ [k]: e.detail.value })
  },

  onToggleRequiredOk() {
    this.setData({ requiredOk: !this.data.requiredOk })
  },

  onBackRecord() {
    this.setData({ phase: 'record', requiredOk: false })
  },

  onBackPlatform() {
    this.setData({ phase: 'platform', recording: false })
  },

  async onPublish() {
    const title = String(this.data.title || '').trim()
    const price = Number.parseFloat(this.data.priceYuan)
    if (!title) {
      wx.showToast({ title: '请确认商品名称', icon: 'none' })
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      wx.showToast({ title: '请确认有效售价', icon: 'none' })
      return
    }
    if (!this.data.requiredOk) {
      wx.showToast({ title: '请先勾选确认必填信息', icon: 'none' })
      return
    }
    const platform = this.data.platformId
    const desc = String(this.data.description || this.data.subtitle || '').trim()
    const payload = {
      platformId: platform,
      title,
      priceYuan: price,
      description: desc,
      originYuan: String(this.data.originYuan || '').trim(),
      tags: this.data.tags,
    }

    if (platform === 'douyin') {
      try {
        wx.setStorageSync('meoo_voice_product_pending', payload)
      } catch (_) {}
      wx.navigateTo({ url: '/pages/product-create/product-create' })
      return
    }

    this.setData({ busy: true, publishTip: '' })
    const r = await listing.postPlatformProductDraft(platform, {
      title,
      priceYuan: price,
      description: desc || undefined,
    })
    this.setData({ busy: false })
    if (!r.ok) {
      wx.showModal({ title: '上架失败', content: r.message, showCancel: false })
      return
    }
    const msg = r.draftId ? `已提交至${this.data.platformLabel}（草稿 ${r.draftId}）` : r.message || '已提交'
    wx.showModal({
      title: '已提交平台',
      content: msg,
      showCancel: false,
      success() {
        wx.navigateBack({ delta: 1 })
      },
    })
  },
})
