const api = require('../../../utils/api.js')
const videoUpload = require('../../../utils/recruitmentVideoUpload.js')
const videoReviewShare = require('../../../utils/videoReviewShare.js')

const VISITOR_KEY = 'meoo_vr_share_visitor'

function loadVisitorName() {
  try {
    return wx.getStorageSync(VISITOR_KEY) || ''
  } catch (_) {
    return ''
  }
}

function saveVisitorName(name) {
  try {
    wx.setStorageSync(VISITOR_KEY, String(name || '').trim())
  } catch (_) {}
}

function mapVideos(videos, feedbackByApplicant, draftComments) {
  return (videos || []).map((v) => {
    const id = String(v.applicantId || '')
    const videoStatus = String(v.videoStatus || 'pending')
    return {
      id,
      displayName: String(v.displayName || '达人'),
      videoUrl: String(v.videoUrl || ''),
      videoStatus,
      videoStatusLabel:
        videoUpload.videoStatusLabel(videoStatus) || (videoStatus === 'pending' ? '待审核' : videoStatus),
      videoSubmittedAt: String(v.videoSubmittedAt || '').slice(0, 16).replace('T', ' '),
      previewOpen: false,
      draftComment: (draftComments && draftComments[id]) || '',
      submitting: false,
      shareFeedback: (feedbackByApplicant && feedbackByApplicant[id]) || [],
    }
  })
}

Page({
  data: {
    token: '',
    title: '',
    expiresAt: '',
    cards: [],
    loading: true,
    err: '',
    visitorName: loadVisitorName(),
    feedbackByApplicant: {},
    draftComments: {},
  },
  onLoad(options) {
    const token = String((options && options.token) || '').trim()
    this.setData({ token })
    if (!token) {
      this.setData({ loading: false, err: '分享链接无效' })
      return
    }
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址' })
      return
    }
    void this.load()
  },
  onPullDownRefresh() {
    this.load({ silent: true }).finally(() => wx.stopPullDownRefresh())
  },
  async load(opts) {
    const token = this.data.token
    if (!token) return
    const silent = !!(opts && opts.silent)
    const hasCards = (this.data.cards || []).length > 0
    if (!silent && !hasCards) this.setData({ loading: true, err: '' })
    try {
      const data = await videoReviewShare.fetchPublicShare(token)
      const feedbackByApplicant = videoReviewShare.groupFeedbackByApplicant(data.annotations)
      const cards = mapVideos(data.videos, feedbackByApplicant, this.data.draftComments)
      const prevOpen = new Set((this.data.cards || []).filter((c) => c.previewOpen).map((c) => c.id))
      const merged = cards.map((c) => ({
        ...c,
        previewOpen: prevOpen.has(c.id),
        submitting: false,
      }))
      this.setData({
        title: data.title,
        expiresAt: String(data.expiresAt || '').slice(0, 19).replace('T', ' '),
        cards: merged,
        feedbackByApplicant,
        loading: false,
        err: '',
      })
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      this.setData({
        loading: false,
        err: msg.includes('share_link_invalid') ? '分享链接已失效或过期' : msg.slice(0, 60),
      })
    }
  },
  onVisitorNameInput(e) {
    const visitorName = String((e.detail && e.detail.value) || '').trim()
    this.setData({ visitorName })
    saveVisitorName(visitorName)
  },
  onTogglePreview(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const cards = (this.data.cards || []).map((c) =>
      c.id === id ? { ...c, previewOpen: !c.previewOpen } : { ...c, previewOpen: false },
    )
    this.setData({ cards })
  },
  onDraftCommentInput(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const draftComment = String((e.detail && e.detail.value) || '')
    const draftComments = { ...(this.data.draftComments || {}), [id]: draftComment }
    const cards = (this.data.cards || []).map((c) =>
      c.id === id ? { ...c, draftComment } : c,
    )
    this.setData({ draftComments, cards })
  },
  async onSubmitComment(e) {
    const id = e.currentTarget.dataset.id
    const token = this.data.token
    if (!id || !token) return
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (!card || card.submitting) return
    const commentText = String(card.draftComment || '').trim()
    if (!commentText) {
      wx.showToast({ title: '请先填写备注', icon: 'none' })
      return
    }
    const cards = (this.data.cards || []).map((c) =>
      c.id === id ? { ...c, submitting: true } : c,
    )
    this.setData({ cards })
    try {
      await videoReviewShare.submitShareComment({
        token,
        applicantId: id,
        visitorName: String(this.data.visitorName || '').trim() || '访客',
        commentText,
      })
      const draftComments = { ...(this.data.draftComments || {}), [id]: '' }
      wx.showToast({ title: '备注已提交', icon: 'success' })
      this.setData({ draftComments })
      await this.load({ silent: true })
    } catch (err) {
      wx.showToast({
        title: String(err && err.message ? err.message : err).slice(0, 28),
        icon: 'none',
      })
      const reset = (this.data.cards || []).map((c) =>
        c.id === id ? { ...c, submitting: false } : c,
      )
      this.setData({ cards: reset })
    }
  },
})
