const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const shop = require('../../utils/shopAnalysisApiMp.js')
const sessionSync = require('../../utils/merchantSessionSyncMp.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

const YDAY_CACHE_KEY = 'meoo_dash_yesterday_analysis_v2'
const YDAY_AUTO_KEY = 'meoo_dash_yday_auto_v1'

const RANGE_TABS = [
  { id: 'today', label: '今日', apiRange: 'realtime' },
  { id: 'day7', label: '7日', apiRange: 'day7' },
  { id: 'day30', label: '30日', apiRange: 'day30' },
]

const EMPTY_KPIS = [
  { label: '营收金额', value: '—', delta: '', deltaUp: true, iconKey: 'shop' },
  { label: '核销总金额', value: '—', delta: '', deltaUp: true, iconKey: 'list' },
  { label: '退款金额', value: '—', delta: '', deltaUp: true, iconKey: 'star' },
  { label: '成交券数', value: '—', delta: '', deltaUp: true, iconKey: 'user' },
  { label: '退款券数', value: '—', delta: '', deltaUp: true, iconKey: 'list' },
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

function readYdayAuto() {
  try {
    return wx.getStorageSync(YDAY_AUTO_KEY) === '1'
  } catch (_) {
    return false
  }
}

function writeYdayAuto(on) {
  try {
    if (on) wx.setStorageSync(YDAY_AUTO_KEY, '1')
    else wx.removeStorageSync(YDAY_AUTO_KEY)
  } catch (_) {}
}

const PAGE_CACHE_KEY = 'meoo_biz_overview_page_v1'

function readPageCache() {
  try {
    const raw = wx.getStorageSync(PAGE_CACHE_KEY)
    const row = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}
    if (!row || row.tenant !== dashTenantKey()) return null
    return row
  } catch (_) {
    return null
  }
}

function writePageCache(row) {
  try {
    wx.setStorageSync(PAGE_CACHE_KEY, row)
  } catch (_) {}
}

function saveRangeCache(rangeId, payload) {
  const row = readPageCache() || { tenant: dashTenantKey(), ranges: {} }
  row.tenant = dashTenantKey()
  row.ranges = row.ranges || {}
  row.ranges[rangeId] = Object.assign({ savedAt: Date.now() }, payload)
  writePageCache(row)
}

function readRangeCache(rangeId) {
  const row = readPageCache()
  const hit = row && row.ranges && row.ranges[rangeId]
  if (!hit || !Array.isArray(hit.kpis) || !hit.kpis.length) return null
  return hit
}

function saveYdayMetrics(targetDate, metrics) {
  const row = readPageCache() || { tenant: dashTenantKey(), ranges: {} }
  row.tenant = dashTenantKey()
  row.yday = { targetDate, metrics: metrics || [], savedAt: Date.now() }
  writePageCache(row)
}

function readYdayMetrics(targetDate) {
  const row = readPageCache()
  const yday = row && row.yday
  if (!yday || yday.targetDate !== targetDate || !Array.isArray(yday.metrics) || !yday.metrics.length) return null
  return yday.metrics
}

const YDAY_AI_SYSTEM = [
  '你是资深本地生活店铺经营顾问。请只根据给出的昨日数据写中文分析，禁止编造未提供的数字。',
  '输出只能使用这五个标题，格式为「一、标题」：',
  '一、经营总览',
  '二、客群洞察',
  '三、商品与退款',
  '四、评价口碑',
  '五、行动建议',
  '每节 3～5 条，用「· 」开头。数据不足的节写明「昨日数据不足」，不要猜测。',
].join('\n')

function pointsFromTokenUsage(usage, model) {
  const prompt = Math.max(0, Math.floor(Number(usage && usage.prompt_tokens) || 0))
  const completion = Math.max(0, Math.floor(Number(usage && usage.completion_tokens) || 0))
  if (prompt + completion <= 0) return 1
  const m = String(model || '').toLowerCase()
  let inPerK = 0.0008
  let outPerK = 0.002
  if (/flash|turbo/.test(m)) {
    inPerK = 0.0003
    outPerK = 0.0006
  } else if (/max/.test(m)) {
    inPerK = 0.0024
    outPerK = 0.0096
  } else if (/mini|haiku/.test(m)) {
    inPerK = 0.001
    outPerK = 0.004
  } else if (/gpt-4o|claude|gemini|grok/.test(m)) {
    inPerK = 0.02
    outPerK = 0.06
  }
  const costYuan = (prompt / 1000) * inPerK + (completion / 1000) * outPerK
  return Math.max(1, Math.ceil(costYuan / 0.01))
}

function cacheClaimsZeroBuyers(sections) {
  const text = (sections || []).map((s) => `${s.title || ''}\n${s.body || ''}`).join('\n')
  return /可识别买家为\s*0/.test(text) || /可识别买家[^\d]{0,8}0\s*人/.test(text)
}

function sectionsFromReport(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const parts = raw.split(/\n(?=[一二三四五六七八九十]、)/).map((s) => s.trim()).filter(Boolean)
  const sections = parts.map((block, i) => {
    const lines = block.split('\n')
    const title = lines[0].replace(/^[一二三四五六七八九十]、/, '').trim()
    const body = lines.slice(1).join('\n').trim() || lines[0]
    return { id: String(i), title: body === lines[0] ? '' : title, body }
  })
  return sections.filter((s) => s.body)
}

function formatYuanExact(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  const fixed = x.toFixed(2)
  const parts = fixed.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${parts.join('.')}`
}

function factsForYesterday(targetDate, summary, adviceFacts) {
  const s = summary || {}
  const yuan = (n) => (n == null || n === '' ? '未知' : n)
  return [
    `统计日期：${targetDate}（昨日）`,
    '平台：全部已绑定平台',
    '门店范围：全部门店',
    `营收金额：${yuan(s.salesAmountYuan)} 元`,
    `核销总金额：${yuan(s.verifyAmountYuan)} 元`,
    `退款金额：${yuan(s.refundAmountYuan)} 元`,
    `成交券数：${s.couponCount == null ? '未知' : s.couponCount}`,
    `退款券数：${s.refundCouponCount == null ? '未知' : s.refundCouponCount}`,
    `可识别买家：${s.buyerCount == null ? '未知' : s.buyerCount} 人`,
    `买家识别覆盖率：${s.openIdCoverage == null ? '未知' : s.openIdCoverage}%`,
    `新客人数：${s.newBuyerCount == null ? '未知' : s.newBuyerCount}`,
    `老客人数：${s.oldBuyerCount == null ? '未知' : s.oldBuyerCount}`,
    `新客成交占比：${s.newBuyerShare == null ? '未知' : s.newBuyerShare}%`,
    `区间复购率：${s.repurchaseRate == null ? '未知' : s.repurchaseRate}%`,
    adviceFacts ? String(adviceFacts) : '',
    '请输出完整五节分析。数字必须与上面给出的金额和券数一致，禁止把有数写成 0。',
  ]
    .filter(Boolean)
    .join('\n')
}

function summaryHasBiz(summary) {
  const s = summary || {}
  return (
    (Number(s.orderCount) || 0) > 0 ||
    (Number(s.salesAmountYuan) || 0) > 0 ||
    (Number(s.verifyAmountYuan) || 0) > 0 ||
    (Number(s.refundAmountYuan) || 0) > 0 ||
    (Number(s.couponCount) || 0) > 0 ||
    (Number(s.refundCouponCount) || 0) > 0
  )
}

function ydayMetricsFromSummary(summary) {
  const s = summary || {}
  return [
    { label: '营收金额', value: formatYuanExact(s.salesAmountYuan) },
    { label: '核销总金额', value: formatYuanExact(s.verifyAmountYuan) },
    { label: '退款金额', value: formatYuanExact(s.refundAmountYuan) },
    { label: '成交券数', value: String(Number(s.couponCount) || 0) },
    { label: '退款券数', value: String(Number(s.refundCouponCount) || 0) },
  ]
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
    ydayHint: '自动分析默认关闭，打开后每天 10:00 分析一次',
    ydayAuto: false,
    ydayLoading: false,
    ydaySections: [],
    ydayEmpty: '',
    ydayMetrics: [],
  },

  onShow() {
    if (!api.canAccessPage()) {
      api.goLogin()
      return
    }
    this.setData({ ydayAuto: readYdayAuto() })
    if (!this.paintRangeCache(this.data.range)) void this.loadDash()
    void this.loadYesterdayAnalysis()
  },

  paintRangeCache(rangeId) {
    const hit = readRangeCache(rangeId)
    if (!hit) return false
    this.setData({
      loading: false,
      usePreview: false,
      kpis: enrichKpis(hit.kpis),
      chartEmpty: !!hit.chartEmpty,
      chartBars: hit.chartBars || [],
      chartHint: hit.chartHint || '',
      chartTitle: hit.chartTitle || chartTitleFor(rangeId),
    })
    return true
  },

  async onPullDownRefresh() {
    try {
      await this.loadDash({ silent: true })
      await this.loadYesterdayAnalysis({ refreshMetrics: true })
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  onToggleYdayAuto(e) {
    const on = !!(e.detail && e.detail.value)
    writeYdayAuto(on)
    this.setData({
      ydayAuto: on,
      ydayHint: on
        ? '已开启，每天 10:00 自动分析，按实际 token 扣积分'
        : '已关闭。打开后每天 10:00 才会自动分析',
    })
    if (on) void this.loadYesterdayAnalysis()
  },

  onRangeTap(e) {
    const range = e.currentTarget.dataset.id
    if (!range || range === this.data.range) return
    this.setData({ range })
    if (!this.paintRangeCache(range)) void this.loadDash()
  },

  async loadDash(opts) {
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

    const silent = Boolean(opts && opts.silent)
    if (!silent) this.setData({ loading: true })
    let d
    try {
      d = await dashboardMp.fetchAggregateDashboard(tab.apiRange)
    } catch (e) {
      this.setData({ loading: false })
      return
    }
    if (!d || !d.connected) {
      if (silent && this.paintRangeCache(tab.id)) return
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

    const rawKpis = [
      {
        label: '营收金额',
        value: formatYuanExact(d.totalRevenue),
        delta: '',
        deltaUp: true,
        iconKey: 'shop',
      },
      {
        label: '核销总金额',
        value: formatYuanExact(d.totalVerify),
        delta: '',
        deltaUp: true,
        iconKey: 'list',
      },
      {
        label: '退款金额',
        value: formatYuanExact(d.totalRefund),
        delta: '',
        deltaUp: true,
        iconKey: 'star',
      },
      {
        label: '成交券数',
        value: String(d.totalOrders || 0),
        delta: '',
        deltaUp: true,
        iconKey: 'user',
      },
      {
        label: '退款券数',
        value: String(d.totalRefundCoupons || 0),
        delta: '',
        deltaUp: true,
        iconKey: 'list',
      },
    ]
    const kpis = enrichKpis(rawKpis)

    const bars = Array.isArray(d.chartBars) ? d.chartBars : []
    const hasVal = bars.some((x) => Number(x.value) > 0)
    const chartEmpty = bars.length === 0
    const chartHint = bars.length === 0 ? '暂无趋势点' : hasVal ? '' : '已接通平台，当前区间成交额为 0'
    const chartTitle = chartTitleFor(tab.id)
    saveRangeCache(tab.id, {
      kpis: rawKpis,
      chartEmpty,
      chartBars: bars,
      chartHint,
      chartTitle,
    })
    this.setData({
      loading: false,
      usePreview: false,
      kpis,
      chartEmpty,
      chartBars: bars,
      chartHint,
      chartTitle,
    })
  },

  async fillYesterdayMetrics(targetDate) {
    try {
      const summaryRes = await shop.fetchShopAnalysisSummary({
        startDate: targetDate,
        endDate: targetDate,
        platform: 'all',
      })
      const summary = (summaryRes && summaryRes.summary) || {}
      const metrics = ydayMetricsFromSummary(summary)
      saveYdayMetrics(targetDate, metrics)
      this.setData({
        ydayDate: targetDate,
        ydayMetrics: metrics,
      })
    } catch (_) {}
  },

  onManualYesterdayAnalysis() {
    void this.loadYesterdayAnalysis({ manual: true })
  },

  async loadYesterdayAnalysis(opts) {
    const manual = Boolean(opts && opts.manual)
    const refreshMetrics = Boolean(opts && opts.refreshMetrics)
    const { slot, targetDate } = yesterdayRefreshSlot()
    const tenant = dashTenantKey()
    const autoOn = readYdayAuto()
    const base = {
      ydayDate: targetDate,
      ydayHint: autoOn
        ? '已开启，每天 10:00 自动分析，按实际 token 扣积分'
        : '已关闭。打开后每天 10:00 才会自动分析',
    }
    if (devAuth.isDevSkipLogin()) {
      this.setData({
        ...base,
        ydayLoading: false,
        ydayEmpty: '',
        ydaySections: [
          {
            id: 'preview',
            title: '经营总览',
            body: '预览：昨日成交集中在午后。正式环境由 AI 根据昨日订单分析，按 token 扣积分。',
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
    if (!manual) {
      const cached = readYesterdayCache(slot, tenant)
      const savedMetrics = readYdayMetrics(targetDate)
      const cachedHint =
        cached && cached.pointsCharged > 0
          ? `${autoOn ? '已开启，每天 10:00 自动更新' : '自动分析已关闭'} · 本次已扣 ${cached.pointsCharged} 积分`
          : base.ydayHint
      if (!refreshMetrics) {
        if (cached) {
          this.setData({
            ...base,
            ydayLoading: false,
            ydayEmpty: '',
            ydayDate: cached.targetDate || targetDate,
            ydaySections: cached.sections,
            ydayMetrics: savedMetrics || [],
            ydayHint: cachedHint,
          })
          return
        }
        if (!autoOn) {
          if (!savedMetrics) await this.fillYesterdayMetrics(targetDate)
          this.setData({
            ...base,
            ydayLoading: false,
            ydaySections: [],
            ydayMetrics: savedMetrics || this.data.ydayMetrics,
            ydayEmpty: '自动分析未开启。打开开关后每天 10:00 分析一次，也可点手动分析',
          })
          return
        }
      } else if (cached) {
        let refreshZeroBuyers = false
        try {
          const peek = await shop.fetchShopAnalysisSummary({
            startDate: targetDate,
            endDate: targetDate,
            platform: 'all',
          })
          const peeked = (peek && peek.summary) || {}
          const metrics = ydayMetricsFromSummary(peeked)
          saveYdayMetrics(targetDate, metrics)
          this._prefetchedYday = { targetDate, summary: peeked, adviceFacts: peek && peek.adviceFacts }
          this.setData({ ydayDate: targetDate, ydayMetrics: metrics })
          refreshZeroBuyers = (Number(peeked.buyerCount) || 0) > 0 && cacheClaimsZeroBuyers(cached.sections)
        } catch (_) {
          this._prefetchedYday = null
        }
        if (!refreshZeroBuyers) {
          this.setData({
            ...base,
            ydayLoading: false,
            ydayEmpty: '',
            ydayDate: cached.targetDate || targetDate,
            ydaySections: cached.sections,
            ydayHint: cachedHint,
          })
          return
        }
      } else if (!autoOn) {
        await this.fillYesterdayMetrics(targetDate)
        this.setData({
          ...base,
          ydayLoading: false,
          ydaySections: [],
          ydayEmpty: '自动分析未开启。打开开关后每天 10:00 分析一次，也可点手动分析',
        })
        return
      }
    }
    if (this._ydayLoading) return
    this._ydayLoading = true
    const seq = (this._ydaySeq || 0) + 1
    this._ydaySeq = seq
    this.setData({ ...base, ydayLoading: true, ydayEmpty: '', ydaySections: manual ? this.data.ydaySections : [] })
    try {
      const pre = this._prefetchedYday
      const summaryRes =
        pre && pre.targetDate === targetDate
          ? { summary: pre.summary, adviceFacts: pre.adviceFacts }
          : await shop.fetchShopAnalysisSummary({
              startDate: targetDate,
              endDate: targetDate,
              platform: 'all',
            })
      this._prefetchedYday = null
      if (seq !== this._ydaySeq) return
      const summary = summaryRes.summary || {}
      const metrics = ydayMetricsFromSummary(summary)
      saveYdayMetrics(targetDate, metrics)
      this.setData({ ydayMetrics: metrics, ydayDate: targetDate })
      if (!summaryHasBiz(summary)) {
        this.setData({
          ydayLoading: false,
          ydaySections: [],
          ydayMetrics: metrics,
          ydayEmpty: '昨日暂无经营数据，未调用 AI',
        })
        return
      }
      const token = api.getBearerToken ? api.getBearerToken() : ''
      let tenantId = tenant
      try {
        tenantId = String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || tenant).trim()
      } catch (_) {}
      const chat = await merchant.merchantRequestAuth('POST', '/api/meoo-ai-chat', {
        bearerToken: token,
        timeoutMs: 90000,
        data: {
          provider: 'qwen',
          stream: false,
          ...(tenantId ? { tenantId } : {}),
          ...(token ? { access_token: token } : {}),
          messages: [
            { role: 'system', content: YDAY_AI_SYSTEM },
            { role: 'user', content: factsForYesterday(targetDate, summary, summaryRes.adviceFacts) },
          ],
        },
      })
      if (seq !== this._ydaySeq) return
      const data = chat && typeof chat === 'object' ? chat : {}
      if (data.ok === false) throw new Error(String(data.detail || data.message || data.error || 'AI 分析失败'))
      const sections = sectionsFromReport(data.content)
      if (!sections.length) throw new Error('AI 未返回分析内容')
      const pointsCharged = pointsFromTokenUsage(data.usage, data.model)
      writeYesterdayCache({
        slot,
        tenant,
        targetDate,
        sections,
        pointsCharged,
        savedAt: Date.now(),
      })
      this.setData({
        ydayLoading: false,
        ydayEmpty: '',
        ydayMetrics: metrics,
        ydaySections: sections,
        ydayHint: `按 token 扣减 · 本次 ${pointsCharged} 积分`,
      })
    } catch (e) {
      if (seq !== this._ydaySeq) return
      this.setData({
        ydayLoading: false,
        ydayEmpty: e instanceof Error ? e.message : '昨日分析暂时无法生成',
      })
    } finally {
      if (seq === this._ydaySeq) this._ydayLoading = false
    }
  },
})
