const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const feature = require('../../utils/merchantFeatureMp.js')
const membershipMp = require('../../utils/membershipMp.js')
const evalApi = require('../../utils/merchantShopEval.js')
const { readPlatformToken } = require('../../utils/platformTokensMp.js')

const CATEGORIES = evalApi.SHOP_EVAL_CATEGORIES || {}
const CAT1 = Object.keys(CATEGORIES)

function formReady(data) {
  const name = String(data.formName || '').trim()
  const region = data.region || []
  const detail = String(data.detailAddress || '').trim()
  const cat1 = (data.cat1List || [])[data.cat1Index]
  const cat2 = (data.cat2List || [])[data.cat2Index]
  return Boolean(name && region.length === 3 && region[0] && detail && cat1 && cat2)
}

async function postLocate(body) {
  const token = api.getBearerToken ? api.getBearerToken() : ''
  const data = await merchant.merchantRequestAuth('POST', '/api/meoo-shop-eval-locate', {
    bearerToken: token,
    timeoutMs: 20000,
    data: body,
  })
  if (!data || data.ok === false) {
    throw new Error(String((data && (data.message || data.error)) || '高德定位失败'))
  }
  return data
}

const PLATFORM_ICONS = {
  douyin: '/images/platforms/douyin-laike.png',
  meituan: '/images/platforms/dianping.png',
  xiaohongshu: '/images/platforms/xiaohongshu.png',
  kuaishou: '/images/platforms/kuaishou-local.png',
}

function platformRows() {
  return (evalApi.SHOP_EVAL_PLATFORMS || []).map((p) => ({
    id: p.id,
    name: p.name,
    icon: PLATFORM_ICONS[p.id] || '',
    bound: Boolean(readPlatformToken(p.id)),
  }))
}

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
    platforms: platformRows(),
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
    positioning: '',
    indicators: [],
    highlights: [],
    gaps: [],
    summary: '',
    sources: [],
    adviceReady: false,
    sections: [],
    err: '',
    formName: '',
    region: [],
    regionText: '',
    detailAddress: '',
    cat1List: CAT1,
    cat1Index: 0,
    cat2List: CATEGORIES[CAT1[0]] || [],
    cat2Index: 0,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (!api.canAccessPage || !api.canAccessPage()) {
      if (api.goLogin) api.goLogin()
      return
    }
    const rows = platformRows()
    let platformId = this.data.platformId
    this.setData({ platforms: rows, platformId, canEval: formReady(this.data) })
    if (rows.some((p) => p.id === platformId && p.bound)) void this.loadStore(platformId)
  },

  onUnload() {
    this.stopTick()
    this.stopGains()
  },

  async loadStore(forcedId) {
    const platformId = forcedId || this.data.platformId
    if (!readPlatformToken(platformId)) return
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
    if (evalApi.hydrateShopEval) await evalApi.hydrateShopEval(input, storage)
    if (this.data.platformId !== platformId) return
    const saved = evalApi.readSavedShopEval(input, storage)
    const score = saved && saved.score
    const advice = saved && saved.advice
    const grade = score ? evalApi.shopEvalGrade(score.score, scope) : null
    this._score = score || null
    const displayName = String(this.data.formName || '').trim() || (scope === 'chain' && input.brandName ? input.brandName : input.storeName)
    if (!this._formTouched && input.storeName) {
      this.setData({
        formName: input.storeName,
        detailAddress: this.data.detailAddress || input.address || '',
      })
    }
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
      canEval: formReady(Object.assign({}, this.data, !this._formTouched && input.storeName ? { formName: input.storeName, detailAddress: this.data.detailAddress || input.address || '' } : {})),
      scoreReady: Boolean(score),
      displayScore: score ? score.score : 0,
      searchLevel: score ? score.searchLevel : '',
      verifyLevel: score ? score.verifyLevel : '',
      situations: score ? score.situations : [],
      positioning: score && score.positioning ? score.positioning : '',
      indicators: score && score.indicators ? score.indicators : [],
      highlights: score && score.highlights ? score.highlights : [],
      gaps: score && score.gaps ? score.gaps : [],
      summary: score && score.summary ? score.summary : '',
      sources: score && score.sources ? score.sources : [],
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
      if (gains) this.playGains(gains.exposure, gains.verify)
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
    if (readPlatformToken(id)) void this.loadStore(id)
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
      content: '分析评估需开通会员或会员 Plus。',
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
    if (!this.data.canEval || this.data.evaluating || this.data.advising) return
    this.stopTick()
    this.setData({
      evaluating: true,
      err: '',
      scorePop: false,
      displayScore: 0,
      scoreReady: false,
      situations: [],
      positioning: '',
      indicators: [],
      highlights: [],
      gaps: [],
      summary: '',
      sources: [],
      showGrade: false,
      showGains: false,
      adviceReady: false,
      sections: [],
    })
    this.startEvalSweep()
    let failed = null
    try {
      const cat1 = this.data.cat1List[this.data.cat1Index]
      const cat2 = this.data.cat2List[this.data.cat2Index]
      const region = this.data.region || []
      const address = region.join('') + String(this.data.detailAddress || '').trim()
      const category = cat1 + ' / ' + cat2
      const located = await postLocate({
        action: 'locate',
        address,
        city: region[1] || '',
        category,
      })
      const input = Object.assign({}, this._input || {}, {
        platformId: this.data.platformId,
        storeName: String(this.data.formName || '').trim(),
        city: region[1] || '',
        address,
        category,
        mapNote: located.mapNote || '',
      })
      this._input = input
      const score = await evalApi.evaluateShop(input, { force: true, storage, askText })
      this._score = score
      const grade = evalApi.shopEvalGrade(score.score, evalApi.shopEvalScopeOf(input))
      this.setData({
        scoreReady: true,
        searchLevel: score.searchLevel,
        verifyLevel: score.verifyLevel,
        situations: score.situations || [],
        positioning: score.positioning || '',
        indicators: score.indicators || [],
        highlights: score.highlights || [],
        gaps: score.gaps || [],
        summary: score.summary || '',
        sources: score.sources || [],
        showGrade: !!grade,
        gradeKey: grade ? grade.key : '',
        gradeLabel: grade ? grade.label : '',
        gradeNote: grade ? grade.note : '',
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

  onFormName(e) {
    this._formTouched = true
    const formName = e.detail.value
    this.setData({ formName, canEval: formReady(Object.assign({}, this.data, { formName })) })
  },

  onDetail(e) {
    this._formTouched = true
    const detailAddress = e.detail.value
    this.setData({ detailAddress, canEval: formReady(Object.assign({}, this.data, { detailAddress })) })
  },

  onRegion(e) {
    this._formTouched = true
    const region = e.detail.value || []
    this.setData({
      region,
      regionText: region.join(' '),
      canEval: formReady(Object.assign({}, this.data, { region })),
    })
  },

  onCat1(e) {
    this._formTouched = true
    const cat1Index = Number(e.detail.value) || 0
    const cat2List = CATEGORIES[this.data.cat1List[cat1Index]] || []
    const next = Object.assign({}, this.data, { cat1Index, cat2List, cat2Index: 0 })
    this.setData({ cat1Index, cat2List, cat2Index: 0, canEval: formReady(next) })
  },

  onCat2(e) {
    this._formTouched = true
    const cat2Index = Number(e.detail.value) || 0
    this.setData({ cat2Index, canEval: formReady(Object.assign({}, this.data, { cat2Index })) })
  },

  async onAdvise() {
    const bound = (this.data.platforms || []).some((item) => item.id === this.data.platformId && item.bound)
    if (!bound) {
      wx.showModal({
        title: '请先绑定门店',
        content: '分析评估前请先绑定门店账号。',
        confirmText: '去绑定',
        cancelText: '取消',
        success(res) {
          if (res.confirm) wx.navigateTo({ url: '/pages/store-list/store-list?mode=info' })
        },
      })
      return
    }
    if (!(await this.requirePaid())) return
    if (!this.data.scoreReady || this.data.evaluating || this.data.advising) return
    this.setData({ advising: true, err: '' })
    let failed = null
    try {
      const base = this._input || { platformId: this.data.platformId, storeName: this.data.storeName }
      const advice = await evalApi.adviseShop(base, this._score, {
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
