/** 评价管理 — 展示字段与预览数据 */
const { GROUPBUY_OPTIONS } = require('./productCreatePlatformsMp.js')
const devAuth = require('./devAuth.js')

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
  const keywords = Array.isArray(item.keywords)
    ? item.keywords
    : extractKeywords(item.content)
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

function previewPlatTabs() {
  return [
    { id: 'all', label: '全部', count: 23, logo: '' },
    { id: 'douyin', label: '抖音', count: 8, logo: PLAT_LOGO.douyin },
    { id: 'meituan', label: '美团', count: 10, logo: PLAT_LOGO.meituan },
    { id: 'xiaohongshu', label: '小红书', count: 3, logo: PLAT_LOGO.xiaohongshu },
    { id: 'dianping', label: '大众点评', count: 2, logo: PLAT_LOGO.dianping },
  ]
}

function previewReviews(platTab) {
  const all = [
    {
      id: 'r1',
      platId: 'douyin',
      userName: '用户A',
      ratingStars: 5,
      content: '环境很好，老师专业，孩子很喜欢街舞课！',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      replied: false,
      aiSuggest: '感谢您的认可！我们会继续优化课程体验，欢迎常来～',
    },
    {
      id: 'r2',
      platId: 'meituan',
      userName: '用户B',
      ratingStars: 3,
      content: '味道不错但排队有点久，建议错峰到店。',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      replied: false,
      aiSuggest: '抱歉让您久等，我们已增加高峰时段人手，期待您再次光临。',
    },
    {
      id: 'r3',
      platId: 'xiaohongshu',
      userName: '用户C',
      ratingStars: 5,
      content: '拍照很出片，套餐划算，会推荐给朋友。',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      replied: true,
      replyText: '谢谢种草！周末有新品上线，欢迎再来打卡～',
    },
    {
      id: 'r4',
      platId: 'dianping',
      userName: '用户D',
      ratingStars: 4,
      content: '位置好找，停车方便，整体体验不错。',
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      replied: true,
      replyText: '感谢支持，我们会继续保持服务品质。',
    },
  ]
  const rows = platTab === 'all' ? all : all.filter((x) => x.platId === platTab)
  return rows.map((x) => enrichReviewRow(x, x.platId))
}

function shouldUsePreview() {
  return devAuth.isDevSkipLogin()
}

module.exports = {
  enrichReviewRow,
  previewPlatTabs,
  previewReviews,
  shouldUsePreview,
  PLAT_LOGO,
}
