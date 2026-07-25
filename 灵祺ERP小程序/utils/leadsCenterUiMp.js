/** 线索中心 — 展示字段与预览数据 */
const devAuth = require('./devAuth.js')

const LEAD_TABS = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待分配' },
  { id: 'following', label: '跟进中' },
  { id: 'converted', label: '已转化' },
  { id: 'invalid', label: '无效线索' },
]

const EMPTY_STAT_CARDS = [
  { key: 'today', label: '今日新增', value: 0 },
  { key: 'pending', label: '待分配', value: 0 },
  { key: 'following', label: '跟进中', value: 0 },
  { key: 'converted', label: '已转化', value: 0 },
]

/** @deprecated 仅兼容旧引用；真实模式用 statsFromLeads */
const STAT_CARDS = EMPTY_STAT_CARDS

function emptyStatCards() {
  return EMPTY_STAT_CARDS.map((x) => ({ ...x }))
}

function statsFromLeads(items) {
  const rows = items || []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = rows.filter((x) => {
    const t = Date.parse(String(x.createdAt || ''))
    return Number.isFinite(t) && t >= start.getTime()
  }).length
  return [
    { key: 'today', label: '今日新增', value: today },
    { key: 'pending', label: '待分配', value: rows.filter((x) => x.stateKey === 'pending').length },
    { key: 'following', label: '跟进中', value: rows.filter((x) => x.stateKey === 'following').length },
    { key: 'converted', label: '已转化', value: rows.filter((x) => x.stateKey === 'converted').length },
  ]
}

function maskPhone(p) {
  const s = String(p || '').replace(/\s/g, '')
  if (s.length >= 7) return `${s.slice(0, 3)}****${s.slice(-4)}`
  return s || '—'
}

function normalizeLeadState(raw) {
  const s = String(raw || '').toLowerCase()
  if (/待分配|pending|new/.test(s)) return { key: 'pending', label: '待分配', tag: '新线索', tagCls: 'new', statusCls: 'pending' }
  if (/跟进|follow/.test(s)) return { key: 'following', label: '跟进中', tag: '跟进中', tagCls: 'follow', statusCls: 'following' }
  if (/转化|convert|done/.test(s)) return { key: 'converted', label: '已转化', tag: '已转化', tagCls: 'done', statusCls: 'converted' }
  if (/无效|invalid/.test(s)) return { key: 'invalid', label: '无效线索', tag: '无效', tagCls: 'invalid', statusCls: 'invalid' }
  return { key: 'pending', label: '待分配', tag: '新线索', tagCls: 'new', statusCls: 'pending' }
}

function formatTimeAgo(iso) {
  const t = Date.parse(String(iso || ''))
  if (!Number.isFinite(t)) return '刚刚'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day === 1) return '昨天'
  return `${day}天前`
}

function enrichLeadRow(item) {
  const st = normalizeLeadState(item.state)
  const name = String(item.name || '匿名')
  const isFemale = /女士|小姐|女/.test(name)
  return {
    id: String(item.id || ''),
    name,
    phoneMasked: maskPhone(item.phone),
    stateKey: st.key,
    stateLabel: st.label,
    tagLabel: st.tag,
    tagClass: st.tagCls,
    statusClass: st.statusCls,
    avatarClass: isFemale ? 'pink' : 'blue',
    avatarLetter: name.slice(0, 1),
    source: item.source || '抖音来客',
    leadTag: item.leadTag || '团购咨询',
    content: item.content || '想了解课程套餐与到店体验，希望尽快联系。',
    createdAt: item.createdAt || new Date().toISOString(),
    timeText: formatTimeAgo(item.createdAt),
    createdText: item.createdAt ? String(item.createdAt).slice(0, 16).replace('T', ' ') : '—',
    primaryAction: st.key === 'pending' ? '分配' : st.key === 'following' ? '继续跟进' : '查看',
    secondaryAction: st.key === 'pending' ? '忽略' : '跟进记录',
  }
}

function previewLeads() {
  return [
    {
      id: 'l1',
      name: '张女士',
      phone: '13812345678',
      state: '待分配',
      source: '抖音来客',
      leadTag: '团购咨询',
      content: '看到团购套餐想了解街舞体验课，请问周末有空位吗？',
      createdAt: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: 'l2',
      name: '李先生',
      phone: '13987654321',
      state: '跟进中',
      source: '美团团购',
      leadTag: '到店预约',
      content: '已预约周三下午到店，想确认停车是否方便。',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'l3',
      name: '王小姐',
      phone: '13600001111',
      state: '已转化',
      source: '小红书',
      leadTag: '种草转化',
      content: '通过笔记种草已下单双人套餐。',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ].map(enrichLeadRow)
}

function filterLeads(items, tabId, keyword) {
  let rows = items.slice()
  if (tabId && tabId !== 'all') rows = rows.filter((x) => x.stateKey === tabId)
  const kw = String(keyword || '').trim().toLowerCase()
  if (kw) {
    rows = rows.filter(
      (x) =>
        x.name.toLowerCase().includes(kw) ||
        x.content.toLowerCase().includes(kw) ||
        x.phoneMasked.includes(kw),
    )
  }
  return rows
}

function shouldUsePreview() {
  return devAuth.isDevSkipLogin()
}

module.exports = {
  LEAD_TABS,
  STAT_CARDS,
  emptyStatCards,
  statsFromLeads,
  enrichLeadRow,
  previewLeads,
  filterLeads,
  shouldUsePreview,
}
