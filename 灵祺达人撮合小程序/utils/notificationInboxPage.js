const messagesStore = require('./messagesStore.js')
const ops = require('./opsRegistryTalentMp.js')
const api = require('./api.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const inboxNoticeState = require('./inboxNoticeState.js')
const inboxCatalog = require('./inboxNoticeCatalog.js')

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
  const filtered = inboxNoticeState.sortRows(inboxCatalog.filterByTab(rows, activeTab))
  if (activeTab !== 'all') {
    if (!filtered.length) return []
    const title = (TABS.find((t) => t.id === activeTab) || {}).label || '通知'
    return [{ id: activeTab, title, rows: filtered }]
  }
  const pinned = filtered.filter((r) => r.pinned)
  const unread = filtered.filter((r) => !r.pinned && !r.read)
  const read = filtered.filter((r) => !r.pinned && r.read)
  const sections = []
  if (pinned.length) {
    sections.push({ id: 'pinned', title: SECTION_META.pinned.title, rows: pinned })
  }
  if (unread.length) {
    sections.push({ id: 'unread', title: '未读', rows: unread })
  }
  if (read.length) {
    sections.push({ id: 'read', title: '已读', rows: read })
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

function localNotificationRows() {
  return enrichAll(inboxNoticeState.sortRows(messagesStore.readNotifications()))
}

/** 只拉本人站内信切片。大厅整包注册表留给报名回填，不挡消息列表。 */
async function fetchNotificationRows() {
  let rows = localNotificationRows()
  if (userProfile.readIdentity() === 'talent' && api.hasApi()) {
    try {
      const member = talentMember.readMember()
      if (member && (member.id || member.contact)) {
        const slice = await ops.fetchTalentInboxSlice()
        const cached = ops.readRegistryCache() || {}
        const reg = ops.mergeRegistryInboxSlice(
          {
            mpRecruitmentOrders: Array.isArray(cached.mpRecruitmentOrders) ? cached.mpRecruitmentOrders : [],
            mpTalentInbox: Array.isArray(cached.mpTalentInbox) ? cached.mpTalentInbox : [],
          },
          slice,
        )
        rows = enrichAll(messagesStore.mergeRegistryInboxForTalent(reg, member))
      }
    } catch (_) {
      /* keep local rows */
    }
  }
  return enrichAll(inboxNoticeState.sortRows(rows))
}

function patchFromRows(rows, activeTab) {
  const counts = inboxCatalog.tabCounts(rows)
  const unreadCount = rows.filter((r) => !r.read).length
  return {
    ntfTabs: buildTabs(counts),
    ntfSections: buildSections(rows, activeTab),
    ntfTotalCount: rows.length,
    ntfUnreadCount: unreadCount,
    ntfEmptyHint:
      rows.length === 0 ? '发单、报名、PR 入选通知会显示在这里；请下拉刷新' : '',
  }
}

module.exports = {
  TABS,
  buildSections,
  localNotificationRows,
  fetchNotificationRows,
  patchFromRows,
}
