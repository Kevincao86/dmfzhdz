const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')
const affiliateApply = require('../../../utils/mpDistributionAffiliateApply.js')
const affiliatePortal = require('../../../utils/mpDistributionAffiliatePortal.js')
const auth = require('../../../utils/auth.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')

const PORTAL_URL = '/pages/subpack-mine/mine-affiliate-portal/mine-affiliate-portal'
const APPLY_URL = '/pages/subpack-mine/mine-affiliate-apply/mine-affiliate-apply'

const SUBJECT_TYPE_LABEL = {
  erp_merchant: 'ERP 商家',
  xingxuan_pr: '星选 PR',
  xingxuan_talent: '星选达人',
  xingxuan_shoot: '星选拍摄',
  xingxuan_edit: '星选剪辑',
}

const LANDING_SURFACE_LABEL = {
  cs: '商家 ERP',
  dr: '星选 Web',
  mp: '星选小程序',
}

function mapAttributionRows(rows) {
  return (rows || []).map((row) => ({
    ...row,
    subjectTypeLabel: SUBJECT_TYPE_LABEL[row.subjectType] || row.subjectType || '—',
    landingLabel: LANDING_SURFACE_LABEL[row.landingSurface] || row.landingSurface || '—',
    boundAtText: String(row.boundAt || '').slice(0, 16).replace('T', ' '),
    paidYuan: row.firstPaidAt ? affiliatePortal.formatYuan(row.paidAmountCents) : '',
  }))
}

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
    attributionStats: data.attributionStats
      ? {
          registrations: data.attributionStats.registrations || 0,
          paidCount: data.attributionStats.paidCount || 0,
          paidAmountYuan: affiliatePortal.formatYuan(data.attributionStats.paidAmountCents),
        }
      : null,
    attributions: mapAttributionRows(data.attributions),
    settlements,
    withdrawGate: data.withdrawGate
      ? {
          ...data.withdrawGate,
          minYuan: affiliatePortal.formatYuan(data.withdrawGate.minCents),
          maxYuan: affiliatePortal.formatYuan(data.withdrawGate.maxCents),
          monthlyCapYuan: affiliatePortal.formatYuan(data.withdrawGate.monthlyCapCents),
        }
      : null,
    withdrawRequests: (data.withdrawRequests || []).map((row) => ({
      ...row,
      amountYuan: affiliatePortal.formatYuan(row.amountCents),
      statusLabel: affiliatePortal.withdrawStatusLabel(row.status),
      createdAtText: String(row.createdAt || '').slice(0, 16).replace('T', ' '),
    })),
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
    attributionStats: null,
    attributions: [],
    withdrawGate: null,
    withdrawAmount: '',
    withdrawing: false,
    withdrawRequests: [],
    wxacodePath: '',
    wxacodeLoading: false,
    wxacodeErr: '',
  },
  onShow() {
    syncPageIdentity(this)
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(PORTAL_URL)
      return
    }
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
      if (/unauthorized|请先登录/i.test(msg)) {
        guestRoutes.redirectToLogin(PORTAL_URL)
        return
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
      const msg = affiliatePortal.wxacodeErrorLabel((e && e.message) || 'wxacode_unavailable')
      this.setData({ wxacodeLoading: false, wxacodeErr: msg })
    }
  },
  onRetryLoad() {
    this.loadPortal()
  },
  onGoApply() {
    wx.navigateTo({ url: APPLY_URL })
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
  onWithdrawAmountInput(e) {
    this.setData({ withdrawAmount: (e.detail && e.detail.value) || '' })
  },
  onWithdrawAll() {
    const wallet = this.data.wallet
    if (!wallet || !wallet.availableYuan) return
    this.setData({ withdrawAmount: wallet.availableYuan })
  },
  async onSubmitWithdraw() {
    const gate = this.data.withdrawGate
    if (!gate || !gate.open) {
      this.setData({ hint: gate && gate.windowHint ? `${gate.windowHint}，当前不可申请` : '当前不在提现申请时段' })
      return
    }
    const yuan = Number(this.data.withdrawAmount)
    if (!Number.isFinite(yuan) || yuan <= 0) {
      this.setData({ hint: '请输入有效提现金额' })
      return
    }
    if (this.data.withdrawing) return
    this.setData({ withdrawing: true, hint: '' })
    try {
      await affiliatePortal.submitWithdraw(Math.round(yuan * 100))
      this.setData({ withdrawAmount: '', hint: '提现申请已提交，请等待运营审核' })
      await this.loadPortal()
    } catch (e) {
      this.setData({ hint: (e && e.message) || '提现申请失败' })
    } finally {
      this.setData({ withdrawing: false })
    }
  },
})
