/** 评价管理 — 展示字段（禁止虚假预览数据） */
const { GROUPBUY_OPTIONS } = require('./productCreatePlatformsMp.js')

const PLAT_LOGO = {}
for (const p of GROUPBUY_OPTIONS) {
  if (p.logo) PLAT_LOGO[p.id] = p.logo
}
PLAT_LOGO.meituan = PLAT_LOGO.meituan || '/images/platforms/dianping.png'
PLAT_LOGO.dianping = '/images/platforms/dianping.png'

const PLAT_SHORT = {
  all: '全部',
  douyin: '抖音',
  meituan: '美团',
  xiaohongshu: '小红书',
  dianping: '大众点评',
  kuaishou: '快手',
}

function formatTimeAgo(iso) {
  const s = String(iso || '').trim()
  if (!s) return '刚刚'
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return s.slice(0, 16)
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  if (day < 7) return `${day}天前`
  return s.slice(0, 10)
}

function starsLabel(n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)))
  return `${v}星`
}

function replyStatusUi(replied) {
  return replied
    ? { label: '已回复', cls: 'replied' }
    : { label: '未回复', cls: 'unreplied' }
}

function enrichReviewRow(item, platId) {
  const st = replyStatusUi(item.replied)
  const keywords = Array.isArray(item.keywords) ? item.keywords : extractKeywords(item.content)
  return {
    ...item,
    platId,
    platShort: PLAT_SHORT[platId] || platId,
    platLogo: PLAT_LOGO[platId] || '',
    starsLabel: starsLabel(item.ratingStars),
    timeText: formatTimeAgo(item.createdAt),
    replyStatusLabel: st.label,
    replyStatusClass: st.cls,
    keywords,
    hasAiSuggest: !item.replied && Boolean(item.aiSuggest || item.content),
    aiSuggestPreview: String(item.aiSuggest || '').slice(0, 48) || '感谢光临，期待再次为您服务…',
  }
}

function extractKeywords(text) {
  const t = String(text || '')
  const pool = ['环境好', '服务好', '性价比高', '口味棒', '排队久', '停车方便', '位置好找']
  return pool.filter((k) => t.includes(k.slice(0, 2))).slice(0, 3)
}

/** 空平台 Tab（计数 0），供加载前 / 无数据时使用 */
function emptyPlatTabs() {
  return [
    { id: 'all', label: '全部', count: 0, logo: '' },
    { id: 'douyin', label: '抖音', count: 0, logo: PLAT_LOGO.douyin },
    { id: 'meituan', label: '美团', count: 0, logo: PLAT_LOGO.meituan },
    { id: 'xiaohongshu', label: '小红书', count: 0, logo: PLAT_LOGO.xiaohongshu },
    { id: 'dianping', label: '大众点评', count: 0, logo: PLAT_LOGO.dianping },
  ]
}

module.exports = {
  enrichReviewRow,
  emptyPlatTabs,
  PLAT_LOGO,
}
