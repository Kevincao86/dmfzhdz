const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')

Page({
  data: {
    loading: false,
    cards: [],
    statItems: [
      { k: 'p', label: '待审核', v: 0 },
      { k: 'o', label: '已通过', v: 0 },
      { k: 'r', label: '已驳回', v: 0 },
      { k: 't', label: '总视频数', v: 0 },
    ],
    statLabel: { pending: '待审核', passed: '已通过', rejected: '已驳回' },
  },

  onShow() {
    if (!api.getBearerToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.reload()
    this._timer = setInterval(() => void this.reload(), 60000)
  },

  onHide() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-flow/recruit-flow' }) })
  },

  computeStats(list) {
    const pending = list.filter((c) => c.status === 'pending').length
    const passed = list.filter((c) => c.status === 'passed').length
    const rejected = list.filter((c) => c.status === 'rejected').length
    const total = list.length
    return [
      { k: 'p', label: '待审核', v: pending },
      { k: 'o', label: '已通过', v: passed },
      { k: 'r', label: '已驳回', v: rejected },
      { k: 't', label: '总视频数', v: total },
    ]
  },

  async reload() {
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, cards: [], statItems: this.computeStats([]) })
      return
    }
    this.setData({ loading: true })
    try {
      const reg = await ops.fetchRegistry()
      const raw = Array.isArray(reg.recruitmentVideoSubmissions) ? reg.recruitmentVideoSubmissions : []
      const cards = raw.map((x) => ({
        id: String(x.id || ''),
        author: String(x.author || ''),
        title: String(x.title || ''),
        status: x.status === 'passed' ? 'passed' : x.status === 'rejected' ? 'rejected' : 'pending',
        submittedAt: String(x.submittedAt || ''),
        aiNote: String(x.aiNote || ''),
        thumbUrl: typeof x.thumbUrl === 'string' ? x.thumbUrl : '',
        duration: typeof x.duration === 'string' ? x.duration : '',
      }))
      this.setData({ loading: false, cards, statItems: this.computeStats(cards) })
    } catch (_) {
      this.setData({ loading: false, cards: [], statItems: this.computeStats([]) })
    }
  },

  async persist(next) {
    if (!merchant.hasMerchantApi()) return
    try {
      await ops.setRecruitmentVideoSubmissions(next)
      this.setData({ cards: next, statItems: this.computeStats(next) })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showModal({
        title: '保存失败',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
      await this.reload()
    }
  },

  onPass(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const next = this.data.cards.map((c) => (c.id === id ? Object.assign({}, c, { status: 'passed' }) : c))
    void this.persist(next)
  },

  onReject(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const next = this.data.cards.map((c) => (c.id === id ? Object.assign({}, c, { status: 'rejected' }) : c))
    void this.persist(next)
  },
})
