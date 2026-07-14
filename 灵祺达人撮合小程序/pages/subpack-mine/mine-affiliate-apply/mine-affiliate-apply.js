const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')
const affiliateApply = require('../../../utils/mpDistributionAffiliateApply.js')

Page({
  data: {
    realName: '',
    phone: '',
    note: '',
    err: '',
    info: '',
    submitting: false,
    checking: false,
    result: null,
  },
  onShow() {
    syncPageIdentity(this)
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
  async onCheckStatus() {
    this.setData({ checking: true, err: '', info: '' })
    try {
      const affiliate = await affiliateApply.fetchStatus(this.data.phone)
      this.setData({
        result: affiliate,
        info: affiliate ? '' : '暂无该手机号的申请记录，可填写下方表单提交。',
      })
    } catch (e) {
      this.setData({ err: (e && e.message) || '查询失败' })
    } finally {
      this.setData({ checking: false })
    }
  },
  async onSubmit() {
    this.setData({ submitting: true, err: '', info: '' })
    try {
      const data = await affiliateApply.applyAffiliate({
        realName: this.data.realName,
        phone: this.data.phone,
        note: this.data.note,
      })
      this.setData({
        result: data.affiliate || null,
        info: data.created ? '申请已提交，请等待运营审核。' : '您已有待审核申请，请耐心等待。',
      })
    } catch (e) {
      if (e && e.affiliate) {
        this.setData({
          result: e.affiliate,
          info: '您已是通过审核的推广员。',
          err: '',
        })
      } else {
        this.setData({ err: (e && e.message) || '提交失败' })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },
})
