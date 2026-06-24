const ops = require('../../utils/opsRegistryTalentMp.js')
const { syncPrPageChrome } = require('../../utils/pageIdentityChrome.js')
const api = require('../../utils/api.js')
const videoUpload = require('../../utils/recruitmentVideoUpload.js')
const videoAiCompliance = require('../../utils/recruitmentVideoAiCompliance.js')
const iceOrderStats = require('../../utils/iceOrderStats.js')

function submitCountLabel(count) {
  return videoUpload.submitCountLabel(count)
}

const appDisplay = require('../../utils/applicationDisplay.js')

function mapCards(applicants, reg, isIce) {
  return (applicants || [])
    .filter((a) => videoUpload.isApplicantVideoVisibleOnPrReview(a, isIce))
    .map((a, i) => {
      const enriched = appDisplay.enrichApplicantRow(a, i, reg || {})
      const visitVideoUrl = String(a.videoUrl || '').trim()
      const url = isIce ? String(a.videoUrl || a.douyinPublishUrl || '').trim() : visitVideoUrl
      const isIceLink = isIce && !!String(a.douyinPublishUrl || '').trim()
      const publishUrl = String(a.visitPublishUrl || a.douyinPublishUrl || '').trim()
      const rawStatus = String(a.videoStatus || '').trim()
      const videoStatus = rawStatus || 'pending'
      return {
        id: String(a.id || ''),
        displayName: enriched.displayName,
        talentMeta: appDisplay.buildApplicantTalentMeta(enriched),
        videoUrl: url,
        visitVideoUrl,
        isIceLink,
        videoStatus,
        videoStatusLabel: videoUpload.videoStatusLabel(videoStatus) || (videoStatus === 'pending' ? '待审核' : videoStatus),
        videoRejectReason: a.videoRejectReason ? String(a.videoRejectReason) : '',
        videoSubmittedAt: a.videoSubmittedAt ? String(a.videoSubmittedAt) : '',
        submitCountLabel: submitCountLabel(a.videoSubmitCount),
        publishUrl: publishUrl && a.videoStatus === 'passed' ? publishUrl : '',
        publishLinkLabel: publishUrl ? (a.visitPublishUrl ? '已回传发布链接' : '平台发布链接') : '待回传发布链接',
        previewOpen: false,
      }
    })
}

function buildStats(cards) {
  const list = cards || []
  return {
    pending: list.filter((c) => c.videoStatus === 'pending').length,
    passed: list.filter((c) => c.videoStatus === 'passed').length,
    rejected: list.filter((c) => c.videoStatus === 'rejected').length,
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
    downloadingId: '',
    fromCompleted: false,
    isIceOrder: false,
    reviewLabel: '视频审核',
    itemLabel: '视频',
    backLabel: '返回待视频审核',
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
      backLabel: fromCompleted ? '返回已完成' : '返回待视频审核',
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
        includePrOwned: true,
        skipCache: !!(opts && opts.skipCache),
      })
      const mpList = reg.mpRecruitmentOrders || []
      const mp = mpList.find((o) => o && String(o.id) === mpOrderId)
      const isIce = mp ? iceOrderStats.isIceMpOrder(mp) : false
      const applicants = mp && Array.isArray(mp.applicants) ? mp.applicants : []
      const cards = mapCards(applicants, reg, isIce)
      const prevOpen = new Set((this.data.cards || []).filter((c) => c.previewOpen).map((c) => c.id))
      const aiMap = this.data.aiCheckStatusMap || {}
      const merged = cards.map((c) => {
        const st = aiMap[c.id]
        return {
          ...c,
          previewOpen: prevOpen.has(c.id),
          ...(st ? { aiCheckStatusText: st.text, aiCheckStatusTone: st.tone } : {}),
        }
      })
      const reviewLabel = isIce ? '链接审核' : '视频审核'
      const itemLabel = isIce ? '链接' : '视频'
      this.setData({
        title: String((mp && mp.title) || mpOrderId),
        isIceOrder: isIce,
        reviewLabel,
        itemLabel,
        cards: merged,
        stats: buildStats(merged),
        batchAiTargetCount: merged.filter(
          (c) => c.videoStatus === 'pending' && !c.isIceLink && String(c.videoUrl || c.visitVideoUrl || '').trim(),
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
              platform: String(mp.platform || '抖音'),
              category: String(mp.category || ''),
              region: String(mp.region || ''),
            }
          : null,
      })
      wx.setNavigationBarTitle({ title: reviewLabel })
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
  onTogglePreview(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (card && card.isIceLink) {
      wx.setClipboardData({
        data: card.videoUrl,
        success: () => wx.showToast({ title: '链接已复制', icon: 'none' }),
      })
      return
    }
    const cards = (this.data.cards || []).map((c) =>
      c.id === id ? { ...c, previewOpen: !c.previewOpen } : { ...c, previewOpen: false },
    )
    this.setData({ cards })
  },
  onDownload(e) {
    const id = e.currentTarget.dataset.id
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (!card || !card.videoUrl || this.data.downloadingId) return
    this.setData({ downloadingId: id })
    wx.showLoading({ title: '下载中…', mask: true })
    wx.downloadFile({
      url: card.videoUrl,
      success(res) {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.showToast({ title: '下载失败', icon: 'none' })
          return
        }
        wx.saveVideoToPhotosAlbum({
          filePath: res.tempFilePath,
          success() {
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          },
          fail(err) {
            const msg = String((err && err.errMsg) || '')
            if (/auth deny|authorize/i.test(msg)) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存到相册，或复制链接在浏览器中下载。',
                showCancel: false,
              })
              return
            }
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              fail() {
                wx.showToast({ title: '已下载到临时文件', icon: 'none' })
              },
            })
          },
        })
      },
      fail() {
        wx.setClipboardData({
          data: card.videoUrl,
          success() {
            wx.showToast({ title: '链接已复制', icon: 'none' })
          },
        })
      },
      complete: () => {
        wx.hideLoading()
        this.setData({ downloadingId: '' })
      },
    })
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
  async onAiCheck(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.aiCheckBusyId) return
    const card = (this.data.cards || []).find((c) => c.id === id)
    const ctx = this.data.orderContext
    if (!card || !ctx) {
      wx.showToast({ title: '缺少商单信息', icon: 'none' })
      return
    }
    this.setData({ aiCheckBusyId: id })
    this.updateCardAiStatus(id, videoAiCompliance.getCheckingInlineStatus())
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
  async runAiCheckForCard(card) {
    const ctx = this.data.orderContext
    if (!card || !ctx) throw new Error('缺少商单信息')
    this.updateCardAiStatus(card.id, videoAiCompliance.getCheckingInlineStatus())
    const res = await videoAiCompliance.checkVideoCompliance({
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
      videoUrl: card.visitVideoUrl || card.videoUrl,
      douyinPublishUrl: card.publishUrl || '',
    })
    this.updateCardAiStatus(card.id, videoAiCompliance.formatInlineStatus(res))
  },
  async onBatchAiCheck() {
    if (this.data.batchAiCheckBusy || this.data.aiCheckBusyId || this.data.readOnly) return
    const targets = (this.data.cards || []).filter(
      (c) => c.videoStatus === 'pending' && !c.isIceLink && String(c.videoUrl || c.visitVideoUrl || '').trim(),
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
      if (failed > 0) {
        wx.showToast({ title: `${failed} 条检核失败`, icon: 'none' })
      }
    } finally {
      this.setData({ batchAiCheckBusy: false, aiCheckBusyId: '' })
    }
  },
  async onPass(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.busyId) return
    const mpOrderId = this.data.mpOrderId
    this.setData({ busyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(mpOrderId, id, 'pass')
      const registryCache = require('../../utils/registryCache.js')
      registryCache.bust()
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
    const mpOrderId = this.data.mpOrderId
    this.setData({ busyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(mpOrderId, id, 'reject', reason)
      const registryCache = require('../../utils/registryCache.js')
      registryCache.bust()
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
    wx.navigateTo({ url: `/pages/mine-pr-orders/mine-pr-orders?tab=${tab}` })
  },
  stopBubble() {},
})
