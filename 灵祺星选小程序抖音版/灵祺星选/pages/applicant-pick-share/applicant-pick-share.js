const api = require('../../utils/api.js')
const applicantPickShare = require('../../utils/applicantPickShare.js')
const appDisplay = require('../../utils/applicationDisplay.js')

const VISITOR_KEY = 'meoo_ap_share_visitor'

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

function mapCards(talents, notesByApplicant, draftNotes) {
  const noteMap = applicantPickShare.groupNotesByApplicant(notesByApplicant || [])
  return (talents || []).map((t) => {
    const id = String(t.applicantId || '')
    const saved = noteMap[id] || null
    return {
      id,
      displayName: String(t.displayName || '达人'),
      platform: String(t.platform || ''),
      platformAccount: String(t.platformAccount || ''),
      displayFollowers: String(t.displayFollowers || '—'),
      displaySalesLevel: String(t.displaySalesLevel || '—'),
      profileLink: String(t.profileLink || '').trim(),
      hasProfileLink: !!String(t.profileLink || '').trim(),
      accountTags: Array.isArray(t.accountTags) ? t.accountTags : [],
      savedNote: saved,
      draftNote: (draftNotes && draftNotes[id]) != null ? draftNotes[id] : saved ? saved.noteText : '',
      submitting: false,
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
    draftNotes: {},
  },
  _pollTimer: null,
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
    this._pollTimer = setInterval(() => void this.load({ silent: true }), 8000)
  },
  onUnload() {
    if (this._pollTimer) clearInterval(this._pollTimer)
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
      const data = await applicantPickShare.fetchPublicShare(token)
      const cards = mapCards(data.talents, data.notes, this.data.draftNotes)
      const prevSubmitting = new Set(
        (this.data.cards || []).filter((c) => c.submitting).map((c) => c.id),
      )
      const merged = cards.map((c) => ({
        ...c,
        submitting: prevSubmitting.has(c.id),
      }))
      this.setData({
        title: data.title,
        expiresAt: String(data.expiresAt || '').slice(0, 19).replace('T', ' '),
        cards: merged,
        loading: false,
        err: '',
      })
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      if (!silent) {
        this.setData({
          loading: false,
          err: msg.includes('share_link_invalid') ? '分享链接已失效或过期' : msg.slice(0, 60),
        })
      }
    }
  },
  onVisitorNameInput(e) {
    const visitorName = String((e.detail && e.detail.value) || '').trim()
    this.setData({ visitorName })
    saveVisitorName(visitorName)
  },
  onDraftNoteInput(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const draftNote = String((e.detail && e.detail.value) || '')
    const draftNotes = { ...(this.data.draftNotes || {}), [id]: draftNote }
    const cards = (this.data.cards || []).map((c) => (c.id === id ? { ...c, draftNote } : c))
    this.setData({ draftNotes, cards })
  },
  onCopyProfileLink(e) {
    const link = String((e.currentTarget.dataset && e.currentTarget.dataset.link) || '').trim()
    appDisplay.copyTalentProfileLink(link)
  },
  async onSubmitNote(e) {
    const id = e.currentTarget.dataset.id
    const token = this.data.token
    if (!id || !token) return
    const card = (this.data.cards || []).find((c) => c.id === id)
    if (!card || card.submitting) return
    const noteText = String(card.draftNote || '').trim()
    if (!noteText) {
      wx.showToast({ title: '请先填写备注', icon: 'none' })
      return
    }
    const cards = (this.data.cards || []).map((c) => (c.id === id ? { ...c, submitting: true } : c))
    this.setData({ cards })
    try {
      await applicantPickShare.submitShareNote({
        token,
        applicantId: id,
        visitorName: String(this.data.visitorName || '').trim() || '商家',
        noteText,
      })
      wx.showToast({ title: '备注已保存', icon: 'success' })
      await this.load({ silent: true })
    } catch (err) {
      wx.showToast({
        title: String(err && err.message ? err.message : err).slice(0, 28),
        icon: 'none',
      })
      const reset = (this.data.cards || []).map((c) => (c.id === id ? { ...c, submitting: false } : c))
      this.setData({ cards: reset })
    }
  },
})
