/** 投流管理 — 展示字段与预览数据 */
const devAuth = require('./devAuth.js')

const STATUS_TABS = [
  { id: 'all', label: '全部' },
  { id: 'running', label: '投放中' },
  { id: 'paused', label: '已暂停' },
  { id: 'ended', label: '已结束' },
]

const EMPTY_TODAY_STATS = [
  { key: 'spend', label: '消耗(元)', value: '—', trend: '' },
  { key: 'expose', label: '曝光', value: '—', trend: '' },
  { key: 'click', label: '点击', value: '—', trend: '' },
  { key: 'deal', label: '成交(元)', value: '—', trend: '' },
]

/** @deprecated 仅预览模式使用；真实模式用 emptyTodayStats / statsFromAds */
const TODAY_STATS = EMPTY_TODAY_STATS

function emptyTodayStats() {
  return EMPTY_TODAY_STATS.map((x) => ({ ...x }))
}

function statsFromAds(items) {
  if (!items || !items.length) return emptyTodayStats()
  const num = (v) => {
    const n = Number(String(v || '').replace(/[^\d.]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  const spend = items.reduce((s, x) => s + num(x.spend), 0)
  const expose = items.reduce((s, x) => s + num(x.exposure), 0)
  const fmt = (n, money) => {
    if (!n) return '—'
    if (money) return n.toFixed(2)
    return String(Math.round(n))
  }
  return [
    { key: 'spend', label: '消耗(元)', value: fmt(spend, true), trend: '' },
    { key: 'expose', label: '曝光', value: fmt(expose, false), trend: '' },
    { key: 'click', label: '点击', value: '—', trend: '' },
    { key: 'deal', label: '成交(元)', value: '—', trend: '' },
  ]
}

function normalizeAdStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (/投放|运行|enable|active|running/.test(s)) return { key: 'running', label: '投放中', cls: 'running' }
  if (/暂停|pause|stop/.test(s)) return { key: 'paused', label: '已暂停', cls: 'paused' }
  if (/结束|end|done|close/.test(s)) return { key: 'ended', label: '已结束', cls: 'ended' }
  return { key: 'running', label: raw || '投放中', cls: 'running' }
}

function enrichAdRow(item) {
  const st = normalizeAdStatus(item.status)
  return {
    id: String(item.id || ''),
    name: String(item.name || '广告计划'),
    statusKey: st.key,
    statusLabel: st.label,
    statusClass: st.cls,
    tags: item.tags || ['本地推'],
    dailyBudget: item.dailyBudget || item.budget || '—',
    spend: item.spend != null && item.spend !== '' ? item.spend : '—',
    exposure: item.exposure != null && item.exposure !== '' ? item.exposure : '—',
    duration: item.duration || '—',
    actionLabel: st.key === 'paused' ? '继续投放' : '管理',
    thumb: item.thumb || '',
  }
}

function previewAds() {
  return [
    {
      id: 'ad1',
      name: '本地推暑期引流',
      status: '投放中',
      tags: ['本地推', '团购'],
      dailyBudget: '300.00',
      spend: '186.50',
      exposure: '12,345',
      duration: '07.01 - 07.31',
    },
    {
      id: 'ad2',
      name: '聚光笔记加热',
      status: '已暂停',
      tags: ['小红书', '种草'],
      dailyBudget: '150.00',
      spend: '42.00',
      exposure: '2,108',
      duration: '06.15 - 07.15',
    },
  ].map(enrichAdRow)
}

function tabCounts(items) {
  const c = { all: items.length, running: 0, paused: 0, ended: 0 }
  for (const x of items) {
    if (x.statusKey === 'running') c.running += 1
    else if (x.statusKey === 'paused') c.paused += 1
    else if (x.statusKey === 'ended') c.ended += 1
  }
  return STATUS_TABS.map((t) => ({
    ...t,
    count: t.id === 'all' ? c.all : c[t.id] || 0,
    labelFull: `${t.label}(${t.id === 'all' ? c.all : c[t.id] || 0})`,
  }))
}

function filterByTab(items, tabId) {
  if (!tabId || tabId === 'all') return items
  return items.filter((x) => x.statusKey === tabId)
}

function shouldUsePreview() {
  return devAuth.isDevSkipLogin()
}

module.exports = {
  STATUS_TABS,
  TODAY_STATS,
  emptyTodayStats,
  statsFromAds,
  enrichAdRow,
  previewAds,
  tabCounts,
  filterByTab,
  shouldUsePreview,
}
