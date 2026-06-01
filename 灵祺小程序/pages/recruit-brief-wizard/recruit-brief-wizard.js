const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const industryMp = require('../../utils/recruitmentIndustryMp.js')
const briefAi = require('../../utils/recruitmentBriefAiMp.js')
const briefStore = require('../../utils/kolBriefStorageMp.js')

const PLATFORMS = [
  { key: 'douyin_laike', label: '抖音来客', sub: '与来客商品联动，AI Brief 链路最完整' },
  { key: 'meituan', label: '美团点评', sub: '以手工填写商品信息与标签为准' },
  { key: 'xiaohongshu', label: '小红书', sub: '以手工填写商品信息与标签为准' },
  { key: 'jd_local', label: '京东本地生活', sub: '以手工填写商品信息与标签为准' },
]

function fmtNow() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

Page({
  data: {
    step: 1,
    stepLabels: ['选择平台', '选择商品', '生成结果'],
    platforms: PLATFORMS,
    selectedKey: 'douyin_laike',

    industryOptions: industryMp.FALLBACK,
    industryIndex: 0,
    mainName: '',
    mainPrice: '',
    secName: '',
    secPrice: '',
    tagsComma: '',
    storeName: '',

    generating: false,
    previews: ['', '', ''],
    errMsg: '',
  },

  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },

  async onLoad() {
    const opts = await industryMp.loadIndustryL1Labels()
    if (opts && opts.length) this.setData({ industryOptions: opts })
  },

  goHub() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-hub/recruit-hub' }) })
  },

  pickPlat(e) {
    const key = String(e.currentTarget.dataset.k || '').trim()
    if (!key) return
    this.setData({ selectedKey: key })
  },

  onIndustryPick(e) {
    const i = Number(e.detail.value) || 0
    this.setData({ industryIndex: i })
  },

  bindMainName(e) {
    this.setData({ mainName: e.detail.value })
  },
  bindMainPrice(e) {
    this.setData({ mainPrice: e.detail.value })
  },
  bindSecName(e) {
    this.setData({ secName: e.detail.value })
  },
  bindSecPrice(e) {
    this.setData({ secPrice: e.detail.value })
  },
  bindTags(e) {
    this.setData({ tagsComma: e.detail.value })
  },
  bindStore(e) {
    this.setData({ storeName: e.detail.value })
  },

  tapNext1() {
    this.setData({ step: 2, errMsg: '' })
  },

  tapBack2() {
    this.setData({ step: 1 })
  },

  tapBack3() {
    this.setData({ step: 2 })
  },

  parseTags() {
    const raw = String(this.data.tagsComma || '').trim()
    return raw.split(/[,，、\s]/g).map((s) => s.trim()).filter(Boolean).slice(0, 14)
  },

  validateStep2() {
    const industry = String(this.data.industryOptions[this.data.industryIndex] || '')
    const mainName = String(this.data.mainName || '').trim()
    const mainPrice = Number.parseFloat(String(this.data.mainPrice || ''))
    if (!mainName) {
      wx.showToast({ title: '请填写主推商品名称', icon: 'none' })
      return false
    }
    if (!Number.isFinite(mainPrice) || mainPrice <= 0) {
      wx.showToast({ title: '请填写有效主推价格（元）', icon: 'none' })
      return false
    }
    const secName = String(this.data.secName || '').trim()
    const secPrice = Number.parseFloat(String(this.data.secPrice || ''))
    if (secName && !(Number.isFinite(secPrice) && secPrice >= 0)) {
      wx.showToast({ title: '次推价格需为数字', icon: 'none' })
      return false
    }
    void industry
    return true
  },

  async runGenerate() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({ title: '未连接后台', content: '请配置 MERCHANT_API_BASE_URL 后再调用 AI Brief。', showCancel: false })
      return
    }
    if (!this.validateStep2()) return

    wx.showLoading({ title: '生成中…', mask: true })
    this.setData({ generating: true, errMsg: '' })
    try {
      const plat = PLATFORMS.find((p) => p.key === this.data.selectedKey) || PLATFORMS[0]
      const industry = String(this.data.industryOptions[this.data.industryIndex] || '')
      const tags = this.parseTags()
      const main = {
        name: String(this.data.mainName || '').trim(),
        priceYuan: Number.parseFloat(String(this.data.mainPrice || '')),
      }
      const secNm = String(this.data.secName || '').trim()
      const secPu = Number.parseFloat(String(this.data.secPrice || ''))
      const secondary =
        secNm && Number.isFinite(secPu)
          ? { name: secNm, priceYuan: secPu }
          : undefined
      const storeName = String(this.data.storeName || '').trim()

      const [p1, p2, p3] = await briefAi.generateThreeKolBriefsMp({
        platformLabel: plat.label,
        industry,
        main,
        secondary,
        tags,
        storeName,
      })

      wx.hideLoading()
      this.setData({
        generating: false,
        step: 3,
        previews: [p1, p2, p3],
      })
    } catch (e) {
      wx.hideLoading()
      const msg = e instanceof Error ? e.message : String(e)
      this.setData({ generating: false, errMsg: msg.slice(0, 240) })
      wx.showToast({ title: '生成失败', icon: 'none' })
    }
  },

  onCopyVariant(e) {
    const idx = Number(e.currentTarget.dataset.i) || 0
    const t = String((this.data.previews[idx] || '').trim())
    if (!t) return
    wx.setClipboardData({ data: t })
  },

  saveRecords() {
    const plat = PLATFORMS.find((p) => p.key === this.data.selectedKey) || PLATFORMS[0]
    const previews = [...this.data.previews].map((s) => String(s || '').trim()).filter(Boolean)
    if (!previews.length || previews.length < 3) {
      wx.showToast({ title: '请先生成三版 Brief', icon: 'none' })
      return
    }
    const id = `KB${Date.now()}`
    const rec = {
      id,
      platform: plat.label,
      industry: String(this.data.industryOptions[this.data.industryIndex] || ''),
      mainProductName: String(this.data.mainName || '').trim(),
      tags: this.parseTags(),
      previews,
      createdAt: fmtNow(),
    }
    briefStore.appendRecord(rec)
    wx.showToast({ title: '已保存记录', icon: 'success' })
  },

  useVariant(e) {
    const v = Number(e.currentTarget.dataset.v) || 0
    const plat = PLATFORMS.find((p) => p.key === this.data.selectedKey) || PLATFORMS[0]
    const text = String(this.data.previews[v] || '').trim()
    if (!text) {
      wx.showToast({ title: '暂无正文', icon: 'none' })
      return
    }
    const payload = {
      recordId: `live_${Date.now()}`,
      variantIndex: v,
      text,
      platform: plat.label,
      mainProductName: String(this.data.mainName || '').trim(),
      tags: this.parseTags(),
    }
    briefStore.writeSelectedBrief(payload)
    wx.showModal({
      title: '已写入招募引用',
      content: `已选择版本 ${String.fromCharCode(65 + v)}，可在「专业版发布招募」中选择或调整。`,
      showCancel: false,
    })
  },
})
