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
        const blockResubmit = affiliate.status === 'active' || affiliate.status === 'disabled'
        let info = ''
        if (affiliate.status === 'pending' || affiliate.status === 'rejected') {
          info = '点击下方即可成为推广员，并生成专属推广二维码。'
        } else if (affiliate.status === 'active') {
          info = '您已是推广员，可前往「我的推广」查看推广二维码与佣金。'
        } else if (affiliate.status === 'disabled') {
          info = '推广员已停用，请联系客服。'
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
        (affiliate.status === 'active' || affiliate.status === 'disabled')
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
      if (this.data.result && this.data.result.status === 'active') {
        wx.redirectTo({ url: PORTAL_URL })
        return
      }
      this.setData({ info: '推广员已停用，请联系客服。', err: '' })
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
      if (affiliate && affiliate.status === 'active') {
        wx.showToast({ title: '已成为推广员', icon: 'success' })
        wx.redirectTo({ url: PORTAL_URL })
        return
      }
      this.setData({
        result: affiliate,
        blockResubmit: !!(affiliate && (affiliate.status === 'active' || affiliate.status === 'disabled')),
        info: '已提交，请前往「我的推广」查看推广二维码。',
      })
    } catch (e) {
      if (e && e.affiliate) {
        if (e.code === 'already_active' || e.affiliate.status === 'active') {
          wx.redirectTo({ url: PORTAL_URL })
          return
        }
        this.setData({
          result: e.affiliate,
          blockResubmit: e.affiliate.status === 'disabled',
          info: (e && e.message) || '',
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
