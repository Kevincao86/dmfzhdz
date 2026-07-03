const ops = require('../../../utils/opsRegistryTalentMp.js')
const { syncPrPageChrome } = require('../../../utils/pageIdentityChrome.js')
const api = require('../../../utils/api.js')
const scriptUpload = require('../../../utils/recruitmentScriptUpload.js')
const scriptAiCompliance = require('../../../utils/recruitmentScriptAiCompliance.js')
const appDisplay = require('../../../utils/applicationDisplay.js')

function mapCards(applicants, reg, mp) {
  return (applicants || [])
    .filter((a) => scriptUpload.isApplicantScriptVisibleOnPrReview(a))
    .map((a, i) => {
      const enriched = appDisplay.enrichApplicantRow(a, i, reg || {}, mp)
      const scriptUrl = String(a.scriptUrl || '').trim()
      const scriptLinkUrl = String(a.scriptLinkUrl || '').trim()
      const rawStatus = String(a.scriptStatus || '').trim()
      const scriptStatus = rawStatus || 'pending'
      return {
        id: String(a.id || ''),
        displayName: enriched.displayName,
        talentMeta: appDisplay.buildApplicantTalentMeta(enriched),
        scriptUrl,
        scriptLinkUrl,
        scriptFileName: String(a.scriptFileName || '').trim(),
        scriptStatus,
        scriptStatusLabel:
          scriptUpload.scriptStatusLabel(scriptStatus) ||
          (scriptStatus === 'pending' ? '待审核' : scriptStatus),
        scriptRejectReason: a.scriptRejectReason ? String(a.scriptRejectReason) : '',
        scriptSubmittedAt: a.scriptSubmittedAt ? String(a.scriptSubmittedAt) : '',
        submitCountLabel: scriptUpload.submitCountLabel(a.scriptSubmitCount),
        displayLabel: scriptLinkUrl ? '文档链接' : scriptFileName || '文稿文件',
      }
    })
}

function buildStats(cards) {
  const list = cards || []
  return {
    pending: list.filter((c) => c.scriptStatus === 'pending').length,
    passed: list.filter((c) => c.scriptStatus === 'passed').length,
    rejected: list.filter((c) => c.scriptStatus === 'rejected').length,
    total: list.length,
  }
}

Page({
  data: {
    mpOrderId: '',
    title: '',
    cards: [],
    stats: { pending: 0, passed: 0, rejected: 0, total: 0 },
    loading: true,
    err: '',
    busyId: '',
    rejectModal: false,
    rejectTargetId: '',
    rejectTargetName: '',
    rejectReason: '',
    lqThemeClass: 'lq-theme-pr',
    fromCompleted: false,
    reviewLabel: '文稿审核',
    itemLabel: '文稿',
    backLabel: '返回待文稿审核',
    readOnly: false,
    aiCheckBusyId: '',
    aiCheckStatusMap: {},
    batchAiCheckBusy: false,
    batchAiTargetCount: 0,
    orderContext: null,
  },
  _pollTimer: null,
  onLoad(options) {
    syncPrPageChrome(this, { animate: false })
    const mpOrderId = String((options && options.id) || '').trim()
    const fromCompleted = String((options && options.from) || '') === 'completed'
    this.setData({
      mpOrderId,
      fromCompleted,
      readOnly: fromCompleted,
      backLabel: fromCompleted ? '返回已完成' : '返回待文稿审核',
    })
    if (!mpOrderId) {
      this.setData({ loading: false, err: '缺少招募单号' })
      return
    }
    void this.load()
  },
  onUnload() {
    if (this._pollTimer) clearInterval(this._pollTimer)
  },
  onShow() {
    syncPrPageChrome(this, { animate: false })
    if (this.data.mpOrderId) void this.load({ silent: true })
  },
  onPullDownRefresh() {
    this.load({ silent: true, skipCache: true }).finally(() => wx.stopPullDownRefresh())
  },
  async load(opts) {
    const silent = !!(opts && opts.silent)
    const mpOrderId = this.data.mpOrderId
    if (!mpOrderId) return
    if (!silent) this.setData({ loading: true, err: '' })
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址', cards: [], stats: buildStats([]) })
      return
    }
    try {
      const reg = await ops.fetchRegistry({
        includeMpOrderIds: [mpOrderId],
        skipCache: !!(opts && opts.skipCache),
      })
      const mpList = reg.mpRecruitmentOrders || []
      const mp = mpList.find((o) => o && String(o.id) === mpOrderId)
      const applicants = mp && Array.isArray(mp.applicants) ? mp.applicants : []
      const cards = mapCards(applicants, reg, mp)
      const aiMap = this.data.aiCheckStatusMap || {}
      const merged = cards.map((c) => {
        const st = aiMap[c.id]
        return st ? { ...c, aiCheckStatusText: st.text, aiCheckStatusTone: st.tone } : c
      })
      this.setData({
        title: String((mp && mp.title) || mpOrderId),
        cards: merged,
        stats: buildStats(merged),
        batchAiTargetCount: merged.filter(
          (c) => c.scriptStatus === 'pending' && (c.scriptUrl || c.scriptLinkUrl),
        ).length,
        loading: false,
        err: '',
        orderContext: mp
          ? {
              mpOrderId: String(mp.id || mpOrderId),
              orderTitle: String(mp.title || ''),
              recruitmentInfo: String(mp.recruitmentInfo || mp.taskDetail || ''),
              merchantRequirements: String(mp.merchantRequirements || ''),
              taskDetail: String(mp.taskDetail || ''),
              platform: String(mp.platform || '小红书'),
              category: String(mp.category || ''),
              region: String(mp.region || ''),
            }
          : null,
      })
      wx.setNavigationBarTitle({ title: '文稿审核' })
      if (!this.data.fromCompleted && !this._pollTimer) {
        this._pollTimer = setInterval(() => void this.load({ silent: true }), 8000)
      }
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 60),
      })
    }
  },
  onOpenScript(e) {
    const id = e.currentTarget.dataset.id
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (!card) return
    scriptUpload.openScriptUrl(card.scriptUrl, card.scriptLinkUrl)
  },
  updateCardAiStatus(cardId, status) {
    const map = { ...(this.data.aiCheckStatusMap || {}), [cardId]: status }
    const cards = (this.data.cards || []).map((c) =>
      c.id === cardId
        ? { ...c, aiCheckStatusText: status.text, aiCheckStatusTone: status.tone }
        : c,
    )
    this.setData({ aiCheckStatusMap: map, cards })
  },
  async runAiCheckForCard(card) {
    const ctx = this.data.orderContext
    if (!card || !ctx) throw new Error('缺少商单信息')
    this.updateCardAiStatus(card.id, scriptAiCompliance.getCheckingInlineStatus())
    const scriptText = await scriptUpload.readScriptTextForAi(card.scriptUrl, card.scriptLinkUrl)
    const res = await scriptAiCompliance.checkScriptCompliance({
      mpOrderId: ctx.mpOrderId,
      applicantId: card.id,
      platform: ctx.platform,
      orderTitle: ctx.orderTitle,
      recruitmentInfo: ctx.recruitmentInfo,
      merchantRequirements: ctx.merchantRequirements,
      taskDetail: ctx.taskDetail,
      category: ctx.category,
      region: ctx.region,
      applicantName: card.displayName,
      scriptUrl: card.scriptUrl,
      scriptLinkUrl: card.scriptLinkUrl,
      scriptText,
    })
    this.updateCardAiStatus(card.id, scriptAiCompliance.formatInlineStatus(res))
  },
  async onAiCheck(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.aiCheckBusyId) return
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (!card || !this.data.orderContext) {
      wx.showToast({ title: '缺少商单信息', icon: 'none' })
      return
    }
    this.setData({ aiCheckBusyId: id })
    try {
      await this.runAiCheckForCard(card)
    } catch (err) {
      this.updateCardAiStatus(id, { text: '', tone: '' })
      wx.showToast({
        title: String((err && err.message) || 'AI 检核失败').slice(0, 28),
        icon: 'none',
      })
    } finally {
      this.setData({ aiCheckBusyId: '' })
    }
  },
  async onBatchAiCheck() {
    if (this.data.batchAiCheckBusy || this.data.aiCheckBusyId || this.data.readOnly) return
    const targets = (this.data.cards || []).filter(
      (c) => c.scriptStatus === 'pending' && (c.scriptUrl || c.scriptLinkUrl),
    )
    if (!targets.length) return
    this.setData({ batchAiCheckBusy: true })
    let failed = 0
    try {
      for (const card of targets) {
        this.setData({ aiCheckBusyId: card.id })
        try {
          await this.runAiCheckForCard(card)
        } catch (_) {
          failed += 1
          this.updateCardAiStatus(card.id, { text: '', tone: '' })
        }
      }
      if (failed > 0) wx.showToast({ title: `${failed} 条检核失败`, icon: 'none' })
    } finally {
      this.setData({ batchAiCheckBusy: false, aiCheckBusyId: '' })
    }
  },
  async onPass(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.busyId) return
    this.setData({ busyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await scriptUpload.reviewScript(this.data.mpOrderId, id, 'pass')
      wx.showToast({ title: '已通过', icon: 'success' })
      await this.load({ silent: true, skipCache: true })
    } catch (err) {
      wx.showToast({
        title: String(err && err.message ? err.message : err).slice(0, 28),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ busyId: '' })
    }
  },
  onOpenReject(e) {
    const id = e.currentTarget.dataset.id
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (!card) return
    this.setData({
      rejectModal: true,
      rejectTargetId: id,
      rejectTargetName: card.displayName,
      rejectReason: '',
    })
  },
  onRejectReasonInput(e) {
    this.setData({ rejectReason: String((e.detail && e.detail.value) || '') })
  },
  onCloseReject() {
    this.setData({
      rejectModal: false,
      rejectTargetId: '',
      rejectTargetName: '',
      rejectReason: '',
    })
  },
  async onConfirmReject() {
    const id = this.data.rejectTargetId
    const reason = String(this.data.rejectReason || '').trim()
    if (!id || !reason || this.data.busyId) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' })
      return
    }
    this.setData({ busyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await scriptUpload.reviewScript(this.data.mpOrderId, id, 'reject', reason)
      wx.showToast({ title: '已驳回', icon: 'success' })
      this.onCloseReject()
      await this.load({ silent: true, skipCache: true })
    } catch (err) {
      wx.showToast({
        title: String(err && err.message ? err.message : err).slice(0, 28),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ busyId: '' })
    }
  },
  onBackList() {
    const tab = this.data.fromCompleted ? 'completed' : 'pending_video_review'
    wx.navigateTo({
      url: `/pages/subpack-pr/mine-pr-orders/mine-pr-orders?tab=${tab}&platformGroup=script`,
    })
  },
  stopBubble() {},
})
