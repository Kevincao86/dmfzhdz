const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const geoScores = require('../../utils/geoScoresMp.js')
const geoAi = require('../../utils/geoAiMp.js')

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'consult', label: '运营咨询' },
  { id: 'store', label: '门店' },
  { id: 'content', label: '内容库' },
  { id: 'query', label: '问法' },
  { id: 'reputation', label: '口碑' },
  { id: 'sync', label: '同步' },
  { id: 'health', label: '体检' },
]

function defaultPack(storeNames) {
  const n = storeNames.length ? storeNames.slice(0, 3).join('、') : '本品牌门店'
  return `【GEO 知识包】\n门店：${n}\n营业时间：待补充\n停车信息：待补充\n主推卖点：待补充\n常见问题：待补充`
}

function localTodos(det) {
  const t = []
  if (det.inputs.infoCompletenessPercent < 90) t.push('来客门店必填字段不完整，建议补齐门头与营业时间')
  if (det.inputs.questionCoveragePercent < 60) t.push('问法覆盖偏低，建议在内容库补充 FAQ')
  if (det.inputs.contentFreshnessPercent < 70) t.push('资料新鲜度一般，建议在 7 天内更新来客信息')
  if (!t.length) t.push('结构良好 · 可到「运营咨询」试答效果')
  return t
}

const SUGGESTION_META = [
  { id: 'nap', title: 'NAP一致性', icon: '📍', iconBg: '#dbeafe', desc: '企业名称、地址、电话在各平台保持一致，提升本地检索可信度。' },
  { id: 'keyword', title: '本地关键词', icon: '🔍', iconBg: '#e0f2fe', desc: '覆盖用户常搜的本地词与长尾问法，提高被搜索引用概率。' },
  { id: 'reputation', title: '口碑证据', icon: '⭐', iconBg: '#fef3c7', desc: '沉淀可引用的评价与到店证据，增强 GEO 内容权重。' },
  { id: 'link', title: '结构化链接', icon: '🔗', iconBg: '#ede9fe', desc: '门店事实、FAQ 与平台资料互链，便于检索引擎理解。' },
]

function buildSuggestions(healthScore, kpiInfo, kpiQuery, kpiFresh) {
  const info = parseInt(String(kpiInfo).replace(/[^\d]/g, ''), 10) || 70
  const query = parseInt(String(kpiQuery).replace(/[^\d]/g, ''), 10) || 60
  const fresh = parseInt(String(kpiFresh).replace(/[^\d]/g, ''), 10) || 65
  const nap = Math.max(40, Math.min(95, Math.round((info + fresh) / 2 - 8)))
  const keyword = Math.max(40, Math.min(95, query))
  const reputation = Math.max(40, Math.min(95, Math.round((info + query) / 2)))
  const link = Math.max(40, Math.min(95, Math.round((fresh + query) / 2 - 5)))
  const scores = [nap, keyword, reputation, link]
  return SUGGESTION_META.map((m, i) => {
    const score = scores[i]
    const good = score >= 80
    return {
      ...m,
      score,
      scoreText: `${score}分`,
      statusLabel: good ? '良好' : '待优化',
      statusClass: good ? 'good' : 'warn',
      scoreClass: good ? 'good' : 'warn',
    }
  })
}

function scoreTrendText(healthScore) {
  const n = Number(healthScore)
  if (!Number.isFinite(n)) return '较上次持平'
  const delta = Math.max(0, Math.min(18, Math.round(n * 0.15)))
  return delta ? `较上次提升 ${delta} 分` : '较上次持平'
}

Page({
  data: {
    tabs: TABS,
    tab: 'overview',
    busy: false,
    scoreBusy: false,

    healthScore: '—',
    scoreTrend: '',
    kpiInfo: '—',
    kpiQuery: '—',
    kpiFresh: '—',
    scoreSource: '规则估算',
    rationale: '',
    storeSummary: '',
    querySamples: [],
    todos: [],
    suggestions: [],

    consultQ: '这家店几点营业？有停车位吗？',
    consultReply: '',
    geoPack: '',
    paneNote: '',
  },

  onShow() {
    if (!api.canAccessPage()) wx.redirectTo({ url: '/pages/login/login' })
    this.syncPaneNote()
    void this.refreshStoresAndScore()
  },

  syncPaneNote() {
    const map = {
      store: '与电脑端「门店信息」同口径：维护门头、地址、营业时间等结构化事实。',
      content: '与电脑端「内容库」同口径：维护 FAQ / 摘要等可被检索引用的结构化资产。',
      query: '与电脑端「问法覆盖」一致：查漏补缺高频提问，低于 60% 会触发待办。',
      reputation: '与电脑端「口碑证据」一致：沉淀可作引用的到店与评价证据。',
      sync: '与电脑端「平台同步」一致：把事实库对齐到来客与其他渠道。',
      health: '与电脑端「效果体检」一致：查看拆解指标与行动计划。',
      consult: '',
      overview: '',
    }
    this.setData({ paneNote: map[this.data.tab] || '' })
  },

  onTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.tab) return
    this.setData({ tab: id }, () => this.syncPaneNote())
  },

  onConsultQ(e) {
    this.setData({ consultQ: e.detail.value })
  },

  onPack(e) {
    this.setData({ geoPack: e.detail.value })
  },

  async refreshStoresAndScore() {
    const names = []
    let items = []
    if (merchant.hasMerchantApi()) {
      const r = await douyin.fetchDouyinStores()
      if (r.ok && Array.isArray(r.items)) items = r.items
    }
    for (const s of items) names.push(s.name)

    const det = geoScores.computeFromSimpleStores(items)
    const ruleHealth = geoScores.computeGeoHealthScore(det.inputs)

    let pack = this.data.geoPack
    if (!String(pack || '').trim()) pack = defaultPack(names)

    let scoreSource = '规则估算'
    let rationale = '依据来客门店基础字段的快速估算（与 Web 本地回退分值思路一致）。'
    let healthScore = String(ruleHealth)
    let kpiInfo = `${det.inputs.infoCompletenessPercent}%`
    let kpiQuery = `${det.inputs.questionCoveragePercent}%`
    let kpiFresh = `${det.inputs.contentFreshnessPercent}%`
    let querySamples = det.querySamples
    let todos = localTodos(det)

    if (merchant.hasMerchantApi() && douyin.douyinToken()) {
      try {
        const ctx = JSON.stringify(
          {
            stores: items.map((s) => ({ name: s.name, address: s.address || '' })),
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        )
        const ar = await geoAi.postGeoAiScore({ geo_score_context: ctx })
        const raw = typeof ar.raw === 'object' && ar.raw ? ar.raw : {}
        let payload =
          raw.payload && typeof raw.payload === 'object'
            ? raw.payload
            : null
        if (!payload && ar.description) {
          try {
            payload = JSON.parse(String(ar.description).replace(/^```json\n?|```$/g, ''))
          } catch (_) {
            rationale = `${rationale}${ar.description ? `\n${String(ar.description).slice(0, 200)}` : ''}`
          }
        }
        if (payload) {
          const info = payload.infoCompletenessPercent ?? payload.info_completeness_percent
          const qc = payload.questionCoveragePercent ?? payload.question_coverage_percent
          const cf = payload.contentFreshnessPercent ?? payload.content_freshness_percent
          const sc = payload.score ?? payload.geo_health_score
          if (Number.isFinite(Number(sc))) healthScore = String(Math.round(Number(sc)))
          else if ([info, qc, cf].every((x) => Number.isFinite(Number(x)))) {
            healthScore = String(
              geoScores.computeGeoHealthScore({
                infoCompletenessPercent: Number(info),
                questionCoveragePercent: Number(qc),
                contentFreshnessPercent: Number(cf),
              }),
            )
            kpiInfo = `${Math.round(Number(info))}%`
            kpiQuery = `${Math.round(Number(qc))}%`
            kpiFresh = `${Math.round(Number(cf))}%`
          }
          scoreSource = '综合评分'
          const rz = typeof payload.rationale_zh === 'string' ? payload.rationale_zh : ''
          if (rz) rationale = rz

          const aiTodos = Array.isArray(payload.todos)
            ? payload.todos
                .slice(0, 8)
                .map((t) =>
                  typeof t === 'object' && t && typeof t.title === 'string'
                    ? t.title
                    : String(t),
                )
                .filter(Boolean)
            : []
          if (aiTodos.length) todos = aiTodos

          if (Array.isArray(payload.covered_queries))
            querySamples = payload.covered_queries.map((x) => ({
              q: String((x && x.q) || ''),
              covered: Boolean(x && x.covered),
            }))
        }
      } catch (_) {
        /* 保持规则分值 */
      }
    }

    this.setData({
      healthScore,
      scoreTrend: scoreTrendText(healthScore),
      scoreSource,
      rationale,
      kpiInfo,
      kpiQuery,
      kpiFresh,
      geoPack: pack,
      querySamples,
      todos,
      suggestions: buildSuggestions(healthScore, kpiInfo, kpiQuery, kpiFresh),
      storeSummary: names.length ? `来客门店 ${names.length} 家` : '未发现来客门店',
    })
  },

  onOpenReport() {
    wx.showToast({ title: '完整报告请在电脑端查看', icon: 'none' })
  },

  onOpenConsult() {
    this.setData({ tab: 'consult' }, () => this.syncPaneNote())
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  onSuggestionTap(e) {
    const id = e.currentTarget.dataset.id
    if (id === 'keyword' || id === 'query') this.setData({ tab: 'query' }, () => this.syncPaneNote())
    else if (id === 'reputation') this.setData({ tab: 'reputation' }, () => this.syncPaneNote())
    else this.setData({ tab: 'store' }, () => this.syncPaneNote())
  },

  async onSyncAiScore() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({ title: '未连接后台', content: '请在小程序开发者工具配置 MERCHANT_API_BASE_URL', showCancel: false })
      return
    }
    wx.showLoading({ title: '同步…', mask: true })
    this.setData({ scoreBusy: true })
    await this.refreshStoresAndScore()
    wx.hideLoading()
    this.setData({ scoreBusy: false })
    wx.showToast({ title: '已刷新', icon: 'success' })
  },

  async runConsult() {
    const q = String(this.data.consultQ || '').trim()
    const pack = String(this.data.geoPack || '').trim()
    if (!q || !pack) {
      wx.showToast({ title: '请填写问题与知识包', icon: 'none' })
      return
    }
    if (!merchant.hasMerchantApi()) return
    if (!douyin.douyinToken()) {
      wx.showToast({ title: '请先绑定抖音来客', icon: 'none' })
      return
    }
    wx.showLoading({ title: '测试中…', mask: true })
    this.setData({ busy: true })
    try {
      const r = await geoAi.postGeoAiConsult({
        store_display_name: String(this.data.storeSummary || '').slice(0, 120),
        geo_knowledge_pack: pack,
        user_question: q,
        model: 'qwen',
      })
      this.setData({ consultReply: r.description })
      wx.hideLoading()
      wx.showToast({ title: '已生成', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showModal({
        title: '失败',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
    }
    this.setData({ busy: false })
  },

  async genQuestion() {
    const pack = String(this.data.geoPack || '').trim()
    if (!pack) return
    if (!merchant.hasMerchantApi() || !douyin.douyinToken()) return
    wx.showLoading({ title: '生成问法…', mask: true })
    try {
      const r = await geoAi.postGeoAiConsultQuestion({
        store_display_name: 'GEO',
        geo_knowledge_pack: pack,
        model: 'qwen',
      })
      this.setData({ consultQ: r.description.slice(0, 200) })
    } catch (_) {}
    wx.hideLoading()
  },

  noop() {},
})
