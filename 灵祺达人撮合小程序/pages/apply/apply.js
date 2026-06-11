const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const auth = require('../../utils/auth.js')
const { labels, normalizePlatform } = require('../../utils/platformLabels.js')
const regionPicker = require('../../utils/regionPicker.js')
const { setupRegionState, onProvincePick, onCityPick } = regionPicker
const applyFormState = require('../../utils/applyFormState.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const talentContactPrGate = require('../../utils/talentContactPrGate.js')
const messagesStore = require('../../utils/messagesStore.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const applyRuntime = require('../../utils/applyTemplateRuntime.js')
const platformForm = require('../../utils/platformForm.js')
const iceOrderStats = require('../../utils/iceOrderStats.js')
const iceOrderDetect = require('../../utils/iceOrderDetect.js')
const recruitApplyGate = require('../../utils/recruitApplyGate.js')
const editIceSlots = require('../../utils/editIceSlots.js')
const userProfile = require('../../utils/userProfile.js')
const mpSubscribeMessages = require('../../utils/mpSubscribeMessages.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

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

function syncApplyRows(page) {
  const d = page.data
  const rows = (d.applyRowsRaw || []).map((row) => ({
    ...row,
    isCustom: row.bindKey.startsWith('custom_'),
    fieldValue: row.bindKey.startsWith('custom_')
      ? String((d.customFields && d.customFields[row.bindKey]) || '')
      : String(d[row.bindKey] != null ? d[row.bindKey] : ''),
  }))
  page.setData({ applyRows: rows })
}

Page({
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
    recruitTarget: 'talent',
    isSupplierApply: false,
    supplierWorkId: 'talent',
    claimSlotCount: '1',
    freeEditSlots: 0,
    gateMessage: '',
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
            recruitTarget = String(orderMeta.recruitTarget || 'talent')
          }
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
    const applyRowsRaw = applyTemplates.resolveApplyRows(tpl, platform, {
      isIceMode,
      recruitTarget,
    })
    const member = memberStore.readMember()
    const isEditIce = loadedMp ? iceOrderDetect.isEditTeamIceMpOrder(loadedMp) : false
    const isSupplierApply = recruitTarget === 'shoot' || recruitTarget === 'edit'
    const supplierWorkId = recruitTarget === 'edit' ? 'edit' : recruitTarget === 'shoot' ? 'shoot' : 'talent'
    const freeEditSlots = loadedMp ? editIceSlots.countFreeEditPackSlots(loadedMp) : 0
    const gate = loadedMp
      ? recruitApplyGate.validateRecruitmentClaim(loadedMp, userProfile.readIdentity())
      : { ok: true }
    const canSyncMember = isSupplierApply
      ? supplierMemberSyncAvailable(member, supplierWorkId)
      : memberSyncAvailable(member, platform)
    const memberFields = canSyncMember
      ? isSupplierApply
        ? applyFieldsFromSupplierMember(member, supplierWorkId)
        : applyFieldsFromMember(member, platform, DOUYIN_LEVELS)
      : null
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
      recruitTarget,
      isSupplierApply,
      supplierWorkId,
      freeEditSlots,
      gateMessage: gate.ok ? '' : gate.message,
      customFields: {},
      ...(memberFields ||
        (isSupplierApply ? emptySupplierApplyFields() : emptyApplyFields(DOUYIN_LEVELS))),
      likesCollects:
        memberFields && memberFields.likesCollects != null ? String(memberFields.likesCollects) : '',
    }
    if (!patch.provinces?.length) {
      Object.assign(patch, setupRegionState('', ''))
    }
    this.setData(patch, () => syncApplyRows(this))
    if (!mpOrderId) {
      wx.showToast({ title: '缺少招募单号', icon: 'none' })
      return
    }
    if (applicationsStore.hasAppliedToOrder(mpOrderId)) {
      wx.showToast({ title: '您已报名该招募', icon: 'none' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/detail/detail?id=${encodeURIComponent(mpOrderId)}&applied=1`,
        })
      }, 800)
      return
    }
    if (loadedMp && talentContactPrGate.evaluate(loadedMp, mpOrderId).hasApplication) {
      wx.showToast({ title: '您已报名该招募', icon: 'none' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/detail/detail?id=${encodeURIComponent(mpOrderId)}&applied=1`,
        })
      }, 800)
      return
    }
    if (!applyRowsRaw.length) {
      wx.showToast({ title: '报名表单加载失败，请返回重试', icon: 'none' })
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
    wx.navigateTo({ url: '/pages/register/register?edit=1' })
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
      this.setData({ [k]: v, syncMemberProfile: false }, () => syncApplyRows(this))
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
    this.setData({ visitDate: e.detail.value }, () => syncApplyRows(this))
  },
  onVisitTimeStartChange(e) {
    this.setData({ visitTimeStart: e.detail.value }, () => syncApplyRows(this))
  },
  onVisitTimeEndChange(e) {
    this.setData({ visitTimeEnd: e.detail.value }, () => syncApplyRows(this))
  },
  validateForm() {
    return applyRuntime.validateApplyRows(this.data.applyRowsRaw, this.data, this.data.platform, {
      isIceMode: this.data.isIceMode,
      isSupplierApply: this.data.isSupplierApply,
    })
  },
  async onSubmit() {
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
    if (this.data.isEditIce) {
      const n = Math.max(1, Number.parseInt(String(this.data.claimSlotCount || '1'), 10) || 1)
      if (n > this.data.freeEditSlots) {
        wx.showToast({ title: `剩余可认领 ${this.data.freeEditSlots} 条`, icon: 'none' })
        return
      }
    }
    if (applicationsStore.hasAppliedToOrder(this.data.mpOrderId)) {
      wx.showToast({ title: '您已报名该招募', icon: 'none' })
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
      const claimSlots = this.data.isEditIce
        ? Math.max(1, Number.parseInt(String(this.data.claimSlotCount || '1'), 10) || 1)
        : undefined
      await ops.applyToMpOrder(this.data.mpOrderId, applicant, workIdentity, claimSlots)
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
      messagesStore.pushNotification({
        title: '报名已提交',
        body: `您已报名 ${this.data.merchantOrderNo || this.data.mpOrderId}`,
        category: 'business',
        mpOrderId: this.data.mpOrderId,
        applicantId,
      })
      if (this.data.isIceMode) {
        try {
          wx.setStorageSync(iceOrderStats.iceApplicantStorageKey(this.data.mpOrderId), applicantId)
        } catch {
          /* ignore */
        }
      }
      wx.showToast({
        title: this.data.isIceMode ? '认领成功，请确认接收' : '报名成功',
        icon: 'success',
      })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/detail/detail?id=${encodeURIComponent(this.data.mpOrderId)}&applied=1`,
        })
      }, 600)
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 40), icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
