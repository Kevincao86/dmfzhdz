const messagesStore = require('../../../utils/messagesStore.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')
const inboxNoticeState = require('../../../utils/inboxNoticeState.js')
const inboxCatalog = require('../../../utils/inboxNoticeCatalog.js')
const talentInboxMatch = require('../../../utils/talentInboxMatch.js')
const ntfPage = require('../../../utils/notificationInboxPage.js')

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'selection', label: '入选' },
  { id: 'order', label: '订单' },
  { id: 'business', label: '业务' },
  { id: 'system', label: '系统' },
]

const SECTION_META = {
  pinned: { title: '待处理' },
  selection: { title: '入选通知' },
  order: { title: '订单通知' },
  business: { title: '业务通知' },
  system: { title: '系统通知' },
}

function buildSections(rows, activeTab) {
  const filtered = inboxCatalog.filterByTab(rows, activeTab)
  if (activeTab !== 'all') {
    if (!filtered.length) return []
    const title = (TABS.find((t) => t.id === activeTab) || {}).label || '通知'
    return [{ id: activeTab, title, rows: filtered }]
  }
  const pinned = filtered.filter((r) => r.pinned)
  const rest = filtered.filter((r) => !r.pinned)
  const sections = []
  if (pinned.length) {
    sections.push({ id: 'pinned', title: SECTION_META.pinned.title, rows: pinned })
  }
  const kinds = ['selection', 'order', 'business', 'system']
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i]
    const slice = rest.filter((r) => r.noticeKind === kind)
    if (slice.length) {
      sections.push({ id: kind, title: SECTION_META[kind].title, rows: slice })
    }
  }
  return sections
}

function buildTabs(counts) {
  return TABS.map((t) => ({
    ...t,
    count: counts[t.id] || 0,
    badge: counts[t.id] > 0 ? String(counts[t.id]) : '',
  }))
}

Page({
  data: {
    tabs: buildTabs({ all: 0, selection: 0, order: 0, business: 0, system: 0 }),
    activeTab: 'all',
    sections: [],
    totalCount: 0,
    unreadCount: 0,
    emptyHint: '',
    mineGuestMode: false,
  },
  async onPullDownRefresh() {
    await this.loadRows()
    wx.stopPullDownRefresh()
  },
  async loadRows() {
    const rows = await ntfPage.fetchNotificationRows()
    const pages = getCurrentPages()
    const mine = pages.length >= 2 ? pages[pages.length - 2] : null
    if (mine && typeof mine.refresh === 'function') mine.refresh()
    this.reapplyRowsView(rows)
    this._notificationsLoadedOnce = true
  },
  reapplyRowsView(rows) {
    const counts = inboxCatalog.tabCounts(rows)
    const unreadCount = rows.filter((r) => !r.read).length
    this.setData({
      tabs: buildTabs(counts),
      sections: buildSections(rows, this.data.activeTab),
      totalCount: rows.length,
      unreadCount,
      emptyHint:
        rows.length === 0
          ? '发单、报名、PR 入选通知会显示在这里；请下拉刷新'
          : '',
    })
    this._allRows = rows
  },
  enrichRow(row) {
    return inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(row))
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) {
      this.setData({
        sections: [],
        totalCount: 0,
        unreadCount: 0,
        emptyHint: '没有数据，请登录后查看',
      })
      this._allRows = []
      this._notificationsLoadedOnce = false
      return
    }
    if (this._suppressShowReload) {
      this._suppressShowReload = false
      return
    }
    if (!this._notificationsLoadedOnce) {
      await this.loadRows()
    }
  },
  onTabChange(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeTab) return
    const rows = this._allRows || []
    this.setData({
      activeTab: id,
      sections: buildSections(rows, id),
      emptyHint:
        id === 'selection' && rows.length > 0
          ? '入选通知含群二维码，点击消息可放大查看；首页点「我知道了」后仍保留在此'
          : this.data.emptyHint,
    })
  },
  findRowById(id) {
    const sections = this.data.sections || []
    for (let i = 0; i < sections.length; i++) {
      const found = (sections[i].rows || []).find((r) => r.id === id)
      if (found) return found
    }
    const all = this._allRows || []
    return all.find((r) => r.id === id) || null
  },
  onOpenNotice(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const row = this.findRowById(id)
    if (!row) return
    if (!row.read) {
      messagesStore.markNotificationsRead([row.id])
      messagesStore.rememberInboxRows([row])
      const rows = (this._allRows || []).map((r) =>
        r.id === id ? this.enrichRow({ ...r, read: true }) : r
      )
      this.reapplyRowsView(rows)
    }
    if (!row.canOpenDetail) return
    this._suppressShowReload = true
    if (row.detailUrl) {
      wx.navigateTo({ url: row.detailUrl })
      return
    }
    inboxCatalog.writeDetailPayload(row)
    wx.navigateTo({ url: '/pages/subpack-mine/mine-notification-detail/mine-notification-detail' })
  },
  stopBubble() {},
  onPreviewInboxImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    this._suppressShowReload = true
    wx.previewImage({ urls: [url], current: url })
  },
  onSelectionAction(e) {
    const { id, action } = e.currentTarget.dataset
    if (!id || !action) return
    const row = this.findRowById(id)
    if (!row) return
    inboxNoticeState.markHandled(row, action)
    messagesStore.rememberInboxRows([row])
    if (row.fromSelection && row.dedupeKey) {
      talentInboxMatch.markSelectionNoticeSent(row.dedupeKey)
    }
    wx.showToast({
      title: action === 'joined' ? '已标记入群' : '已确认',
      icon: 'success',
    })
    const rows = (this._allRows || []).map((r) =>
      r.id === id ? this.enrichRow(r) : r
    )
    this.reapplyRowsView(rows)
  },
  onMarkAllRead() {
    const rows = this._allRows || []
    const unreadIds = rows.filter((r) => r && !r.read).map((r) => r.id)
    if (!unreadIds.length) {
      wx.showToast({ title: '暂无未读消息', icon: 'none' })
      return
    }
    messagesStore.markAllNotificationsRead(rows)
    wx.showToast({ title: '已全部标为已读', icon: 'success' })
    const next = rows.map((r) => this.enrichRow({ ...r, read: true }))
    this.reapplyRowsView(next)
  },
})
