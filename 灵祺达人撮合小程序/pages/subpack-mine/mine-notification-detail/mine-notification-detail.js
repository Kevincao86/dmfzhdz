const messagesStore = require('../../../utils/messagesStore.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')
const inboxNoticeState = require('../../../utils/inboxNoticeState.js')
const inboxCatalog = require('../../../utils/inboxNoticeCatalog.js')

Page({
  data: {
    row: null,
  },
  onLoad() {
    syncPageIdentity(this)
    const raw = inboxCatalog.readDetailPayload()
    if (!raw) {
      wx.showToast({ title: '通知不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    const row = inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(raw))
    this.setData({ row })
    if (!row.read) {
      messagesStore.markNotificationsRead([row.id])
      messagesStore.markInboxSeen([row.id])
    }
  },
  onUnload() {
    inboxCatalog.clearDetailPayload()
  },
  onPreviewImage() {
    const url = this.data.row && this.data.row.imageUrl
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onGoOrder() {
    const url = this.data.row && this.data.row.detailUrl
    if (!url) return
    wx.navigateTo({ url })
  },
  onSelectionAction(e) {
    const action = e.currentTarget.dataset.action
    const row = this.data.row
    if (!row || !action) return
    inboxNoticeState.markHandled(row, action)
    messagesStore.markInboxSeen([row.id])
    wx.showToast({
      title: action === 'joined' ? '已标记入群' : '已确认',
      icon: 'success',
    })
    const next = inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow({ ...row, read: true }))
    this.setData({ row: next })
  },
})
