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
      : { settlementTotalYuan: '0.00' },
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
    stats: { settlementTotalYuan: '0.00' },
    settlements: [],
    wxacodePath: '',
    wxacodeLoading: false,
    wxacodeErr: '',
  },
  onShow() {
    syncPageIdentity(this)
    this.loadPortal()
  },
  async loadPortal(retry = 0) {
    this.setData({
      loading: true,
      err: '',
      hint: '',
      wxacodePath: '',
      wxacodeErr: '',
    })
    try {
      const data = await affiliatePortal.fetchPortal()
      this.setData({ loading: false, ...mapPortalView(data) })
      if (data.promoLinks && data.affiliate && data.affiliate.status === 'active') {
        this.loadWxacode()
      }
    } catch (e) {
      const msg = (e && e.message) || '加载失败'
      const isGateway = /502|503|504|Bad Gateway|后台服务正在重启/i.test(msg)
      if (retry < 1 && isGateway) {
        await new Promise((r) => setTimeout(r, 1500))
        return this.loadPortal(retry + 1)
      }
      this.setData({
        loading: false,
        err: msg,
      })
    }
  },
  async loadWxacode() {
    if (this.data.wxacodeLoading) return
    this.setData({ wxacodeLoading: true, wxacodeErr: '' })
    try {
      const path = await affiliatePortal.fetchWxacodeImagePath()
      this.setData({ wxacodePath: path, wxacodeLoading: false })
    } catch (e) {
      const raw = (e && e.message) || 'wxacode_unavailable'
      const msg = raw === 'wxacode_unavailable' ? '太阳码生成失败，请稍后重试' : raw
      this.setData({ wxacodeLoading: false, wxacodeErr: msg })
    }
  },
  onRetryLoad() {
    this.loadPortal()
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
  onSaveWxacode() {
    const path = this.data.wxacodePath
    if (!path) return
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => this.setData({ hint: '太阳码已保存到相册' }),
      fail: (err) => {
        const denied = err && /auth deny|authorize/i.test(String(err.errMsg || ''))
        if (denied) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) wx.openSetting({})
            },
          })
          return
        }
        this.setData({ hint: '保存失败，请长按太阳码保存' })
      },
    })
  },
})
