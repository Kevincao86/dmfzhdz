const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')
const affiliateApply = require('../../../utils/mpDistributionAffiliateApply.js')
const affiliatePortal = require('../../../utils/mpDistributionAffiliatePortal.js')

function mapPortalView(data) {
  const affiliate = data.affiliate || null
  const wallet = data.wallet
  const stats = data.stats
  const promoLinks = data.promoLinks
  const linkRows = promoLinks
    ? [
        { key: 'cs', label: '商家 ERP 注册', url: promoLinks.cs },
        { key: 'drPr', label: '星选 PR 注册', url: promoLinks.drPr },
        { key: 'drTalent', label: '星选达人注册', url: promoLinks.drTalent },
      ]
    : []
  const settlements = (data.settlements || []).map((row) => ({
    ...row,
    periodStart: String(row.periodStart || '').slice(0, 10),
    periodEnd: String(row.periodEnd || '').slice(0, 10),
    totalYuan: affiliatePortal.formatYuan(row.totalCents),
    statusLabel: affiliatePortal.settlementStatusLabel(row.status),
  }))
  return {
    affiliate,
    statusLabel: affiliate ? affiliateApply.statusLabel(affiliate.status) : '',
    promoLinks,
    linkRows,
    wallet: wallet
      ? {
          availableYuan: affiliatePortal.formatYuan(wallet.availableCents),
          frozenYuan: affiliatePortal.formatYuan(wallet.frozenCents),
          withdrawnYuan: affiliatePortal.formatYuan(wallet.withdrawnCents),
        }
      : null,
    stats: stats
      ? {
          settlementTotalYuan: affiliatePortal.formatYuan(stats.settlementTotalCents),
        }
      : null,
    settlements,
  }
}

Page({
  data: {
    loading: true,
    err: '',
    hint: '',
    affiliate: null,
    statusLabel: '',
    promoLinks: null,
    linkRows: [],
    wallet: null,
    stats: null,
    settlements: [],
  },
  onShow() {
    syncPageIdentity(this)
    this.loadPortal()
  },
  async loadPortal() {
    this.setData({ loading: true, err: '', hint: '' })
    try {
      const data = await affiliatePortal.fetchPortal()
      this.setData({ loading: false, ...mapPortalView(data) })
    } catch (e) {
      this.setData({
        loading: false,
        err: (e && e.message) || '加载失败',
      })
    }
  },
  onGoApply() {
    wx.navigateTo({ url: '/pages/subpack-mine/mine-affiliate-apply/mine-affiliate-apply' })
  },
  onCopyCode() {
    const code = this.data.affiliate && this.data.affiliate.refCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => this.setData({ hint: '已复制推广码' }),
    })
  },
  onCopyLink(e) {
    const url = e.currentTarget.dataset.url
    const label = e.currentTarget.dataset.label || '链接'
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => this.setData({ hint: `已复制${label}` }),
    })
  },
})
