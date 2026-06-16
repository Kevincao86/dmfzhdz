const messagesStore = require('./messagesStore.js')
const ops = require('./opsRegistryTalentMp.js')
const api = require('./api.js')
const talentMember = require('./talentMember.js')
const userProfile = require('./userProfile.js')
const inboxNoticeState = require('./inboxNoticeState.js')
const inboxCatalog = require('./inboxNoticeCatalog.js')
const appRegistrySync = require('./applicationsRegistrySync.js')

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

async function fetchNotificationRows() {
  let rows = enrichAll(messagesStore.readNotifications())
  if (userProfile.readIdentity() === 'talent' && api.hasApi()) {
    try {
      const member = talentMember.readMember()
      if (member && (member.id || member.contact)) {
        const reg = await appRegistrySync.fetchRegistryAndReconcileApplications({
          includeLocalContext: true,
          skipCache: true,
        })
        rows = enrichAll(messagesStore.mergeRegistryInboxForTalent(reg, member))
      }
    } catch (_) {
      rows = enrichAll(inboxNoticeState.sortRows(rows))
    }
  } else {
    rows = enrichAll(inboxNoticeState.sortRows(rows))
  }
  return rows
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
  fetchNotificationRows,
  patchFromRows,
}
