const shop = require('../../utils/shopAnalysisApiMp.js')
const api = require('../../utils/api.js')

function yuan(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

Page({
  data: {
    startDate: '',
    endDate: '',
    platform: 'douyin',
    poiId: '',
    storeOptions: [{ poiId: '', poiName: '全部门店' }],
    storeIndex: 0,
    loading: true,
    analyzing: false,
    err: '',
    summary: null,
    kpis: [],
    topSales: [],
    topRefund: [],
    adviceFacts: '',
    aiSections: [],
    showAdvice: false,
    estimatedPoints: 0,
    pointsCharged: 0,
    modelUsed: '',
  },

  onLoad() {
    const range = shop.defaultRange()
    this.setData({ startDate: range.startDate, endDate: range.endDate })
    void this.loadCharts()
  },

  onStorePick(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.storeOptions[idx] || { poiId: '' }
    this.setData({ storeIndex: idx, poiId: opt.poiId || '' }, () => {
      void this.loadCharts()
    })
  },

  onStartDate(e) {
    this.setData({ startDate: e.detail.value }, () => {
      void this.loadCharts()
    })
  },
  onEndDate(e) {
    this.setData({ endDate: e.detail.value }, () => {
      void this.loadCharts()
    })
  },

  onReload() {
    void this.loadCharts()
  },

  applySummary(summary, adviceFacts) {
    if (!summary) {
      this.setData({
        summary: null,
        kpis: [],
        topSales: [],
        topRefund: [],
        adviceFacts: adviceFacts || '',
        estimatedPoints: 0,
      })
      return
    }
    const stores = [{ poiId: '', poiName: '全部门店' }].concat(
      (summary.stores || []).map((s) => ({
        poiId: String(s.poiId || ''),
        poiName: String(s.poiName || s.poiId || '门店'),
      })),
    )
    let storeIndex = 0
    if (this.data.poiId) {
      const i = stores.findIndex((s) => s.poiId === this.data.poiId)
      if (i >= 0) storeIndex = i
    }
    const kpis = [
      {
        label: '成交额',
        value: `¥${yuan(summary.salesAmountYuan)}`,
        sub: `${summary.orderCount || 0} 笔订单`,
      },
      {
        label: '退款率',
        value: `${summary.refundRate || 0}%`,
        sub: `${summary.refundCount || 0} 笔退款`,
      },
      {
        label: '复购率',
        value: `${summary.repurchaseRate || 0}%`,
        sub: `${summary.buyerCount || 0} 位买家`,
      },
      {
        label: '新客占比',
        value: `${summary.newBuyerShare || 0}%`,
        sub: `新 ${summary.newBuyerCount || 0} / 老 ${summary.oldBuyerCount || 0}`,
      },
    ]
    const maxSales = Math.max(1, ...(summary.topBySales || []).map((x) => Number(x.salesYuan) || 0))
    const topSales = (summary.topBySales || []).slice(0, 8).map((x, i) => ({
      id: `s-${i}`,
      name: String(x.name || x.productName || '商品').slice(0, 28),
      meta: `¥${yuan(x.salesYuan)}`,
      pct: Math.round(((Number(x.salesYuan) || 0) / maxSales) * 100),
    }))
    const maxRef = Math.max(1, ...(summary.topByRefund || []).map((x) => Number(x.refundYuan) || 0))
    const topRefund = (summary.topByRefund || []).slice(0, 6).map((x, i) => ({
      id: `r-${i}`,
      name: String(x.name || x.productName || '商品').slice(0, 28),
      meta: `¥${yuan(x.refundYuan)} · ${x.refundRate || 0}%`,
      pct: Math.round(((Number(x.refundYuan) || 0) / maxRef) * 100),
    }))
    this.setData({
      summary,
      storeOptions: stores,
      storeIndex,
      kpis,
      topSales,
      topRefund,
      adviceFacts: adviceFacts || '',
      estimatedPoints: shop.shopAnalysisAiPointsFromGross(summary.estimatedGrossYuan),
    })
  },

  async loadCharts() {
    if (!api.isRealAuthed || !api.isRealAuthed()) {
      this.setData({ loading: false, err: '请先登录后再查看店铺分析' })
      return
    }
    this.setData({ loading: true, err: '', showAdvice: false, aiSections: [], pointsCharged: 0 })
    try {
      const r = await shop.fetchShopAnalysisSummary({
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        platform: this.data.platform,
        poiId: this.data.poiId || undefined,
      })
      this.applySummary(r.summary, r.adviceFacts)
      this.setData({ loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        err: e instanceof Error ? e.message : '加载失败',
        summary: null,
      })
    }
  },

  onAnalyze() {
    if (!this.data.summary || this.data.analyzing) return
    this.setData({ analyzing: true, err: '' })
    void (async () => {
      try {
        const r = await shop.fetchShopAnalysisAi({
          startDate: this.data.startDate,
          endDate: this.data.endDate,
          platform: this.data.platform,
          poiId: this.data.poiId || undefined,
        })
        if (r.summary) this.applySummary(r.summary, r.adviceFacts)
        const sections =
          r.aiSections && r.aiSections.length
            ? r.aiSections.map((s, i) => ({
                id: `a-${i}`,
                title: s.title || `第 ${i + 1} 节`,
                body: s.body || (s.bullets || []).map((b) => `· ${b}`).join('\n') || '',
              }))
            : r.aiReport
              ? [{ id: 'a-0', title: '经营建议', body: r.aiReport }]
              : []
        if (!sections.length && r.adviceFacts) {
          sections.push({ id: 'a-f', title: '规则建议', body: r.adviceFacts })
        }
        this.setData({
          analyzing: false,
          showAdvice: true,
          aiSections: sections,
          pointsCharged: r.pointsCharged || 0,
          modelUsed: r.modelUsed || '',
          err: r.aiFailed && r.message ? r.message : '',
        })
      } catch (e) {
        this.setData({
          analyzing: false,
          err: e instanceof Error ? e.message : '分析失败',
        })
      }
    })()
  },
})
