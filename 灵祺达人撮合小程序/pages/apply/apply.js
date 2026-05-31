const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const { labels, normalizePlatform } = require('../../utils/platformLabels.js')
const regionPicker = require('../../utils/regionPicker.js')
const { setupRegionState, onProvincePick, onCityPick } = regionPicker
const applyFormState = require('../../utils/applyFormState.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const messagesStore = require('../../utils/messagesStore.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const applyRuntime = require('../../utils/applyTemplateRuntime.js')
const platformForm = require('../../utils/platformForm.js')

const { emptyApplyFields, memberSyncAvailable, applyFieldsFromMember } = applyFormState
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
  },
  onLoad(options) {
    const mpOrderId = options && options.mpId ? decodeURIComponent(options.mpId) : ''
    const merchantOrderNo =
      options && options.merchantOrderNo ? decodeURIComponent(options.merchantOrderNo) : ''
    const platform = normalizePlatform(options && options.platform ? decodeURIComponent(options.platform) : '抖音')
    const isIceMode = options && options.ice === '1'
    const templateId = options && options.templateId ? decodeURIComponent(options.templateId) : ''
    const tpl = applyTemplates.getApplyConfigForMpOrder(mpOrderId, templateId)
    const applyRowsRaw = applyTemplates.resolveApplyRows(tpl, platform, { isIceMode })
    const member = memberStore.readMember()
    const canSyncMember = memberSyncAvailable(member, platform)
    const patch = {
      mpOrderId,
      merchantOrderNo,
      platform,
      labels: labels(platform),
      templateName: tpl.name,
      applyRowsRaw,
      hasMember: !!member,
      canSyncMember,
      syncMemberProfile: false,
      memberTypeLabel: member ? memberStore.memberTypeLabel(member) : '',
      isIceMode,
      customFields: {},
      ...emptyApplyFields(DOUYIN_LEVELS),
      likesCollects: '',
    }
    if (!patch.provinces?.length) {
      Object.assign(patch, setupRegionState('', ''))
    }
    this.setData(patch, () => syncApplyRows(this))
    if (!mpOrderId) {
      wx.showToast({ title: '缺少招募单号', icon: 'none' })
    }
  },
  onSyncMemberChange(e) {
    const sync = !!e.detail.value
    if (sync) {
      const member = memberStore.readMember()
      const fields = applyFieldsFromMember(member, this.data.platform, DOUYIN_LEVELS)
      if (!fields) {
        wx.showToast({ title: '暂无可用会员资料', icon: 'none' })
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
        ...emptyApplyFields(DOUYIN_LEVELS),
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
    })
  },
  async onSubmit() {
    if (!merchant.hasMerchantApi()) {
      wx.showToast({ title: '未配置后台地址', icon: 'none' })
      return
    }
    const errMsg = this.validateForm()
    if (errMsg) {
      wx.showToast({ title: errMsg, icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const applicantId = `app-${Date.now()}`
      const applicant = applyRuntime.buildApplicantFromRows(this.data.applyRowsRaw, this.data, {
        platform: this.data.platform,
        isIceMode: this.data.isIceMode,
        mpOrderId: this.data.mpOrderId,
        merchantOrderNo: this.data.merchantOrderNo,
        applicantId,
        appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      })
      await ops.applyToMpOrder(this.data.mpOrderId, applicant)
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
      })
      if (this.data.isIceMode) {
        try {
          wx.setStorageSync(`meoo_ice_applicant_v1_${this.data.mpOrderId}`, applicantId)
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
