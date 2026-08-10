const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const industryMp = require('../../utils/recruitmentIndustryMp.js')
const novice = require('../../utils/recruitmentNoviceMp.js')
const briefStore = require('../../utils/kolBriefStorageMp.js')

const PLATS = ['抖音', '小红书', '美团', '快手']
const CONTENT = ['短视频', '直播', '图文']
const VISIT_SLOTS = ['09:00-12:00', '12:00-14:00', '14:00-17:00', '17:00-20:00', '20:00-22:00']
const FOLLOWER = ['1000-5000', '5000-1万', '1万+', '5万+', '10万+', '50万+']
const COMMERCE = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6+']
const COMMISSION_PRESETS = ['0', '3', '5', '8', '10', '12', '15', '20', '25', '30', '40', '50', '80']
const TAG_PRESET = ['营销卡券', '家居家装', '购物', '休闲娱乐', '生活服务']

function toggle(arr, x) {
  return arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]
}

Page({
  data: {
    name: '',
    recruitMode: 'ai',
    designatedInput: '',
    platformsSel: ['抖音'],
    contentSel: ['短视频'],
    platOpts: PLATS,
    contentOpts: CONTENT,
    recruitStart: '',
    recruitEnd: '',
    visitStart: '',
    visitEnd: '',
    visitSlotsSel: ['09:00-12:00'],
    slotOpts: VISIT_SLOTS,
    commissionInput: '3',
    commissionPresets: COMMISSION_PRESETS,
    industryOptions: industryMp.FALLBACK,
    industryIndex: 0,
    provideMeal: false,
    tablePerMeal: 4,
    stores: [{ name: '', address: '' }],
    talentTagsSel: ['营销卡券'],
    followerSel: [],
    commerceSel: [],
    followerOpts: FOLLOWER,
    commerceOpts: COMMERCE,
    tagPresetOpts: TAG_PRESET,
    budget: '',
    headcount: '',
    note: '',
    selectedBriefLines: '',
    submitting: false,
    briefPickerOpen: false,
    briefRecords: [],
    designatedModalOpen: false,
  },

  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
    const sel = briefStore.readSelectedBrief()
    this.applySelectedBrief(sel)
  },

  async onLoad() {
    const opts = await industryMp.loadIndustryL1Labels()
    const first = opts[0] || TAG_PRESET[0]
    this.setData({
      industryOptions: opts,
      industryIndex: 0,
      talentTagsSel: [first],
    })
    const persisted = briefStore.readSelectedBrief()
    this.applySelectedBrief(persisted)
  },

  applySelectedBrief(sel) {
    if (!sel || !sel.text) {
      this.setData({
        selectedBriefLines: sel && sel.recordId ? '（已选记录，暂无正文）' : '尚未选择 Brief',
      })
      return
    }
    const t = String(sel.text || '').trim()
    const head = `${sel.mainProductName || '主推'} · ${sel.platform || ''} · v${typeof sel.variantIndex === 'number' ? sel.variantIndex + 1 : 1}`
    this.setData({ selectedBriefLines: `${head}\n${t.slice(0, 620)}${t.length > 620 ? '…' : ''}` })
  },

  backManage() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-publish-pick/recruit-publish-pick' }) })
  },

  bindName(e) {
    this.setData({ name: e.detail.value })
  },

  tapModeAi() {
    this.setData({ recruitMode: 'ai', designatedModalOpen: false })
  },

  tapModeDesignated() {
    this.setData({ designatedModalOpen: true })
  },

  closeDesignated() {
    this.setData({ designatedModalOpen: false })
  },

  bindDesignated(e) {
    this.setData({ designatedInput: e.detail.value })
  },

  confirmDesignated() {
    const d = String(this.data.designatedInput || '').trim()
    if (!d) {
      wx.showToast({ title: '请填写达人昵称或 ID', icon: 'none' })
      return
    }
    this.setData({ recruitMode: 'designated', designatedModalOpen: false })
  },

  tapPlat(e) {
    const x = String(e.currentTarget.dataset.x || '')
    const next = toggle(this.data.platformsSel, x)
    this.setData({ platformsSel: next.length ? next : ['抖音'] })
  },

  tapContent(e) {
    const x = String(e.currentTarget.dataset.x || '')
    const next = toggle(this.data.contentSel, x)
    this.setData({ contentSel: next.length ? next : ['短视频'] })
  },

  tapSlot(e) {
    const x = String(e.currentTarget.dataset.x || '')
    const next = toggle(this.data.visitSlotsSel, x)
    this.setData({ visitSlotsSel: next.length ? next : ['09:00-12:00'] })
  },

  tapFollower(e) {
    const x = String(e.currentTarget.dataset.x || '')
    this.setData({ followerSel: toggle(this.data.followerSel, x) })
  },

  tapCommerce(e) {
    const x = String(e.currentTarget.dataset.x || '')
    this.setData({ commerceSel: toggle(this.data.commerceSel, x) })
  },

  tapTag(e) {
    const x = String(e.currentTarget.dataset.x || '')
    let next = toggle(this.data.talentTagsSel, x)
    if (!next.length) next = [x]
    this.setData({ talentTagsSel: next })
  },

  pickCommissionPreset(e) {
    const x = String(e.currentTarget.dataset.x || '')
    this.setData({ commissionInput: String(Number.parseInt(x, 10) || 0) })
  },

  bindCommission(e) {
    this.setData({ commissionInput: novice.filterKolCommissionInputDigits(e.detail.value) })
  },

  onIndustryPick(e) {
    const i = Number(e.detail.value) || 0
    this.setData({ industryIndex: i })
  },

  toggleMeal() {
    this.setData({ provideMeal: !this.data.provideMeal })
  },

  bindTable(e) {
    const n = Number.parseInt(String(e.detail.value || ''), 10)
    this.setData({ tablePerMeal: Number.isFinite(n) ? Math.max(1, n) : 4 })
  },

  bindStoreName(e) {
    const i = Number(e.currentTarget.dataset.i) || 0
    const stores = this.data.stores.map((row, idx) =>
      idx === i ? Object.assign({}, row, { name: e.detail.value }) : row,
    )
    this.setData({ stores })
  },

  bindStoreAddr(e) {
    const i = Number(e.currentTarget.dataset.i) || 0
    const stores = this.data.stores.map((row, idx) =>
      idx === i ? Object.assign({}, row, { address: e.detail.value }) : row,
    )
    this.setData({ stores })
  },

  addStoreRow() {
    this.setData({ stores: [...this.data.stores, { name: '', address: '' }] })
  },

  async syncDouyinStores() {
    const r = await douyin.fetchDouyinStores()
    if (!r.ok || !r.items?.length) {
      wx.showToast({ title: r.message || '同步失败', icon: 'none' })
      return
    }
    const stores = r.items.map((it) => ({ name: it.name || '', address: it.address || '' }))
    this.setData({ stores: stores.length ? stores : [{ name: '', address: '' }] })
    wx.showToast({ title: '已同步来客门店', icon: 'success' })
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

  bindBudget(e) {
    this.setData({ budget: e.detail.value })
  },
  bindHeadcount(e) {
    this.setData({ headcount: e.detail.value })
  },
  bindNote(e) {
    this.setData({ note: e.detail.value })
  },

  openBriefPicker() {
    this.setData({ briefPickerOpen: true, briefRecords: briefStore.readRecords() })
  },
  closeBriefPicker() {
    this.setData({ briefPickerOpen: false })
  },

  pickBriefVariant(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const v = Number(e.currentTarget.dataset.v) || 0
    const rec = this.data.briefRecords.find((r) => r.id === id)
    if (!rec || !Array.isArray(rec.previews)) return
    const text = String(rec.previews[v] || '')
    const payload = {
      recordId: rec.id,
      variantIndex: v,
      text,
      platform: rec.platform || '',
      mainProductName: rec.mainProductName || '',
      tags: rec.tags || [],
    }
    briefStore.writeSelectedBrief(payload)
    this.applySelectedBrief(payload)
    this.setData({ briefPickerOpen: false })
    wx.showToast({ title: '已选择 Brief', icon: 'success' })
  },

  goBriefWizard() {
    wx.navigateTo({ url: '/pages/recruit-brief-wizard/recruit-brief-wizard' })
  },

  async onSubmit() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({ title: '未连接后台', content: '请配置 MERCHANT_API_BASE_URL', showCancel: false })
      return
    }
    const name = String(this.data.name || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写招募名称', icon: 'none' })
      return
    }
    const sel = briefStore.readSelectedBrief()
    if (!sel || !String(sel.text || '').trim()) {
      wx.showToast({ title: '请先「选择Brief」', icon: 'none' })
      return
    }
    if (this.data.recruitMode === 'designated' && !String(this.data.designatedInput || '').trim()) {
      wx.showToast({ title: '指定达人请填写昵称/ID', icon: 'none' })
      return
    }
    const budget = Number.parseFloat(String(this.data.budget || ''))
    const headcount = Number.parseInt(String(this.data.headcount || ''), 10)
    if (!Number.isFinite(budget) || budget <= 0) {
      wx.showToast({ title: '请填写总预算', icon: 'none' })
      return
    }
    if (!Number.isFinite(headcount) || headcount <= 0) {
      wx.showToast({ title: '请填写招募人数', icon: 'none' })
      return
    }
    if (!this.data.talentTagsSel.length) {
      wx.showToast({ title: '请选择达人标签', icon: 'none' })
      return
    }

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
            content: '请前往「我的钱包」完成充值申报后再提交。',
            confirmText: '去钱包',
            success(res) {
              if (res.confirm) wx.navigateTo({ url: '/pages/wallet/wallet' })
            },
          })
          return
        }
      } catch (_) {}

      const merchantCommissionPct = novice.parseKolCommissionPctFromDraft(this.data.commissionInput)
      const industry = String(this.data.industryOptions[this.data.industryIndex] || '餐饮')
      const validStores = this.data.stores.filter((s) => String(s.name || '').trim())
      const storeName = validStores[0]?.name.trim() || '—'
      const storeAddress = validStores[0]?.address.trim() || '—'
      const id = `RO${Date.now()}`
      const platforms = this.data.platformsSel.join(' / ') || '—'
      const talentTags = this.data.talentTagsSel
      const followerTiers = this.data.followerSel
      const commerceLevels = this.data.commerceSel
      const visitSlots = this.data.visitSlotsSel
      const tablePerMeal = this.data.provideMeal && industry === '餐饮' ? this.data.tablePerMeal : undefined

      const order = {
        id,
        customerName,
        storeName,
        talentId: '—',
        talentName: '待管控台接单分配',
        fans: 0,
        accountType: platforms,
        coopTimes: 0,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        status: 'pending',
        serviceAmount: budget,
        commissionPct: merchantCommissionPct,
        netAmount: Math.round(Math.max(0, budget) * (1 - merchantCommissionPct / 100)),
        storeAddress,
        category: talentTags[0] || '达人招募',
        infoSummary: `招募：${name}；模式：${this.data.recruitMode === 'designated' ? `指定达人(${String(this.data.designatedInput).trim()})` : '智能匹配'}；Brief：${sel.mainProductName}（${sel.platform}）；预算¥${budget}/${headcount}人；行业${industry}；商家佣金率${merchantCommissionPct}%；桌数${tablePerMeal ?? '—'}；时段${visitSlots.join('、')}；达人标签${talentTags.join('、')}；粉丝量级${followerTiers.join('、') || '—'}；带货等级${commerceLevels.join('、') || '—'}`,
      }

      try {
        wx.setStorageSync(
          'meoo_last_recruitment_submit',
          JSON.stringify({
            name,
            tablePerMeal,
            visitSlots,
            visitStart: this.data.visitStart,
            visitEnd: this.data.visitEnd,
            merchantCommissionPct,
            stores: validStores,
            talentTags,
            followerTiers,
            commerceLevels,
          }),
        )
      } catch (_) {}

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
})
