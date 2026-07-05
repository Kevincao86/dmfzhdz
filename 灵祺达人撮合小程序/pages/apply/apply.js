const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const auth = require('../../utils/auth.js')
const { labels, normalizePlatform } = require('../../utils/platformLabels.js')
const regionPicker = require('../../utils/regionPicker.js')
const { setupRegionState, onProvincePick, onCityPick } = regionPicker
const applyFormState = require('../../utils/applyFormState.js')
const talentPrPricing = require('../../utils/talentPrPricingApi.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const talentContactPrGate = require('../../utils/talentContactPrGate.js')
const messagesStore = require('../../utils/messagesStore.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const applyRuntime = require('../../utils/applyTemplateRuntime.js')
const tierQuote = require('../../utils/mpRecruitmentTierQuote.js')
const platformForm = require('../../utils/platformForm.js')
const iceOrderStats = require('../../utils/iceOrderStats.js')
const iceOrderDetect = require('../../utils/iceOrderDetect.js')
const recruitApplyGate = require('../../utils/recruitApplyGate.js')
const editIceSlots = require('../../utils/editIceSlots.js')
const userProfile = require('../../utils/userProfile.js')
const mpSubscribeMessages = require('../../utils/mpSubscribeMessages.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const mpProfileNav = require('../../utils/mpProfileNav.js')
const memberProfileApplyGate = require('../../utils/memberProfileApplyGate.js')
const xingxuanEnhance = require('../../utils/xingxuanEnhanceApi.js')
const { parseIceSlotTotalFromMp, resolveApplicantCountFromMp } = require('../../utils/mpRecruitCount.js')

function buildApplyRecruitCountTexts(mp, opts) {
  const isIce = !!opts.isIce
  const recruitCap = parseIceSlotTotalFromMp(mp)
  let applicantCount = resolveApplicantCountFromMp(mp)
  if (isIce && mp) {
    const progress = iceOrderStats.countIceClaimedSlots(mp, recruitCap)
    applicantCount = progress.claimed
  }
  return {
    recruitCountText: isIce ? `${recruitCap} 位` : `${recruitCap} 人`,
    applicantCountText: isIce
      ? `${Math.min(applicantCount, recruitCap > 0 ? recruitCap : applicantCount)} 位`
      : `${applicantCount} 人`,
  }
}

const {
  emptyApplyFields,
  emptySupplierApplyFields,
  memberSyncAvailable,
  supplierMemberSyncAvailable,
  applyFieldsFromMember,
  applyFieldsFromSupplierMember,
  enrichApplicantFromMember,
  persistApplicantToMemberProfile,
} = applyFormState
const DOUYIN_LEVELS = platformForm.DOUYIN_LEVELS

function detailUrlAfterApply(mpOrderId) {
  return `/pages/subpack-core/detail/detail?id=${encodeURIComponent(String(mpOrderId || '').trim())}&applied=1`
}

function isAlreadyAppliedError(err) {
  const msg = String((err && err.message) || err || '').trim()
  return /already_applied|已报名该招募|请勿重复提交/i.test(msg)
}

function navigateApplySuccess(page, opts) {
  const mpOrderId = String((page && page.data && page.data.mpOrderId) || '').trim()
  if (!mpOrderId) return
  const url = detailUrlAfterApply(mpOrderId)
  const isIceMode = !!(opts && opts.isIceMode != null ? opts.isIceMode : page.data.isIceMode)
  const isEditIce = !!(opts && opts.isEditIce != null ? opts.isEditIce : page.data.isEditIce)
  const confirmHint =
    '剪辑认领成功，请在30分钟内去「我的报名」确认订单，超时将自动放弃并释放条数。'
  if (isIceMode) {
    wx.showModal({
      title: '认领成功',
      content: confirmHint,
      showCancel: false,
      confirmText: '知道了',
      success: () => {
        wx.redirectTo({
          url,
          fail: () => wx.reLaunch({ url }),
        })
      },
    })
    return
  }
  const toastTitle =
    opts && opts.toastTitle
      ? opts.toastTitle
      : isEditIce
        ? '认领成功，请到我的报名确认'
        : '报名成功'
  wx.showToast({ title: toastTitle, icon: 'success', mask: true })
  setTimeout(() => {
    wx.hideToast()
    wx.redirectTo({
      url,
      fail: () => {
        wx.navigateBack({
          fail: () => wx.reLaunch({ url }),
        })
      },
    })
  }, 500)
}

function maybePromptTierSelfQuote(page) {
  if (!page.data.applyNeedsSelfQuote) return
  if (page._tierSelfQuotePrompted) return
  page._tierSelfQuotePrompted = true
  const q = tierQuote.parseYuan(page.data.quotePrice)
  if (q > 0) return
  wx.showModal({
    title: '填写自报价',
    content: '本单您匹配的阶梯为自报价，请填写报价（元）后再提交报名。',
    showCancel: false,
    confirmText: '知道了',
  })
}

function syncApplyRows(page) {
  const d = page.data
  const meta = page._orderMeta
  const needsQuote =
    meta && !d.isSupplierApply && tierQuote.applicantNeedsSelfQuoteForApply(meta, d)
  const raw = (d.applyRowsRaw || [])
    .filter((row) => {
      if (row.role !== 'quotePrice') return true
      if (d.isSupplierApply) return true
      return !!needsQuote
    })
    .map((row) => {
      if (row.role !== 'quotePrice') return row
      return { ...row, required: !!needsQuote }
    })
    .map((row) => {
      if (!meta || d.isSupplierApply) return row
      if (tierQuote.applyRowRequiredForTierMeta(row.role, meta)) {
        return { ...row, required: true }
      }
      return row
    })
  const rows = raw.map((row) => ({
    ...row,
    isCustom: row.bindKey.startsWith('custom_'),
    fieldValue: row.bindKey.startsWith('custom_')
      ? String((d.customFields && d.customFields[row.bindKey]) || '')
      : String(d[row.bindKey] != null ? d[row.bindKey] : ''),
  }))
  page.setData({
    applyRows: rows,
    tierFixedPriceHint:
      meta && !d.isSupplierApply ? tierQuote.applicantTierFixedPriceHint(meta, d) : '',
    applyNeedsSelfQuote: !!needsQuote,
  })
  if (needsQuote) maybePromptTierSelfQuote(page)
}

Page({
  behaviors: [require('../../behaviors/mpDefaultShare')],
  data: {
    mpOrderId: '',
    merchantOrderNo: '',
    platform: '抖音',
    labels: labels('抖音'),
    templateName: '',
    applyRowsRaw: [],
    applyRows: [],
    customFields: {},
    douyinLevels: DOUYIN_LEVELS,
    douyinLevelIndex: 0,
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
    likesCollects: '',
    douyinSalesLevel: '',
    contact: '',
    wechatId: '',
    quotePrice: '',
    visitDate: '',
    visitTimeStart: '',
    visitTimeEnd: '',
    alipayAccount: '',
    submitting: false,
    provinces: [],
    cities: [],
    province: '',
    city: '',
    provinceIndex: 0,
    cityIndex: 0,
    hasMember: false,
    canSyncMember: false,
    syncMemberProfile: false,
    memberTypeLabel: '',
    isIceMode: false,
    isEditIce: false,
    isPackIce: false,
    recruitTarget: 'talent',
    isSupplierApply: false,
    supplierWorkId: 'talent',
    claimSlotCount: '1',
    freeEditSlots: 0,
    gateMessage: '',
    profileGateMessage: '',
    canReclaim: false,
    recruitCountText: '',
    applicantCountText: '',
    quoteSuggestHint: '',
    quoteSuggesting: false,
    orderBudgetText: '',
    scheduleWarning: '',
    graylistWarning: '',
    routeBundles: [],
    scheduleBlockSubmit: false,
  },
  onLoad(options) {
    if (!auth.isLoggedIn()) {
      const q = []
      if (options) {
        Object.keys(options).forEach((k) => {
          if (options[k] != null && options[k] !== '') {
            q.push(`${k}=${encodeURIComponent(String(options[k]))}`)
          }
        })
      }
      const applyUrl = `/pages/apply/apply${q.length ? `?${q.join('&')}` : ''}`
      guestRoutes.redirectToLogin(applyUrl, { replace: true })
      return
    }
    void this.initApplyPage(options || {})
  },
  onShow() {
    const member = memberStore.readMember()
    const workIdentity = userProfile.readIdentity()
    const profileGateMessage = memberProfileApplyGate.validateMemberProfileForApply(member, workIdentity) || ''
    const gateMessage =
      memberProfileApplyGate.resolveApplyGateHint(
        this._loadedMp || null,
        workIdentity,
        member,
      ) || ''
    if (
      profileGateMessage !== this.data.profileGateMessage ||
      gateMessage !== this.data.gateMessage
    ) {
      this.setData({ profileGateMessage, gateMessage })
    }
  },
  maybePromptExclusiveQuote(member, platform, orderMeta, supplierWorkId) {
    if (!talentPrPricing.isSelfQuoteRecruitmentOrder(orderMeta, this._loadedMp)) return
    if (this._exclusiveQuotePrompted) return
    const offer =
      supplierWorkId === 'shoot' || supplierWorkId === 'edit'
        ? talentPrPricing.getExclusiveQuoteOfferForSupplier(member, orderMeta, supplierWorkId, this._loadedMp)
        : talentPrPricing.getExclusiveQuoteOffer(member, platform, orderMeta, this._loadedMp)
    if (!offer) return
    this._exclusiveQuotePrompted = true
    const dimHint = offer.dimension ? `（${offer.dimension}）` : ''
    wx.showModal({
      title: '专属 PR 报价',
      content: `您已为 ${offer.prLabel} 设置专属价 ¥${offer.quoteYuan}${dimHint}，是否使用该价格？`,
      confirmText: '使用',
      cancelText: '手动填写',
      success: (res) => {
        if (res.confirm) {
          this.setData({ quotePrice: String(offer.quoteYuan) }, () => syncApplyRows(this))
        }
      },
    })
  },
  async initApplyPage(options) {
    const mpOrderId = options.mpId ? decodeURIComponent(options.mpId) : ''
    let merchantOrderNo = options.merchantOrderNo ? decodeURIComponent(options.merchantOrderNo) : ''
    let platform = normalizePlatform(options.platform ? decodeURIComponent(options.platform) : '抖音')
    const isIceMode = options.ice === '1'
    const templateId = options.templateId ? decodeURIComponent(options.templateId) : ''
    let orderMeta = null
    let recruitTarget = 'talent'
    let loadedMp = null

    if (mpOrderId && api.hasApi()) {
      try {
        const reg = await ops.fetchRegistry({ includeMpOrderIds: [mpOrderId] })
        const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
        if (mp) {
          loadedMp = mp
          applyTemplates.cacheApplyFormFromMpOrder(mp)
          if (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object') {
            orderMeta = mp.mpPublishMeta
          }
          recruitTarget = recruitApplyGate.recruitTargetFromMpOrder(mp)
          if (!merchantOrderNo) {
            merchantOrderNo = String(mp.sourceMerchantOrderId || mp.title || '').trim()
          }
          if (mp.platform) platform = normalizePlatform(mp.platform)
        }
      } catch (e) {
        console.warn('[apply] fetchRegistry', e)
      }
    }

    const tpl = applyTemplates.getApplyConfigForMpOrder(mpOrderId, templateId, orderMeta)
    const tplKind = applyTemplates.normalizeTemplateKind(tpl.kind || recruitTarget)
    if (tplKind === 'shoot' || tplKind === 'edit') recruitTarget = tplKind
    const applyRowsRaw = applyTemplates.resolveApplyRows(tpl, platform, {
      isIceMode,
      recruitTarget,
    })
    const member = memberStore.readMember()
    const isEditIce = loadedMp ? iceOrderDetect.isEditTeamIceMpOrder(loadedMp) : false
    const isPackIce = loadedMp ? iceOrderDetect.isPackSlotIceOrder(loadedMp) : false
    const isSupplierApply = recruitTarget === 'shoot' || recruitTarget === 'edit'
    const supplierWorkId = recruitTarget === 'edit' ? 'edit' : recruitTarget === 'shoot' ? 'shoot' : 'talent'
    const freeEditSlots = loadedMp ? editIceSlots.countFreeEditPackSlots(loadedMp) : 0
    const workIdentity = userProfile.readIdentity()
    const canReclaim = loadedMp ? talentContactPrGate.canReclaimIceOrder(loadedMp, mpOrderId) : false
    const profileGateMessage = memberProfileApplyGate.validateMemberProfileForApply(member, workIdentity) || ''
    const gateMessage = memberProfileApplyGate.resolveApplyGateHint(loadedMp, workIdentity, member)
    this._loadedMp = loadedMp
    this._orderMeta = orderMeta && typeof orderMeta === 'object' ? orderMeta : null
    const canSyncMember = isSupplierApply
      ? supplierMemberSyncAvailable(member, supplierWorkId)
      : memberSyncAvailable(member, platform)
    const memberFields = canSyncMember
      ? isSupplierApply
        ? applyFieldsFromSupplierMember(member, supplierWorkId)
        : applyFieldsFromMember(member, platform, DOUYIN_LEVELS)
      : null
    const quoteFromPolicy =
      !isSupplierApply && memberFields
        ? talentPrPricing.resolveDefaultApplyQuotePrice(member, platform)
        : ''
    const isIceForStats = isIceMode || (loadedMp ? iceOrderDetect.isIceMpOrder(loadedMp) : false)
    const countTexts = loadedMp
      ? buildApplyRecruitCountTexts(loadedMp, { isIce: isIceForStats })
      : { recruitCountText: '', applicantCountText: '' }
    const patch = {
      mpOrderId,
      merchantOrderNo,
      platform,
      labels: labels(platform),
      templateName: tpl.name,
      applyRowsRaw,
      hasMember: !!member,
      canSyncMember,
      syncMemberProfile: !!memberFields,
      memberTypeLabel: member ? memberStore.memberTypeLabel(member) : '',
      isIceMode,
      isEditIce,
      isPackIce,
      recruitTarget,
      isSupplierApply,
      supplierWorkId,
      freeEditSlots,
      gateMessage,
      profileGateMessage,
      canReclaim,
      recruitCountText: countTexts.recruitCountText,
      applicantCountText: countTexts.applicantCountText,
      orderBudgetText: loadedMp ? String(loadedMp.budgetText || loadedMp.reward || '') : '',
      customFields: {},
      ...(memberFields ||
        (isSupplierApply ? emptySupplierApplyFields() : emptyApplyFields(DOUYIN_LEVELS))),
      ...(quoteFromPolicy ? { quotePrice: quoteFromPolicy } : {}),
      likesCollects:
        memberFields && memberFields.likesCollects != null ? String(memberFields.likesCollects) : '',
    }
    if (!patch.provinces?.length) {
      Object.assign(patch, setupRegionState('', ''))
    }
    this.setData(patch, () => {
      syncApplyRows(this)
      if (member && orderMeta) {
        this.maybePromptExclusiveQuote(
          member,
          platform,
          orderMeta,
          isSupplierApply ? supplierWorkId : null,
        )
      }
    })
    if (!mpOrderId) {
      wx.showToast({ title: '缺少招募单号', icon: 'none' })
      return
    }
    if (canReclaim) {
      talentContactPrGate.clearLocalIceApplyState(mpOrderId)
    } else if (applicationsStore.hasAppliedToOrder(mpOrderId)) {
      navigateApplySuccess(this, { toastTitle: '您已报名该招募' })
      return
    }
    if (loadedMp && talentContactPrGate.evaluate(loadedMp, mpOrderId).hasApplication && !canReclaim) {
      navigateApplySuccess(this, { toastTitle: '您已报名该招募' })
      return
    }
    if (!applyRowsRaw.length) {
      wx.showToast({ title: '报名表单加载失败，请返回重试', icon: 'none' })
    }
    if (!isIceMode && !isEditIce && !isSupplierApply) {
      void this.refreshApplyScheduleCheck()
    }
    if (profileGateMessage) {
      if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workIdentity)) return
    }
    if (gateMessage && !canReclaim) {
      wx.showModal({
        title: '无法认领',
        content: gateMessage,
        showCancel: false,
        success: () => wx.navigateBack(),
      })
      return
    }
    if (!gate.ok) {
      wx.showModal({
        title: '无法认领',
        content: gate.message,
        showCancel: false,
        success: () => wx.navigateBack(),
      })
    }
  },
  onClaimSlotInput(e) {
    this.setData({ claimSlotCount: e.detail.value })
  },
  onSyncMemberChange(e) {
    const sync = !!e.detail.value
    if (sync) {
      const member = memberStore.readMember()
      const fields = this.data.isSupplierApply
        ? applyFieldsFromSupplierMember(member, this.data.supplierWorkId)
        : applyFieldsFromMember(member, this.data.platform, DOUYIN_LEVELS)
      if (!fields) {
        wx.showToast({
          title: this.data.isSupplierApply ? '暂无团队资料' : '暂无可用会员资料',
          icon: 'none',
        })
        this.setData({ syncMemberProfile: false })
        return
      }
      this.setData({ syncMemberProfile: true, ...fields }, () => syncApplyRows(this))
      return
    }
    this.setData(
      {
        syncMemberProfile: false,
        customFields: {},
        ...(this.data.isSupplierApply
          ? emptySupplierApplyFields()
          : emptyApplyFields(DOUYIN_LEVELS)),
        likesCollects: '',
      },
      () => syncApplyRows(this),
    )
  },
  goRegister() {
    mpProfileNav.goMyProfile()
  },
  async refreshApplyScheduleCheck() {
    if (!this.data.mpOrderId || this.data.isIceMode || this.data.isSupplierApply) return
    try {
      const member = memberStore.readMember()
      const res = await xingxuanEnhance.checkApplySchedule({
        mpOrderId: this.data.mpOrderId,
        preferredVisitDate: this.data.visitDate,
        visitDate: this.data.visitDate,
        talentCity: this.data.city || (member && member.city) || '',
        platformAccount: this.data.platformAccount,
      })
      this.setData({
        graylistWarning: String(res.graylistWarning || ''),
        routeBundles: Array.isArray(res.bundles) ? res.bundles : [],
      })
    } catch (_) {
      this.setData({ graylistWarning: '', routeBundles: [] })
    }
  },
  onOpenBundleOrder(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}` })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    const isCustom = e.currentTarget.dataset.custom === '1'
    const v = e.detail.value
    if (!k) return
    if (isCustom) {
      const customFields = { ...(this.data.customFields || {}), [k]: v }
      this.setData({ customFields, syncMemberProfile: false }, () => syncApplyRows(this))
    } else {
      this.setData({ [k]: v, syncMemberProfile: false }, () => {
        syncApplyRows(this)
        if (k === 'visitDate') void this.refreshApplyScheduleCheck()
      })
    }
  },
  onProvinceChange(e) {
    onProvincePick(this, e)
    this.setData({ syncMemberProfile: false }, () => syncApplyRows(this))
  },
  onCityChange(e) {
    onCityPick(this, e)
    this.setData({ syncMemberProfile: false }, () => syncApplyRows(this))
  },
  onDouyinLevelChange(e) {
    const i = Number(e.detail.value)
    this.setData(
      {
        douyinLevelIndex: i,
        douyinSalesLevel: DOUYIN_LEVELS[i] || '',
        syncMemberProfile: false,
      },
      () => syncApplyRows(this),
    )
  },
  onVisitDateChange(e) {
    this.setData({ visitDate: e.detail.value }, () => {
      syncApplyRows(this)
      void this.refreshApplyScheduleCheck()
    })
  },
  onVisitTimeStartChange(e) {
    const value = String((e.detail && e.detail.value) || '').trim()
    const end = String(this.data.visitTimeEnd || '').trim()
    if (end && value >= end) {
      wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' })
      return
    }
    this.setData({ visitTimeStart: value }, () => syncApplyRows(this))
  },
  onVisitTimeEndChange(e) {
    const value = String((e.detail && e.detail.value) || '').trim()
    const start = String(this.data.visitTimeStart || '').trim()
    if (start && value <= start) {
      wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' })
      return
    }
    this.setData({ visitTimeEnd: value }, () => syncApplyRows(this))
  },
  async onSuggestQuote() {
    if (this.data.quoteSuggesting || this.data.isSupplierApply) return
    this.setData({ quoteSuggesting: true })
    try {
      const res = await xingxuanEnhance.suggestQuote({
        followers: Number(this.data.followers) || 0,
        platform: this.data.platform,
        city: this.data.city,
        budgetText: this.data.orderBudgetText,
      })
      const q = res.quote || {}
      const hint = `参考区间 ¥${q.minYuan}–${q.maxYuan}，建议 ¥${q.suggestYuan}。${q.hint || ''}`
      this.setData({ quoteSuggestHint: hint })
      if (q.suggestYuan) {
        wx.showModal({
          title: 'AI 报价参考',
          content: hint,
          confirmText: '填入报价',
          success: (r) => {
            if (r.confirm) {
              this.setData({ quotePrice: String(q.suggestYuan) }, () => syncApplyRows(this))
            }
          },
        })
      }
    } catch (e) {
      wx.showToast({ title: e.message || '获取失败', icon: 'none' })
    } finally {
      this.setData({ quoteSuggesting: false })
    }
  },
  validateForm() {
    const err = applyRuntime.validateApplyRows(this.data.applyRows, this.data, this.data.platform, {
      isIceMode: this.data.isIceMode,
      isSupplierApply: this.data.isSupplierApply,
    })
    if (err) return err
    if (this._orderMeta && !this.data.isSupplierApply) {
      return tierQuote.validateTierApply(this._orderMeta, this.data)
    }
    return null
  },
  async onSubmit() {
    if (this.data.submitting) return
    if (!api.hasApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      return
    }
    if (!this.data.mpOrderId) {
      wx.showToast({ title: '缺少招募单号', icon: 'none' })
      return
    }
    if (!(this.data.applyRowsRaw || []).length) {
      wx.showToast({ title: '报名表单未加载，请返回详情页重试', icon: 'none' })
      return
    }
    const errMsg = this.validateForm()
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' })
      return
    }
    if (this.data.gateMessage) {
      wx.showToast({ title: this.data.gateMessage, icon: 'none' })
      return
    }
    if (this.data.profileGateMessage) {
      const member = memberStore.readMember()
      const workIdentity = userProfile.readIdentity()
      if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workIdentity)) return
    }
    if (this.data.isPackIce) {
      const n = Math.max(1, Number.parseInt(String(this.data.claimSlotCount || '1'), 10) || 1)
      if (n > this.data.freeEditSlots) {
        wx.showToast({ title: `剩余可认领 ${this.data.freeEditSlots} 条`, icon: 'none' })
        return
      }
    }
    let canReclaim = this.data.canReclaim
    if (this.data.mpOrderId && api.hasApi()) {
      try {
        const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
        const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === this.data.mpOrderId)
        if (mp) canReclaim = talentContactPrGate.canReclaimIceOrder(mp, this.data.mpOrderId)
      } catch {
        /* ignore */
      }
    }
    if (canReclaim) {
      talentContactPrGate.clearLocalIceApplyState(this.data.mpOrderId)
    } else if (applicationsStore.hasAppliedToOrder(this.data.mpOrderId)) {
      navigateApplySuccess(this, { toastTitle: '您已报名该招募' })
      return
    }

    this.setData({ submitting: true })
    try {
      await mpSubscribeMessages.requestForAuditPass()
      const applicantId = `app-${Date.now()}`
      let applicant = applyRuntime.buildApplicantFromRows(this.data.applyRowsRaw, this.data, {
        platform: this.data.platform,
        isIceMode: this.data.isIceMode,
        isSupplierApply: this.data.isSupplierApply,
        supplierWorkId: this.data.supplierWorkId,
        mpOrderId: this.data.mpOrderId,
        merchantOrderNo: this.data.merchantOrderNo,
        applicantId,
        appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      })
      const memberForApply = memberStore.readMember()
      applicant = enrichApplicantFromMember(applicant, memberForApply, this.data.platform, {
        isSupplierApply: this.data.isSupplierApply,
        workId: this.data.supplierWorkId,
      })
      const acct = auth.readAccount()
      if (acct && acct.openid) {
        applicant.wxOpenId = String(acct.openid).trim()
      }
      const displayName = this.data.isSupplierApply
        ? String(applicant.teamName || applicant.name || applicant.contact || '').trim()
        : String(applicant.platformNickname || applicant.name || '').trim()
      if (!displayName) {
        wx.showToast({
          title: this.data.isSupplierApply
            ? '请填写团队名称或联系电话'
            : '请填写抖音昵称或完善我的信息',
          icon: 'none',
        })
        return
      }
      const workIdentity = userProfile.readIdentity()
      const claimSlots = this.data.isPackIce
        ? Math.max(1, Number.parseInt(String(this.data.claimSlotCount || '1'), 10) || 1)
        : undefined
      const preferredVisitDate = String(this.data.visitDate || '').trim() || undefined
      await ops.applyToMpOrder(
        this.data.mpOrderId,
        applicant,
        workIdentity,
        claimSlots,
        preferredVisitDate,
      )
      const persisted = persistApplicantToMemberProfile(
        memberStore.readMember(),
        applicant,
        this.data.platform,
      )
      if (persisted) memberStore.writeMember(persisted)
      const member = memberStore.readMember()
      if (member && String(member.wxNickName || '').trim() && String(member.contact || '').trim()) {
        try {
          const regRes = await ops.registerTalentMember(member)
          if (regRes && regRes.id) {
            member.id = regRes.id
            memberStore.writeMember(member)
          }
        } catch (regErr) {
          console.warn('[apply] registerTalentMember', regErr)
        }
      }
      applicationsStore.addApplication({
        mpOrderId: this.data.mpOrderId,
        applicantId,
        title: this.data.merchantOrderNo || this.data.mpOrderId,
        platform: this.data.platform,
        appliedAt: applicant.appliedAt,
      })
      try {
        messagesStore.pushNotification({
          title: '认领已提交',
          body: this.data.isEditIce
            ? `请到「我的报名」确认接收 ${this.data.merchantOrderNo || this.data.mpOrderId}`
            : `您已报名 ${this.data.merchantOrderNo || this.data.mpOrderId}`,
          category: 'business',
          mpOrderId: this.data.mpOrderId,
          applicantId,
        })
      } catch (notifyErr) {
        console.warn('[apply] pushNotification', notifyErr)
      }
      if (this.data.isIceMode) {
        try {
          wx.setStorageSync(iceOrderStats.iceApplicantStorageKey(this.data.mpOrderId), applicantId)
        } catch {
          /* ignore */
        }
      }
      navigateApplySuccess(this)
    } catch (e) {
      if (isAlreadyAppliedError(e)) {
        if (!applicationsStore.hasAppliedToOrder(this.data.mpOrderId)) {
          applicationsStore.addApplication({
            mpOrderId: this.data.mpOrderId,
            applicantId: `app-${Date.now()}`,
            title: this.data.merchantOrderNo || this.data.mpOrderId,
            platform: this.data.platform,
            appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          })
        }
        navigateApplySuccess(this, { toastTitle: '您已报名该招募' })
        return
      }
      wx.showToast({ title: String(e.message || e).slice(0, 40), icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
