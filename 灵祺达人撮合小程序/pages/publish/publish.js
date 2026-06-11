const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const mpRecruitmentOrderId = require('../../utils/mpRecruitmentOrderId.js')
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
const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
const recruitCoverImage = require('../../utils/recruitCoverImage.js')
const recruitTarget = require('../../utils/recruitTarget.js')
const userProfile = require('../../utils/userProfile.js')
const auth = require('../../utils/auth.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const publishPendingAfterLogin = require('../../utils/publishPendingAfterLogin.js')
const wxAccount = require('../../utils/wxAccount.js')
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
  RECRUIT_TARGETS,
  RECRUIT_MODES,
  PLATFORMS,
  TALENT_TAGS,
  DOUYIN_SALES_LEVELS,
  DOUYIN_TIER_LEVELS,
  FANS_TIER_RANGES,
  FEE_TYPES,
  feeTypeLabel,
  modeById,
  targetById,
  modesForTarget,
  newLevelTier,
  newFansTier,
} = publishOpts
const supplierPublishForm = require('../../utils/supplierPublishForm.js')
const livePublishForm = require('../../utils/livePublishForm.js')
const mpGroupQr = require('../../utils/mpGroupQr.js')
const { buildCompactBudgetText } = require('../../utils/recruitmentBudgetDisplay.js')

/** 子页确认后滚动回表单对应字段 */
const PICKER_FIELD_ANCHOR = {
  platform: 'field-platform',
  tag: 'field-tag',
  city: 'field-city',
  reqLevel: 'field-req-level',
  fee: 'field-fee',
  signupDeadline: 'field-signup-deadline',
  applyForm: 'field-apply-form',
  cover: 'field-cover',
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

const SINGLE_SELECT_SUPPLIER_FIELDS = { styleTags: true }

function toggleSupplierListField(form, field, name) {
  let cur = Array.isArray(form[field]) ? [...form[field]] : []
  if (SINGLE_SELECT_SUPPLIER_FIELDS[field]) {
    cur = cur.includes(name) ? [] : [name]
  } else {
    const idx = cur.indexOf(name)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(name)
  }
  return { ...form, [field]: cur }
}

function buildFansRequirementText(f) {
  if (f.fansLimitMode === 'unlimited') return '不限'
  const min = String(f.fansMin ?? '').trim()
  return min ? `粉丝≥${min}` : ''
}

function emptyForm(recruitTarget) {
  const target = recruitTarget || 'talent'
  const afFields =
    target === 'shoot' || target === 'edit'
      ? supplierPublishForm.defaultSupplierApplyFields(target)
      : (applyTemplates.emptyCustomTemplate('').fields || []).map((f) => ({ ...f }))
  return {
    deliveryWindow: 'normal',
    title: '',
    platform: target === 'talent' ? '' : '通用',
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
    iceVerifyMode: 'ai',
    editGroupQrImage: '',
    applyFormTemplateId: '',
    applyFormTemplateName: target === 'talent' ? '' : '团队报名默认项',
    applyFormFields: afFields,
    coverImage: '',
    coverLibraryId: '',
    ...supplierPublishForm.emptySupplierPublishFields(),
    ...livePublishForm.emptyLiveFields(),
  }
}

function resolveIceReferenceVideoUrl(f) {
  return String((f && f.referenceUrl) || (f && f.materialUrl) || (f && f.iceVideoUrl) || '').trim()
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
    step: 'target',
    recruitTargets: RECRUIT_TARGETS,
    recruitModes: RECRUIT_MODES,
    recruitTarget: '',
    recruitTargetLabel: '',
    deliveryWindows: DELIVERY_WINDOWS,
    todayDate: defaultSignupDate(),
    signupDeadlineDate: '',
    signupDeadlineTime: '23:59',
    deliveryDeadlineDate: '',
    deliveryDeadlineTime: '18:00',
    showSignupDeadline: true,
    signupDeadlineDisplay: '请选择报名截止时间',
    signupDeadlinePlaceholder: true,
    recruitMode: '',
    recruitModeLabel: '',
    iceVerifyModes: publishOpts.ICE_VERIFY_MODES,
    form: emptyForm('talent'),
    isSupplierPublish: false,
    deliverableGrid: [],
    equipmentReqGrid: [],
    styleTagGrid: [],
    packageTagGrid: [],
    materialSources: supplierPublishForm.MATERIAL_SOURCES,
    aspectRatios: supplierPublishForm.ASPECT_RATIOS,
    targetDurations: supplierPublishForm.TARGET_DURATIONS,
    livePlatforms: livePublishForm.LIVE_PLATFORMS,
    liveTypes: livePublishForm.LIVE_TYPES,
    liveDurations: livePublishForm.LIVE_DURATIONS,
    samplePolicies: livePublishForm.SAMPLE_POLICIES,
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
    editGroupQrUploading: false,
    createdOrder: null,
    shareTitle: '',
    groupCopyText: '',
    formHeadStyle: '',
    heroHeadStyle: '',
    scrollIntoView: '',
    scrollWithAnimation: false,
    formScrollTop: 0,
    lastScrollAnchor: '',
    applyFormDisplayText: '',
    applyFormPlaceholder: true,
    coverPreviewUrl: '',
    coverGalleryItems: [],
    coverGalleryTab: 'recommended',
    coverGallerySubKey: '',
    coverPlatformNames: [],
    coverTagNames: [],
    coverSourceHint: '未选择时将使用对应平台默认封面',
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
    if (this.data.step === 'mode' && !this.data.isEditMode) {
      this.resetToTarget()
    }
  },
  onUnload() {
    setTabBarHidden(this, false)
  },
  /** 填写表单及子页全屏时隐藏 TabBar */
  syncTabBarOverlay() {
    setTabBarHidden(this, this.data.step === 'form')
  },
  /** 进入表单或重新选模式时回到顶部（避免 scroll-into-view / scroll-top 残留） */
  resetFormScrollToTop() {
    this.setData({
      scrollIntoView: 'field-delivery-window',
      scrollWithAnimation: false,
      lastScrollAnchor: '',
      formScrollTop: 0,
    })
    setTimeout(() => {
      this.setData({ scrollIntoView: '', formScrollTop: 0 })
    }, 80)
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
  syncDeliveryDeadlineFromParts() {
    const d = this.data.deliveryDeadlineDate
    const t = this.data.deliveryDeadlineTime || '18:00'
    if (!d) {
      this.setData({ 'form.deliveryDeadline': '' })
      return
    }
    this.setData({ 'form.deliveryDeadline': `${d} ${t}:00` })
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
  onDeliveryDeadlineDate(e) {
    this.setData({ deliveryDeadlineDate: e.detail.value }, () => this.syncDeliveryDeadlineFromParts())
  },
  onDeliveryDeadlineTime(e) {
    this.setData({ deliveryDeadlineTime: e.detail.value }, () => this.syncDeliveryDeadlineFromParts())
  },
  onPickerBack() {
    this.setData({ pickerView: '' }, () => this.syncTabBarOverlay())
  },
  closePickerAndScroll() {
    this.setData({ pickerView: '', scrollIntoView: '' }, () => this.syncTabBarOverlay())
  },
  onApplyFormConfirm() {
    applyFormEditor.confirmApplyFormEditor(this, () => this.closePickerAndScroll())
  },
  applyTemplateKind() {
    return applyTemplates.templateKindFromRecruitTarget(this.data.recruitTarget || 'talent')
  },
  openApplyFormEditorNew() {
    const kind = this.applyTemplateKind()
    const tpl = applyTemplates.emptyCustomTemplate(
      kind === 'shoot' ? '拍摄报名模版' : kind === 'edit' ? '剪辑报名模版' : '我的报名模版',
      kind,
    )
    applyFormEditor.resetApplyFormEditorSession(this)
    this.setData(
      {
        pickerView: 'applyForm',
        applyFormEditorMode: 'new',
        applyFormTemplateKind: kind,
        applyFormTemplateId: tpl.id,
        applyFormTemplateName: tpl.name,
        applyFormFields: tpl.fields.map((f) => ({ ...f })),
        applyTemplateList: applyTemplates.listCustomTemplates(kind),
      },
      () => {
        applyFormEditor.syncEditorRows(this)
        this.syncTabBarOverlay()
      },
    )
  },
  openApplyFormUseTemplate() {
    const kind = this.applyTemplateKind()
    const list = applyTemplates.listCustomTemplates(kind)
    if (!list.length) {
      wx.showModal({
        title: '暂无模版',
        content: '请先在「我的」→「我的模版」中新建对应类型的自定义模版',
        showCancel: false,
      })
      return
    }
    this.setData({ showApplyTplPicker: true, customTemplateList: list, applyFormTemplateKind: kind })
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
    applyFormEditor.resetApplyFormEditorSession(this)
    this.setData(
      {
        pickerView: 'applyForm',
        applyFormEditorMode: 'template',
        applyFormTemplateKind: this.applyTemplateKind(),
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
      const target = this.data.recruitTarget || 'talent'
      const isSupplier = target === 'shoot' || target === 'edit'
      if (!isSupplier && !this.data.form.platform) {
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
    const isLive = this.data.recruitMode === 'live'
    const platformDisplayText = isLive
      ? f.livePlatform || '请选择直播平台'
      : f.platform || '请选择招募平台'
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
      showDouyinLevel: isLive
        ? livePublishForm.isDouyinLivePlatform(f.livePlatform)
        : f.platform === '抖音',
      feeTypeLabel: feeTypeLabel(f.feeTypeId),
      feePlaceholder: !f.feeTypeId,
      tagsPlaceholder: !tags.length,
      cityPlaceholder: cityDisplayText === '请选择招募城市',
      platformPlaceholder: isLive ? !f.livePlatform : !f.platform,
      showSignupDeadline: !urgentWin,
      signupDeadlineDisplay: urgentWin
        ? '急单默认发布后 24 小时截止'
        : f.signupDeadline
          ? String(f.signupDeadline).slice(0, 16)
          : '请选择报名截止时间',
      signupDeadlinePlaceholder: !urgentWin && !f.signupDeadline,
    })
    this.syncCoverPreview()
  },
  syncCoverPreview() {
    const f = this.data.form || {}
    let preview = ''
    let hint = '未选择时将使用对应平台默认封面'
    if (String(f.coverImage || '').trim()) {
      preview = f.coverImage
      hint = '已上传自定义封面'
    } else if (String(f.coverLibraryId || '').trim()) {
      const hit = recruitCoverLib.findCoverById(f.coverLibraryId)
      preview = hit ? hit.url : ''
      hint = '已选图库封面'
    } else {
      const def = recruitCoverLib.resolveDefaultCover(f.platform, f.talentTags || [])
      preview = def && def.url ? def.url : ''
    }
    this.setData({ coverPreviewUrl: preview, coverSourceHint: hint })
  },
  async onCoverUpload() {
    try {
      const dataUrl = await recruitCoverImage.chooseCoverImageDataUrl()
      this.setData({ 'form.coverImage': dataUrl, 'form.coverLibraryId': '' })
      this.syncCoverPreview()
    } catch (e) {
      const msg = String((e && e.message) || e || '')
      if (/cancel/i.test(msg)) return
      wx.showToast({ title: msg.slice(0, 28) || '上传失败', icon: 'none' })
    }
  },
  openCoverGallery() {
    const f = this.data.form || {}
    const tab = 'recommended'
    const open = () => {
      this.setData({
        pickerView: 'coverGallery',
        coverGalleryTab: tab,
        coverGallerySubKey: '',
        coverPlatformNames: recruitCoverLib.listCoverPlatformNames(),
        coverTagNames: recruitCoverLib.listCoverTagNames(),
      })
      this.refreshCoverGalleryItems(tab, '', f.platform, f.talentTags || [])
    }
    if (recruitCoverLib.useCoverBundle()) {
      wx.showLoading({ title: '加载图库', mask: true })
      recruitCoverLib
        .loadCoverSubpackages()
        .then(() => {
          wx.hideLoading()
          open()
        })
        .catch((err) => {
          wx.hideLoading()
          wx.showToast({ title: String((err && err.message) || err || '图库加载失败').slice(0, 28), icon: 'none' })
        })
      return
    }
    open()
  },
  refreshCoverGalleryItems(tab, subKey, platform, talentTags) {
    const items = recruitCoverLib.getGalleryItemsForTab(
      tab || this.data.coverGalleryTab,
      platform || this.data.form.platform,
      talentTags || this.data.form.talentTags || [],
      subKey !== undefined ? subKey : this.data.coverGallerySubKey,
    )
    this.setData({ coverGalleryItems: items })
  },
  onCoverGalleryTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab) return
    const f = this.data.form || {}
    let subKey = ''
    if (tab === 'platform') subKey = f.platform || (this.data.coverPlatformNames[0] || '抖音')
    if (tab === 'tag') subKey = (f.talentTags && f.talentTags[0]) || (this.data.coverTagNames[0] || '美食')
    this.setData({ coverGalleryTab: tab, coverGallerySubKey: subKey })
    this.refreshCoverGalleryItems(tab, subKey, f.platform, f.talentTags || [])
  },
  onCoverGallerySubPick(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const f = this.data.form || {}
    this.setData({ coverGallerySubKey: key })
    this.refreshCoverGalleryItems(this.data.coverGalleryTab, key, f.platform, f.talentTags || [])
  },
  onCoverGalleryPick(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData(
      { 'form.coverImage': '', 'form.coverLibraryId': id, pickerView: '', scrollIntoView: 'field-cover' },
      () => {
        this.syncCoverPreview()
        this.syncTabBarOverlay()
      },
    )
  },
  onCoverClear() {
    this.setData({ 'form.coverImage': '', 'form.coverLibraryId': '' })
    this.syncCoverPreview()
  },
  onShow() {
    if (userProfile.readIdentity() !== 'pr') {
      wx.switchTab({ url: '/pages/index/index' })
      return
    }
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
    const pendingDraft = publishPendingAfterLogin.read()
    if (pendingDraft) {
      if (auth.isLoggedIn()) {
        void this.tryResumePublishAfterLogin()
      } else {
        publishPendingAfterLogin.applyToPage(this, pendingDraft, () => {
          this.syncTabBarOverlay()
        })
      }
      return
    }
    if (this.data.step === 'done' && this.data.createdOrder) return
    if (this.data.step === 'form' && this.data.recruitMode) return
    if (this.data.isEditMode) return
    this.resetToTarget()
  },
  async tryResumePublishAfterLogin() {
    if (this._resumePublishRunning) return
    const pending = publishPendingAfterLogin.read()
    if (!pending || !pending.autoSubmit) return
    this._resumePublishRunning = true
    publishPendingAfterLogin.clear()
    try {
      await new Promise((resolve) => {
        publishPendingAfterLogin.applyToPage(this, pending, resolve)
      })
      const err = this.validate()
      if (err) {
        wx.showToast({ title: err, icon: 'none' })
        return
      }
      wx.showLoading({ title: '正在发布…', mask: true })
      await this.submitPublishOrder()
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 28), icon: 'none' })
    } finally {
      wx.hideLoading()
      this._resumePublishRunning = false
    }
  },
  async loadEditOrder(mpId) {
    if (!api.hasApi()) {
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
      const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
      let recruitTargetId = String(meta.recruitTarget || mp.recruitTarget || '').trim()
      if (!recruitTargetId) {
        if (mode.hall === 'ice' || mode.id === 'edit_ice') recruitTargetId = 'edit'
        else recruitTargetId = 'talent'
      }
      const isSupplier = recruitTargetId === 'shoot' || recruitTargetId === 'edit'
      this.setData({
        step: 'form',
        pickerView: '',
        editMpId: mpId,
        editingOrder: mp,
        isEditMode: true,
        editLoadDone: true,
        recruitTarget: recruitTargetId,
        isSupplierPublish: isSupplier,
        recruitMode: mode.id,
        recruitModeLabel: mode.label,
        form: restored.patch,
        todayDate: today,
        signupDeadlineDate: restored.signupDeadlineDate || '',
        signupDeadlineTime: restored.signupDeadlineTime || '23:59',
        deliveryDeadlineDate: restored.deliveryDeadlineDate || '',
        deliveryDeadlineTime: restored.deliveryDeadlineTime || '18:00',
      }, () => this.syncDeliveryDeadlineFromParts())
      if (isSupplier) this.syncSupplierPublishGrids(restored.patch)
      this.syncDisplayFields()
      this.syncTabBarOverlay()
      this.resetFormScrollToTop()
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 28), icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    } finally {
      wx.hideLoading()
    }
  },
  resetToTarget() {
    this.setData({
      step: 'target',
      pickerView: '',
      recruitTarget: '',
      recruitTargetLabel: '',
      recruitMode: '',
      recruitModeLabel: '',
      form: emptyForm('talent'),
      tagGrid: buildTagGrid([]),
      feeTypeLabel: '请选择',
      feePlaceholder: true,
      createdOrder: null,
    })
    this.syncDisplayFields()
    this.syncTabBarOverlay()
  },
  onBackFromTarget() {
    wx.switchTab({ url: '/pages/index/index' })
  },
  onBackFromMode() {
    this.setData({
      step: 'target',
      recruitTarget: '',
      recruitTargetLabel: '',
      recruitMode: '',
      recruitModeLabel: '',
    })
    this.syncTabBarOverlay()
  },
  syncSupplierPublishGrids(form) {
    const f = form || this.data.form
    this.setData({
      deliverableGrid: supplierPublishForm.DELIVERABLES.map((name) => ({
        name,
        on: (f.deliverables || []).includes(name),
      })),
      equipmentReqGrid: supplierPublishForm.SHOOT_EQUIPMENT.map((name) => ({
        name,
        on: (f.equipmentRequired || []).includes(name),
      })),
      styleTagGrid: supplierPublishForm.EDIT_STYLES.map((name) => ({
        name,
        on: (f.styleTags || []).includes(name),
      })),
      packageTagGrid: supplierPublishForm.PACKAGE_TAGS.map((name) => ({
        name,
        on: (f.packageTags || []).includes(name),
      })),
    })
  },
  onSelectTarget(e) {
    const target = targetById(e.currentTarget.dataset.id)
    if (!target) return
    const isSupplier = target.id === 'shoot' || target.id === 'edit'
    this.setData({
      step: 'mode',
      recruitTarget: target.id,
      recruitTargetLabel: target.label,
      recruitModes: modesForTarget(target.id),
      isSupplierPublish: isSupplier,
      form: emptyForm(target.id),
      tagGrid: buildTagGrid([]),
    })
    if (isSupplier) this.syncSupplierPublishGrids(emptyForm(target.id))
    this.syncDisplayFields()
    this.syncTabBarOverlay()
  },
  onBackFromPlaceholder() {
    this.setData({ step: 'target', recruitTarget: '', recruitTargetLabel: '' })
    this.syncTabBarOverlay()
  },
  onSelectMode(e) {
    const mode = modeById(e.currentTarget.dataset.id)
    if (!mode) return
    const today = defaultSignupDate()
    const patch = {
      step: 'form',
      pickerView: '',
      recruitMode: mode.id,
      recruitModeLabel: mode.label,
      todayDate: today,
      signupDeadlineDate: '',
      signupDeadlineTime: '23:59',
      deliveryDeadlineDate: '',
      deliveryDeadlineTime: '18:00',
    }
    if (mode.id === 'live') {
      patch['form.applyFormFields'] = livePublishForm.defaultLiveApplyFields()
      patch['form.applyFormTemplateName'] = '直播达人报名默认项'
    }
    this.setData(patch, () => {
      if (this.data.isSupplierPublish) {
        this.syncSupplierPublishGrids(this.data.form)
      }
      this.syncDisplayFields()
      this.syncTabBarOverlay()
      this.resetFormScrollToTop()
    })
  },
  onBackToMode() {
    if (this.data.isEditMode) {
      this.setData({
        editMpId: '',
        editingOrder: null,
        isEditMode: false,
        editLoadDone: false,
        step: 'target',
      })
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    this.setData({ step: 'mode', scrollIntoView: '', lastScrollAnchor: '', formScrollTop: 0 })
  },
  onFieldInput(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`form.${key}`]: e.detail.value })
  },
  onShootDatePick(e) {
    this.setData({ 'form.shootDate': e.detail.value || '' })
  },
  onShootTimePick(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`form.${key}`]: e.detail.value || '' })
  },
  onLiveDatePick(e) {
    this.setData({ 'form.liveDate': e.detail.value || '' })
  },
  onLiveTimePick(e) {
    this.setData({ 'form.liveTimeStart': e.detail.value || '' })
  },
  onLiveOptionPick(e) {
    const key = e.currentTarget.dataset.key
    const val = e.currentTarget.dataset.val
    if (!key || !val) return
    const patch = { [`form.${key}`]: val }
    if (key === 'livePlatform') {
      patch['form.platform'] = val.replace(/直播$/, '')
      patch.showDouyinLevel = livePublishForm.isDouyinLivePlatform(val)
    }
    this.setData(patch)
    if (key === 'livePlatform') this.syncDisplayFields()
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
    this.closePickerAndScroll()
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
    this.closePickerAndScroll()
  },
  onCityNational() {
    this.setData({
      'form.cityNational': true,
      'form.selectedCities': [],
    })
    this.syncDisplayFields()
    this.closePickerAndScroll()
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
    this.closePickerAndScroll()
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
    this.closePickerAndScroll()
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
    this.closePickerAndScroll()
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
    this.setData({ 'form.levelTiers': tiers, editingTierIndex: -1 })
    this.closePickerAndScroll()
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
    this.setData({ 'form.fansTiers': tiers, editingFansTierIndex: -1 })
    this.closePickerAndScroll()
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
    const target = this.data.recruitTarget || 'talent'
    const isSupplier = target === 'shoot' || target === 'edit'
    if (!String(f.title || '').trim()) return '请填写招募标题'
    if (this.data.recruitMode === 'live') {
      const liveErr = livePublishForm.validateLivePublish(f)
      if (liveErr) return liveErr
      if (livePublishForm.isDouyinLivePlatform(f.livePlatform) && !(f.douyinSalesLevels || []).length) {
        return '请选择达人带货等级'
      }
    } else if (!isSupplier && !f.platform) return '请选择招募平台'
    if (!f.cityNational && !(f.selectedCities || []).length) return '请选择招募城市'
    if (!isSupplier && !(f.talentTags || []).length) return '请选择需求达人标签'
    if (!isSupplier && f.fansLimitMode === 'limit' && !String(f.fansMin ?? '').trim()) return '请填写粉丝下限'
    if (f.deliveryWindow !== 'urgent' && !String(f.signupDeadline || '').trim()) {
      return '请选择招募报名截止时间'
    }
    if (
      !isSupplier &&
      this.data.recruitMode !== 'live' &&
      f.platform === '抖音' &&
      !(f.douyinSalesLevels || []).length
    ) {
      return '请选择达人带货等级'
    }
    if (!f.feeTypeId) return '请选择费用模式'
    const feeErr = this.validateFee(f)
    if (feeErr) return feeErr
    const n = Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)
    if (n < 1) return '招募人数至少为 1'
    if (!String(f.recruitDetail || '').trim() && this.data.recruitMode !== 'live') return '请填写招募详情'
    if (isSupplier) {
      const sErr = supplierPublishForm.validateSupplierPublish(target, f, this.data.recruitMode)
      if (sErr) return sErr
    }
    if (this.data.recruitMode === 'ice') {
      if (!resolveIceReferenceVideoUrl(f)) return '云剪任务请填写参考片链接'
    }
    if (
      this.data.recruitMode === 'edit_ice' &&
      (f.iceVerifyMode || 'ai') === 'ai' &&
      !String(f.editGroupQrImage || '').trim()
    ) {
      return '剪辑云剪请上传剪辑师群二维码'
    }
    if (!(f.applyFormFields || []).length) {
      return isSupplier ? '请配置团队报名必填信息' : '请配置达人报名必填信息'
    }
    const afErr = applyTemplates.validateTemplateFields(f.applyFormFields)
    if (afErr) return afErr
    return null
  },
  buildBudgetText(f) {
    return buildCompactBudgetText(f, feeTypeLabel)
  },
  buildBudgetDetailText(f) {
    const cps = String(f.cpsPercent || '').trim()
    const prefix = cps ? `CPS ${cps}% · ` : ''
    if (f.feeTypeId === 'level_tier') {
      const parts = (f.levelTiers || []).map((t) => `${(t.levels || []).join('+')} ¥${t.price}`)
      return `${prefix}等级阶梯 ${parts.join(' / ')}`
    }
    if (f.feeTypeId === 'fans_tier') {
      const parts = (f.fansTiers || []).map((t) => `${t.fansRange} ¥${t.price}`)
      return `${prefix}粉丝阶梯 ${parts.join(' / ')}`
    }
    return this.buildBudgetText(f)
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
    const target = this.data.recruitTarget || 'talent'
    const isSupplier = target === 'shoot' || target === 'edit'
    const lines = [
      `招募标题：${String(f.title || '').trim()}`,
      `投放窗口：${windowLabel}`,
      `招募对象：${recruitTarget.recruitTargetLabel(this.data.recruitTargetLabel || this.data.recruitTarget || target)}`,
      `招募模式：${mode.label}`,
      `招募城市：${this.buildRegionText(f)}`,
      `报名截止：${deadline ? String(deadline).slice(0, 16) : '—'}`,
      `${this.data.recruitMode === 'edit_ice' ? '成片位总数' : '招募人数'}：${Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)}${this.data.recruitMode === 'edit_ice' ? ' 位' : ' 人'}`,
      `费用模式：${feeTypeLabel(f.feeTypeId)}`,
    ]
    if (!isSupplier) {
      if (this.data.recruitMode === 'live') {
        lines.splice(4, 0, `直播平台：${f.livePlatform || '—'}`)
        lines.push(...livePublishForm.buildLiveRecruitmentLines(f))
      } else {
        lines.splice(4, 0, `招募平台：${f.platform || '—'}`)
      }
      lines.push(`需求达人标签：${(f.talentTags || []).join('、')}`)
      lines.push(`粉丝要求：${buildFansRequirementText(f)}`)
      const douyinLevel =
        this.data.recruitMode === 'live'
          ? livePublishForm.isDouyinLivePlatform(f.livePlatform)
          : f.platform === '抖音'
      if (douyinLevel) lines.push(`带货等级：${(f.douyinSalesLevels || []).join('、')}`)
    } else {
      lines.push(...supplierPublishForm.buildSupplierRecruitmentLines(target, f, mode, {
        buildBudgetDetailText: (form) => this.buildBudgetDetailText(form),
      }))
    }
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
    lines.push(`酬劳摘要：${this.buildBudgetDetailText(f)}`)
    lines.push('招募详情：')
    const recruitDetail = String(f.recruitDetail || '').trim()
    if (recruitDetail) lines.push(recruitDetail)
    if (mode.id === 'ice' && resolveIceReferenceVideoUrl(f)) {
      lines.push(`云剪参考成片：${resolveIceReferenceVideoUrl(f)}`)
      lines.push(`云剪审核方式：${f.iceVerifyMode === 'pr' ? 'PR 审核' : 'AI 核查'}`)
    }
    if (mode.id === 'edit_ice') {
      lines.push(`云剪审核方式：${f.iceVerifyMode === 'pr' ? 'PR 审核' : 'AI 核查'}`)
    }
    return lines.join('\n')
  },
  onSupplierListTap(e) {
    const field = e.currentTarget.dataset.field
    const name = e.currentTarget.dataset.name
    if (!field || !name) return
    const nextForm = toggleSupplierListField(this.data.form, field, name)
    this.setData({ [`form.${field}`]: nextForm[field] })
    this.syncSupplierPublishGrids(nextForm)
  },
  onMaterialSourcePick(e) {
    const val = e.currentTarget.dataset.val
    if (!val) return
    this.setData({ 'form.materialSource': val })
  },
  onIceVerifyModePick(e) {
    const val = e.currentTarget.dataset.val
    if (!val) return
    const iceVerifyMode = val === 'pr' ? 'pr' : 'ai'
    this.setData({ form: { ...this.data.form, iceVerifyMode } })
  },
  async onUploadEditGroupQr() {
    if (this.data.editGroupQrUploading) return
    this.setData({ editGroupQrUploading: true })
    try {
      const dataUrl = await mpGroupQr.chooseAndReadImageDataUrl()
      this.setData({ form: { ...this.data.form, editGroupQrImage: dataUrl } })
      wx.showToast({ title: '已上传群码', icon: 'success' })
    } catch (e) {
      const msg = String((e && e.message) || e || '')
      if (!/cancel/i.test(msg)) {
        wx.showToast({ title: msg.slice(0, 24) || '上传失败', icon: 'none' })
      }
    } finally {
      this.setData({ editGroupQrUploading: false })
    }
  },
  onClearEditGroupQr() {
    this.setData({ form: { ...this.data.form, editGroupQrImage: '' } })
  },
  onPreviewEditGroupQr() {
    const url = String((this.data.form && this.data.form.editGroupQrImage) || '').trim()
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onAspectRatioPick(e) {
    const val = e.currentTarget.dataset.val
    if (!val) return
    this.setData({ 'form.aspectRatio': val })
  },
  onTargetDurationPick(e) {
    const val = e.currentTarget.dataset.val
    if (!val) return
    this.setData({ 'form.targetDuration': val })
  },
  buildOrder() {
    const f = this.data.form
    const mode = modeById(this.data.recruitMode)
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    const nowMs = Date.now()
    const ts = mpRecruitmentOrderId.mpOrderTimeSuffix(nowMs)
    const existing = this.data.editingOrder
    const editId = this.data.editMpId
    const mpId =
      editId && existing
        ? editId
        : mode.hall === 'ice'
          ? mpRecruitmentOrderId.buildMpRecruitmentOrderId('ICE', nowMs)
          : mpRecruitmentOrderId.buildMpRecruitmentOrderId('RO', nowMs)
    const recruitCount = Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)
    const isUrgent = f.deliveryWindow === 'urgent' && mode.hall !== 'ice'
    const deadline = this.resolveSignupDeadline(f)
    const coverFields = recruitCoverLib.buildCoverFieldsForOrder(f)
    const order = {
      id: mpId,
      sourceMerchantOrderId:
        existing && existing.sourceMerchantOrderId
          ? existing.sourceMerchantOrderId
          : mpRecruitmentOrderId.buildMpRecruitmentOrderId('USER', nowMs),
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
      platform: this.data.recruitMode === 'live' ? f.livePlatform || f.platform : f.platform,
      fansRequirement: buildFansRequirementText(f),
      urgent: isUrgent,
      deadline,
      budgetText: this.buildBudgetText(f),
      recruitCount,
      region: this.buildRegionText(f),
      category: mode.category,
      publisherIdentity: 'pr',
      publisherTemplateId: 'publish-wizard-v2',
      coverImage: coverFields.coverImage,
      mpPublishMeta: (() => {
        const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
        const acct = require('../../utils/auth.js').readAccount()
        return livePublishForm.patchLiveMeta(
          {
          prParticipantKey: participant.prParticipantKey(pr),
          prDisplayName: userProfile.prDisplayName(pr),
          prWxNickName: String(pr.wxNickName || '').trim(),
          prWxAvatarUrl: String(pr.wxAvatarUrl || '').trim(),
          lingqiPrId: String((acct && acct.lingqiPrId) || pr.lingqiPrId || '').trim(),
          registryPrId: String((acct && acct.registryPrId) || pr.id || '').trim(),
          deliveryWindow: f.deliveryWindow,
          recruitMode: mode.id,
          recruitTarget: this.data.recruitTarget || 'talent',
          signupDeadline: deadline,
          fansLimitMode: f.fansLimitMode,
          fansMin: f.fansMin,
          talentTags: f.talentTags,
          shootDate: f.shootDate,
          shootTimeStart: f.shootTimeStart,
          shootTimeEnd: f.shootTimeEnd,
          shootLocation: f.shootLocation,
          deliverables: f.deliverables,
          equipmentRequired: f.equipmentRequired,
          materialSource: f.materialSource,
          materialUrl: f.materialUrl,
          aspectRatio: f.aspectRatio,
          targetDuration: f.targetDuration,
          styleTags: f.styleTags,
          packageTags: f.packageTags,
          deliveryDeadline: f.deliveryDeadline,
          referenceUrl: f.referenceUrl,
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
          coverImage: coverFields.coverImage,
          coverLibraryId: coverFields.coverLibraryId,
          coverImageSource: coverFields.coverImageSource,
          iceVideoUrl: mode.id === 'edit_ice' ? '' : resolveIceReferenceVideoUrl(f),
          iceVerifyMode: f.iceVerifyMode === 'pr' ? 'pr' : 'ai',
          ...(String(f.editGroupQrImage || '').trim() ? { editGroupQrImage: String(f.editGroupQrImage).trim() } : {}),
        },
          f,
        )
      })(),
    }
    const editGroupQrImage = String(f.editGroupQrImage || '').trim()
    if (editGroupQrImage) {
      order.editGroupQrImage = editGroupQrImage
    }
    if (mode.hall === 'ice' || mode.id === 'edit_ice') {
      order.orderKind = 'recruitment_ice'
      order.hall = 'ice'
      order.fulfillmentLoop = 'closed'
      const isEditIce = mode.id === 'edit_ice'
      const url = isEditIce ? '' : resolveIceReferenceVideoUrl(f)
      const slotN = Math.max(1, Number.parseInt(String(f.recruitCount || '1'), 10) || 1)
      order.iceVideoSlots = Array.from({ length: slotN }, (_, i) => ({
        slotId: i === 0 ? `SLOT-${ts}` : `SLOT-${ts}-${i + 1}`,
        label: `成片${i + 1}`,
        downloadUrl: url,
        iceJobId: '',
      }))
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
  promptLoginBeforePublish() {
    if (wxAccount.isWxLoggedIn()) return true
    publishPendingAfterLogin.saveFromPage(this)
    guestRoutes.redirectToLogin('/pages/publish/publish')
    return false
  },
  async submitPublishOrder() {
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
          mpOrderId: order.id,
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
      try {
        wx.removeStorageSync('meoo_mp_registry_cache_v1')
      } catch (_) {}
      const mode = modeById(this.data.recruitMode)
      const pubHall = order.urgent ? 'urgent' : mode.hall === 'ice' ? 'ice' : 'normal'
      applicationsStore.addPublishedOrder({ mpOrderId: order.id, title: order.title, hall: pubHall })
      messagesStore.pushNotification({
        title: '招募发布成功',
        body: `「${order.title}」已创建`,
        category: 'order',
        mpOrderId: order.id,
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
      const shareTitle = shareCopy.buildShareTitle(order)
      const prProfile = userProfile.readPrProfile()
      const groupCopyText = await shareCopy.buildGroupCopyTextAsync(order, prProfile)
      this.setData({ step: 'done', submitting: false, createdOrder: order, shareTitle, groupCopyText })
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 28), icon: 'none' })
      this.setData({ submitting: false })
      throw e
    }
  },
  async onCreate() {
    const err = this.validate()
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    if (!api.hasApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      return
    }
    if (!this.promptLoginBeforePublish()) return
    try {
      await this.submitPublishOrder()
    } catch (_) {
      /* submitPublishOrder 已 toast */
    }
  },
  onShareAppMessage() {
    const order = this.data.createdOrder
    if (!order) return { title: '灵祺星选平台', path: '/pages/index/index' }
    const coverUrl = recruitCoverLib.resolveOrderCoverUrl(order)
    const share = {
      title: this.data.shareTitle || order.title,
      path: `/pages/detail/detail?id=${encodeURIComponent(order.id)}`,
    }
    const imageUrl = recruitCoverLib.resolveShareImageUrl(coverUrl)
    if (imageUrl) share.imageUrl = imageUrl
    return share
  },
  onCopyGroupShare() {
    const order = this.data.createdOrder
    if (!order) return
    wx.showLoading({ title: '生成报名链接', mask: true })
    shareCopy
      .buildGroupCopyTextAsync(order, userProfile.readPrProfile())
      .then((text) => {
        wx.hideLoading()
        this.setData({ groupCopyText: text })
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
      })
      .catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '生成链接失败', icon: 'none' })
      })
  },
  onFinish() {
    this.resetToTarget()
    wx.switchTab({ url: '/pages/index/index' })
  },
})
