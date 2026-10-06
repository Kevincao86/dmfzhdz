const api = require('../../utils/api.js')
const affiliate = require('../../utils/merchantAffiliateMp.js')

function yuan(cents) {
  return (Math.max(0, Number(cents) || 0) / 100).toFixed(2)
}

Page({
  data: {
    booting: true,
    submitting: false,
    active: false,
    realName: '',
    phone: '',
    err: '',
    info: '',
    refCode: '',
    commissionHint: '',
    wxacodePath: '',
    wxacodeLoading: false,
    wxacodeErr: '',
    linkRows: [],
    wallet: null,
  },
  onShow() {
    if (!api.isRealAuthed()) {
      api.requireRealAuth('/pages/affiliate/affiliate')
      return
    }
    this.boot()
  },
  async boot() {
    this.setData({
      booting: true,
      err: '',
      phone: this.data.phone || affiliate.readLoginPhone(),
    })
    try {
      const data = await affiliate.fetchMine()
      const row = data.affiliate || null
      if (row && row.status === 'active') {
        await this.showPortal()
        return
      }
      this.setData({
        active: false,
        info: row && row.status === 'disabled' ? '推广员已停用，请联系运营。' : '',
      })
    } catch (e) {
      this.setData({ err: (e && e.message) || '加载失败' })
    } finally {
      this.setData({ booting: false })
    }
  },
  async showPortal() {
    const portal = await affiliate.fetchPortal()
    const row = portal.affiliate || {}
    const links = portal.promoLinks || null
    const wallet = portal.wallet
    this.setData({
      booting: false,
      active: true,
      refCode: row.refCode || '',
      commissionHint: portal.commissionHint || '',
      linkRows: links
        ? [
            { key: 'cs', label: '商家注册', url: links.cs },
            { key: 'drTalent', label: '星选达人注册', url: links.drTalent },
            { key: 'drPr', label: '星选 PR 注册', url: links.drPr },
          ]
        : [],
      wallet: wallet
        ? {
            availableYuan: yuan(wallet.availableCents),
            withdrawnYuan: yuan(wallet.withdrawnCents),
          }
        : null,
    })
    this.loadQr()
  },
  async loadQr() {
    this.setData({ wxacodeLoading: true, wxacodeErr: '' })
    try {
      const path = await affiliate.fetchWxacodePath()
      this.setData({ wxacodePath: path, wxacodeLoading: false })
    } catch (e) {
      this.setData({
        wxacodeLoading: false,
        wxacodeErr: (e && e.message) || '二维码生成失败',
      })
    }
  },
  onRealName(e) {
    this.setData({ realName: e.detail.value })
  },
  onPhone(e) {
    this.setData({ phone: String(e.detail.value || '').replace(/\D/g, '').slice(0, 11) })
  },
  async onApply() {
    this.setData({ submitting: true, err: '', info: '' })
    try {
      const data = await affiliate.applyAffiliate({
        realName: this.data.realName,
        phone: this.data.phone,
      })
      if (data && data.affiliate && data.affiliate.status === 'active') {
        wx.showToast({ title: '已成为推广员', icon: 'success' })
        await this.showPortal()
        return
      }
      this.setData({ info: '已提交' })
    } catch (e) {
      if (e && (e.code === 'already_active' || (e.affiliate && e.affiliate.status === 'active'))) {
        await this.showPortal()
        return
      }
      this.setData({ err: (e && e.message) || '申请失败' })
    } finally {
      this.setData({ submitting: false })
    }
  },
  onCopyCode() {
    if (!this.data.refCode) return
    wx.setClipboardData({ data: this.data.refCode })
  },
  onCopyLink(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.setClipboardData({ data: url })
  },
  onSaveQr() {
    if (!this.data.wxacodePath) return
    wx.saveImageToPhotosAlbum({
      filePath: this.data.wxacodePath,
      fail: () => wx.showToast({ title: '请长按二维码保存', icon: 'none' }),
    })
  },
})
