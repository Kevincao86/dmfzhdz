const ops = require('../../utils/opsRegistryTalentMp.js')
const { syncPrPageChrome } = require('../../utils/pageIdentityChrome.js')
const api = require('../../utils/api.js')
const videoUpload = require('../../utils/recruitmentVideoUpload.js')

function submitCountLabel(count) {
  return videoUpload.submitCountLabel(count)
}

const appDisplay = require('../../utils/applicationDisplay.js')

function mapCards(applicants, reg) {
  return (applicants || [])
    .filter((a) => a && String(a.videoUrl || a.douyinPublishUrl || '').trim())
    .map((a, i) => {
      const enriched = appDisplay.enrichApplicantRow(a, i, reg || {})
      return {
      id: String(a.id || ''),
      displayName: enriched.displayName,
      talentMeta: appDisplay.buildApplicantTalentMeta(enriched),
      videoUrl: String(a.videoUrl || a.douyinPublishUrl || ''),
      videoStatus: String(a.videoStatus || 'pending'),
      videoStatusLabel: videoUpload.videoStatusLabel(a.videoStatus || 'pending') || '待审核',
      videoRejectReason: a.videoRejectReason ? String(a.videoRejectReason) : '',
      videoSubmittedAt: a.videoSubmittedAt ? String(a.videoSubmittedAt) : '',
      submitCountLabel: submitCountLabel(a.videoSubmitCount),
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
  },
  _pollTimer: null,
  onLoad(options) {
    syncPrPageChrome(this, { animate: false })
    const mpOrderId = String((options && options.id) || '').trim()
    this.setData({ mpOrderId })
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
    this.load({ silent: true }).finally(() => wx.stopPullDownRefresh())
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
      const reg = await ops.fetchRegistry()
      const mpList = reg.mpRecruitmentOrders || []
      const mp = mpList.find((o) => o && String(o.id) === mpOrderId)
      const applicants = mp && Array.isArray(mp.applicants) ? mp.applicants : []
      const cards = mapCards(applicants, reg)
      const prevOpen = new Set((this.data.cards || []).filter((c) => c.previewOpen).map((c) => c.id))
      const merged = cards.map((c) => ({ ...c, previewOpen: prevOpen.has(c.id) }))
      this.setData({
        title: String((mp && mp.title) || mpOrderId),
        cards: merged,
        stats: buildStats(merged),
        loading: false,
        err: '',
      })
      if (!this._pollTimer) {
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
  async onPass(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.busyId) return
    const mpOrderId = this.data.mpOrderId
    this.setData({ busyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(mpOrderId, id, 'pass')
      wx.showToast({ title: '已通过', icon: 'success' })
      await this.load({ silent: true })
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
      wx.showToast({ title: '已驳回', icon: 'success' })
      this.onCloseReject()
      await this.load({ silent: true })
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
  stopBubble() {},
})
