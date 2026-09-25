const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const shop = require('../../utils/shopAnalysisApiMp.js')
const sessionSync = require('../../utils/merchantSessionSyncMp.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

const YDAY_CACHE_KEY = 'meoo_dash_yesterday_analysis_v1'
const YDAY_AUTO_KEY = 'meoo_dash_yday_auto_v1'

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

function factsForYesterday(targetDate, summary, adviceFacts) {
  const s = summary || {}
  return [
    `统计日期：${targetDate}（昨日）`,
    '平台：全部已绑定平台',
    '门店范围：全部门店',
    `成交额：${s.salesAmountYuan == null ? '未知' : s.salesAmountYuan} 元`,
    `订单数：${s.orderCount == null ? '未知' : s.orderCount}`,
    `核销额：${s.verifyAmountYuan == null ? '未知' : s.verifyAmountYuan} 元`,
    `退款额：${s.refundAmountYuan == null ? '未知' : s.refundAmountYuan} 元`,
    adviceFacts ? String(adviceFacts) : '',
    '请输出完整五节分析。',
  ]
    .filter(Boolean)
    .join('\n')
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
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    if (!api.canAccessPage()) {
      api.goLogin()
      return
    }
    this.setData({ ydayAuto: readYdayAuto() })
    void this.loadDash()
    void this.loadYesterdayAnalysis()
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

  onManualYesterdayAnalysis() {
    void this.loadYesterdayAnalysis({ manual: true })
  },

  async loadYesterdayAnalysis(opts) {
    const manual = Boolean(opts && opts.manual)
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
      if (cached) {
        this.setData({
          ...base,
          ydayLoading: false,
          ydayEmpty: '',
          ydayDate: cached.targetDate || targetDate,
          ydaySections: cached.sections,
          ydayHint:
            cached.pointsCharged > 0
              ? `${autoOn ? '已开启，每天 10:00 自动更新' : '自动分析已关闭'} · 本次已扣 ${cached.pointsCharged} 积分`
              : base.ydayHint,
        })
        return
      }
      if (!autoOn) {
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
      const summaryRes = await shop.fetchShopAnalysisSummary({
        startDate: targetDate,
        endDate: targetDate,
        platform: 'all',
      })
      if (seq !== this._ydaySeq) return
      const summary = summaryRes.summary || {}
      const orders = Number(summary.orderCount) || 0
      const sales = Number(summary.salesAmountYuan) || 0
      const facts = String(summaryRes.adviceFacts || '').trim()
      if (orders <= 0 && sales <= 0 && !facts) {
        this.setData({
          ydayLoading: false,
          ydaySections: [],
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
            { role: 'user', content: factsForYesterday(targetDate, summary, facts) },
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
