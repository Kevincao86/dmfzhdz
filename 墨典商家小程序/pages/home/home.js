const api = require('../../utils/api.js')
const devAuth = require('../../utils/devAuth.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')
const tiers = require('../../utils/meooPaymentTiers.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const { hasAnyPlatformToken } = require('../../utils/platformTokensMp.js')
const { buildIconPages, buildFeaturedList } = require('../../utils/homeMenuFlat.js')

const DEFAULT_METRICS = [
  { value: '—', label: '可用余额', sub: '加载中…' },
  { value: '—', label: '成交额', sub: '近7日' },
  { value: '—', label: '招募待办', sub: '待接单' },
]

Page({
  data: {
    storeName: '墨典商家',
    statusText: '正常经营',
    balanceLoaded: false,
    erpLinked: false,
    scoreLabel: '经营分',
    score: '—',
    scoreHint: '登录后同步钱包与招募数据',
    metrics: DEFAULT_METRICS,
    dataBanner: '正在同步电脑端商家数据…',
    featured: [],
    iconPages: [],
    swiperH: 320,
    todos: [
      {
        title: '待回复评论',
        sub: '与电脑端评论管理一致',
        url: '/pages/reviews-list/reviews-list',
      },
      {
        title: '达人招募单跟进',
        sub: '与电脑端同一份招募数据，可在小程序提交与查看',
        url: '/pages/recruitment/recruitment',
      },
    ],
    todoTotal: 2,
    promos: [
      {
        key: 'p1',
        size: 'large',
        title: '我的钱包',
        sub: '充值 · 订阅 · 账单',
        url: '/pages/wallet/wallet',
        theme: 'coral',
      },
      {
        key: 'p2',
        size: 'small',
        title: '达人招募',
        sub: '列表与提交',
        url: '/pages/recruitment/recruitment',
        theme: 'sky',
      },
      {
        key: 'p3',
        size: 'small',
        title: '短视频看板',
        sub: '脚本与任务',
        url: '/pages/module-detail/module-detail?k=shortvideo',
        theme: 'mint',
      },
    ],
  },
  onShow() {
    wx.switchTab({ url: '/pages/agent/agent' })
  },

  _legacyOnShow() {
    if (!api.isAuthed()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const featured = buildFeaturedList()
    const raw = buildIconPages()
    const iconPages = raw.length ? raw : [[]]
    const swiperH = Math.min(500, 280 + (iconPages.length > 1 ? 44 : 0))
    const erpLinked = merchant.hasMerchantApi()
    this.setData({ featured, iconPages, swiperH, erpLinked })
    try {
      const name = wx.getStorageSync('meoo_login_name')
      if (name && String(name).trim()) this.setData({ storeName: String(name).trim() })
    } catch (_) {}
    void this.loadLiveData()
  },

  async loadLiveData() {
    const erpLinked = merchant.hasMerchantApi()
    const metrics = DEFAULT_METRICS.map((m) => Object.assign({}, m))
    let score = '—'
    let scoreLabel = '经营分'
    let scoreHint = '登录成功后可显示余额'
    let dataBanner = '正在加载…'
    let balanceLoaded = false

    if (devAuth.isDevSkipLogin()) {
      score = '¥12,580.00'
      scoreLabel = '可用余额'
      scoreHint = '开发模式 · 示意数据'
      metrics[0] = { value: '¥12,580', label: '可用余额', sub: '示意' }
      metrics[1] = { value: '¥8,420', label: '成交额', sub: '近7日 · 示意' }
      metrics[2] = { value: '2', label: '招募待办', sub: '待接单 · 示意' }
      dataBanner =
        '开发模式：已跳过登录，以下为示意数据，便于设计内部页面。对接真实数据请将 utils/config.js 中 DEV_SKIP_LOGIN 设为 false。'
      this.setData({
        erpLinked,
        balanceLoaded: true,
        score,
        scoreLabel,
        scoreHint,
        metrics,
        dataBanner,
        statusText: '设计预览',
      })
      return
    }

    try {
      const tid = await rest.fetchPrimaryTenantId()
      const sum = await rest.fetchTenantWalletSummary(tid)
      const yuan = tiers.formatYuanFromCents(sum.balanceCents)
      score = `¥${yuan}`
      scoreLabel = '可用余额'
      scoreHint = '与电脑端「我的钱包」一致'
      metrics[0] = { value: `¥${yuan}`, label: '可用余额', sub: '实时' }
      balanceLoaded = true
      dataBanner =
        '钱包、流水已与电脑端一致。成交额等来自各平台店铺的数据，需先在电脑端完成店铺授权；达人招募还需连接电脑端商家后台网络。'

      try {
        const tname = await rest.fetchTenantMerchantName(tid)
        if (tname && String(tname).trim()) this.setData({ storeName: String(tname).trim() })
      } catch (_) {}
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e)
      scoreHint = '钱包暂不可用'
      metrics[0] = { value: '—', label: '可用余额', sub: '请稍后再试或联系技术支持' }
      dataBanner =
        /does not exist|relation|schema/i.test(msg) || /Could not find/i.test(msg)
          ? '钱包功能尚未在后台就绪，请联系技术支持完成数据初始化。'
          : `暂时无法显示钱包：${msg.slice(0, 80)}`
    }

    metrics[1] = { value: '—', label: '成交额', sub: '近7日' }
    if (erpLinked && hasAnyPlatformToken()) {
      try {
        const d = await dashboardMp.fetchAggregateDashboard('day7')
        if (d.connected) {
          metrics[1] = {
            value: dashboardMp.formatCurrencyYuan(d.totalRevenue),
            label: '成交额',
            sub: d.totalOrders ? `近7日 · ${d.totalOrders} 单` : '近7日 · 汇总',
          }
        }
      } catch (_) {}
    } else if (!erpLinked) {
      metrics[1].sub = '近7日 · 需连接电脑端后台'
    } else if (erpLinked) {
      metrics[1].sub = '近7日 · 请在电脑端绑定店铺'
    }

    if (erpLinked) {
      try {
        const tid = await rest.fetchPrimaryTenantId()
        const merchantName = (await rest.fetchTenantMerchantName(tid).catch(() => '')) || ''
        const reg = await ops.fetchRegistry()
        let list = Array.isArray(reg.recruitmentOrders) ? reg.recruitmentOrders : []
        if (merchantName) {
          list = list.filter((o) => String(o.customerName || '').trim() === merchantName.trim())
        }
        const pending = list.filter((o) => o.status === 'pending').length
        metrics[2] = { value: String(pending), label: '招募待办', sub: '待接单' }
      } catch (_) {
        metrics[2] = { value: '—', label: '招募待办', sub: '列表加载失败' }
      }
    } else {
      metrics[2] = {
        value: '—',
        label: '招募待办',
        sub: '需连接电脑端后台',
      }
      if (balanceLoaded) {
        dataBanner =
          '钱包已与电脑端一致。达人招募要与电脑端互通，请让技术人员在配置文件里填写您电脑上商家后台的访问地址（与手机同一局域网）。'
      }
    }

    this.setData({
      erpLinked,
      balanceLoaded,
      score,
      scoreLabel,
      scoreHint,
      metrics,
      dataBanner,
    })
  },
  onPullDownRefresh() {
    void this.loadLiveData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onLogout() {
    api.logout()
    wx.redirectTo({ url: '/pages/login/login' })
  },
})
