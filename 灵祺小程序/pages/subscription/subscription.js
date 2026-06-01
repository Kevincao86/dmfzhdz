const api = require('../../utils/api.js')
const membershipMp = require('../../utils/membershipMp.js')
const tiersUtil = require('../../utils/meooPaymentTiers.js')
const rest = require('../../utils/supabaseRest.js')

function formatErr(e) {
  return e && e.message ? e.message : String(e)
}

Page({
  data: {
    loading: true,
    planLabel: '免费版',
    monthlyYuan: null,
    featureLines: [],
    directAiRemaining: null,
    directAiLimit: null,
    isPaid: false,
    subscriptionDays: 0,
    opsGiftDays: 0,
    totalEntitlementDays: 0,
    remainDaysDisplay: '0',
    expireText: '',
    expireWarn: '',
    subscriptionTiers: tiersUtil.SUBSCRIPTION_TIERS,
    tierIndex: 0,
    channel: '',
    payBusy: false,
    payErr: '',
    paySheetOpen: false,
  },

  onShow() {
    if (!api.isAuthed()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.reload()
  },

  async reload() {
    this.setData({ loading: true, payErr: '' })
    try {
      const snap = await membershipMp.loadMembershipSnapshot()
      const ent = snap.ent
      const usage = snap.memberUsage
      let remainDaysDisplay = '0'
      let expireWarn = ''
      if (ent.isPaid) {
        if (usage.remainDays != null && usage.remainDays > 0) {
          remainDaysDisplay = String(usage.remainDays)
        } else if (usage.remainDays === 0) {
          remainDaysDisplay = '0'
          expireWarn = '今日到期，请尽快续费。'
        } else if (usage.remainDays != null && usage.remainDays < 0) {
          remainDaysDisplay = String(Math.abs(usage.remainDays))
          expireWarn = `会员已过期 ${Math.abs(usage.remainDays)} 天，续费后可继续使用。`
        }
      }
      this.setData({
        loading: false,
        planLabel: ent.planLabel,
        monthlyYuan: ent.monthlyYuan,
        featureLines: ent.featureLines,
        directAiRemaining: ent.directAiRemaining,
        directAiLimit: ent.directAiCallLimit,
        isPaid: ent.isPaid,
        subscriptionDays: snap.subscriptionDays,
        opsGiftDays: snap.opsGiftDays,
        totalEntitlementDays: snap.totalEntitlementDays,
        remainDaysDisplay,
        expireText: usage.expireText || '',
        expireWarn,
      })
    } catch (e) {
      this.setData({ loading: false, payErr: formatErr(e) })
    }
  },

  onReload() {
    this.reload()
  },

  onOpenSubscribe() {
    this.setData({ paySheetOpen: true, payErr: '', channel: '' })
  },

  onCloseSubscribe() {
    this.setData({ paySheetOpen: false, payBusy: false, payErr: '' })
  },

  onPickTier(e) {
    this.setData({ tierIndex: Number(e.currentTarget.dataset.index) || 0 })
  },

  onPickChannel(e) {
    this.setData({ channel: e.currentTarget.dataset.ch || '', payErr: '' })
  },

  async onSubmitPay() {
    const tier = this.data.subscriptionTiers[this.data.tierIndex]
    const ch = this.data.channel
    if (!tier || !ch) {
      this.setData({ payErr: '请选择套餐与支付方式' })
      return
    }
    this.setData({ payBusy: true, payErr: '' })
    try {
      const tid = await rest.fetchPrimaryTenantId()
      await rest.insertPaymentOrder({
        tenantId: tid,
        orderKind: 'subscription',
        amountCents: tier.cents,
        payChannel: ch === 'alipay' ? 'alipay' : 'wechat',
      })
      wx.showModal({
        title: '已提交',
        content:
          '支付申报已提交，请等待运营在管控台核对确认；确认后将自动开通对应会员版本，约 20 秒内与电脑端同步。',
        showCancel: false,
      })
      this.setData({ payBusy: false })
    } catch (e) {
      this.setData({ payBusy: false, payErr: formatErr(e) })
    }
  },
})
