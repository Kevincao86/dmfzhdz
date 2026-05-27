const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const memberStore = require('../../utils/talentMember.js')
const { labels, normalizePlatform } = require('../../utils/platformLabels.js')
const regionPicker = require('../../utils/regionPicker.js')
const { setupRegionState, onProvincePick, onCityPick, validateRegion } = regionPicker
const applyFormState = require('../../utils/applyFormState.js')
const { emptyApplyFields, memberSyncAvailable, applyFieldsFromMember } = applyFormState

const DOUYIN_LEVELS = ['LV0', 'LV1', 'LV2', 'LV3', 'LV4', 'LV5', 'LV6', 'LV7', '暂无等级']

Page({
  data: {
    mpOrderId: '',
    merchantOrderNo: '',
    platform: '抖音',
    labels: labels('抖音'),
    douyinLevels: DOUYIN_LEVELS,
    douyinLevelIndex: 0,
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
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
    const member = memberStore.readMember()
    const canSyncMember = memberSyncAvailable(member, platform)
    const patch = {
      mpOrderId,
      merchantOrderNo,
      platform,
      labels: labels(platform),
      hasMember: !!member,
      canSyncMember,
      syncMemberProfile: false,
      memberTypeLabel: member ? memberStore.memberTypeLabel(member.memberType) : '',
      ...emptyApplyFields(DOUYIN_LEVELS),
    }
    if (!patch.provinces?.length) {
      Object.assign(patch, setupRegionState('', ''))
    }
    this.setData(patch)
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
      this.setData({ syncMemberProfile: true, ...fields })
      return
    }
    this.setData({
      syncMemberProfile: false,
      ...emptyApplyFields(DOUYIN_LEVELS),
    })
  },
  goRegister() {
    wx.navigateTo({ url: '/pages/register/register' })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [k]: e.detail.value, syncMemberProfile: false })
  },
  onProvinceChange(e) {
    onProvincePick(this, e)
    this.setData({ syncMemberProfile: false })
  },
  onCityChange(e) {
    onCityPick(this, e)
    this.setData({ syncMemberProfile: false })
  },
  onDouyinLevelChange(e) {
    const i = Number(e.detail.value)
    this.setData({
      douyinLevelIndex: i,
      douyinSalesLevel: DOUYIN_LEVELS[i] || '',
      syncMemberProfile: false,
    })
  },
  onVisitDateChange(e) {
    this.setData({ visitDate: e.detail.value })
  },
  onVisitTimeStartChange(e) {
    this.setData({ visitTimeStart: e.detail.value })
  },
  onVisitTimeEndChange(e) {
    this.setData({ visitTimeEnd: e.detail.value })
  },
  validateForm() {
    const lb = this.data.labels
    if (!String(this.data.platformAccount || '').trim()) return `请填写${lb.accountId}`
    if (!String(this.data.platformNickname || '').trim()) return `请填写${lb.nickname}`
    if (!String(this.data.profileLink || '').trim()) return `请填写${lb.profileLink}`
    const followers = Number.parseInt(String(this.data.followers || '').replace(/,/g, ''), 10)
    if (!Number.isFinite(followers) || followers <= 0) return '请填写有效粉丝数'
    if (this.data.labels.showSalesLevel && !String(this.data.douyinSalesLevel || '').trim()) {
      return '请选择抖音带货等级'
    }
    if (!String(this.data.contact || '').trim()) return '请填写联系方式'
    if (!String(this.data.wechatId || '').trim()) return '请填写微信号'
    const regionErr = validateRegion(this.data.province, this.data.city)
    if (regionErr) return regionErr
    if (!this.data.isIceMode) {
      if (!String(this.data.quotePrice || '').trim()) return '请填写报价'
      if (!this.data.visitDate || !this.data.visitTimeStart || !this.data.visitTimeEnd) {
        return '请选择探店日期与时间段'
      }
      if (this.data.visitTimeStart >= this.data.visitTimeEnd) return '探店结束时间须晚于开始时间'
      if (!String(this.data.alipayAccount || '').trim()) return '请填写支付宝账号'
    }
    return null
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

    const platformNickname = String(this.data.platformNickname || '').trim()
    const visitTimeSlot = this.data.isIceMode
      ? '云剪任务·无需探店'
      : `${this.data.visitDate} ${this.data.visitTimeStart}-${this.data.visitTimeEnd}`
    const followers = Number.parseInt(String(this.data.followers || '').replace(/,/g, ''), 10)
    const platform = this.data.platform
    const alipayAccount = String(this.data.alipayAccount || '').trim()

    this.setData({ submitting: true })
    try {
      const applicantId = `app-${Date.now()}`
      const applicant = {
        id: applicantId,
        name: platformNickname,
        platform,
        platformAccount: String(this.data.platformAccount || '').trim(),
        platformNickname,
        profileLink: String(this.data.profileLink || '').trim(),
        followers: Math.max(0, followers),
        douyinSalesLevel: this.data.labels.showSalesLevel
          ? String(this.data.douyinSalesLevel || '').trim()
          : undefined,
        contact: String(this.data.contact || '').trim(),
        wechatId: String(this.data.wechatId || '').trim(),
        quotePrice: this.data.isIceMode ? '云剪' : String(this.data.quotePrice || '').trim(),
        visitTimeSlot,
        alipayAccount: this.data.isIceMode ? '' : alipayAccount,
        paymentMethod: this.data.isIceMode ? '云剪任务' : `支付宝：${alipayAccount}`,
        mpOrderId: this.data.mpOrderId,
        merchantOrderNo: this.data.merchantOrderNo,
        province: String(this.data.province || '').trim(),
        city: String(this.data.city || '').trim(),
        appliedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      }
      await ops.applyToMpOrder(this.data.mpOrderId, applicant)
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
