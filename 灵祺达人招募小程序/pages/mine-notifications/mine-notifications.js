const messagesStore = require('../../utils/messagesStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const merchant = require('../../utils/merchantApi.js')
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
  },
  async onShow() {
    let rows = messagesStore.readNotifications()
    if (userProfile.readIdentity() === 'talent' && merchant.hasMerchantApi()) {
      try {
        const member = talentMember.readMember()
        if (member && member.id) {
          const reg = await ops.fetchRegistry()
          rows = messagesStore.mergeRegistryInboxForTalent(reg, member.id)
          const unseen = rows.filter((r) => r.fromRegistry && !r.read).map((r) => r.id)
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
    })
  },
})
