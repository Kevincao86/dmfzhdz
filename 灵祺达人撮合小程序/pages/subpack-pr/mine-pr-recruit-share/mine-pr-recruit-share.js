const hub = require('../../../utils/recruitShareHub.js')
const sharePoster = require('../../../utils/recruitmentSharePoster.js')
const mpApplyShortLink = require('../../../utils/mpApplyShortLink.js')
const mpApplyWxacode = require('../../../utils/mpApplyWxacode.js')
const userProfile = require('../../../utils/userProfile.js')

const TABS = [
  { id: 'poster', label: '分享图' },
  { id: 'code', label: '小程序码' },
  { id: 'web', label: '网页链接' },
]
const WEB_MODES = [
  { id: 'link', label: '链接' },
  { id: 'text', label: '文字+链接' },
  { id: 'qr', label: '图文二维码' },
  { id: 'short', label: '小程序短链' },
]

function withOn(list, id, key) {
  return (list || []).map((item) => Object.assign({}, item, { on: item[key || 'id'] === id }))
}

Page({
  data: {
    tabs: TABS,
    tab: 'poster',
    order: null,
    title: '',
    webUrl: '',
    shortLink: '',
    edition: 'normal',
    webModes: withOn(WEB_MODES, 'link'),
    webMode: 'link',
    colors: withOn(hub.POSTER_COLORS, 'sunset'),
    colorId: 'sunset',
    styleIndex: 0,
    sizes: withOn(hub.CODE_SIZES, 'm'),
    sizeId: 'm',
    codePx: 420,
    shapes: withOn(hub.SHAPES, 'round'),
    shapeId: 'round',
    caption: '长按识别小程序码报名',
    showLogo: true,
    showTitle: true,
    showMeta: true,
    showQr: true,
    showBrand: true,
    posterPath: '',
    posterLoading: false,
    posterErr: '',
    codePath: '',
    codeLoading: false,
    codeErr: '',
    qrPath: '',
    qrLoading: false,
  },

  onLoad(query) {
    const payload = hub.readPayload()
    const order = payload && payload.order
    if (!order || !order.id) {
      wx.showToast({ title: '招募单缺失', icon: 'none' })
      return
    }
    const tab = ['poster', 'code', 'web'].indexOf(query && query.tab) >= 0 ? query.tab : 'poster'
    const mode = ['link', 'text', 'qr', 'short'].indexOf(query && query.mode) >= 0 ? query.mode : 'link'
    const color = hub.POSTER_COLORS[0]
    this.setData({
      order,
      title: String(order.title || ''),
      webUrl: hub.recruitmentWebUrl(order.id),
      tab,
      tabs: withOn(TABS, tab),
      webMode: mode,
      webModes: withOn(WEB_MODES, mode),
      colorId: color.id,
      styleIndex: color.index,
      colors: withOn(hub.POSTER_COLORS, color.id),
    })
    this.loadShortLink()
    if (tab === 'poster') this.renderPoster()
    if (tab === 'code') this.renderCode()
    if (tab === 'web' && mode === 'qr') this.renderWebQr()
  },

  loadShortLink() {
    const order = this.data.order
    if (!order) return
    mpApplyShortLink.fetchApplyShortLink(order.id, order.title).then((out) => {
      this.setData({ shortLink: (out && out.link) || hub.shareCopy.buildRecruitmentApplyLink(order.id) })
    })
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.id
    if (!tab || tab === this.data.tab) return
    this.setData({ tab, tabs: withOn(TABS, tab) })
    if (tab === 'poster' && !this.data.posterPath) this.renderPoster()
    if (tab === 'code' && !this.data.codePath) this.renderCode()
    if (tab === 'web' && this.data.webMode === 'qr' && !this.data.qrPath) this.renderWebQr()
  },

  onEdition(e) {
    const edition = e.currentTarget.dataset.id === 'pure' ? 'pure' : 'normal'
    this.setData({ edition })
    if (this.data.webMode === 'qr') this.renderWebQr()
  },

  onWebMode(e) {
    const webMode = e.currentTarget.dataset.id
    if (!webMode) return
    this.setData({ webMode, webModes: withOn(WEB_MODES, webMode) })
    if (webMode === 'qr') this.renderWebQr()
  },

  onColor(e) {
    const id = e.currentTarget.dataset.id
    const hit = hub.POSTER_COLORS.find((c) => c.id === id)
    if (!hit) return
    this.setData(
      {
        colorId: hit.id,
        styleIndex: hit.index,
        colors: withOn(hub.POSTER_COLORS, hit.id),
        posterPath: '',
        qrPath: '',
      },
      () => {
        if (this.data.tab === 'poster') this.renderPoster()
        if (this.data.tab === 'web' && this.data.webMode === 'qr') this.renderWebQr()
      },
    )
  },

  onSize(e) {
    const id = e.currentTarget.dataset.id
    const hit = hub.CODE_SIZES.find((s) => s.id === id)
    if (!hit) return
    this.setData({ sizeId: hit.id, codePx: hit.px, sizes: withOn(hub.CODE_SIZES, hit.id) })
  },

  onShape(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ shapeId: id, shapes: withOn(hub.SHAPES, id), posterPath: '' }, () => {
      if (this.data.tab === 'poster') this.renderPoster()
    })
  },

  onCaption(e) {
    this.setData({ caption: String(e.detail.value || '').slice(0, 24) })
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    if (!key || !Object.prototype.hasOwnProperty.call(this.data, key)) return
    const patch = { posterPath: '' }
    patch[key] = !this.data[key]
    this.setData(patch, () => {
      if (this.data.tab === 'poster') this.renderPoster()
    })
  },

  posterOpts() {
    const shape = hub.SHAPES.find((s) => s.id === this.data.shapeId) || hub.SHAPES[1]
    const radius = shape.id === 'round' ? 48 : shape.id === 'square' ? 0 : 24
    return {
      cardRadius: radius,
      visibility: {
        brand: this.data.showLogo && this.data.showBrand,
        title: this.data.showTitle,
        meta: this.data.showMeta,
        qr: this.data.showQr,
      },
    }
  },

  renderPoster() {
    const order = this.data.order
    if (!order) return
    const seq = (this._posterSeq || 0) + 1
    this._posterSeq = seq
    this.setData({ posterLoading: true, posterErr: '' })
    sharePoster
      .buildRecruitmentSharePosterPath(order, this.data.styleIndex, this.posterOpts())
      .then((path) => {
        if (this._posterSeq !== seq) return
        this.setData({ posterPath: path, posterLoading: false })
      })
      .catch((err) => {
        if (this._posterSeq !== seq) return
        this.setData({
          posterLoading: false,
          posterErr: String((err && err.message) || '海报生成失败').slice(0, 40),
        })
      })
  },

  renderCode() {
    const order = this.data.order
    if (!order) return
    this.setData({ codeLoading: true, codeErr: '' })
    mpApplyWxacode
      .fetchApplyWxacodeDataUrl(order.id)
      .then((dataUrl) => {
        if (!dataUrl) throw new Error('小程序码生成失败')
        return writeDataUrl(dataUrl)
      })
      .then((path) => this.setData({ codePath: path, codeLoading: false }))
      .catch((err) => {
        this.setData({
          codeLoading: false,
          codeErr: String((err && err.message) || '小程序码生成失败').slice(0, 40),
        })
      })
  },

  renderWebQr() {
    const url = this.data.webUrl
    const color = (hub.POSTER_COLORS.find((c) => c.id === this.data.colorId) || hub.POSTER_COLORS[0]).color
    if (!url) return
    this.setData({ qrLoading: true })
    drawLinkCard(url, this.data.title, color, this.data.edition)
      .then((path) => this.setData({ qrPath: path, qrLoading: false }))
      .catch(() => this.setData({ qrLoading: false, qrPath: '' }))
  },

  currentCopyText() {
    const order = this.data.order
    const edition = this.data.edition
    if (this.data.webMode === 'short') {
      return hub.buildShortShareText(order, this.data.shortLink, edition)
    }
    if (this.data.webMode === 'text') {
      if (edition === 'pure') return hub.buildWebShareText(order, this.data.webUrl, 'pure')
      return hub.shareCopy.buildGroupCopyText(order, userProfile.readPrProfile(), this.data.webUrl)
    }
    if (edition === 'pure') return this.data.webUrl
    return hub.buildWebShareText(order, this.data.webUrl, 'normal')
  },

  onPrimary() {
    if (this.data.tab === 'poster') this.onSavePoster()
    else if (this.data.tab === 'code') this.onSaveCode()
    else this.onCopy()
  },

  onCopy() {
    if (this.data.webMode === 'qr') {
      this.onSaveQr()
      return
    }
    const data = this.currentCopyText()
    if (!data) {
      wx.showToast({ title: '链接生成中', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    })
  },

  onSavePoster() {
    saveImage(this.data.posterPath)
  },
  onSaveCode() {
    saveImage(this.data.codePath)
  },
  onSaveQr() {
    saveImage(this.data.qrPath)
  },
})

function writeDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/i)
  if (!m) return Promise.reject(new Error('小程序码无效'))
  const ext = String(m[1]).toLowerCase() === 'jpeg' ? 'jpg' : 'png'
  const dest = `${wx.env.USER_DATA_PATH}/share-code-${Date.now()}.${ext}`
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath: dest,
      data: m[2],
      encoding: 'base64',
      success: () => resolve(dest),
      fail: () => reject(new Error('小程序码保存失败')),
    })
  })
}

function drawLinkCard(url, title, color, edition) {
  const W = 600
  const H = edition === 'pure' ? 640 : 760
  const canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H })
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = color
  ctx.lineWidth = 16
  ctx.strokeRect(8, 8, W - 16, H - 16)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 32px sans-serif'
  ctx.textAlign = 'center'
  const name = String(title || '招募').slice(0, 18)
  if (edition !== 'pure') ctx.fillText(name, W / 2, 72)
  const UQRCode = require('../../../utils/uqrcode.js')
  const qr = new UQRCode()
  qr.data = url
  qr.size = 420
  qr.margin = 8
  qr.backgroundColor = '#ffffff'
  qr.foregroundColor = color
  qr.make()
  qr.canvasContext = ctx
  ctx.save()
  ctx.translate(90, edition === 'pure' ? 80 : 110)
  qr.drawCanvas()
  ctx.restore()
  if (edition !== 'pure') {
    ctx.fillStyle = '#64748b'
    ctx.font = '24px sans-serif'
    ctx.fillText('扫码查看招募并报名', W / 2, H - 48)
  }
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      width: W,
      height: H,
      destWidth: W,
      destHeight: H,
      fileType: 'png',
      success: (res) => (res.tempFilePath ? resolve(res.tempFilePath) : reject(new Error('empty'))),
      fail: reject,
    })
  })
}

function saveImage(path) {
  if (!path) {
    wx.showToast({ title: '图片还在生成', icon: 'none' })
    return
  }
  wx.saveImageToPhotosAlbum({
    filePath: path,
    success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
    fail: (err) => {
      const msg = String((err && err.errMsg) || '')
      if (/auth deny|authorize/i.test(msg)) {
        wx.showModal({ title: '需要相册权限', content: '请在设置中允许保存到相册。', showCancel: false })
        return
      }
      wx.showToast({ title: '保存失败', icon: 'none' })
    },
  })
}
