const hub = require('../../../utils/recruitShareHub.js')
const themes = require('../../../utils/recruitShareThemes.js')
const posterAssets = require('../../../utils/recruitPosterAssets.js')
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

function monthChips(active) {
  const list = []
  for (let id = 1; id <= 12; id += 1) list.push({ id, label: `${id}月`, on: id === active })
  return list
}

function themeChips(month, themeId) {
  return withOn(themes.themesInMonth(month), themeId)
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
    themeMonth: new Date().getMonth() + 1,
    months: monthChips(new Date().getMonth() + 1),
    themes: themeChips(new Date().getMonth() + 1, ''),
    themeId: '',
    styleIndex: 0,
    sizes: withOn(hub.CODE_SIZES, 'm'),
    sizeId: 'm',
    codePx: 420,
    shapes: withOn(hub.SHAPES, 'soft'),
    shapeId: 'soft',
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
        themeId: '',
        themes: themeChips(this.data.themeMonth, ''),
        posterPath: '',
        qrPath: '',
        codePath: '',
      },
      () => this.rerenderCurrent(),
    )
  },

  onThemeMonth(e) {
    const month = Number(e.currentTarget.dataset.month)
    if (!month || month === this.data.themeMonth) return
    this.setData({
      themeMonth: month,
      months: monthChips(month),
      themes: themeChips(month, this.data.themeId),
    })
  },

  onTheme(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    this.setData(
      {
        themeId: id,
        themes: themeChips(this.data.themeMonth, id),
        posterPath: '',
        qrPath: '',
        codePath: '',
      },
      () => this.rerenderCurrent(),
    )
  },

  rerenderCurrent() {
    if (this.data.tab === 'poster') this.renderPoster()
    else if (this.data.tab === 'code') this.renderCode()
    else if (this.data.webMode === 'qr') this.renderWebQr()
  },

  onSize(e) {
    const id = e.currentTarget.dataset.id
    const hit = hub.CODE_SIZES.find((s) => s.id === id)
    if (!hit) return
    this.setData({ sizeId: hit.id, codePx: hit.px, sizes: withOn(hub.CODE_SIZES, hit.id), codePath: '' }, () => {
      if (this.data.tab === 'code') this.renderCode()
    })
  },

  onShape(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({ shapeId: id, shapes: withOn(hub.SHAPES, id), posterPath: '', codePath: '' }, () => {
      if (this.data.tab === 'poster') this.renderPoster()
      if (this.data.tab === 'code') this.renderCode()
    })
  },

  onCaption(e) {
    this.setData({ caption: String(e.detail.value || '').slice(0, 24) })
  },
  onCaptionDone() {
    if (this.data.tab === 'code') this.renderCode()
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    if (!key || !Object.prototype.hasOwnProperty.call(this.data, key)) return
    const patch = { posterPath: '' }
    patch[key] = !this.data[key]
    this.setData(patch, () => {
      if (this.data.tab === 'poster') this.renderPoster()
      if (this.data.tab === 'code' && (key === 'showLogo' || key === 'showBrand')) this.renderCode()
    })
  },

  posterOpts() {
    const shape = hub.SHAPES.find((s) => s.id === this.data.shapeId) || hub.SHAPES[1]
    const theme = themes.findTheme(this.data.themeId)
    const color = hub.POSTER_COLORS.find((c) => c.id === this.data.colorId) || hub.POSTER_COLORS[0]
    const radius = shape.id === 'round' ? 72 : shape.id === 'square' ? 0 : 28
    return {
      cardRadius: radius,
      heroRadius: shape.id === 'round' ? 40 : shape.id === 'square' ? 0 : 16,
      theme,
      accentColor: theme ? '' : color.color,
      accentSoft: mixWhite(color.color, 0.38),
      accentLight: mixWhite(color.color, 0.84),
      visibility: {
        brand: !!this.data.showBrand,
        logo: !!this.data.showLogo,
        title: !!this.data.showTitle,
        meta: !!this.data.showMeta,
        qr: !!this.data.showQr,
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
    const seq = (this._codeSeq || 0) + 1
    this._codeSeq = seq
    const color = (hub.POSTER_COLORS.find((c) => c.id === this.data.colorId) || hub.POSTER_COLORS[0]).color
    const codeSize = this.data.sizeId === 's' ? 260 : this.data.sizeId === 'l' ? 460 : 360
    this.setData({ codeLoading: true, codeErr: '' })
    mpApplyWxacode
      .fetchApplyWxacodeDataUrl(order.id)
      .then((dataUrl) => {
        if (!dataUrl) throw new Error('小程序码生成失败')
        return writeDataUrl(dataUrl)
      })
      .then((filePath) =>
        drawCodeCard({
          filePath,
          theme: themes.findTheme(this.data.themeId),
          color,
          shapeId: this.data.shapeId,
          codeSize,
          caption: this.data.caption,
          showLogo: this.data.showLogo,
        }),
      )
      .then((path) => {
        if (this._codeSeq !== seq) return
        this.setData({ codePath: path, codeLoading: false })
      })
      .catch((err) => {
        if (this._codeSeq !== seq) return
        this.setData({
          codeLoading: false,
          codeErr: String((err && err.message) || '小程序码生成失败').slice(0, 40),
        })
      })
  },

  renderWebQr() {
    const url = this.data.webUrl
    if (!url) return
    this.setData({ qrLoading: true })
    drawLinkCard(url, this.data.title, themes.findTheme(this.data.themeId), this.data.edition)
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

function mixWhite(hex, t) {
  const n = parseInt(String(hex || '').replace('#', ''), 16)
  if (!Number.isFinite(n)) return '#FFFFFF'
  const ch = (c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

function exportCanvas(canvas, W, H, name) {
  const dest = `${wx.env.USER_DATA_PATH}/${name}-${Date.now()}.png`
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      width: W,
      height: H,
      destWidth: W,
      destHeight: H,
      fileType: 'png',
      success: (res) => {
        if (!res.tempFilePath) {
          reject(new Error('empty'))
          return
        }
        wx.getFileSystemManager().copyFile({
          srcPath: res.tempFilePath,
          destPath: dest,
          success: () => resolve(dest),
          fail: () => resolve(res.tempFilePath),
        })
      },
      fail: reject,
    })
  })
}

function loadRemoteImage(canvas, urls) {
  const list = (urls || []).filter(Boolean)
  return new Promise((resolve) => {
    const next = (index) => {
      if (index >= list.length) {
        resolve(null)
        return
      }
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => next(index + 1)
      img.src = list[index]
    }
    next(0)
  })
}

function drawCodeCard(opts) {
  const codeSize = opts.codeSize
  const inset = 36
  const side = codeSize + inset * 2
  const canvas = wx.createOffscreenCanvas({ type: '2d', width: side, height: side })
  const ctx = canvas.getContext('2d')
  const urls = opts.theme ? posterAssets.festivalAssetCandidates(`festival-${opts.theme.id}.jpg`) : []
  return loadRemoteImage(canvas, urls).then((bg) => {
    if (opts.theme) {
      if (bg) themes.drawCover(ctx, bg, 0, 0, side, side)
      else themes.paintPosterChrome(ctx, opts.theme, side, side)
    } else {
      ctx.fillStyle = opts.color
      ctx.fillRect(0, 0, side, side)
    }
    return new Promise((resolve, reject) => {
      const img = canvas.createImage()
      img.onload = () => {
        const x = inset + 8
        const y = inset + 8
        const inner = side - inset * 2 - 16
        const shot = themes.captureTheme(ctx, x, y, inner, inner)
        ctx.save()
        themes.clipShape(ctx, x, y, inner, opts.shapeId)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillRect(x, y, inner, inner)
        ctx.drawImage(img, x, y, inner, inner)
        ctx.restore()
        if (shot && shot.reveal) shot.reveal(0.1)
        exportCanvas(canvas, side, side, 'share-code').then(resolve).catch(reject)
      }
      img.onerror = () => reject(new Error('小程序码图片无效'))
      img.src = opts.filePath
    })
  })
}

function drawLinkCard(url, title, theme, edition) {
  const W = 640
  const H = 780
  const qrSize = 400
  const canvas = wx.createOffscreenCanvas({ type: '2d', width: W, height: H })
  const ctx = canvas.getContext('2d')
  const accent = theme ? theme.accent : '#EA580C'
  const titleH = edition === 'pure' ? 0 : 64
  const capH = edition === 'pure' ? 0 : 40
  const top = Math.round((H - (titleH + qrSize + capH)) / 2)
  const qx = Math.round((W - qrSize) / 2)
  const qy = top + titleH
  const urls = theme ? posterAssets.festivalAssetCandidates(`festival-${theme.id}.jpg`) : []
  return loadRemoteImage(canvas, urls).then((bg) => {
    if (theme) {
      if (bg) themes.drawCover(ctx, bg, 0, 0, W, H)
      else themes.paintPosterChrome(ctx, theme, W, H)
    } else {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = accent
      ctx.lineWidth = 14
      ctx.strokeRect(18, 18, W - 36, H - 36)
    }
    const shot = themes.captureTheme(ctx, qx, qy, qrSize, qrSize)
    if (theme) {
      themes.roundRect(ctx, 28, 28, W - 56, H - 56, 24)
      ctx.fillStyle = 'rgba(255,255,255,0.62)'
      ctx.fill()
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (edition !== 'pure') {
      ctx.fillStyle = '#0F172A'
      ctx.font = 'bold 30px sans-serif'
      ctx.fillText(String(title || '招募').slice(0, 16), W / 2, top + 20)
    }
    const UQRCode = require('../../../utils/uqrcode.js')
    const qr = new UQRCode()
    qr.data = url
    qr.size = qrSize
    qr.margin = 0
    qr.backgroundColor = '#ffffff'
    qr.foregroundColor = '#0F172A'
    qr.make()
    qr.canvasContext = ctx
    ctx.save()
    ctx.translate(qx, qy)
    return Promise.resolve(qr.drawCanvas()).then(() => {
      ctx.restore()
      shot.reveal(0.48)
      if (edition !== 'pure') {
        ctx.fillStyle = '#334155'
        ctx.font = '24px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('扫码查看招募并报名', W / 2, qy + qrSize + 28)
      }
      return exportCanvas(canvas, W, H, 'share-qr')
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
