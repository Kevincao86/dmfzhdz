const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')
const affiliateApply = require('../../../utils/mpDistributionAffiliateApply.js')
const auth = require('../../../utils/auth.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')

const APPLY_URL = '/pages/subpack-mine/mine-affiliate-apply/mine-affiliate-apply'
const PORTAL_URL = '/pages/subpack-mine/mine-affiliate-portal/mine-affiliate-portal'

Page({
  data: {
    realName: '',
    phone: '',
    note: '',
    err: '',
    info: '',
    submitting: false,
    checking: false,
    booting: true,
    result: null,
    blockResubmit: false,
  },
  onShow() {
    syncPageIdentity(this)
    this.boot()
  },
  async boot() {
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(APPLY_URL)
      return
    }
    const phone = affiliateApply.phoneFromAccount(auth.readAccount())
    this.setData({
      booting: true,
      err: '',
      phone: phone || this.data.phone,
    })
    try {
      const affiliate = await affiliateApply.fetchMyStatus()
      if (affiliate) {
        const blockResubmit = affiliate.status === 'pending' || affiliate.status === 'active'
        let info = ''
        if (affiliate.status === 'pending') {
          info = '您已有待审核申请，审核通过后将在「我的推广」展示推广码。'
        } else if (affiliate.status === 'active') {
          info = '您已是推广员，可前往「我的推广」查看推广码与佣金数据。'
        }
        this.setData({
          result: affiliate,
          blockResubmit,
          info,
          realName: this.data.realName || String(affiliate.realName || ''),
        })
      }
    } catch (e) {
      this.setData({ err: (e && e.message) || '加载申请状态失败' })
    } finally {
      this.setData({ booting: false })
    }
  },
  onRealNameInput(e) {
    this.setData({ realName: e.detail.value })
  },
  onPhoneInput(e) {
    this.setData({ phone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
  },
  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },
  onGoPortal() {
    wx.navigateTo({ url: PORTAL_URL })
  },
  async onCheckStatus() {
    this.setData({ checking: true, err: '', info: '' })
    try {
      const affiliate = await affiliateApply.fetchStatus(this.data.phone)
      const blockResubmit = !!(
        affiliate &&
        (affiliate.status === 'pending' || affiliate.status === 'active')
      )
      this.setData({
        result: affiliate,
        blockResubmit,
        info: affiliate ? '' : '暂无该手机号的申请记录，可填写下方表单提交。',
      })
    } catch (e) {
      this.setData({ err: (e && e.message) || '查询失败' })
    } finally {
      this.setData({ checking: false })
    }
  },
  async onSubmit() {
    if (this.data.blockResubmit) {
      this.setData({
        info:
          this.data.result && this.data.result.status === 'active'
            ? '您已是推广员，请前往「我的推广」。'
            : '您已有待审核申请，无需重复提交。',
        err: '',
      })
      return
    }
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(APPLY_URL)
      return
    }
    this.setData({ submitting: true, err: '', info: '' })
    try {
      const data = await affiliateApply.applyAffiliate({
        realName: this.data.realName,
        phone: this.data.phone,
        note: this.data.note,
      })
      const affiliate = data.affiliate || null
      this.setData({
        result: affiliate,
        blockResubmit: !!(
          affiliate &&
          (affiliate.status === 'pending' || affiliate.status === 'active')
        ),
        info: data.created
          ? '申请已提交，请等待运营审核。'
          : '您已有待审核申请，请耐心等待；审核结果可在「我的推广」查看。',
      })
    } catch (e) {
      if (e && e.affiliate) {
        this.setData({
          result: e.affiliate,
          blockResubmit: e.affiliate.status === 'active' || e.affiliate.status === 'pending',
          info: e.code === 'already_active' || e.affiliate.status === 'active'
            ? '您已是通过审核的推广员。'
            : (e && e.message) || '',
          err: e.code === 'phone_taken' ? e.message : '',
        })
      } else {
        this.setData({ err: (e && e.message) || '提交失败' })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },
})
