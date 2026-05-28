const messagesStore = require('../../utils/messagesStore.js')

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
  onShow() {
    const rows = messagesStore.readNotifications()
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
