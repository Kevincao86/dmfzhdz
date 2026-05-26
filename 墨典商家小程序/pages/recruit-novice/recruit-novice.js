const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const industryMp = require('../../utils/recruitmentIndustryMp.js')
const novice = require('../../utils/recruitmentNoviceMp.js')

const STRATEGIES = [
  { id: 'more_v3', lab: novice.kolTierStrategyLabel('more_v3') },
  { id: 'more_v4', lab: novice.kolTierStrategyLabel('more_v4') },
  { id: 'more_v5', lab: novice.kolTierStrategyLabel('more_v5') },
]

Page({
  data: {
    deliveryPlatformIdx: 0,
    platforms: [{ id: '抖音', label: '抖音' }, { id: '小红书', label: '小红书' }],
    city: '',
    industryOptions: industryMp.FALLBACK,
    industryIndex: 0,
    packageNote: '',
    budget: '',
    recruitStart: '',
    recruitEnd: '',
    visitStart: '',
    visitEnd: '',
    strategyIndex: 1,
    strategies: STRATEGIES,
    kolCommissionInput: '3',
    selectedStores: [],
    storePickerOpen: false,
    storeSearch: '',
    storeCandidates: [],
    displayStores: [],
    storesBoundHint: '',
    allocationText: '',
    allocationFresh: false,
    aiLoading: false,
    aiErr: '',
    submitting: false,
  },

  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },

  async onLoad() {
    const opts = await industryMp.loadIndustryL1Labels()
    this.setData({ industryOptions: opts, industryIndex: 0 })
  },

  onPlatformTap(e) {
    const i = Number(e.currentTarget.dataset.i) || 0
    this.setData({
      deliveryPlatformIdx: i,
      allocationText: '',
      allocationFresh: false,
      aiErr: '',
      kolCommissionInput: i === 0 ? this.data.kolCommissionInput || '3' : '0',
    })
  },

  bindCity(e) {
    this.setData({ city: e.detail.value, allocationFresh: false })
  },

  bindPackage(e) {
    this.setData({ packageNote: e.detail.value })
  },

  bindBudget(e) {
    this.setData({ budget: e.detail.value, allocationFresh: false })
  },

  bindRecruitStart(e) {
    this.setData({ recruitStart: e.detail.value })
  },

  bindRecruitEnd(e) {
    this.setData({ recruitEnd: e.detail.value })
  },

  bindVisitStart(e) {
    this.setData({ visitStart: e.detail.value })
  },

  bindVisitEnd(e) {
    this.setData({ visitEnd: e.detail.value })
  },

  onIndustryPick(e) {
    this.setData({ industryIndex: Number(e.detail.value) || 0 })
  },

  onStrategyPick(e) {
    this.setData({ strategyIndex: Number(e.detail.value) || 0, allocationFresh: false })
  },

  bindKolCommission(e) {
    const v = novice.filterKolCommissionInputDigits(e.detail.value)
    this.setData({ kolCommissionInput: v })
  },

  openStorePicker() {
    douyin.fetchDouyinStores().then((r) => {
      if (!r.ok || !r.items || !r.items.length) {
        this.setData({
          storesBoundHint:
            r.message || '未取得门店列表，请先绑定抖音来客并在电脑端同步门店。',
          storePickerOpen: false,
          storeCandidates: [],
        })
        return
      }
      this.setData({
        storePickerOpen: true,
        storesBoundHint: '',
        storeCandidates: r.items,
        displayStores: r.items,
        storeSearch: '',
      })
    })
  },

  closeStorePicker() {
    this.setData({ storePickerOpen: false })
  },

  bindStoreSearch(e) {
    const q = String(e.detail.value || '').trim().toLowerCase()
    const rows = this.data.storeCandidates || []
    if (!q) {
      this.setData({ storeSearch: e.detail.value, displayStores: rows })
      return
    }
    const displayStores = rows.filter((s) => {
      const name = String(s.name || '').toLowerCase()
      const addr = String(s.address || '').toLowerCase()
      return name.includes(q) || addr.includes(q)
    })
    this.setData({ storeSearch: e.detail.value, displayStores })
  },

  toggleStoreTap(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const hit = this.data.storeCandidates.find((x) => x.id === id)
    if (!hit) return
    const sel = this.data.selectedStores.slice()
    const ix = sel.findIndex((s) => s.id === id)
    if (ix >= 0) sel.splice(ix, 1)
    else sel.push({ id: hit.id, name: hit.name, address: hit.address || '' })
    this.setData({ selectedStores: sel, allocationFresh: false })
  },

  removeStoreTap(e) {
    const id = String(e.currentTarget.dataset.id || '')
    this.setData({
      selectedStores: this.data.selectedStores.filter((s) => s.id !== id),
      allocationFresh: false,
    })
  },

  confirmStorePicker() {
    this.setData({ storePickerOpen: false })
  },

  runAllocation() {
    const city = String(this.data.city || '').trim()
    const budget = Number.parseFloat(String(this.data.budget || ''))
    const plat = this.data.platforms[this.data.deliveryPlatformIdx]
    const strategy = STRATEGIES[this.data.strategyIndex].id
    if (!city) {
      this.setData({ aiErr: '请填写城市' })
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      this.setData({ aiErr: '请填写总预算（大于 0）' })
      return
    }
    this.setData({ aiLoading: true, aiErr: '' })
    setTimeout(() => {
      try {
        let alloc
        if (plat.id === '小红书') {
          alloc = novice.fallbackXiaohongshuNoviceAllocation(budget)
        } else {
          alloc = novice.fallbackNoviceKolAllocation(budget, strategy, city)
        }
        const head = alloc.v3 + alloc.v4 + alloc.v5 + alloc.v5plus
        const tierLine =
          plat.id === '小红书'
            ? `预估达人数:${head}`
            : `V3:${alloc.v3} V4:${alloc.v4} V5:${alloc.v5} V5以上:${alloc.v5plus}`
        const text = `${tierLine}\n${alloc.costHint || ''}\n${alloc.notes || ''}`
        this.setData({
          allocationText: text,
          allocationFresh: true,
          aiLoading: false,
        })
      } catch (e) {
        this.setData({
          aiLoading: false,
          aiErr: e instanceof Error ? e.message : String(e),
        })
      }
    }, 260)
  },

  async onSubmit() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({ title: '未连接后台', content: '请配置 MERCHANT_API_BASE_URL', showCancel: false })
      return
    }
    const plat = this.data.platforms[this.data.deliveryPlatformIdx]
    const isDouyin = plat.id === '抖音'
    const city = String(this.data.city || '').trim()
    const industry = String(this.data.industryOptions[this.data.industryIndex] || '餐饮')
    const packageNote = String(this.data.packageNote || '').trim()
    const budget = Number.parseFloat(String(this.data.budget || ''))
    const recruitStart = String(this.data.recruitStart || '').trim()
    const recruitEnd = String(this.data.recruitEnd || '').trim()
    const visitStart = String(this.data.visitStart || '').trim()
    const visitEnd = String(this.data.visitEnd || '').trim()

    if (!this.data.selectedStores.length) {
      wx.showToast({ title: '请至少选择一家探店门店', icon: 'none' })
      return
    }
    if (!city) {
      wx.showToast({ title: '请填写城市', icon: 'none' })
      return
    }
    if (!packageNote) {
      wx.showToast({ title: '请填写套餐/项目说明', icon: 'none' })
      return
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      wx.showToast({ title: '请填写有效预算', icon: 'none' })
      return
    }
    if (!recruitStart || !recruitEnd || !visitStart || !visitEnd) {
      wx.showToast({ title: '请填写招募与探店日期', icon: 'none' })
      return
    }
    const kolPct = novice.parseKolCommissionPctFromDraft(this.data.kolCommissionInput)
    if (isDouyin && kolPct <= 0) {
      wx.showToast({ title: '请填写达人佣金%', icon: 'none' })
      return
    }
    if (!this.data.allocationFresh) {
      wx.showToast({
        title: plat.id === '小红书' ? '请先点击小红书人数估算' : '请先点击 AI 分配达人档位',
        icon: 'none',
      })
      return
    }

    const strategy = STRATEGIES[this.data.strategyIndex].id
    let alloc
    if (isDouyin) alloc = novice.fallbackNoviceKolAllocation(budget, strategy, city)
    else alloc = novice.fallbackXiaohongshuNoviceAllocation(budget)

    const headcount = alloc.v3 + alloc.v4 + alloc.v5 + alloc.v5plus
    const tierLine =
      isDouyin
        ? `V3:${alloc.v3} V4:${alloc.v4} V5:${alloc.v5} V5以上:${alloc.v5plus}`
        : `预估达人数:${headcount}`

    wx.showLoading({ title: '提交中…', mask: true })
    this.setData({ submitting: true })
    try {
      let customerName = ''
      try {
        const tid = await rest.fetchPrimaryTenantId()
        customerName = (await rest.fetchTenantMerchantName(tid)) || ''
      } catch (_) {}
      if (!customerName) customerName = wx.getStorageSync('meoo_login_name') || '小程序商户'

      const needCents = Math.round(budget * 100)
      try {
        const tid = await rest.fetchPrimaryTenantId()
        const sum = await rest.fetchTenantWalletSummary(tid)
        if (needCents > 0 && sum.balanceCents < needCents) {
          wx.hideLoading()
          this.setData({ submitting: false })
          wx.showModal({
            title: '余额不足',
            content: `当前可用余额不足以覆盖预算 ¥${budget.toFixed(2)}，请先前往「我的钱包」充值申报。`,
            confirmText: '去钱包',
            success(res) {
              if (res.confirm) wx.navigateTo({ url: '/pages/wallet/wallet' })
            },
          })
          return
        }
      } catch (_) {}

      const storeName = this.data.selectedStores.map((s) => s.name).join('、') || city
      const storeAddress =
        this.data.selectedStores
          .map((s) => (String(s.address || '').trim() ? `${s.name}（${s.address.trim()}）` : s.name))
          .join('；') || `${city} · ${industry}`
      const storeIdsLine = this.data.selectedStores.map((s) => s.id).join(',')
      const id = `RO-NV${Date.now()}`
      const order = {
        id,
        customerName,
        storeName,
        talentId: '—',
        talentName: '新手版·待 AI / 运营匹配',
        fans: headcount,
        accountType: plat.id,
        recruitmentPlatform: plat.id,
        coopTimes: 0,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        status: 'pending',
        serviceAmount: budget,
        commissionPct: isDouyin ? kolPct : 0,
        netAmount: Math.round((Math.max(0, budget) * (100 - (isDouyin ? kolPct : 0))) / 100),
        storeAddress,
        category: industry,
        infoSummary: `【新手版·AI纯智能】投放平台:${plat.id}；城市:${city}；门店:${storeName}；POI:${storeIdsLine}；行业:${industry}；套餐:${packageNote.slice(0, 200)}；预算¥${budget}；${isDouyin ? `达人佣金:${kolPct}%；策略:${novice.kolTierStrategyLabel(strategy)}；` : '达人佣金:不适用(小红书)；'}招募:${recruitStart}~${recruitEnd}；探店:${visitStart}~${visitEnd}；${isDouyin ? `档位:${tierLine}；` : `人数:${tierLine}；`}分配来源:${alloc.source}；${alloc.costHint || ''}${alloc.notes ? `；说明:${alloc.notes}` : ''}`,
      }

      await ops.appendRecruitmentOrder(order)
      try {
        wx.setStorageSync('meoo_last_recruitment_order_id', id)
      } catch (_) {}

      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: '已提交', icon: 'success' })
      setTimeout(() => wx.redirectTo({ url: '/pages/recruitment/recruitment' }), 600)
    } catch (e) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showModal({
        title: '提交失败',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
    }
  },

  backPick() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-publish-pick/recruit-publish-pick' }) })
  },
})
