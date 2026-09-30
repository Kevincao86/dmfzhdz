const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const feature = require('../../utils/merchantFeatureMp.js')
const membershipMp = require('../../utils/membershipMp.js')
const evalApi = require('../../utils/merchantShopEval.js')
const productsApi = require('../../utils/productListingMp.js')
const dashboardApi = require('../../utils/dashboardMp.js')
const kbApi = require('../../utils/knowledgeBaseMp.js')
const reviewsApi = require('../../utils/reviewsMp.js')
const { readPlatformToken, apiSegment } = require('../../utils/platformTokensMp.js')

const PLATFORM_ICONS = {
  douyin: '/images/platforms/douyin-laike.png',
  meituan: '/images/platforms/dianping.png',
  xiaohongshu: '/images/platforms/xiaohongshu.png',
  kuaishou: '/images/platforms/kuaishou-local.png',
}

const PLATFORMS = (evalApi.SHOP_EVAL_PLATFORMS || []).map((p) => ({
  id: p.id,
  name: p.name,
  icon: PLATFORM_ICONS[p.id] || '',
}))

const storage = {
  getItem(key) {
    try {
      const v = wx.getStorageSync(key)
      if (v == null || v === '') return null
      return typeof v === 'string' ? v : JSON.stringify(v)
    } catch (e) {
      return null
    }
  },
  setItem(key, value) {
    try {
      wx.setStorageSync(key, value)
    } catch (e) {}
  },
}

const PRODUCT_PATHS = {
  douyin: '/api/meoo-douyin-goods-products',
  kuaishou: '/api/meoo-kuaishou-goods-products',
  meituan: '/api/meoo-meituan-goods-products',
  xiaohongshu: '/api/meoo-xhs-goods-products',
}

const EVAL_PLATFORMS = ['douyin', 'kuaishou', 'meituan', 'xiaohongshu']

function scaleCount(sample, seen, total) {
  if (seen <= 0 || total <= seen) return sample
  return Math.round((total * sample) / seen)
}

function numOf(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function readProductSignals(platformId) {
  const token = readPlatformToken(platformId)
  const seg = apiSegment(platformId)
  const qs = '?page=1&page_size=50'
  const paths = []
  if (PRODUCT_PATHS[platformId]) paths.push(`${PRODUCT_PATHS[platformId]}${qs}`)
  if (seg) paths.push(`/api/merchant/${seg}/goods/products${qs}`)
  if (token) {
    for (const path of paths) {
      try {
        const data = await merchant.merchantRequestAuth('GET', path, { bearerToken: token, timeoutMs: 18000 })
        const inner = data && data.data && typeof data.data === 'object' ? data.data : data || {}
        const raw = Array.isArray(inner.items) ? inner.items : []
        const total = typeof inner.total === 'number' ? inner.total : raw.length
        let priced = 0
        let imaged = 0
        for (const row of raw) {
          if (!row || typeof row !== 'object') continue
          if (numOf(row.price) > 0) priced += 1
          const img = String(row.head_image_url || row.headImageUrl || row.image_url || row.cover || '').trim()
          if (img) imaged += 1
        }
        return {
          productTotal: total || raw.length,
          productPriced: scaleCount(priced, raw.length, total || raw.length),
          productWithImage: scaleCount(imaged, raw.length, total || raw.length),
        }
      } catch (e) {}
    }
  }
  try {
    const listed = await productsApi.fetchMerchantProductList(platformId, { page: 1, pageSize: 50 })
    if (!listed || !listed.ok) return null
    const items = listed.items || []
    const total = listed.total || items.length
    const priced = items.filter((item) => numOf(item.price) > 0).length
    return {
      productTotal: total,
      productPriced: scaleCount(priced, items.length, total),
      productWithImage: 0,
    }
  } catch (e) {
    return null
  }
}

async function collectShopEvalSignals(platformId) {
  const reviewPlatform = platformId === 'xiaohongshu' ? 'xhs' : platformId
  const [products, decoration, reviews, activities, dashboards, kb, finance, ads, clues] = await Promise.all([
    readProductSignals(platformId),
    feature.fetchStoreDecorations(platformId).catch(() => null),
    reviewsApi.fetchReviewsList(reviewPlatform, 'all', 'all').catch(() => null),
    platformId === 'kuaishou' ? Promise.resolve(null) : feature.fetchMarketingActivities(platformId, 'all').catch(() => null),
    Promise.all(EVAL_PLATFORMS.map((id) => dashboardApi.fetchPlatformSummary(id, 'day7').catch(() => null))),
    kbApi.listDocuments().catch(() => null),
    feature.fetchFinanceReconcile(14).catch(() => null),
    feature.fetchAdsReport('qianchuan').catch(() => null),
    feature.fetchAdsClues('qianchuan', 1).catch(() => null),
  ])
  const signals = {
    productTotal: 0,
    productPriced: 0,
    productWithImage: 0,
    reviewTotal: 0,
    reviewReplied: 0,
    activityTotal: 0,
    decorationTotal: 0,
    decorationWithCover: 0,
    payAmount: 0,
    verifyAmount: 0,
    orderCount: 0,
    otherPlatformPay: 0,
    clueCount: 0,
    adShow: 0,
    kbTotal: 0,
    kbFeeding: 0,
    financeVerify: 0,
    financeRefund: 0,
    financeRows: 0,
  }
  if (products) {
    signals.productTotal = products.productTotal
    signals.productPriced = products.productPriced
    signals.productWithImage = products.productWithImage
  }
  if (decoration && decoration.ok) {
    const items = decoration.items || []
    signals.decorationTotal = items.length
    signals.decorationWithCover = items.filter((item) => item.coverImageUrl || numOf(item.albumCount) > 0).length
  }
  if (reviews && reviews.ok) {
    const stats = reviews.stats || {}
    signals.reviewTotal = typeof stats.total === 'number' ? stats.total : (reviews.items || []).length
    signals.reviewReplied =
      typeof stats.replied === 'number'
        ? stats.replied
        : (reviews.items || []).filter((item) => item && item.replied).length
  }
  if (activities && activities.ok) signals.activityTotal = (activities.items || []).length
  EVAL_PLATFORMS.forEach((id, index) => {
    const row = dashboards[index]
    if (!row) return
    if (id === platformId) {
      signals.payAmount = numOf(row.payAmount)
      signals.verifyAmount = numOf(row.verifyAmount)
      signals.orderCount = numOf(row.orderCount)
      signals.financeRefund = numOf(row.refundAmount)
    } else {
      signals.otherPlatformPay += numOf(row.payAmount)
    }
  })
  const docs = kb && kb.ok && Array.isArray(kb.documents) ? kb.documents : []
  signals.kbTotal = docs.length
  signals.kbFeeding = docs.filter((doc) => doc && doc.feed_enabled).length
  if (finance && finance.ok) {
    const rows = (finance.rows || []).filter((row) => row && row.platform === platformId)
    signals.financeRows = rows.length
    signals.financeVerify = rows.reduce((sum, row) => sum + numOf(row.verifyAmountYuan), 0)
  }
  if (ads && ads.ok && ads.summary) signals.adShow = numOf(ads.summary.showCnt || ads.summary.show_cnt)
  if (clues && clues.ok) signals.clueCount = (clues.items || []).length
  return signals
}

function letterOf(name) {
  const s = String(name || '').trim()
  return s ? s.slice(0, 1) : '店'
}

async function askText(system, user) {
  const token = api.getBearerToken ? api.getBearerToken() : ''
  let tenantId = ''
  try {
    tenantId = String(wx.getStorageSync('meoo_active_tenant_id') || '').trim()
  } catch (e) {}
  const data = await merchant.merchantRequestAuth('POST', '/api/meoo-ai-chat', {
    bearerToken: token,
    timeoutMs: 90000,
    data: {
      provider: 'doubao',
      stream: false,
      temperature: 0,
      ...(tenantId ? { tenantId } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  })
  if (!data || data.ok === false) {
    throw new Error(String((data && (data.message || data.detail || data.error)) || '豆包评估失败'))
  }
  if (String(data.provider || '') !== 'doubao') throw new Error('豆包暂不可用，请稍后再试')
  const content = String(data.content || data.text || '').trim()
  if (!content) throw new Error('豆包未返回内容')
  return content
}

Page({
  data: {
    platforms: PLATFORMS,
    grades: evalApi.SHOP_EVAL_GRADES,
    platformId: 'douyin',
    storeName: '',
    scopeLabel: '单门店',
    evalTitle: '门店智能分析',
    statusTitle: '门店现状',
    avatarLetter: '店',
    basis: '',
    canEval: false,
    evaluating: false,
    advising: false,
    displayScore: 0,
    scoreReady: false,
    scorePop: false,
    searchLevel: '',
    verifyLevel: '',
    levelA: '可被搜到',
    levelB: '可被核销',
    platformName: '抖音来客',
    showGrade: false,
    gradeKey: '',
    gradeLabel: '',
    gradeNote: '',
    showGains: false,
    exposureText: '',
    salesText: '',
    situations: [],
    adviceReady: false,
    sections: [],
    err: '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (!api.canAccessPage || !api.canAccessPage()) {
      if (api.goLogin) api.goLogin()
      return
    }
    void this.loadStore()
  },

  onUnload() {
    this.stopTick()
    this.stopGains()
  },

  async loadStore() {
    const platformId = this.data.platformId
    let items = []
    let total = 0
    try {
      const r = await feature.fetchStoresForPlatform(platformId, '')
      items = r && r.ok && r.items ? r.items : []
      total = r && r.ok ? Number(r.total || items.length) : items.length
    } catch (e) {}
    const input = evalApi.resolveShopEvalFromStores(platformId, items, total)
    const scope = evalApi.shopEvalScopeOf(input)
    const meta = evalApi.platformShopEvalMeta(platformId, scope)
    this._input = input
    const saved = evalApi.readSavedShopEval(input, storage)
    const score = saved && saved.score
    const advice = saved && saved.advice
    const grade = score ? evalApi.shopEvalGrade(score.score, scope) : null
    this._score = score || null
    const displayName = scope === 'chain' && input.brandName ? input.brandName : input.storeName
    this.setData({
      platformName: meta.name,
      evalTitle: meta.title,
      statusTitle: meta.statusTitle,
      levelA: meta.levelA,
      levelB: meta.levelB,
      storeName: displayName,
      scopeLabel: scope === 'chain' ? `连锁品牌 · ${input.storeCount || '多'}家` : '单门店',
      grades: evalApi.shopEvalGrades(scope),
      avatarLetter: letterOf(displayName),
      basis: evalApi.describeShopEvalBasis(input),
      canEval: Boolean(input.storeName),
      scoreReady: Boolean(score),
      displayScore: score ? score.score : 0,
      searchLevel: score ? score.searchLevel : '',
      verifyLevel: score ? score.verifyLevel : '',
      situations: score ? score.situations : [],
      showGrade: Boolean(grade),
      gradeKey: grade ? grade.key : '',
      gradeLabel: grade ? grade.label : '',
      gradeNote: grade ? grade.note : '',
      adviceReady: Boolean(advice && advice.sections && advice.sections.length),
      sections: advice ? advice.sections : [],
      err: '',
    })
    if (score) {
      const gains = evalApi.shopEvalGainTargets(score, input)
      this.playGains(gains.exposure, gains.verify)
    } else {
      this.setData({ showGains: false, exposureText: '', salesText: '' })
    }
  },

  onPlatform(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.platformId) return
    this.stopTick()
    this._signals = null
    this.setData({ platformId: id })
    void this.loadStore()
  },

  stopTick() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  stopGains() {
    if (this._gainTimer) {
      clearInterval(this._gainTimer)
      this._gainTimer = null
    }
  },

  startEvalSweep() {
    this.stopTick()
    const start = Date.now()
    this._timer = setInterval(() => {
      const wave = (Math.sin(((Date.now() - start) / 700) * Math.PI) + 1) / 2
      this.setData({ displayScore: Math.round(8 + wave * 78) })
    }, 32)
  },

  playScore(target) {
    this.stopTick()
    const goal = Math.max(0, Math.min(100, Number(target) || 0))
    const start = Date.now()
    const dur = 1400
    this.setData({ displayScore: 0, evaluating: false, scorePop: false })
    this._timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = Math.round(goal * eased)
      if (t >= 1) {
        this.stopTick()
        this.setData({ displayScore: goal, scorePop: true })
        return
      }
      this.setData({ displayScore: cur })
    }, 32)
  },

  playGains(exposure, verify) {
    this.stopGains()
    const goalE = Math.max(0, Number(exposure) || 0)
    const goalS = Math.max(0, Number(verify) || 0)
    const start = Date.now()
    const dur = 1600
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      this.setData({
        showGains: true,
        exposureText: '+' + Math.round(goalE * eased) + '%',
        salesText: '+' + evalApi.formatVerifyYuan(Math.round(goalS * eased)),
      })
      if (t >= 1) this.stopGains()
    }
    tick()
    this._gainTimer = setInterval(tick, 32)
  },

  async requirePaid() {
    try {
      const snap = await membershipMp.loadMembershipSnapshot()
      const plan = snap && snap.ent && snap.ent.plan
      if (plan && plan !== 'free') return true
    } catch (e) {}
    wx.showModal({
      title: '请升级会员',
      content: '门店经营评估需开通会员版后使用。',
      confirmText: '去升级',
      cancelText: '取消',
      success(res) {
        if (res.confirm) wx.navigateTo({ url: '/pages/subscription/subscription' })
      },
    })
    return false
  },

  failEval(e, key) {
    const msg = String(e && e.message ? e.message : e || '评估失败').slice(0, 120)
    const patch = { err: msg }
    patch[key] = false
    this.setData(patch)
    wx.showToast({ title: msg, icon: 'none', duration: 2800 })
  },

  async onEvaluate() {
    if (!(await this.requirePaid())) return
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.stopTick()
    this.setData({ evaluating: true, err: '', scorePop: false, displayScore: 0 })
    this.startEvalSweep()
    let failed = null
    try {
      const input = this._input || { platformId: this.data.platformId, storeName: this.data.storeName }
      const signals = await collectShopEvalSignals(input.platformId)
      this._signals = signals
      const score = await evalApi.evaluateShop(Object.assign({}, input, { signals }), { force: true, storage, askText })
      this._score = score
      const grade = evalApi.shopEvalGrade(score.score, evalApi.shopEvalScopeOf(input))
      this.setData({
        scoreReady: true,
        searchLevel: score.searchLevel,
        verifyLevel: score.verifyLevel,
        situations: score.situations || [],
        showGrade: !!grade,
        gradeKey: grade ? grade.key : '',
        gradeLabel: grade ? grade.label : '',
        gradeNote: grade ? grade.note : '',
        showGains: true,
      })
      this.playScore(score.score)
      const gains = evalApi.shopEvalGainTargets(score, input)
      if (gains) this.playGains(gains.exposure, gains.verify)
    } catch (e) {
      failed = e
    }
    if (failed) {
      this.stopTick()
      const prev = this._score ? Number(this._score.score) || 0 : 0
      this.setData({ displayScore: prev })
      this.failEval(failed, 'evaluating')
    }
  },

  async onAdvise() {
    if (!(await this.requirePaid())) return
    if (!this.data.scoreReady || this.data.evaluating || this.data.advising) return
    this.setData({ advising: true, err: '' })
    let failed = null
    try {
      const base = this._input || { platformId: this.data.platformId, storeName: this.data.storeName }
      const signals = this._signals || (await collectShopEvalSignals(base.platformId))
      this._signals = signals
      const advice = await evalApi.adviseShop(Object.assign({}, base, { signals }), this._score, {
        force: true,
        storage,
        askText,
      })
      this.setData({
        advising: false,
        adviceReady: true,
        sections: advice.sections,
      })
    } catch (e) {
      failed = e
    }
    if (failed) this.failEval(failed, 'advising')
  },
})
