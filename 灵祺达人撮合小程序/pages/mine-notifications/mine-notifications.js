const messagesStore = require('../../utils/messagesStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const talentMember = require('../../utils/talentMember.js')
const userProfile = require('../../utils/userProfile.js')

const SECTION_ORDER = [
  { id: 'order', title: '订单通知' },
  { id: 'business', title: '业务通知' },
  { id: 'system', title: '系统通知' },
]

function buildSections(rows) {
  const byCat = { order: [], business: [], system: [] }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const cat = r.category === 'order' || r.category === 'business' ? r.category : 'system'
    byCat[cat].push(r)
  }
  return SECTION_ORDER.map((s) => ({ ...s, rows: byCat[s.id] })).filter((s) => s.rows.length > 0)
}

Page({
  data: {
    sections: [],
    totalCount: 0,
    emptyHint: '',
  },
  async onPullDownRefresh() {
    await this.loadRows()
    wx.stopPullDownRefresh()
  },
  async loadRows() {
    let rows = messagesStore.readNotifications()
    if (userProfile.readIdentity() === 'talent' && api.hasApi()) {
      try {
        const member = talentMember.readMember()
        if (member && (member.id || member.contact)) {
          const reg = await ops.fetchRegistry()
          rows = messagesStore.mergeRegistryInboxForTalent(reg, member)
          const unseen = rows.filter((r) => (r.fromRegistry || r.fromSelection) && !r.read).map((r) => r.id)
          if (unseen.length) messagesStore.markInboxSeen(unseen)
        }
      } catch (_) {
        /* 使用本地通知 */
      }
    }
    messagesStore.markNotificationsRead()
    const pages = getCurrentPages()
    const mine = pages.length >= 2 ? pages[pages.length - 2] : null
    if (mine && typeof mine.refresh === 'function') mine.refresh()
    this.setData({
      sections: buildSections(rows),
      totalCount: rows.length,
      emptyHint:
        rows.length === 0
          ? 'PR 通知入选后，请下拉刷新；入口在「我的 → 消息通知」（不是底部「消息」）'
          : '',
    })
  },
  async onShow() {
    await this.loadRows()
  },
})
