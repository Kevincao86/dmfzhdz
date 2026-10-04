const auth = require('../../../utils/auth.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')
const promoClaim = require('../../../utils/mpMembershipPromoClaim.js')
const registryProfileSync = require('../../../utils/registryProfileSync.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')

const PAGE_URL =
  '/pages/subpack-mine/mine-membership-promo-claim/mine-membership-promo-claim?campaign=poster30d2026'

Page({
  data: {
    booting: true,
    invalidEntry: false,
    needLogin: false,
    claiming: false,
    status: '',
    grantDays: 30,
    grantPlanLabel: '专业版',
    membershipExpiresAt: '',
    claimedAt: '',
    info: '',
    err: '',
    campaignEndLabel: promoClaim.CAMPAIGN_END_LABEL,
  },

  onLoad(query) {
    const campaign = String((query && query.campaign) || '').trim()
    if (campaign !== promoClaim.CAMPAIGN_ID) {
      this.setData({
        booting: false,
        invalidEntry: true,
        err: '请扫描海报上的官方小程序码进入领取页',
      })
      return
    }
    this._campaign = campaign
  },

  onShow() {
    syncPageIdentity(this)
    if (this.data.invalidEntry) return
    this.boot()
  },

  async boot() {
    if (!auth.isLoggedIn()) {
      this.setData({
        booting: false,
        needLogin: true,
        status: 'login',
        err: '',
      })
      return
    }
    this.setData({ booting: true, needLogin: false, err: '', info: '' })
    try {
      const preview = await promoClaim.previewPromoClaim(this._campaign)
      const status = String(preview.status || 'available')
      let info = ''
      if (status === 'ended') {
        info = `活动已于 ${promoClaim.CAMPAIGN_END_LABEL} 结束，感谢关注。`
      } else if (status === 'claimed') {
        info = '您已领取过本活动福利，会员权益已生效。'
      } else {
        info = `限时福利：扫码领取 ${preview.grantDays} 天星选专业版会员（活动截止 ${promoClaim.CAMPAIGN_END_LABEL}）。`
      }
      this.setData({
        booting: false,
        status,
        grantDays: preview.grantDays,
        grantPlanLabel: '专业版',
        membershipExpiresAt: preview.membershipExpiresAt,
        claimedAt: preview.claimedAt,
        info,
      })
    } catch (e) {
      this.setData({
        booting: false,
        err: (e && e.message) || '加载活动信息失败',
      })
    }
  },

  onGoLogin() {
    guestRoutes.redirectToLogin(PAGE_URL)
  },

  async onClaim() {
    if (this.data.claiming || this.data.status !== 'available') return
    if (!auth.isLoggedIn()) {
      this.onGoLogin()
      return
    }
    this.setData({ claiming: true, err: '' })
    try {
      const result = await promoClaim.claimPromoMembership(this._campaign)
      await registryProfileSync.pullRegistryProfileAfterLogin()
      this.setData({
        claiming: false,
        status: 'claimed',
        membershipExpiresAt: result.membershipExpiresAt,
        info: result.message,
      })
      wx.showToast({ title: '领取成功', icon: 'success' })
    } catch (e) {
      this.setData({
        claiming: false,
        err: (e && e.message) || '领取失败',
      })
    }
  },

  onGoMembership() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-xingxuan-membership/mine-xingxuan-membership' })
  },
})
