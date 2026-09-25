const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const shop = require('../../utils/shopAnalysisApiMp.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

const YDAY_CACHE_KEY = 'meoo_dash_yesterday_analysis_v1'

const RANGE_TABS = [
  { id: 'today', label: '今日', apiRange: 'realtime' },
  { id: 'day7', label: '7日', apiRange: 'day7' },
  { id: 'day30', label: '30日', apiRange: 'day30' },
]

const EMPTY_KPIS = [
  { label: '成交额', value: '—', delta: '', deltaUp: true, iconKey: 'shop' },
  { label: '核销单', value: '—', delta: '', deltaUp: true, iconKey: 'list' },
  { label: '转化率', value: '—', delta: '', deltaUp: true, iconKey: 'star' },
  { label: '在途招募', value: '—', delta: '', deltaUp: true, iconKey: 'user' },
]

/** 仅 DEV_SKIP 预览模式使用 */
const PREVIEW_BY_RANGE = {
  today: {
    kpis: [
      { label: '成交额', value: '¥12,480', delta: '较昨日 +12.5%', deltaUp: true, iconKey: 'shop' },
      { label: '核销单', value: '326', delta: '较昨日 +8.3%', deltaUp: true, iconKey: 'list' },
      { label: '转化率', value: '12.6%', delta: '较昨日 +0.8%', deltaUp: true, iconKey: 'star' },
      { label: '在途招募', value: '18', delta: '较昨日 +2', deltaUp: true, iconKey: 'user' },
    ],
  },
  day7: {
    kpis: [
      { label: '成交额', value: '¥86,320', delta: '较上周期 +9.1%', deltaUp: true, iconKey: 'shop' },
      { label: '核销单', value: '2,148', delta: '较上周期 +6.4%', deltaUp: true, iconKey: 'list' },
      { label: '转化率', value: '11.4%', delta: '较上周期 +0.6%', deltaUp: true, iconKey: 'star' },
      { label: '在途招募', value: '24', delta: '较上周期 +5', deltaUp: true, iconKey: 'user' },
    ],
  },
  day30: {
    kpis: [
      { label: '成交额', value: '¥328,600', delta: '较上周期 +15.2%', deltaUp: true, iconKey: 'shop' },
      { label: '核销单', value: '8,926', delta: '较上周期 +11.8%', deltaUp: true, iconKey: 'list' },
      { label: '转化率', value: '13.1%', delta: '较上周期 +1.2%', deltaUp: true, iconKey: 'star' },
      { label: '在途招募', value: '31', delta: '较上周期 +7', deltaUp: true, iconKey: 'user' },
    ],
  },
}

function chartTitleFor(rangeId) {
  if (rangeId === 'day30') return '近30日成交趋势'
  if (rangeId === 'day7') return '近7日成交趋势'
  return '今日成交趋势'
}

function formatConversion(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const text = String(Math.round(n * 10) / 10)
  return text.endsWith('%') ? text : `${text}%`
}

function enrichKpis(kpis) {
  return kpis.map((k) => ({
    ...k,
    iconSrc: iconDataUri('cyan', k.iconKey),
  }))
}

function shanghaiNowParts(date) {
  const d = date || new Date()
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(d),
  )
  return { ymd, hour: Number.isFinite(hour) ? hour : 0 }
}

function addDaysYmd(ymd, delta) {
  const ms = new Date(`${ymd}T12:00:00+08:00`).getTime() + delta * 86400000
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

/** 10:00 前沿用上一档；10:00 起分析昨天，缓存到次日 10:00 */
function yesterdayRefreshSlot(now) {
  const { ymd, hour } = shanghaiNowParts(now)
  if (hour >= 10) return { slot: ymd, targetDate: addDaysYmd(ymd, -1) }
  return { slot: addDaysYmd(ymd, -1), targetDate: addDaysYmd(ymd, -2) }
}

function dashTenantKey() {
  try {
    return String(wx.getStorageSync('meoo_active_tenant_id') || wx.getStorageSync('meoo_login_name') || '').trim()
  } catch (_) {
    return ''
  }
}

function readYesterdayCache(slot, tenant) {
  try {
    const raw = wx.getStorageSync(YDAY_CACHE_KEY)
    const row = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    if (!row || row.slot !== slot || row.tenant !== tenant) return null
    if (!Array.isArray(row.sections) || !row.sections.length) return null
    return row
  } catch (_) {
    return null
  }
}

function writeYesterdayCache(row) {
  try {
    wx.setStorageSync(YDAY_CACHE_KEY, row)
  } catch (_) {}
}

function sectionsFromAi(r) {
  const list = Array.isArray(r && r.aiSections) ? r.aiSections : []
  const out = list
    .map((s, i) => ({
      id: String((s && s.id) || i),
      title: String((s && (s.title || s.heading)) || '').trim(),
      body: String((s && (s.body || s.content || s.text)) || '').trim(),
    }))
    .filter((s) => s.body)
  const report = String((r && r.aiReport) || '').trim()
  if (!out.length && report) out.push({ id: 'report', title: '', body: report })
  return out
}

Page({
  data: {
    loading: false,
    range: 'today',
    rangeTabs: RANGE_TABS,
    heroIconSrc: iconDataUri('cyan', 'shop'),
    kpis: enrichKpis(EMPTY_KPIS),
    usePreview: false,
    chartEmpty: true,
    chartBars: [],
    chartHint: '',
    chartTitle: '趋势分析',
    ydayTitle: '昨日数据分析',
    ydayDate: '',
    ydayHint: '每天 10:00 更新，结果缓存 1 天',
    ydayLoading: false,
    ydaySections: [],
    ydayEmpty: '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    if (!api.canAccessPage()) {
      api.goLogin()
      return
    }
    void this.loadDash()
    void this.loadYesterdayAnalysis()
  },

  onRangeTap(e) {
    const range = e.currentTarget.dataset.id
    if (!range || range === this.data.range) return
    this.setData({ range })
    void this.loadDash()
  },

  async loadDash() {
    const tab = RANGE_TABS.find((t) => t.id === this.data.range) || RANGE_TABS[0]
    const previewPack = PREVIEW_BY_RANGE[tab.id] || PREVIEW_BY_RANGE.today

    if (devAuth.isDevSkipLogin()) {
      const demo = [
        { label: '09-16', value: 80, pct: 55, tip: '¥80' },
        { label: '09-17', value: 120, pct: 80, tip: '¥120' },
        { label: '09-18', value: 90, pct: 62, tip: '¥90' },
        { label: '09-19', value: 150, pct: 100, tip: '¥150' },
        { label: '09-20', value: 110, pct: 74, tip: '¥110' },
        { label: '09-21', value: 130, pct: 87, tip: '¥130' },
        { label: '09-22', value: 140, pct: 93, tip: '¥140' },
      ]
      this.setData({
        loading: false,
        usePreview: true,
        kpis: enrichKpis(previewPack.kpis),
        chartEmpty: false,
        chartBars: demo,
        chartHint: '预览数据',
        chartTitle: chartTitleFor(tab.id),
      })
      return
    }

    if (!merchant.hasMerchantApi()) {
      this.setData({
        loading: false,
        usePreview: false,
        kpis: enrichKpis(EMPTY_KPIS),
        chartEmpty: true,
        chartBars: [],
        chartHint: '登录并绑定平台后可查看趋势',
        chartTitle: chartTitleFor(tab.id),
      })
      return
    }

    this.setData({ loading: true })
    const d = await dashboardMp.fetchAggregateDashboard(tab.apiRange)
    if (!d.connected) {
      this.setData({
        loading: false,
        usePreview: false,
        kpis: enrichKpis(EMPTY_KPIS),
        chartEmpty: true,
        chartBars: [],
        chartHint: '请先在系统设置绑定至少一个平台',
        chartTitle: chartTitleFor(tab.id),
      })
      return
    }

    const kpis = enrichKpis([
      {
        label: '成交额',
        value: dashboardMp.formatCurrencyYuan(d.totalRevenue),
        delta: '',
        deltaUp: true,
        iconKey: 'shop',
      },
      {
        label: '核销单',
        value: d.totalOrders ? String(d.totalOrders) : '0',
        delta: '',
        deltaUp: true,
        iconKey: 'list',
      },
      {
        label: '转化率',
        value: formatConversion(d.conversionRate),
        delta: '',
        deltaUp: true,
        iconKey: 'star',
      },
      {
        label: '在途招募',
        value: d.fansGrowth ? String(d.fansGrowth) : '—',
        delta: '',
        deltaUp: true,
        iconKey: 'user',
      },
    ])

    const bars = Array.isArray(d.chartBars) ? d.chartBars : []
    const hasVal = bars.some((x) => Number(x.value) > 0)
    this.setData({
      loading: false,
      usePreview: false,
      kpis,
      chartEmpty: bars.length === 0,
      chartBars: bars,
      chartHint: bars.length === 0 ? '暂无趋势点' : hasVal ? '' : '已接通平台，当前区间成交额为 0',
      chartTitle: chartTitleFor(tab.id),
    })
  },

  async loadYesterdayAnalysis() {
    const { slot, targetDate } = yesterdayRefreshSlot()
    const tenant = dashTenantKey()
    const base = {
      ydayDate: targetDate,
      ydayHint: '每天 10:00 更新，结果缓存 1 天',
    }
    if (devAuth.isDevSkipLogin()) {
      this.setData({
        ...base,
        ydayLoading: false,
        ydayEmpty: '',
        ydaySections: [
          {
            id: 'preview',
            title: '经营小结',
            body: '预览：昨日成交集中在午后，核销与转化保持稳定。正式环境会按昨天的订单生成，并缓存到次日 10:00。',
          },
        ],
      })
      return
    }
    if (!api.isRealAuthed || !api.isRealAuthed() || !merchant.hasMerchantApi()) {
      this.setData({
        ...base,
        ydayLoading: false,
        ydaySections: [],
        ydayEmpty: '登录后查看昨日数据分析',
      })
      return
    }
    const cached = readYesterdayCache(slot, tenant)
    if (cached) {
      this.setData({
        ...base,
        ydayLoading: false,
        ydayEmpty: '',
        ydayDate: cached.targetDate || targetDate,
        ydaySections: cached.sections,
        ydayHint:
          cached.pointsCharged > 0
            ? `每天 10:00 更新，结果缓存 1 天 · 已消耗 ${cached.pointsCharged} 积分`
            : base.ydayHint,
      })
      return
    }
    if (this._ydayLoading) return
    this._ydayLoading = true
    const seq = (this._ydaySeq || 0) + 1
    this._ydaySeq = seq
    this.setData({ ...base, ydayLoading: true, ydayEmpty: '', ydaySections: [] })
    try {
      const r = await shop.fetchShopAnalysisAi({
        startDate: targetDate,
        endDate: targetDate,
        platform: 'all',
      })
      if (seq !== this._ydaySeq) return
      const sections = sectionsFromAi(r)
      if (!sections.length) {
        this.setData({
          ydayLoading: false,
          ydaySections: [],
          ydayEmpty: r.message || '昨日暂无可分析的经营数据',
        })
        return
      }
      writeYesterdayCache({
        slot,
        tenant,
        targetDate,
        sections,
        pointsCharged: Number(r.pointsCharged) || 0,
        savedAt: Date.now(),
      })
      this.setData({
        ydayLoading: false,
        ydayEmpty: '',
        ydaySections: sections,
        ydayHint:
          Number(r.pointsCharged) > 0
            ? `每天 10:00 更新，结果缓存 1 天 · 本次消耗 ${r.pointsCharged} 积分`
            : base.ydayHint,
      })
    } catch (e) {
      if (seq !== this._ydaySeq) return
      this.setData({
        ydayLoading: false,
        ydaySections: [],
        ydayEmpty: e instanceof Error ? e.message : '昨日分析暂时无法生成',
      })
    } finally {
      if (seq === this._ydaySeq) this._ydayLoading = false
    }
  },
})
