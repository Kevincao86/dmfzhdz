const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const userProfile = require('../../utils/userProfile.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const messagesStore = require('../../utils/messagesStore.js')
const participant = require('../../utils/participant.js')
const publishOpts = require('../../utils/publishFormOptions.js')
const cityPicker = require('../../utils/publishCityPicker.js')
const applyFormEditor = require('../../utils/applyFormEditor.js')
const applyTemplates = applyFormEditor.templates
const shareCopy = require('../../utils/recruitmentShareCopy.js')
const mpOrderRestore = require('../../utils/mpOrderPublishRestore.js')
const mpOrderRegistryOps = require('../../utils/mpOrderRegistryOps.js')
const { setTabBarForPage, setTabBarHidden } = require('../../utils/tabBar.js')
/** 自定义导航：标题区落在胶囊下方 */
function applyPublishSafeHead(page) {
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const pxToRpx = 750 / win.windowWidth
    const topRpx = Math.round((menu.top + menu.height + 6) * pxToRpx)
    const rightRpx = Math.round((win.windowWidth - menu.left + 12) * pxToRpx)
    page.setData({
      formHeadStyle: `padding-top:${topRpx}rpx;padding-right:${rightRpx}rpx;`,
      heroHeadStyle: `padding-top:${topRpx}rpx;padding-right:${rightRpx}rpx;`,
    })
  } catch (_) {
    page.setData({
      formHeadStyle: 'padding-top:calc(env(safe-area-inset-top) + 96rpx);padding-right:200rpx;',
      heroHeadStyle: 'padding-top:calc(env(safe-area-inset-top) + 96rpx);padding-right:200rpx;',
    })
  }
}

const {
  DELIVERY_WINDOWS,
  RECRUIT_MODES,
  PLATFORMS,
  TALENT_TAGS,
  DOUYIN_SALES_LEVELS,
  DOUYIN_TIER_LEVELS,
  FANS_TIER_RANGES,
  FEE_TYPES,
  feeTypeLabel,
  modeById,
  newLevelTier,
  newFansTier,
} = publishOpts

/** 子页确认后滚动回表单对应字段 */
const PICKER_FIELD_ANCHOR = {
  platform: 'field-platform',
  tag: 'field-tag',
  city: 'field-city',
  reqLevel: 'field-req-level',
  fee: 'field-fee',
  signupDeadline: 'field-signup-deadline',
  applyForm: 'field-apply-form',
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDeadlineLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`
}

function defaultSignupDate() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function buildFansRequirementText(f) {
  if (f.fansLimitMode === 'unlimited') return '不限'
  const min = String(f.fansMin ?? '').trim()
  return min ? `粉丝≥${min}` : ''
}

function emptyForm() {
  const afTpl = applyTemplates.emptyCustomTemplate('')
  return {
    deliveryWindow: 'normal',
    title: '',
    platform: '',
    cityNational: false,
    selectedCities: [],
    talentTags: [],
    fansLimitMode: 'unlimited',
    fansMin: '',
    fansRequirement: '不限',
    douyinSalesLevels: ['不限'],
    feeTypeId: '',
    fixedPrice: '',
    selfQuoteMin: '',
    selfQuoteMax: '',
    levelTiers: [newLevelTier('lt-init')],
    fansTiers: [newFansTier('ft-init')],
    cpsPercent: '',
    recruitCount: '1',
    recruitDetail: '',
    signupDeadline: '',
    iceVideoUrl: '',
    applyFormTemplateId: '',
    applyFormTemplateName: '',
    applyFormFields: (afTpl.fields || []).map((f) => ({ ...f })),
  }
}

function buildTagGrid(selected) {
  const set = new Set(selected || [])
  return TALENT_TAGS.map((name) => ({ name, on: set.has(name), disabled: false }))
}

function buildLevelGrid(selected, disabledSet) {
  return DOUYIN_SALES_LEVELS.map((name) => ({
    name,
    on: (selected || []).includes(name),
    disabled: disabledSet ? disabledSet.has(name) : false,
  }))
}

function buildTierLevelGrid(selected, usedElsewhere) {
  const sel = new Set(selected || [])
  const used = usedElsewhere || new Set()
  return DOUYIN_TIER_LEVELS.map((name) => ({
    name,
    on: sel.has(name),
    disabled: !sel.has(name) && used.has(name),
  }))
}

Page({
  data: {
    step: 'mode',
    recruitModes: RECRUIT_MODES,
    deliveryWindows: DELIVERY_WINDOWS,
    todayDate: defaultSignupDate(),
    signupDeadlineDate: '',
    signupDeadlineTime: '23:59',
    showSignupDeadline: true,
    signupDeadlineDisplay: '请选择报名截止时间',
    signupDeadlinePlaceholder: true,
    recruitMode: '',
    recruitModeLabel: '',
    form: emptyForm(),
    showDouyinLevel: false,
    pickerView: '',
    platforms: PLATFORMS,
    platformDisplayText: '请选择招募平台',
    tagGrid: buildTagGrid([]),
    tagsDisplayText: '请选择达人标签（最多2个）',
    cityKeyword: '',
    cityActiveProvince: '',
    cityProvinceRows: [],
    cityCheckGrid: [],
    citySelectedChips: [],
    cityDisplayText: '请选择招募城市',
    reqLevelGrid: buildLevelGrid(['不限'], null),
    levelDisplayText: '不限',
    tagsPlaceholder: true,
    cityPlaceholder: true,
    platformPlaceholder: true,
    feeTypes: FEE_TYPES,
    feeTypeLabel: '请选择',
    feePlaceholder: true,
    tierLevelGrid: [],
    editingTierIndex: -1,
    fansTierPickerRanges: FANS_TIER_RANGES,
    editingFansTierIndex: -1,
    submitting: false,
    createdOrder: null,
    shareTitle: '',
    groupCopyText: '',
    formHeadStyle: '',
    heroHeadStyle: '',
    scrollIntoView: '',
    lastScrollAnchor: '',
    applyFormDisplayText: '',
    applyFormPlaceholder: true,
    showApplyTplPicker: false,
    customTemplateList: [],
    applyFormEditorMode: '',
    editMpId: '',
    editingOrder: null,
    isEditMode: false,
    editLoadDone: false,
    ...applyFormEditor.editorDataExtra(),
  },
  onLoad(options) {
    applyPublishSafeHead(this)
    applyFormEditor.bindEditorHandlers(this)
    let editMpId = options && options.editMpId ? String(options.editMpId).trim() : ''
    if (!editMpId) {
      try {
        editMpId = String(wx.getStorageSync('meoo_publish_edit_mp_id') || '').trim()
        if (editMpId) wx.removeStorageSync('meoo_publish_edit_mp_id')
      } catch (_) {}
    }
    if (editMpId) {
      this.setData({ editMpId, isEditMode: true, editLoadDone: false })
    }
  },
  onHide() {
    setTabBarHidden(this, false)
  },
  onUnload() {
    setTabBarHidden(this, false)
  },
  /** 填写表单及子页全屏时隐藏 TabBar */
  syncTabBarOverlay() {
    setTabBarHidden(this, this.data.step === 'form')
  },
  syncDeadlineFromParts() {
    const d = this.data.signupDeadlineDate
    const t = this.data.signupDeadlineTime || '23:59'
    if (!d) {
      this.setData({ 'form.signupDeadline': '', signupDeadlineDisplay: '请选择报名截止时间', signupDeadlinePlaceholder: true })
      return
    }
    const deadline = `${d} ${t}:00`
    this.setData({
      'form.signupDeadline': deadline,
      signupDeadlineDisplay: deadline.slice(0, 16),
      signupDeadlinePlaceholder: false,
    })
  },
  onDeliveryWindowTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.form.deliveryWindow) return
    const patch = { 'form.deliveryWindow': id, showSignupDeadline: id !== 'urgent' }
    if (id === 'urgent') {
      patch['form.signupDeadline'] = ''
      patch.signupDeadlineDisplay = '急单默认发布后 24 小时截止'
      patch.signupDeadlinePlaceholder = false
    } else {
      patch.signupDeadlineDisplay = this.data.signupDeadlineDate
        ? `${this.data.signupDeadlineDate} ${this.data.signupDeadlineTime || '23:59'}`
        : '请选择报名截止时间'
      patch.signupDeadlinePlaceholder = !this.data.signupDeadlineDate
    }
    this.setData(patch)
  },
  onFansLimitModeTap(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode) return
    const patch = { 'form.fansLimitMode': mode }
    if (mode === 'unlimited') {
      patch['form.fansMin'] = ''
      patch['form.fansRequirement'] = '不限'
    } else {
      patch['form.fansRequirement'] = buildFansRequirementText({
        ...this.data.form,
        fansLimitMode: 'limit',
        fansMin: this.data.form.fansMin,
      })
    }
    this.setData(patch)
  },
  onFansMinInput(e) {
    const fansMin = e.detail.value
    this.setData({
      'form.fansMin': fansMin,
      'form.fansRequirement': fansMin ? `粉丝≥${fansMin}` : '',
    })
  },
  onSignupDeadlineDate(e) {
    this.setData({ signupDeadlineDate: e.detail.value }, () => this.syncDeadlineFromParts())
  },
  onSignupDeadlineTime(e) {
    this.setData({ signupDeadlineTime: e.detail.value }, () => this.syncDeadlineFromParts())
  },
  onPickerBack() {
    this.setData({ pickerView: '' }, () => this.syncTabBarOverlay())
  },
  closePickerAndScroll(anchor) {
    const target = anchor || this.data.lastScrollAnchor || ''
    this.setData({ pickerView: '', scrollIntoView: '' }, () => {
      this.syncTabBarOverlay()
      if (!target) return
      wx.nextTick(() => {
        this.setData({ scrollIntoView: target })
        setTimeout(() => this.setData({ scrollIntoView: '' }), 500)
      })
    })
  },
  onApplyFormConfirm() {
    applyFormEditor.confirmApplyFormEditor(this, () => this.closePickerAndScroll('field-apply-form'))
  },
  openApplyFormEditorNew() {
    const platform = this.data.form.platform
    const tpl = applyTemplates.emptyCustomTemplate('')
    this.setData(
      {
        pickerView: 'applyForm',
        applyFormEditorMode: 'new',
        applyFormTemplateId: '',
        applyFormTemplateName: '新建报名项',
        applyFormFields: tpl.fields.map((f) => ({ ...f })),
        applyTemplateList: applyTemplates.listCustomTemplates(),
      },
      () => {
        applyFormEditor.syncEditorRows(this)
        this.syncTabBarOverlay()
      },
    )
  },
  openApplyFormUseTemplate() {
    const list = applyTemplates.listCustomTemplates()
    if (!list.length) {
      wx.showModal({
        title: '暂无模版',
        content: '请先在「我的」→「我的模版」中新建自定义模版',
        showCancel: false,
      })
      return
    }
    this.setData({ showApplyTplPicker: true, customTemplateList: list })
  },
  onCloseApplyTplPicker() {
    this.setData({ showApplyTplPicker: false })
  },
  onPickApplyTplFromModal(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const tpl = applyTemplates.getTemplateById(id)
    if (!tpl) return
    this.setData({ showApplyTplPicker: false })
    this.setData(
      {
        pickerView: 'applyForm',
        applyFormEditorMode: 'template',
        applyFormTemplateId: tpl.id,
        applyFormTemplateName: tpl.name,
        applyFormFields: tpl.fields.map((f) => ({ ...f })),
      },
      () => {
        applyFormEditor.syncEditorRows(this)
        this.syncTabBarOverlay()
      },
    )
  },
  openPicker(e) {
    const view = e.currentTarget.dataset.view
    if (!view) return
    if (view === 'applyForm') {
      if (!this.data.form.platform) {
        wx.showToast({ title: '请先选择招募平台', icon: 'none' })
        return
      }
      this.setData({ lastScrollAnchor: 'field-apply-form' })
      wx.showActionSheet({
        itemList: ['新增', '使用模版'],
        success: (res) => {
          if (res.tapIndex === 0) this.openApplyFormEditorNew()
          else if (res.tapIndex === 1) this.openApplyFormUseTemplate()
        },
      })
      return
    }
    const patch = { pickerView: view, lastScrollAnchor: PICKER_FIELD_ANCHOR[view] || '' }
    if (view === 'tag') patch.tagGrid = buildTagGrid(this.data.form.talentTags)
    if (view === 'city') {
      patch.cityKeyword = ''
    }
    if (view === 'reqLevel') {
      patch.reqLevelGrid = buildLevelGrid(this.data.form.douyinSalesLevels, null)
    }
    this.setData(patch, () => {
      if (view === 'city') this.refreshCityModalUi('')
      this.syncTabBarOverlay()
    })
  },
  refreshCityModalUi(activeProvinceHint) {
    const kw = this.data.cityKeyword
    const hint = activeProvinceHint != null ? activeProvinceHint : this.data.cityActiveProvince
    const selected = this.data.form.selectedCities || []
    const st = cityPicker.initModalState(kw, hint, selected)
    this.setData({
      cityActiveProvince: st.activeProvince,
      cityProvinceRows: st.provinceRows,
      cityCheckGrid: st.cityCheckGrid,
    })
  },
  syncDisplayFields() {
    const f = this.data.form
    let cityDisplayText = '请选择招募城市'
    if (f.cityNational) cityDisplayText = '全国'
    else if ((f.selectedCities || []).length) {
      const cities = f.selectedCities
      cityDisplayText =
        cities.length <= 2 ? cities.join('、') : `${cities.slice(0, 2).join('、')} 等${cities.length}城`
    }
    const tags = f.talentTags || []
    const tagsDisplayText = tags.length ? tags.join('、') : '请选择达人标签（最多2个）'
    const platformDisplayText = f.platform || '请选择招募平台'
    const levels = f.douyinSalesLevels || []
    const levelDisplayText =
      !levels.length || levels.includes('不限') ? '不限' : levels.join('、')
    const chips = (f.selectedCities || []).map((name) => ({ name }))
    const urgentWin = f.deliveryWindow === 'urgent'
    const af = f.applyFormFields || []
    let applyFormDisplayText = '请配置达人报名必填信息'
    let applyFormPlaceholder = true
    if (af.length) {
      applyFormPlaceholder = false
      const name =
        f.applyFormTemplateName ||
        (f.applyFormTemplateId && applyTemplates.getTemplateById(f.applyFormTemplateId)?.name) ||
        '已配置报名项'
      applyFormDisplayText = `${name}（${applyFormEditor.applyFormSummary(af, f.platform)}）`
    }
    this.setData({
      applyFormDisplayText,
      applyFormPlaceholder,
      cityDisplayText,
      tagsDisplayText,
      platformDisplayText,
      levelDisplayText,
      citySelectedChips: chips,
      showDouyinLevel: f.platform === '抖音',
      feeTypeLabel: feeTypeLabel(f.feeTypeId),
      feePlaceholder: !f.feeTypeId,
      tagsPlaceholder: !tags.length,
      cityPlaceholder: cityDisplayText === '请选择招募城市',
      platformPlaceholder: !f.platform,
      showSignupDeadline: !urgentWin,
      signupDeadlineDisplay: urgentWin
        ? '急单默认发布后 24 小时截止'
        : f.signupDeadline
          ? String(f.signupDeadline).slice(0, 16)
          : '请选择报名截止时间',
      signupDeadlinePlaceholder: !urgentWin && !f.signupDeadline,
    })
  },
  onShow() {
    if (userProfile.readIdentity() !== 'pr') {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
    try {
      const wxAcc = require('../../utils/wxAccount.js')
      if (!wxAcc.isWxLoggedIn()) {
        wx.showToast({ title: '请先在「我的」完成微信登录', icon: 'none' })
        wx.switchTab({ url: '/pages/mine/mine' })
        return
      }
    } catch (_) {}
    setTabBarForPage(this, '/pages/publish/publish')
    applyPublishSafeHead(this)
    this.syncTabBarOverlay()
    let pendingEdit = ''
    try {
      pendingEdit = String(wx.getStorageSync('meoo_publish_edit_mp_id') || '').trim()
      if (pendingEdit) wx.removeStorageSync('meoo_publish_edit_mp_id')
    } catch (_) {}
    if (pendingEdit && pendingEdit !== this.data.editMpId) {
      this.setData({ editMpId: pendingEdit, isEditMode: true, editLoadDone: false })
    }
    if (this.data.editMpId && !this.data.editLoadDone) {
      this.loadEditOrder(this.data.editMpId)
      return
    }
    if (this.data.step === 'done' && this.data.createdOrder) return
    if (this.data.step === 'form' && this.data.recruitMode) return
    if (this.data.isEditMode) return
    this.resetToMode()
  },
  async loadEditOrder(mpId) {
    if (!merchant.hasMerchantApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    wx.showLoading({ title: '加载中…', mask: true })
    try {
      const reg = await ops.fetchRegistry()
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === mpId)
      if (!mp) {
        wx.showToast({ title: '订单不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      const modeId = mpOrderRestore.recruitModeIdFromMp(mp)
      const mode = modeById(modeId) || modeById('visit')
      const restored = mpOrderRestore.formPatchFromMpOrder(mp)
      const afCfg = applyTemplates.getApplyConfigForMpOrder(mpId, restored.patch.applyFormTemplateId)
      if (afCfg && afCfg.fields && afCfg.fields.length) {
        restored.patch.applyFormFields = afCfg.fields.map((f) => ({ ...f }))
        if (!restored.patch.applyFormTemplateName && afCfg.name) {
          restored.patch.applyFormTemplateName = afCfg.name
        }
      }
      const today = defaultSignupDate()
      this.setData({
        step: 'form',
        pickerView: '',
        editMpId: mpId,
        editingOrder: mp,
        isEditMode: true,
        editLoadDone: true,
        recruitMode: mode.id,
        recruitModeLabel: mode.label,
        form: restored.patch,
        todayDate: today,
        signupDeadlineDate: restored.signupDeadlineDate || '',
        signupDeadlineTime: restored.signupDeadlineTime || '23:59',
      })
      this.syncDisplayFields()
      this.syncTabBarOverlay()
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 28), icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    } finally {
      wx.hideLoading()
    }
  },
  resetToMode() {
    this.setData({
      step: 'mode',
      pickerView: '',
      recruitMode: '',
      recruitModeLabel: '',
      form: emptyForm(),
      tagGrid: buildTagGrid([]),
      feeTypeLabel: '请选择',
      feePlaceholder: true,
      createdOrder: null,
    })
    this.syncDisplayFields()
  },
  onSelectMode(e) {
    const mode = modeById(e.currentTarget.dataset.id)
    if (!mode) return
    const today = defaultSignupDate()
    this.setData({
      step: 'form',
      pickerView: '',
      recruitMode: mode.id,
      recruitModeLabel: mode.label,
      todayDate: today,
      signupDeadlineDate: '',
      signupDeadlineTime: '23:59',
    })
    this.syncDisplayFields()
    this.syncTabBarOverlay()
  },
  onBackToMode() {
    if (this.data.isEditMode) {
      this.setData({
        editMpId: '',
        editingOrder: null,
        isEditMode: false,
        editLoadDone: false,
        step: 'mode',
      })
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    this.setData({ step: 'mode' })
  },
  onFieldInput(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`form.${key}`]: e.detail.value })
  },
  onTierFieldInput(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const tiers = (this.data.form.levelTiers || []).map((t) => ({ ...t }))
    if (!tiers[idx]) return
    tiers[idx][field] = e.detail.value
    this.setData({ 'form.levelTiers': tiers })
  },
  onFansTierFieldInput(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const tiers = (this.data.form.fansTiers || []).map((t) => ({ ...t }))
    if (!tiers[idx]) return
    tiers[idx][field] = e.detail.value
    this.setData({ 'form.fansTiers': tiers })
  },
  onPlatformPick(e) {
    const platform = e.currentTarget.dataset.platform
    if (!platform) return
    const levels = platform === '抖音' ? this.data.form.douyinSalesLevels : ['不限']
    this.setData({
      'form.platform': platform,
      'form.douyinSalesLevels': platform === '抖音' ? levels : [],
    })
    this.syncDisplayFields()
    this.closePickerAndScroll('field-platform')
  },
  onTagTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const grid = this.data.tagGrid.map((t) => ({ ...t }))
    const item = grid.find((t) => t.name === name)
    if (!item || item.disabled) return
    const selected = grid.filter((t) => t.on)
    if (!item.on && selected.length >= 2) {
      wx.showToast({ title: '最多可选2个标签', icon: 'none' })
      return
    }
    item.on = !item.on
    this.setData({ tagGrid: grid })
  },
  confirmTagPicker() {
    const talentTags = this.data.tagGrid.filter((t) => t.on).map((t) => t.name)
    if (!talentTags.length) {
      wx.showToast({ title: '请至少选择1个标签', icon: 'none' })
      return
    }
    this.setData({ 'form.talentTags': talentTags })
    this.syncDisplayFields()
    this.closePickerAndScroll('field-tag')
  },
  onCityNational() {
    this.setData({
      'form.cityNational': true,
      'form.selectedCities': [],
    })
    this.syncDisplayFields()
    this.closePickerAndScroll('field-city')
  },
  onCityKeyword(e) {
    this.setData({ cityKeyword: e.detail.value }, () => this.refreshCityModalUi())
  },
  onCityProvinceTap(e) {
    const province = e.currentTarget.dataset.name
    if (!province || province === this.data.cityActiveProvince) return
    this.refreshCityModalUi(province)
  },
  onCityCheckTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    let cities = [...(this.data.form.selectedCities || [])]
    const idx = cities.indexOf(name)
    if (idx >= 0) cities.splice(idx, 1)
    else cities.push(name)
    this.setData({ 'form.selectedCities': cities, 'form.cityNational': false }, () => {
      this.refreshCityModalUi()
      this.syncDisplayFields()
    })
  },
  onRemoveCityChip(e) {
    const name = e.currentTarget.dataset.name
    const cities = (this.data.form.selectedCities || []).filter((c) => c !== name)
    this.setData({ 'form.selectedCities': cities })
    this.syncDisplayFields()
  },
  confirmCityPicker() {
    if (!this.data.form.cityNational && !(this.data.form.selectedCities || []).length) {
      wx.showToast({ title: '请选择全国或添加城市', icon: 'none' })
      return
    }
    this.syncDisplayFields()
    this.closePickerAndScroll('field-city')
  },
  onReqLevelTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    let grid = this.data.reqLevelGrid.map((t) => ({ ...t }))
    const item = grid.find((t) => t.name === name)
    if (!item) return
    if (name === '不限') {
      grid = grid.map((t) => ({ ...t, on: t.name === '不限' }))
    } else {
      item.on = !item.on
      const unlimited = grid.find((t) => t.name === '不限')
      if (unlimited) unlimited.on = false
      if (!grid.some((t) => t.on && t.name !== '不限')) {
        grid.find((t) => t.name === '不限').on = true
      }
    }
    this.setData({ reqLevelGrid: grid })
  },
  confirmReqLevelPicker() {
    const levels = this.data.reqLevelGrid.filter((t) => t.on).map((t) => t.name)
    this.setData({ 'form.douyinSalesLevels': levels })
    this.syncDisplayFields()
    this.closePickerAndScroll('field-req-level')
  },
  onFeeSelect(e) {
    const id = e.currentTarget.dataset.id
    const row = FEE_TYPES.find((f) => f.id === id)
    if (!row) return
    const patch = { 'form.feeTypeId': id }
    if (id === 'level_tier' && !(this.data.form.levelTiers || []).length) {
      patch['form.levelTiers'] = [newLevelTier()]
    }
    if (id === 'fans_tier' && !(this.data.form.fansTiers || []).length) {
      patch['form.fansTiers'] = [newFansTier()]
    }
    this.setData(patch)
    this.syncDisplayFields()
    this.closePickerAndScroll('field-fee')
  },
  onAddLevelTier() {
    const tiers = [...(this.data.form.levelTiers || []), newLevelTier()]
    this.setData({ 'form.levelTiers': tiers })
  },
  onRemoveLevelTier(e) {
    const idx = Number(e.currentTarget.dataset.index)
    let tiers = [...(this.data.form.levelTiers || [])]
    if (tiers.length <= 1) {
      wx.showToast({ title: '至少保留1个阶梯', icon: 'none' })
      return
    }
    tiers.splice(idx, 1)
    this.setData({ 'form.levelTiers': tiers })
  },
  openTierLevelPicker(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const tiers = this.data.form.levelTiers || []
    const tier = tiers[idx]
    if (!tier) return
    const used = new Set()
    tiers.forEach((t, i) => {
      if (i === idx) return
      ;(t.levels || []).forEach((lv) => used.add(lv))
    })
    this.setData({
      pickerView: 'tierLevel',
      editingTierIndex: idx,
      tierLevelGrid: buildTierLevelGrid(tier.levels, used),
      lastScrollAnchor: `field-tier-lv-${idx}`,
    })
    this.syncTabBarOverlay()
  },
  onTierLevelTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    const grid = this.data.tierLevelGrid.map((t) => ({ ...t }))
    const item = grid.find((t) => t.name === name)
    if (!item || item.disabled) {
      wx.showToast({ title: '该等级已在其他阶梯使用', icon: 'none' })
      return
    }
    item.on = !item.on
    this.setData({ tierLevelGrid: grid })
  },
  confirmTierLevelPicker() {
    const idx = this.data.editingTierIndex
    const levels = this.data.tierLevelGrid.filter((t) => t.on).map((t) => t.name)
    if (!levels.length) {
      wx.showToast({ title: '请至少选择一个等级', icon: 'none' })
      return
    }
    const tiers = (this.data.form.levelTiers || []).map((t) => ({ ...t }))
    if (!tiers[idx]) return
    tiers[idx].levels = levels
    tiers[idx].levelsText = levels.join('、')
    const anchor = `field-tier-lv-${idx}`
    this.setData({ 'form.levelTiers': tiers, editingTierIndex: -1 })
    this.closePickerAndScroll(anchor)
  },
  onAddFansTier() {
    const tiers = [...(this.data.form.fansTiers || []), newFansTier()]
    this.setData({ 'form.fansTiers': tiers })
  },
  onRemoveFansTier(e) {
    const idx = Number(e.currentTarget.dataset.index)
    let tiers = [...(this.data.form.fansTiers || [])]
    if (tiers.length <= 1) {
      wx.showToast({ title: '至少保留1个阶梯', icon: 'none' })
      return
    }
    tiers.splice(idx, 1)
    this.setData({ 'form.fansTiers': tiers })
  },
  openFansTierPicker(e) {
    const idx = Number(e.currentTarget.dataset.index)
    this.setData({
      pickerView: 'fansTier',
      editingFansTierIndex: idx,
      lastScrollAnchor: `field-tier-fans-${idx}`,
    })
    this.syncTabBarOverlay()
  },
  onFansRangeTap(e) {
    const range = e.currentTarget.dataset.range
    if (!range) return
    const idx = this.data.editingFansTierIndex
    const tiers = (this.data.form.fansTiers || []).map((t) => ({ ...t }))
    const used = new Set(tiers.filter((_, j) => j !== idx).map((t) => t.fansRange).filter(Boolean))
    if (used.has(range)) {
      wx.showToast({ title: '该粉丝档位已在其他阶梯使用', icon: 'none' })
      return
    }
    if (!tiers[idx]) return
    tiers[idx].fansRange = range
    tiers[idx].fansRangeText = range
    const anchor = `field-tier-fans-${idx}`
    this.setData({ 'form.fansTiers': tiers, editingFansTierIndex: -1 })
    this.closePickerAndScroll(anchor)
  },
  validateFee(f) {
    if (f.feeTypeId === 'fixed') {
      if (String(f.fixedPrice ?? '').trim() === '') return '请填写一口价金额（0 表示置换）'
    }
    if (f.feeTypeId === 'self_quote') {
      const min = String(f.selfQuoteMin ?? '').trim()
      const max = String(f.selfQuoteMax ?? '').trim()
      if (!min && !max) return '请填写可接受报价区间'
    }
    if (f.feeTypeId === 'exchange_only') return null
    if (f.feeTypeId === 'level_tier') {
      const tiers = f.levelTiers || []
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i]
        if (!(t.levels || []).length) return `请设置第 ${i + 1} 个阶梯的达人等级`
        if (String(t.price ?? '').trim() === '') return `请填写第 ${i + 1} 个阶梯的达人价格`
      }
    }
    if (f.feeTypeId === 'fans_tier') {
      const tiers = f.fansTiers || []
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i]
        if (!t.fansRange) return `请设置第 ${i + 1} 个阶梯的粉丝档位`
        if (String(t.price ?? '').trim() === '') return `请填写第 ${i + 1} 个阶梯的达人价格`
      }
    }
    return null
  },
  validate() {
    const f = this.data.form
    if (!String(f.title || '').trim()) return '请填写招募标题'
    if (!f.platform) return '请选择招募平台'
    if (!f.cityNational && !(f.selectedCities || []).length) return '请选择招募城市'
    if (!(f.talentTags || []).length) return '请选择需求达人标签'
    if (f.fansLimitMode === 'limit' && !String(f.fansMin ?? '').trim()) return '请填写粉丝下限'
    if (f.deliveryWindow !== 'urgent' && !String(f.signupDeadline || '').trim()) {
      return '请选择招募报名截止时间'
    }
    if (f.platform === '抖音' && !(f.douyinSalesLevels || []).length) return '请选择达人带货等级'
    if (!f.feeTypeId) return '请选择费用模式'
    const feeErr = this.validateFee(f)
    if (feeErr) return feeErr
    const n = Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)
    if (n < 1) return '招募人数至少为 1'
    if (!String(f.recruitDetail || '').trim()) return '请填写招募详情'
    if (this.data.recruitMode === 'ice' && !String(f.iceVideoUrl || '').trim()) {
      return '云剪任务请填写成片下载链接'
    }
    if (!(f.applyFormFields || []).length) return '请配置达人报名必填信息'
    const afErr = applyTemplates.validateTemplateFields(f.applyFormFields)
    if (afErr) return afErr
    return null
  },
  buildBudgetText(f) {
    const cps = String(f.cpsPercent || '').trim()
    const prefix = cps ? `CPS ${cps}% · ` : ''
    if (f.feeTypeId === 'fixed') return `${prefix}一口价 ¥${f.fixedPrice}`
    if (f.feeTypeId === 'exchange_only') return `${prefix}纯置换`
    if (f.feeTypeId === 'self_quote') {
      const min = String(f.selfQuoteMin ?? '').trim()
      const max = String(f.selfQuoteMax ?? '').trim()
      const range = min || max ? `${min || '0'}-${max || '∞'}` : '面议'
      return `${prefix}自报价 ${range}`
    }
    if (f.feeTypeId === 'level_tier') {
      const parts = (f.levelTiers || []).map((t) => `${(t.levels || []).join('+')} ¥${t.price}`)
      return `${prefix}等级阶梯 ${parts.join(' / ')}`
    }
    if (f.feeTypeId === 'fans_tier') {
      const parts = (f.fansTiers || []).map((t) => `${t.fansRange} ¥${t.price}`)
      return `${prefix}粉丝阶梯 ${parts.join(' / ')}`
    }
    return feeTypeLabel(f.feeTypeId)
  },
  buildRegionText(f) {
    if (f.cityNational) return '全国'
    return (f.selectedCities || []).join('、')
  },
  resolveSignupDeadline(f) {
    if (f.deliveryWindow === 'urgent') return formatDeadlineLocal(new Date(Date.now() + 24 * 3600000))
    return String(f.signupDeadline || '').trim()
  },
  buildRecruitmentInfo(f, mode) {
    const deadline = this.resolveSignupDeadline(f)
    const windowLabel = f.deliveryWindow === 'urgent' ? '急单大厅' : '招募大厅'
    const lines = [
      `招募标题：${String(f.title || '').trim()}`,
      `投放窗口：${windowLabel}`,
      `招募模式：${mode.label}`,
      `招募平台：${f.platform || '—'}`,
      `招募城市：${this.buildRegionText(f)}`,
      `报名截止：${deadline ? String(deadline).slice(0, 16) : '—'}`,
      `招募人数：${Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)} 人`,
      `需求达人标签：${(f.talentTags || []).join('、')}`,
      `粉丝要求：${buildFansRequirementText(f)}`,
      `费用模式：${feeTypeLabel(f.feeTypeId)}`,
    ]
    if (f.platform === '抖音') lines.push(`带货等级：${(f.douyinSalesLevels || []).join('、')}`)
    if (f.feeTypeId === 'fixed') lines.push(`一口价：¥${f.fixedPrice}`)
    if (f.feeTypeId === 'exchange_only') lines.push('酬劳：纯置换（无现金）')
    if (f.feeTypeId === 'self_quote') {
      const min = String(f.selfQuoteMin ?? '').trim()
      const max = String(f.selfQuoteMax ?? '').trim()
      lines.push(`可接受报价区间：${min || '0'}-${max || '不限'}`)
    }
    if (f.feeTypeId === 'level_tier') {
      ;(f.levelTiers || []).forEach((t, i) => {
        lines.push(`阶梯${i + 1}：${(t.levels || []).join('、')} · ¥${t.price}`)
      })
    }
    if (f.feeTypeId === 'fans_tier') {
      ;(f.fansTiers || []).forEach((t, i) => {
        lines.push(`阶梯${i + 1}：${t.fansRange} · ¥${t.price}`)
      })
    }
    if (String(f.cpsPercent || '').trim()) lines.push(`佣金CPS：${f.cpsPercent}%`)
    else lines.push('佣金CPS：未设置')
    lines.push(`酬劳摘要：${this.buildBudgetText(f)}`)
    lines.push(`招募详情：${String(f.recruitDetail || '').trim()}`)
    if (mode.hall === 'ice' && String(f.iceVideoUrl || '').trim()) {
      lines.push(`云剪成片链接：${String(f.iceVideoUrl).trim()}`)
    }
    return lines.join('\n')
  },
  buildOrder() {
    const f = this.data.form
    const mode = modeById(this.data.recruitMode)
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const ts = Date.now()
    const existing = this.data.editingOrder
    const editId = this.data.editMpId
    const mpId =
      editId && existing
        ? editId
        : mode.hall === 'ice'
          ? `MP-ICE-${ts}`
          : `MP-RO-${ts}`
    const recruitCount = Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)
    const isUrgent = f.deliveryWindow === 'urgent' && mode.hall !== 'ice'
    const deadline = this.resolveSignupDeadline(f)
    const order = {
      id: mpId,
      sourceMerchantOrderId:
        existing && existing.sourceMerchantOrderId
          ? existing.sourceMerchantOrderId
          : `MP-USER-${ts}`,
      customerName: String(f.title || '').trim().slice(0, 24),
      storeName: this.buildRegionText(f),
      merchantRequirements: this.buildRecruitmentInfo(f, mode),
      status: existing && existing.status ? existing.status : 'open',
      createdAt: existing && existing.createdAt ? existing.createdAt : now,
      updatedAt: now,
      applicants: existing && existing.applicants ? existing.applicants : [],
      title: String(f.title || '').trim(),
      recruitmentInfo: this.buildRecruitmentInfo(f, mode),
      taskDetail: this.buildRecruitmentInfo(f, mode),
      platform: f.platform,
      fansRequirement: buildFansRequirementText(f),
      urgent: isUrgent,
      deadline,
      budgetText: this.buildBudgetText(f),
      recruitCount,
      region: this.buildRegionText(f),
      category: mode.category,
      publisherIdentity: 'pr',
      publisherTemplateId: 'publish-wizard-v2',
      mpPublishMeta: {
        prParticipantKey: participant.prParticipantKey(
          userProfile.readPrProfile() || userProfile.emptyPrProfile(),
        ),
        prDisplayName: userProfile.prDisplayName(
          userProfile.readPrProfile() || userProfile.emptyPrProfile(),
        ),
        deliveryWindow: f.deliveryWindow,
        recruitMode: mode.id,
        signupDeadline: deadline,
        fansLimitMode: f.fansLimitMode,
        fansMin: f.fansMin,
        talentTags: f.talentTags,
        douyinSalesLevels: f.platform === '抖音' ? f.douyinSalesLevels : [],
        feeTypeId: f.feeTypeId,
        fixedPrice: f.fixedPrice,
        selfQuoteMin: f.selfQuoteMin,
        selfQuoteMax: f.selfQuoteMax,
        levelTiers: f.levelTiers,
        fansTiers: f.fansTiers,
        cpsPercent: f.cpsPercent,
        recruitDetail: f.recruitDetail,
        cityNational: !!f.cityNational,
        cities: f.selectedCities || [],
        applyFormTemplateId: f.applyFormTemplateId,
        applyFormTemplateName: f.applyFormTemplateName || '',
        applyFormFields: f.applyFormFields || [],
      },
    }
    if (mode.hall === 'ice') {
      order.orderKind = 'recruitment_ice'
      order.hall = 'ice'
      order.fulfillmentLoop = 'closed'
      const url = String(f.iceVideoUrl || '').trim()
      order.iceVideoSlots = [{ slotId: `SLOT-${ts}`, label: '成片1', downloadUrl: url, iceJobId: '' }]
    } else {
      order.hall = 'normal'
    }
    return order
  },
  buildShareTexts(order) {
    const prProfile = userProfile.readPrProfile()
    return {
      shareTitle: shareCopy.buildShareTitle(order),
      groupCopyText: shareCopy.buildGroupCopyText(order, prProfile),
    }
  },
  async onCreate() {
    const err = this.validate()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    if (!merchant.hasMerchantApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      return
    }
    const order = this.buildOrder()
    const isEdit = !!(this.data.editMpId && this.data.editingOrder)
    this.setData({ submitting: true })
    try {
      if (isEdit) {
        await mpOrderRegistryOps.updateMpRecruitmentOrder(order)
        applicationsStore.updatePublishedOrderTitle(order.id, order.title)
        const f = this.data.form
        applyTemplates.saveApplyFormForMpOrder(order.id, {
          templateId: f.applyFormTemplateId,
          templateName:
            f.applyFormTemplateName ||
            applyTemplates.getTemplateById(f.applyFormTemplateId)?.name ||
            '报名表单',
          fields: f.applyFormFields,
        })
        messagesStore.pushNotification({
          title: '招募已更新',
          body: `「${order.title}」已保存`,
          category: 'order',
        })
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({
          submitting: false,
          editMpId: '',
          editingOrder: null,
          isEditMode: false,
          editLoadDone: false,
        })
        setTimeout(() => wx.switchTab({ url: '/pages/mine/mine' }), 400)
        return
      }
      await ops.appendMpRecruitmentOrder(order)
      const mode = modeById(this.data.recruitMode)
      const pubHall = order.urgent ? 'urgent' : mode.hall === 'ice' ? 'ice' : 'normal'
      applicationsStore.addPublishedOrder({ mpOrderId: order.id, title: order.title, hall: pubHall })
      messagesStore.pushNotification({
        title: '招募发布成功',
        body: `「${order.title}」已创建`,
        category: 'order',
      })
      const f = this.data.form
      applyTemplates.saveApplyFormForMpOrder(order.id, {
        templateId: f.applyFormTemplateId,
        templateName:
          f.applyFormTemplateName ||
          applyTemplates.getTemplateById(f.applyFormTemplateId)?.name ||
          '报名表单',
        fields: f.applyFormFields,
      })
      if (f.applyFormTemplateId) applyTemplates.setActiveTemplateId(f.applyFormTemplateId)
      const { shareTitle, groupCopyText } = this.buildShareTexts(order)
      this.setData({ step: 'done', submitting: false, createdOrder: order, shareTitle, groupCopyText })
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 28), icon: 'none' })
      this.setData({ submitting: false })
    }
  },
  onShareAppMessage() {
    const order = this.data.createdOrder
    if (!order) return { title: '灵祺达人招募', path: '/pages/index/index' }
    return {
      title: this.data.shareTitle || order.title,
      path: `/pages/detail/detail?id=${encodeURIComponent(order.id)}`,
    }
  },
  onCopyGroupShare() {
    const text = this.data.groupCopyText
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '已复制招募信息',
          content: '请打开微信群，粘贴发送给达人即可。',
          showCancel: false,
        })
      },
    })
  },
  onFinish() {
    this.resetToMode()
    wx.switchTab({ url: '/pages/index/index' })
  },
})
