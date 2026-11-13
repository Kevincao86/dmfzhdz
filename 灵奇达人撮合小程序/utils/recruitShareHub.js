const shareCopy = require('./recruitmentShareCopy.js')

const STORAGE_KEY = 'meoo_recruit_share_payload'
const WEB_ORIGIN = 'https://dr.mofangdianai.com'

const POSTER_COLORS = [
  { id: 'sunset', label: '橙', color: '#F97316', index: 0 },
  { id: 'aurora', label: '紫', color: '#7C3AED', index: 1 },
  { id: 'mint', label: '绿', color: '#0D9488', index: 2 },
  { id: 'night', label: '蓝', color: '#6366F1', index: 3 },
  { id: 'rose', label: '红', color: '#E11D48', index: 4 },
  { id: 'gold', label: '金', color: '#D97706', index: 5 },
]

const CODE_SIZES = [
  { id: 's', label: '小', px: 280 },
  { id: 'm', label: '中', px: 420 },
  { id: 'l', label: '大', px: 560 },
]

const SHAPES = [
  { id: 'round', label: '圆形', radius: 999 },
  { id: 'soft', label: '圆角', radius: 36 },
  { id: 'square', label: '方形', radius: 8 },
]

function recruitmentWebUrl(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return ''
  return `${WEB_ORIGIN}/recruitment/${encodeURIComponent(id)}`
}

function savePayload(order, extra) {
  const id = order && order.id ? String(order.id) : ''
  const payload = Object.assign(
    {
      order: order || null,
      webUrl: recruitmentWebUrl(id),
      savedAt: Date.now(),
    },
    extra || {},
  )
  try {
    wx.setStorageSync(STORAGE_KEY, payload)
  } catch (_) {}
  return payload
}

function readPayload() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    return raw && raw.order ? raw : null
  } catch (_) {
    return null
  }
}

function openStudio(order, tab, mode) {
  savePayload(order, { tab: tab || 'poster', mode: mode || 'link' })
  const q = [`tab=${encodeURIComponent(tab || 'poster')}`]
  if (mode) q.push(`mode=${encodeURIComponent(mode)}`)
  wx.navigateTo({
    url: `/pages/subpack-pr/mine-pr-recruit-share/mine-pr-recruit-share?${q.join('&')}`,
  })
}

function buildWebShareText(order, webUrl, edition) {
  const title = String((order && order.title) || '招募').trim()
  const url = String(webUrl || '').trim()
  if (!url) return title
  if (edition === 'pure') return `${title}\n${url}`
  return `【${title}】\n打开链接查看招募并报名：\n${url}`
}

function buildShortShareText(order, shortLink, edition) {
  const title = String((order && order.title) || '招募').trim()
  const link = String(shortLink || '').trim()
  if (edition === 'pure') return link || title
  return `【${title}】\n微信里点开即可报名：\n${link}`
}

module.exports = {
  POSTER_COLORS,
  CODE_SIZES,
  SHAPES,
  recruitmentWebUrl,
  savePayload,
  readPayload,
  openStudio,
  buildWebShareText,
  buildShortShareText,
  shareCopy,
}
