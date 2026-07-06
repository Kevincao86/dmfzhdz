const { prepareXingxuanSubPage } = require('../../../utils/pageIdentityChrome.js')
const oaBind = require('../../../utils/mpWechatOaBindApi.js')
const participant = require('../../../utils/participant.js')
const auth = require('../../../utils/auth.js')

Page({
  data: {
    loading: true,
    bound: false,
    oaDisplayName: '灵祺星选',
    qrUrl: '',
    expiresAt: '',
    polling: false,
    creating: false,
    talentMemberId: '',
  },

  _pollTimer: null,

  async onShow() {
    const ready = await prepareXingxuanSubPage(this)
    if (!ready) return
    await this.refreshStatus()
  },

  onHide() {
    this.stopPoll()
  },

  onUnload() {
    this.stopPoll()
  },

  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
    this.setData({ polling: false })
  },

  talentId() {
    const acct = auth.readAccount()
    return String((acct && acct.registryMemberId) || participant.resolveTalentMemberId() || '').trim()
  },

  async refreshStatus() {
    const talentMemberId = this.talentId()
    if (!talentMemberId) {
      this.setData({ loading: false, bound: false })
      return
    }
    this.setData({ loading: true, talentMemberId })
    try {
      const res = await oaBind.getStatus(talentMemberId)
      const bound = !!res.bound
      this.setData({
        loading: false,
        bound,
        oaDisplayName: res.oaDisplayName || '灵祺星选',
        boundAt: res.boundAt || '',
      })
      if (bound) this.stopPoll()
      return bound
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
      return false
    }
  },

  startPoll() {
    this.stopPoll()
    this.setData({ polling: true })
    this._pollTimer = setInterval(() => {
      this.refreshStatus()
    }, 3000)
  },

  async onCreateQr() {
    const talentMemberId = this.talentId()
    if (!talentMemberId) {
      wx.showToast({ title: '请先完善达人资料', icon: 'none' })
      return
    }
    this.setData({ creating: true })
    try {
      const res = await oaBind.createTicket(talentMemberId)
      this.setData({
        creating: false,
        qrUrl: res.qrUrl || '',
        expiresAt: res.expiresAt || '',
        oaDisplayName: res.oaDisplayName || this.data.oaDisplayName,
      })
      this.startPoll()
    } catch (e) {
      this.setData({ creating: false })
      wx.showToast({ title: e.message || '获取二维码失败', icon: 'none' })
    }
  },

  onPreviewQr() {
    const url = String(this.data.qrUrl || '').trim()
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },

  onLongPressQr() {
    const url = String(this.data.qrUrl || '').trim()
    if (!url) return
    wx.showActionSheet({
      itemList: ['保存二维码到相册'],
      success: (res) => {
        if (res.tapIndex !== 0) return
        wx.downloadFile({
          url,
          success: (dl) => {
            wx.saveImageToPhotosAlbum({
              filePath: dl.tempFilePath,
              success: () => wx.showToast({ title: '已保存', icon: 'success' }),
              fail: () => wx.showToast({ title: '保存失败，请长按识别', icon: 'none' }),
            })
          },
          fail: () => wx.showToast({ title: '下载失败', icon: 'none' }),
        })
      },
    })
  },
})
