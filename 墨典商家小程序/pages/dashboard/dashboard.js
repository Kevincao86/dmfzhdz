const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const dashboardMp = require('../../utils/dashboardMp.js')
const { PLATFORM_TABS, readPlatformToken } = require('../../utils/platformTokensMp.js')

const TONE_BY_PLAT = {
  douyin: 'pink',
  meituan: 'amber',
  xiaohongshu: 'rose',
  jd: 'red',
  kuaishou: 'cyan',
  eleme: 'blue',
  meituan_waimai: 'amber',
  jd_waimai: 'red',
}

/** 经营概览：与电脑端首页类似的汇总指标 */
Page({
  data: {
    loading: false,
    rangeLabel: '近 7 日',
    stats: [
      { label: '成交额', value: '—', hint: '连接商家后台 API 后展示' },
      { label: '订单数', value: '—', hint: '' },
      { label: '转化率', value: '—', hint: '' },
      { label: '涨粉', value: '—', hint: '额外指标接口就绪后展示' },
    ],
    platforms: [],
    todos: [
      { title: '处理待回复评论', sub: '评论管理', url: '/pages/reviews-list/reviews-list' },
      { title: '商品列表与同步', sub: '多平台商品', url: '/pages/product-list/product-list' },
      { title: '达人招募中心', sub: '五步流程与 Brief', url: '/pages/recruit-hub/recruit-hub' },
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
        hint: d.connected ? '近7日 · 已连接' : '请完成各平台店铺授权',
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
        hint: '扩展指标陆续接入',
      },
    ]
    this.setData({ loading: false, stats })
  },
})
