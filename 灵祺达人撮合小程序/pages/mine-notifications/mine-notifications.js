const messagesStore = require('../../utils/messagesStore.js')
const { syncPageIdentity } = require('../../utils/pageIdentityChrome.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const talentMember = require('../../utils/talentMember.js')
const userProfile = require('../../utils/userProfile.js')
const inboxNoticeState = require('../../utils/inboxNoticeState.js')
const inboxCatalog = require('../../utils/inboxNoticeCatalog.js')
const talentInboxMatch = require('../../utils/talentInboxMatch.js')
const appRegistrySync = require('../../utils/applicationsRegistrySync.js')

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

function enrichAll(rows) {
  return (rows || []).map((r) => inboxCatalog.enrichNoticeRow(inboxNoticeState.enrichRow(r)))
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
  },
  async onPullDownRefresh() {
    await this.loadRows()
    wx.stopPullDownRefresh()
  },
  async loadRows() {
    let rows = enrichAll(messagesStore.readNotifications())
    if (userProfile.readIdentity() === 'talent' && api.hasApi()) {
      try {
        const member = talentMember.readMember()
        if (member && (member.id || member.contact)) {
          const reg = await appRegistrySync.fetchRegistryAndReconcileApplications({ includeLocalContext: true })
          rows = enrichAll(messagesStore.mergeRegistryInboxForTalent(reg, member))
        }
      } catch (_) {
        /* 使用本地通知 */
      }
    } else {
      rows = enrichAll(inboxNoticeState.sortRows(rows))
    }
    const pages = getCurrentPages()
    const mine = pages.length >= 2 ? pages[pages.length - 2] : null
    if (mine && typeof mine.refresh === 'function') mine.refresh()
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
  async onShow() {
    syncPageIdentity(this)
    await this.loadRows()
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
      messagesStore.markInboxSeen([row.id])
    }
    if (!row.canOpenDetail) {
      void this.loadRows()
      return
    }
    if (row.detailUrl) {
      wx.navigateTo({ url: row.detailUrl })
      void this.loadRows()
      return
    }
    inboxCatalog.writeDetailPayload(row)
    wx.navigateTo({ url: '/pages/mine-notification-detail/mine-notification-detail' })
    void this.loadRows()
  },
  stopBubble() {},
  onPreviewInboxImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onSelectionAction(e) {
    const { id, action } = e.currentTarget.dataset
    if (!id || !action) return
    const row = this.findRowById(id)
    if (!row) return
    inboxNoticeState.markHandled(row, action)
    messagesStore.markInboxSeen([row.id])
    if (row.fromSelection && row.dedupeKey) {
      talentInboxMatch.markSelectionNoticeSent(row.dedupeKey)
    }
    wx.showToast({
      title: action === 'joined' ? '已标记入群' : '已确认',
      icon: 'success',
    })
    void this.loadRows()
  },
  onMarkAllRead() {
    const rows = this._allRows || []
    const unreadIds = rows.filter((r) => r && !r.read).map((r) => r.id)
    if (!unreadIds.length) {
      wx.showToast({ title: '暂无未读消息', icon: 'none' })
      return
    }
    messagesStore.markAllNotificationsRead()
    wx.showToast({ title: '已全部标为已读', icon: 'success' })
    void this.loadRows()
  },
})
