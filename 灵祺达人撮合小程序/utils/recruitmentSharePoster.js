/**
 * 招募单分享海报：Canvas 绘制 + AI 模版拉取（小程序 offscreen canvas）
 */
const api = require('./api.js')
const posterCore = require('./recruitmentSharePosterCore.js')
const prRecruitQr = require('./prRecruitQr.js')

const POSTER_W = 750
const POSTER_H = 1200

function truncateText(ctx, text, maxWidth) {
  const s = String(text || '')
  if (ctx.measureText(s).width <= maxWidth) return s
  let out = s
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const raw = String(text || '').replace(/\\n/g, '\n')
  const chunks = raw.split('\n')
  const lines = []
  for (let c = 0; c < chunks.length; c += 1) {
    let line = ''
    const chunk = chunks[c]
    for (let i = 0; i < chunk.length; i += 1) {
      const ch = chunk[i]
      const next = line + ch
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line)
        line = ch
        if (lines.length >= maxLines) return lines
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
    if (lines.length >= maxLines) break
  }
  return lines.slice(0, maxLines)
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawQrOnCanvas(ctx, content, x, y, size) {
  const UQRCode = require('./uqrcode.js')
  const qr = new UQRCode()
  qr.data = content
  qr.size = size
  qr.margin = 6
  qr.backgroundColor = '#ffffff'
  qr.foregroundColor = '#1e293b'
  qr.make()
  qr.canvasContext = ctx
  ctx.save()
  ctx.translate(x, y)
  return qr.drawCanvas().then(() => {
    ctx.restore()
  })
}

function renderPosterOnContext(ctx, input, design) {
  const pad = 40
  const cardW = POSTER_W - pad * 2
  const cardH = POSTER_H - pad * 2

  ctx.fillStyle = '#E5E7EB'
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)

  roundRect(ctx, pad, pad, cardW, cardH, 24)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  let y = pad + 36
  const avatarX = pad + 36
  const avatarR = 28
  ctx.fillStyle = design.accentLight
  ctx.beginPath()
  ctx.arc(avatarX, y, avatarR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = design.accentColor
  ctx.font = 'bold 28px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(input.inviterName || '招').slice(0, 1), avatarX, y)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#334155'
  ctx.font = '26px sans-serif'
  ctx.fillText(
    truncateText(ctx, `${input.inviterName}${design.inviterSuffix}`, cardW - 120),
    pad + 84,
    y,
  )
  y += 56

  const heroH = 300
  roundRect(ctx, pad + 24, y, cardW - 48, heroH, 20)
  ctx.fillStyle = design.accentColor
  ctx.fill()

  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.font = 'bold 52px sans-serif'
  const heroLines = wrapLines(ctx, design.heroTitle, cardW - 120, 2)
  const heroStartY = y + heroH / 2 - (heroLines.length - 1) * 30
  for (let i = 0; i < heroLines.length; i += 1) {
    ctx.fillText(heroLines[i], POSTER_W / 2, heroStartY + i * 60)
  }
  if (design.heroSubtitle) {
    ctx.font = '24px sans-serif'
    ctx.fillText(design.heroSubtitle, POSTER_W / 2, y + heroH - 36)
  }
  y += heroH + 28

  ctx.textAlign = 'left'
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 34px sans-serif'
  const titleLines = wrapLines(ctx, input.title, cardW - 48, 2)
  for (let i = 0; i < titleLines.length; i += 1) {
    ctx.fillText(titleLines[i], pad + 24, y + i * 44)
  }
  y += titleLines.length * 44 + 24

  ctx.font = '26px sans-serif'
  for (let r = 0; r < input.rows.length; r += 1) {
    const row = input.rows[r]
    ctx.fillStyle = '#64748B'
    ctx.fillText(`${row.label}：`, pad + 24, y)
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(truncateText(ctx, row.value, cardW - 220), pad + 170, y)
    ctx.font = '26px sans-serif'
    y += 44
  }

  const qrSize = 168
  const qrX = POSTER_W - pad - 24 - qrSize
  const qrY = pad + cardH - qrSize - 72
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16)
  return drawQrOnCanvas(ctx, input.qrUrl, qrX, qrY, qrSize).then(() => {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#64748B'
    ctx.font = '22px sans-serif'
    ctx.fillText('长按识别即可报名', qrX + qrSize / 2, qrY + qrSize + 32)
  })
}

function exportCanvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: POSTER_W,
      height: POSTER_H,
      destWidth: POSTER_W,
      destHeight: POSTER_H,
      fileType: 'png',
      success(res) {
        if (res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('empty_temp'))
      },
      fail(err) {
        try {
          if (typeof canvas.toDataURL === 'function') {
            const m = canvas.toDataURL('image/png').match(/^data:image\/(\w+);base64,(.+)$/i)
            if (m) {
              const dest = `${wx.env.USER_DATA_PATH}/recruit-poster-${Date.now()}.png`
              wx.getFileSystemManager().writeFile({
                filePath: dest,
                data: m[2],
                encoding: 'base64',
                success: () => resolve(dest),
                fail: () => reject(err),
              })
              return
            }
          }
        } catch (_) {
          /* ignore */
        }
        reject(err)
      },
    })
  })
}

function fetchPosterDesign(order) {
  if (!api.hasApi()) {
    const fields = posterCore.extractPosterFieldsFromOrder(order)
    return Promise.resolve({ design: posterCore.defaultPosterDesign(order, fields), source: 'local' })
  }
  return api
    .post('/api/meoo-mp-recruitment-share-poster-design', { order })
    .then((data) => {
      const fields = posterCore.extractPosterFieldsFromOrder(order)
      const fallback = posterCore.defaultPosterDesign(order, fields)
      return {
        design: posterCore.mergePosterDesign(data.design, fallback),
        source: 'ai',
      }
    })
    .catch(() => {
      const fields = posterCore.extractPosterFieldsFromOrder(order)
      return { design: posterCore.defaultPosterDesign(order, fields), source: 'local_fallback' }
    })
}

function buildRecruitmentSharePosterPath(order) {
  const qrUrl = prRecruitQr.buildPrQrScanUrl(order)
  const input = posterCore.buildPosterInput(order, qrUrl)
  return fetchPosterDesign(order).then(({ design }) => {
    let canvas
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: POSTER_W, height: POSTER_H })
    } catch (e) {
      return Promise.reject(e)
    }
    const ctx = canvas.getContext('2d')
    return renderPosterOnContext(ctx, input, design).then(() => exportCanvasToFile(canvas))
  })
}

function savePosterToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail: reject,
    })
  })
}

module.exports = {
  POSTER_W,
  POSTER_H,
  buildRecruitmentSharePosterPath,
  savePosterToAlbum,
  fetchPosterDesign,
}
