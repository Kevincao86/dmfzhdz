const mpShare = require('../../utils/mpShare.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
const recruitShareCover = require('../../utils/recruitShareCover.js')
const { buildTimelineSharePayload } = require('../../utils/shareTimelinePayload.js')

Page({
  data: {
    id: '',
    title: '',
    shareCoverPath: '',
    mpOrder: null,
  },
  onLoad(options) {
    const id = String(options && options.id ? decodeURIComponent(options.id) : '').trim()
    const title = String(options && options.title ? decodeURIComponent(options.title) : '').trim()
    this.setData({
      id,
      title: title || '招募分享',
    })
    mpShare.enableShareMenu()
    if (id) void this.preloadOrder(id)
  },
  onShow() {
    mpShare.enableShareMenu()
    if (this.data.id && wx.onCopyUrl) {
      const id = this.data.id
      wx.onCopyUrl(() => ({ query: `id=${encodeURIComponent(id)}` }))
    }
  },
  onUnload() {
    if (wx.offCopyUrl) wx.offCopyUrl()
  },
  async preloadOrder(id) {
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [id], includeLocalContext: true })
      const mp = ops.findMpOrderInRegistry(reg, id)
      if (!mp) return
      const patch = { mpOrder: mp }
      if (!this.data.title || this.data.title === '招募分享') {
        patch.title = String(mp.title || mp.customerName || '招募分享').trim()
      }
      this.setData(patch)
      const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
      const path = await recruitShareCover.preloadShareImageUrl(coverUrl)
      if (recruitShareCover.isLocalSharePath(path)) {
        this.setData({ shareCoverPath: path })
      }
    } catch (_) {
      /* ignore preload */
    }
  },
  onShareTimeline() {
    mpShare.enableShareMenu()
    return buildTimelineSharePayload({
      id: this.data.id,
      title: this.data.title,
      shareCoverPath: this.data.shareCoverPath,
      mp: this.data.mpOrder,
    })
  },
  onGoBack() {
    wx.navigateBack()
  },
})
