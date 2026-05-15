const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const { PLATFORM_TABS, readPlatformToken } = require('../../utils/platformTokensMp.js')

const TONE_BY_PLAT = {
  douyin: 'pink',
  meituan: 'amber',
  xiaohongshu: 'rose',
  jd: 'red',
}

/** 经营概览：与电脑端首页类似的汇总指标 */
Page({
  data: {
    loading: false,
    rangeLabel: '近 7 日',
    stats: [
      { label: '成交额', value: '—', hint: '连接电脑端后台后展示；店铺授权在电脑端完成' },
      { label: '订单数', value: '—', hint: '' },
      { label: '转化率', value: '—', hint: '' },
      { label: '涨粉', value: '—', hint: '额外指标接口就绪后展示' },
    ],
    platforms: [],
    todos: [
      { title: '处理待回复评论', sub: '与电脑端评论管理一致', url: '/pages/reviews-list/reviews-list' },
      { title: '商品列表与同步', sub: '多平台商品', url: '/pages/product-list/product-list' },
      { title: '跟进达人招募单', sub: '招募列表', url: '/pages/recruitment/recruitment' },
    ],
  },
  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const platforms = PLATFORM_TABS.map((p) => ({
      id: p.id,
      name: p.label,
      tone: TONE_BY_PLAT[p.id] || 'slate',
      connected: Boolean(readPlatformToken(p.id)),
    }))
    this.setData({ platforms })
    void this.loadDash()
  },
  async loadDash() {
    if (!merchant.hasMerchantApi()) {
      this.setData({
        loading: false,
        stats: [
          { label: '成交额', value: '—', hint: '请先配置电脑端商家后台地址' },
          { label: '订单数', value: '—', hint: '' },
          { label: '转化率', value: '—', hint: '' },
          { label: '涨粉', value: '—', hint: '' },
        ],
      })
      return
    }
    this.setData({ loading: true })
    const d = await dashboardMp.fetchAggregateDashboard('day7')
    const stats = [
      {
        label: '成交额',
        value: d.connected ? dashboardMp.formatCurrencyYuan(d.totalRevenue) : '—',
        hint: d.connected ? '近7日 · 已连接后台' : '请先在电脑端「系统设置」绑定各平台店铺',
      },
      {
        label: '订单数',
        value: d.connected && d.totalOrders ? String(d.totalOrders) : d.connected ? '0' : '—',
        hint: '',
      },
      {
        label: '转化率',
        value: d.connected && d.conversionRate ? `${d.conversionRate}%` : '—',
        hint: '',
      },
      {
        label: '涨粉',
        value: '—',
        hint: '粉丝等扩展指标可在电脑端查看',
      },
    ]
    this.setData({ loading: false, stats })
  },
})
