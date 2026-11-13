/** 消息通知 — 展示样式 */
function formatTimeLabel(iso) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return String(iso).slice(0, 16)
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 60) return `${Math.max(1, min)}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day}天前`
  try {
    const d = new Date(t)
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch (_) {
    return ''
  }
}

function pickStyle(title, body) {
  const t = `${title} ${body}`
  if (/招募|报名/.test(t)) return { icon: '📋', bg: '#dbeafe' }
  if (/商品|审核|上架/.test(t)) return { icon: '🛍', bg: '#d1fae5' }
  if (/会员|订阅|套餐/.test(t)) return { icon: '👑', bg: '#ffedd5' }
  if (/评论|评价/.test(t)) return { icon: '💬', bg: '#e0e7ff' }
  if (/财务|对账|结款/.test(t)) return { icon: '💰', bg: '#ecfccb' }
  return { icon: '🔔', bg: '#e0f2fe' }
}

function enrichNotification(item) {
  const style = pickStyle(item.title, item.body)
  return {
    ...item,
    timeLabel: formatTimeLabel(item.time),
    icon: style.icon,
    iconBg: style.bg,
    desc: String(item.body || item.desc || '').trim() || '点击查看详情',
  }
}

const PREVIEW_ITEMS = [
  {
    id: 'n1',
    title: '招募单有新报名',
    body: '有 1 个招募单收到新报名，快去查看吧',
    time: new Date(Date.now() - 300000).toISOString(),
    read: false,
  },
  {
    id: 'n2',
    title: '商品审核通过',
    body: '「双人街舞体验课」已通过平台审核并上架',
    time: new Date(Date.now() - 86400000).toISOString(),
    read: false,
  },
  {
    id: 'n3',
    title: '会员即将到期',
    body: '专业版将于 30 天后到期，建议提前续费',
    time: new Date(Date.now() - 259200000).toISOString(),
    read: true,
  },
].map(enrichNotification)

module.exports = {
  enrichNotification,
  PREVIEW_ITEMS,
  formatTimeLabel,
}
