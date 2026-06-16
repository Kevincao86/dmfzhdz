const ops = require('../../utils/opsRegistryTalentMp.js')
const mpGroupQr = require('../../utils/mpGroupQr.js')
const { syncPageIdentity } = require('../../utils/pageIdentityChrome.js')

Page({
  data: {
    id: '',
    title: '',
    groupQrImage: '',
    loading: true,
    err: '',
    lqThemeClass: '',
  },
  onLoad(options) {
    syncPageIdentity(this)
    const id = String((options && options.id) || '').trim()
    const title = decodeURIComponent(String((options && options.title) || ''))
    this.setData({ id, title })
    if (!id) {
      this.setData({ loading: false, err: '缺少招募单号' })
      return
    }
    void this.loadQr(id)
  },
  async loadQr(id) {
    this.setData({ loading: true, err: '' })
    try {
      let groupQrImage = ''
      let title = this.data.title

      const direct = await ops.fetchFormRelayGroupQr(id)
      if (direct && direct.groupQrImage) {
        groupQrImage = direct.groupQrImage
        if (direct.title) title = direct.title
      }

      if (!groupQrImage) {
        const reg = await ops.fetchRegistry({ includeMpOrderIds: [id], skipCache: true })
        groupQrImage = mpGroupQr.groupQrFromRegistry(reg, id)
      }

      if (!groupQrImage) {
        const local = mpGroupQr.readLocalGroupQr(id)
        if (local) groupQrImage = local
      }

      if (!groupQrImage) {
        this.setData({
          loading: false,
          groupQrImage: '',
          err: '群二维码加载失败，请稍后重试或联系发单方补传群码',
        })
        return
      }
      this.setData({ loading: false, groupQrImage, title, err: '' })
    } catch (e) {
      this.setData({
        loading: false,
        err: String((e && e.message) || e || '加载失败'),
      })
    }
  },
  onPreviewQr() {
    const url = String(this.data.groupQrImage || '').trim()
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
})
