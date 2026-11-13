const { prepareXingxuanSubPage } = require('../../../utils/pageIdentityChrome.js')
const xingxuan = require('../../../utils/xingxuanEnhanceApi.js')

Page({
  data: {
    summary: [],
    orders: [],
    loading: false,
  },
  async onShow() {
    const ready = await prepareXingxuanSubPage(this)
    if (!ready) return
    await this.load()
  },
  async load() {
    this.setData({ loading: true })
    try {
      const res = await xingxuan.getRecruitmentFunnel()
      const ov = res.overview || {}
      const summary = [
        { stage: '曝光', count: ov.totalViews || 0, rate: '' },
        { stage: '报名', count: ov.totalApplies || 0, rate: '' },
        { stage: '入选', count: ov.totalSelected || 0, rate: '' },
        { stage: '已发布', count: ov.totalPublished || 0, rate: '' },
      ]
      const orders = (ov.funnels || []).map((f) => ({
        mpOrderId: f.mpOrderId,
        title: f.title,
        applied: f.applyCount,
        approved: f.selectedCount,
        videoSubmitted: f.videoSubmittedCount,
      }))
      this.setData({ summary, orders })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
