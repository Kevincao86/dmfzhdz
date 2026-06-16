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
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [id] })
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const mp = mpList.find((o) => o && String(o.id) === id)
      const groupQrImage = mpGroupQr.groupQrFromRegistry(reg, id, mp)
      if (!groupQrImage) {
        this.setData({ loading: false, groupQrImage: '', err: '群二维码暂不可用' })
        return
      }
      this.setData({ loading: false, groupQrImage, err: '' })
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
