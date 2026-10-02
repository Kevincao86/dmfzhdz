const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const billing = require('../../utils/tenantBillingApiMp.js')
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
    timeoutMs: 28000,
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

function readableLines(rows) {
  return (Array.isArray(rows) ? rows : []).filter((line) => typeof line === 'string' && line.trim() && line.indexOf('[object Object]') < 0)
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

const FORM_KEY = 'lq_shop_eval_form'

function formInput(data) {
  const region = data.region || []
  const cat1 = (data.cat1List || [])[data.cat1Index] || ''
  const cat2 = (data.cat2List || [])[data.cat2Index] || ''
  const name = String(data.formName || '').trim()
  return {
    platformId: data.platformId || 'douyin',
    storeName: name,
    brandName: name,
    city: region[1] || '',
    address: region.join('') + String(data.detailAddress || '').trim(),
    category: cat1 && cat2 ? cat1 + ' / ' + cat2 : '',
  }
}

function scopeText(input) {
  const scope = evalApi.shopEvalScopeOf(input)
  if (input && input.evalFocus === 'brand') return '总品牌 · ' + (input.storeCount || '多') + '家'
  if (input && input.evalFocus === 'store') return '单门店'
  return scope === 'chain' ? '连锁品牌 · ' + (input.storeCount || '多') + '家' : '单门店'
}

function withChain(input, profile) {
  if (!profile || profile.evalFocus === 'store' || (input && input.evalFocus === 'store')) return input
  if (!(Number(profile.storeCount) >= 2)) return input
  return Object.assign({}, input, {
    storeCount: Number(profile.storeCount) || 0,
    scope: 'chain',
    storeNames: profile.storeNames || input.storeNames || '',
    brandName: profile.brandName || input.brandName || input.storeName,
  })
}

function identityPatch(input, score) {
  const scope = evalApi.shopEvalScopeOf(input)
  const grade = score ? evalApi.shopEvalGrade(score.score, scope) : null
  const name = String(input.storeName || input.brandName || '').trim()
  const bits = []
  if (input.category) bits.push(input.category)
  if (input.address) bits.push(input.address)
  return {
    storeName: name,
    scopeLabel: scopeText(input),
    grades: evalApi.shopEvalGrades(scope),
    avatarLetter: letterOf(name),
    basis: bits.join(' · '),
    showGrade: Boolean(grade),
    gradeKey: grade ? grade.key : '',
    gradeLabel: grade ? grade.label : '',
    gradeNote: grade ? grade.note : '',
  }
}

function readSavedForm() {
  try {
    const raw = wx.getStorageSync(FORM_KEY)
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!saved || !saved.formName) return null
    const cat1Index = Math.max(0, CAT1.indexOf(saved.cat1))
    const cat2List = CATEGORIES[CAT1[cat1Index]] || []
    let cat2Index = cat2List.indexOf(saved.cat2)
    if (cat2Index < 0) cat2Index = 0
    return {
      formName: saved.formName,
      region: saved.region || [],
      regionText: (saved.region || []).join(' '),
      detailAddress: saved.detailAddress || '',
      cat1Index,
      cat2List,
      cat2Index,
    }
  } catch (e) {
    return null
  }
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
    quotaPaid: false,
    quotaRemaining: -1,
    quotaLimit: 1,
    chooser: '',
    storeQuery: '',
    boundStores: [],
    filteredStores: [],
    boundCount: 0,
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
    const restored = readSavedForm()
    const view = restored ? Object.assign({}, this.data, restored) : this.data
    if (restored) this._formTouched = true
    this.setData(Object.assign({ platforms: rows, platformId }, restored || {}, { canEval: formReady(view) }))
    void this.refreshQuota()
    if (formReady(view)) void this.syncFormResult(view)
    else if (rows.some((p) => p.id === platformId && p.bound)) void this.loadStore(platformId)
  },

  rememberForm(extra) {
    const data = Object.assign({}, this.data, extra || {})
    try {
      wx.setStorageSync(
        FORM_KEY,
        JSON.stringify({
          formName: data.formName || '',
          region: data.region || [],
          detailAddress: data.detailAddress || '',
          cat1: (data.cat1List || [])[data.cat1Index] || '',
          cat2: (data.cat2List || [])[data.cat2Index] || '',
        }),
      )
    } catch (e) {}
  },

  scheduleSync() {
    if (this._syncTimer) clearTimeout(this._syncTimer)
    this._syncTimer = setTimeout(() => {
      this._syncTimer = 0
      if (formReady(this.data) && !this.data.evaluating) void this.syncFormResult(this.data)
    }, 500)
  },

  async syncFormResult(data) {
    const view = data || this.data
    if (!formReady(view) || this.data.evaluating) return
    const base = Object.assign({}, formInput(view))
    let saved = null
    try {
      if (evalApi.hydrateShopEval) await evalApi.hydrateShopEval(base, storage)
      saved = evalApi.readSavedShopEval(base, storage)
    } catch (e) {}
    if (this.data.evaluating) return
    let input = withChain(base, saved && saved.profile)
    if (!(Number(input.storeCount) >= 2)) {
      try {
        const located = await postLocate({
          action: 'locate',
          address: base.address,
          city: base.city,
          category: base.category,
          storeName: base.storeName,
        })
        const brandCount = Number(located.brandCount) || 0
        const brandNames = Array.isArray(located.brandNames) ? located.brandNames : []
        const titles = Array.isArray(located.publicTitles) ? located.publicTitles : []
        input = Object.assign({}, input, {
          storeCount: brandCount,
          scope: brandCount >= 2 ? 'chain' : 'single',
          storeNames: brandNames.slice(0, 8).join('、'),
          brandName: base.storeName,
          mapNote: [located.mapNote, located.brandNote].filter(Boolean).join('\n'),
          publicNote: titles.join('\n'),
        })
      } catch (e) {}
    }
    if (this.data.evaluating) return
    this._input = input
    const score = (saved && saved.score) || null
    const advice = saved && saved.advice
    if (score) this._score = score
    else this._score = null
    const meta = evalApi.platformShopEvalMeta(view.platformId || this.data.platformId, evalApi.shopEvalScopeOf(input))
    const patch = Object.assign(
      {
        platformName: meta.name,
        evalTitle: meta.title,
        levelA: meta.levelA,
        levelB: meta.levelB,
      },
      identityPatch(input, score),
    )
    if (score) {
      Object.assign(patch, {
        scoreReady: true,
        displayScore: score.score,
        searchLevel: score.searchLevel,
        verifyLevel: score.verifyLevel,
        situations: score.situations || [],
        positioning: score.positioning || '',
        indicators: score.indicators || [],
        highlights: readableLines(score.highlights),
        gaps: readableLines(score.gaps),
        summary: score.summary || '',
        sources: score.sources || [],
        adviceReady: Boolean(advice && advice.sections && advice.sections.length),
        sections: advice && advice.sections ? advice.sections : [],
      })
    } else {
      Object.assign(patch, {
        scoreReady: false,
        displayScore: 0,
        positioning: '',
        indicators: [],
        highlights: [],
        gaps: [],
        summary: '',
        sources: [],
        adviceReady: false,
        sections: [],
      })
    }
    this.setData(patch)
  },

  async refreshQuota() {
    try {
      const data = await postLocate({ action: 'eval-quota' })
      this.setData({
        quotaPaid: Boolean(data.paid),
        quotaRemaining: Number(data.remaining) || 0,
        quotaLimit: Number(data.limit) || 0,
      })
    } catch (e) {}
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
      const r = await feature.fetchStoresForPlatform(platformId, '', { page: 1, pageSize: 100 })
      items = r && r.ok && r.items ? r.items : []
      total = r && r.ok ? Number(r.total || items.length) : items.length
    } catch (e) {}
    const mapped = (items || [])
      .map((row, index) => ({
        id: String((row && (row.id || row.name)) || index),
        name: String((row && row.name) || '').trim(),
        address: String((row && row.address) || '').trim(),
        city: String((row && row.city) || '').trim(),
        phone: String((row && row.phone) || '').trim(),
        businessHours: String((row && row.businessHours) || '').trim(),
        brandName: String((row && row.brandName) || '').trim(),
      }))
      .filter((row) => row.name)
    this._boundStores = mapped
    const input = evalApi.resolveShopEvalFromStores(platformId, mapped, Math.max(total, mapped.length))
    if (mapped.length >= 2) {
      input.scope = 'single'
      input.storeCount = 1
      input.evalFocus = ''
      input.storeNames = ''
    }
    this.setData({
      boundStores: mapped,
      filteredStores: mapped,
      boundCount: Math.max(mapped.length, total),
    })
    if (evalApi.hydrateShopEval) await evalApi.hydrateShopEval(input, storage)
    if (this.data.platformId !== platformId || formReady(this.data)) return
    const saved = evalApi.readSavedShopEval(input, storage)
    const viewed = withChain(input, saved && saved.profile)
    const scope = evalApi.shopEvalScopeOf(viewed)
    const meta = evalApi.platformShopEvalMeta(platformId, scope)
    this._input = viewed
    const score = saved && saved.score
    const advice = saved && saved.advice
    const grade = score ? evalApi.shopEvalGrade(score.score, scope) : null
    this._score = score || null
    const displayName = String(this.data.formName || '').trim() || (scope === 'chain' && viewed.brandName ? viewed.brandName : viewed.storeName)
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
      scopeLabel: scopeText(viewed),
      grades: evalApi.shopEvalGrades(scope),
      avatarLetter: letterOf(displayName),
      basis: [viewed.category, viewed.address].filter(Boolean).join(' · ') || evalApi.describeShopEvalBasis(viewed),
      canEval: formReady(Object.assign({}, this.data, !this._formTouched && input.storeName ? { formName: input.storeName, detailAddress: this.data.detailAddress || input.address || '' } : {})),
      scoreReady: Boolean(score),
      displayScore: score ? score.score : 0,
      searchLevel: score ? score.searchLevel : '',
      verifyLevel: score ? score.verifyLevel : '',
      situations: score ? score.situations : [],
      positioning: score && score.positioning ? score.positioning : '',
      indicators: score && score.indicators ? score.indicators : [],
      highlights: readableLines(score && score.highlights),
      gaps: readableLines(score && score.gaps),
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
      const gains = evalApi.shopEvalGainTargets(score, viewed)
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
      content: '分析提升需开通会员，每次 5 积分。升级后每月可评估 30 次。',
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
    if ((this._boundStores || []).length >= 2) {
      this.setData({ chooser: 'mode', storeQuery: '', filteredStores: this._boundStores })
      return
    }
    await this.runEvaluate(this._input || {})
  },

  onCloseChooser() {
    this.setData({ chooser: '' })
  },

  onOpenStorePick() {
    this.setData({ chooser: 'store', storeQuery: '', filteredStores: this._boundStores || [] })
  },

  onBackChooser() {
    this.setData({ chooser: 'mode' })
  },

  onStoreQuery(e) {
    const storeQuery = e.detail.value || ''
    const q = String(storeQuery).trim()
    const list = this._boundStores || []
    const filteredStores = q
      ? list.filter((store) => store.name.indexOf(q) >= 0 || String(store.address || '').indexOf(q) >= 0)
      : list
    this.setData({ storeQuery, filteredStores })
  },

  onChooseBrand() {
    const stores = this._boundStores || []
    const target = evalApi.boundEvalBrandTarget(stores)
    const anchor = target.anchor
    const region = anchor ? evalApi.splitCnRegion(anchor.address || '', anchor.city) : null
    const prev = this.data.region || []
    const nextRegion = region && region.province && region.city && region.district ? [region.province, region.city, region.district] : prev
    const snap = {
      formName: target.brandName,
      region: nextRegion,
      regionText: nextRegion.join(' '),
      detailAddress: (region && region.detail) || (anchor && anchor.address) || this.data.detailAddress,
    }
    this.applySnap(snap)
    this.setData({ chooser: '' })
    void this.runEvaluate(
      Object.assign({}, this._input || {}, {
        evalFocus: 'brand',
        scope: 'chain',
        storeCount: Math.max(target.storeCount, 2),
        brandName: target.brandName,
        storeName: target.brandName,
        storeNames: target.storeNames,
        storeId: '',
        phone: anchor && anchor.phone ? anchor.phone : '',
        businessHours: anchor && anchor.businessHours ? anchor.businessHours : '',
      }),
      snap,
    )
  },

  onPickStore(e) {
    const id = e.currentTarget.dataset.id
    const store = (this._boundStores || []).find((item) => item.id === id)
    if (!store) return
    const target = evalApi.boundEvalBrandTarget(this._boundStores || [])
    const region = evalApi.splitCnRegion(store.address || '', store.city)
    const prev = this.data.region || []
    const nextRegion = region.province && region.city && region.district ? [region.province, region.city, region.district] : prev
    const snap = {
      formName: store.name,
      region: nextRegion,
      regionText: nextRegion.join(' '),
      detailAddress: region.detail || store.address || this.data.detailAddress,
    }
    this.applySnap(snap)
    this.setData({ chooser: '' })
    void this.runEvaluate(
      Object.assign({}, this._input || {}, {
        evalFocus: 'store',
        scope: 'single',
        storeCount: 1,
        storeId: store.id,
        storeName: store.name,
        brandName: target.brandName,
        storeNames: '',
        phone: store.phone || '',
        businessHours: store.businessHours || '',
      }),
      snap,
    )
  },

  applySnap(snap) {
    this._formTouched = true
    const next = Object.assign({}, this.data, snap)
    this.setData(Object.assign({}, snap, { canEval: formReady(next) }))
    this.rememberForm(snap)
  },

  async runEvaluate(draft, snap) {
    const data = Object.assign({}, this.data, snap || {})
    if (!formReady(data)) {
      wx.showToast({ title: '请补全名称、省市区、详细地址和分类', icon: 'none' })
      return
    }
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
      const gate = await postLocate({ action: 'eval-quota' })
      const remaining = Number(gate.remaining) || 0
      this.setData({
        quotaPaid: Boolean(gate.paid),
        quotaRemaining: remaining,
        quotaLimit: Number(gate.limit) || 0,
      })
      if (remaining <= 0) {
        if (!gate.paid) {
          wx.showModal({
            title: '请升级会员',
            content: gate.message || '免费评估已用完。升级会员后每月可评估 30 次。',
            confirmText: '去升级',
            cancelText: '取消',
            success(res) {
              if (res.confirm) wx.navigateTo({ url: '/pages/subscription/subscription' })
            },
          })
        }
        throw new Error(gate.message || '评估次数已用完')
      }
      const cat1 = data.cat1List[data.cat1Index]
      const cat2 = data.cat2List[data.cat2Index]
      const region = data.region || []
      const name = String(data.formName || '').trim()
      const address = region.join('') + String(data.detailAddress || '').trim()
      const category = cat1 + ' / ' + cat2
      const located = await postLocate({
        action: 'locate',
        address,
        city: region[1] || '',
        category,
        storeName: name,
      })
      const brandCount = Number(located.brandCount) || 0
      const brandNames = Array.isArray(located.brandNames) ? located.brandNames : []
      const titles = Array.isArray(located.publicTitles) ? located.publicTitles : []
      const note = [located.mapNote, located.brandNote].filter(Boolean).join('\n')
      const focus = draft && draft.evalFocus
      const base = Object.assign({}, this._input || {}, draft || {}, {
        platformId: this.data.platformId,
        city: region[1] || '',
        address,
        category,
        mapNote: note,
        publicNote: titles.join('\n'),
      })
      const input =
        focus === 'store'
          ? Object.assign(base, {
              evalFocus: 'store',
              scope: 'single',
              storeCount: 1,
              storeName: name,
              storeNames: '',
            })
          : focus === 'brand'
            ? Object.assign(base, {
                evalFocus: 'brand',
                scope: 'chain',
                storeCount: Math.max(Number(draft.storeCount) || 0, brandCount, (this._boundStores || []).length, 2),
                storeName: draft.brandName || name,
                brandName: draft.brandName || name,
                storeNames: draft.storeNames || brandNames.slice(0, 8).join('、'),
              })
            : Object.assign(base, {
                storeName: name,
                brandName: name,
                storeNames: brandNames.slice(0, 8).join('、'),
                storeCount: brandCount,
                scope: brandCount >= 2 ? 'chain' : 'single',
              })
      this._input = input
      const score = await evalApi.evaluateShop(input, { force: true, storage, askText })
      this._score = score
      const meta = evalApi.platformShopEvalMeta(input.platformId, evalApi.shopEvalScopeOf(input))
      this.rememberForm()
      this.setData(Object.assign({
        scoreReady: true,
        platformName: meta.name,
        evalTitle: meta.title,
        levelA: meta.levelA,
        levelB: meta.levelB,
        searchLevel: score.searchLevel,
        verifyLevel: score.verifyLevel,
        situations: score.situations || [],
        positioning: score.positioning || '',
        indicators: score.indicators || [],
        highlights: readableLines(score.highlights),
        gaps: readableLines(score.gaps),
        summary: score.summary || '',
        sources: score.sources || [],
      }, identityPatch(input, score)))
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
      return
    }
    try {
      const used = await postLocate({ action: 'eval-quota', consume: true })
      this.setData({
        quotaPaid: Boolean(used.paid),
        quotaRemaining: Number(used.remaining) || 0,
        quotaLimit: Number(used.limit) || 0,
      })
    } catch (e) {}
  },

  onFormName(e) {
    this._formTouched = true
    const formName = e.detail.value
    this.setData({ formName, canEval: formReady(Object.assign({}, this.data, { formName })) })
    this.rememberForm({ formName })
    this.scheduleSync()
  },

  onDetail(e) {
    this._formTouched = true
    const detailAddress = e.detail.value
    this.setData({ detailAddress, canEval: formReady(Object.assign({}, this.data, { detailAddress })) })
    this.rememberForm({ detailAddress })
    this.scheduleSync()
  },

  onRegion(e) {
    this._formTouched = true
    const region = e.detail.value || []
    this.setData({
      region,
      regionText: region.join(' '),
      canEval: formReady(Object.assign({}, this.data, { region })),
    })
    this.rememberForm({ region })
    this.scheduleSync()
  },

  onCat1(e) {
    this._formTouched = true
    const cat1Index = Number(e.detail.value) || 0
    const cat2List = CATEGORIES[this.data.cat1List[cat1Index]] || []
    const next = Object.assign({}, this.data, { cat1Index, cat2List, cat2Index: 0 })
    this.setData({ cat1Index, cat2List, cat2Index: 0, canEval: formReady(next) })
    this.rememberForm({ cat1Index, cat2List, cat2Index: 0 })
    this.scheduleSync()
  },

  onCat2(e) {
    this._formTouched = true
    const cat2Index = Number(e.detail.value) || 0
    this.setData({ cat2Index, canEval: formReady(Object.assign({}, this.data, { cat2Index })) })
    this.rememberForm({ cat2Index })
    this.scheduleSync()
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
      await billing.checkErpPointsAffordable({ kind: 'shop_eval_advice' })
      const base = this._input || { platformId: this.data.platformId, storeName: this.data.storeName }
      const advice = await evalApi.adviseShop(base, this._score, {
        force: true,
        storage,
        askText,
      })
      await billing.spendErpPointsForUsage({
        kind: 'shop_eval_advice',
        idempotencyKey: 'shop-eval-advice-' + Date.now(),
        note: '门店分析提升',
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
