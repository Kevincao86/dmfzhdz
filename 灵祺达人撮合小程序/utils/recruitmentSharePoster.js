/**
 * 招募单分享海报：固定模版 Canvas 绘制（小程序 offscreen canvas）
 */
const posterCore = require('./recruitmentSharePosterCore.js')
const posterTemplates = require('./recruitmentSharePosterTemplates.js')
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

function loadCanvasImage(canvas, src) {
  const url = String(src || '').trim()
  if (!url) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    } catch (_) {
      resolve(null)
    }
  })
}

function fillLinearGradient(ctx, x, y, w, h, colors) {
  const list = Array.isArray(colors) && colors.length ? colors : ['#6366F1', '#8B5CF6']
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  const step = 1 / Math.max(1, list.length - 1)
  list.forEach((color, i) => {
    g.addColorStop(i * step, color)
  })
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

function drawHeroDecor(ctx, decor, x, y, w, h) {
  ctx.save()
  if (decor === 'blobs') {
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(x + w * 0.85, y + h * 0.18, w * 0.22, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + w * 0.12, y + h * 0.82, w * 0.18, 0, Math.PI * 2)
    ctx.fill()
  } else if (decor === 'streak') {
    ctx.globalAlpha = 0.16
    ctx.fillStyle = '#FFFFFF'
    ctx.save()
    ctx.translate(x + w * 0.5, y + h * 0.35)
    ctx.rotate(-0.35)
    roundRect(ctx, -w * 0.55, -h * 0.08, w * 1.1, h * 0.16, 24)
    ctx.fill()
    ctx.restore()
  } else if (decor === 'dots') {
    ctx.globalAlpha = 0.22
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i < 18; i += 1) {
      const px = x + ((i * 97) % w)
      const py = y + ((i * 53) % h)
      ctx.beginPath()
      ctx.arc(px, py, 3 + (i % 3), 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (decor === 'stars') {
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i < 24; i += 1) {
      const px = x + ((i * 71) % w)
      const py = y + ((i * 43) % h)
      ctx.beginPath()
      ctx.arc(px, py, 2 + (i % 2), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawTagChips(ctx, labels, x, y, maxWidth) {
  const chips = (labels || []).filter(Boolean).slice(0, 4)
  if (!chips.length) return y
  let cx = x
  const gap = 12
  const padX = 18
  const chipH = 40
  ctx.textBaseline = 'middle'
  ctx.font = '22px sans-serif'
  for (let i = 0; i < chips.length; i += 1) {
    const text = String(chips[i]).slice(0, 8)
    const textW = ctx.measureText(text).width
    const chipW = textW + padX * 2
    if (cx + chipW > x + maxWidth && i > 0) break
    roundRect(ctx, cx, y - chipH / 2, chipW, chipH, chipH / 2)
    ctx.fillStyle = 'rgba(255,255,255,0.24)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.fillText(text, cx + chipW / 2, y)
    cx += chipW + gap
  }
  ctx.textAlign = 'left'
  return y + chipH / 2 + 8
}

function drawQrModules(ctx, content, x, y, size) {
  const UQRCode = require('./uqrcode.js')
  const qr = new UQRCode()
  qr.data = content
  qr.size = size
  qr.margin = 4
  qr.backgroundColor = '#ffffff'
  qr.foregroundColor = '#0f172a'
  qr.make()
  qr.canvasContext = ctx
  ctx.save()
  ctx.translate(x, y)
  return qr.drawCanvas().then(() => {
    ctx.restore()
  })
}

function drawStyledQr(ctx, content, x, y, size, ringColor, centerColor) {
  const pad = 12
  const frame = size + pad * 2
  ctx.save()
  roundRect(ctx, x - pad + 3, y - pad + 5, frame, frame, 18)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'
  ctx.fill()

  roundRect(ctx, x - pad, y - pad, frame, frame, 18)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  roundRect(ctx, x - pad, y - pad, frame, frame, 18)
  ctx.strokeStyle = ringColor || '#6366F1'
  ctx.lineWidth = 5
  ctx.stroke()

  ctx.save()
  roundRect(ctx, x, y, size, size, 10)
  ctx.clip()
  return drawQrModules(ctx, content, x, y, size).then(() => {
    ctx.restore()
    const dotR = Math.max(8, size * 0.085)
    const cx = x + size / 2
    const cy = y + size / 2
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(cx, cy, dotR + 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = centerColor || ringColor || '#6366F1'
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
}

function drawHeroSection(ctx, canvas, input, design, bgImg, platformImg, x, y, w, h) {
  const tmpl = design.template || {}
  roundRect(ctx, x, y, w, h, 20)
  ctx.save()
  ctx.clip()
  if (bgImg) {
    ctx.drawImage(bgImg, x, y, w, h)
  } else {
    fillLinearGradient(ctx, x, y, w, h, tmpl.bgGradient)
    drawHeroDecor(ctx, tmpl.decor, x, y, w, h)
  }
  ctx.restore()

  const iconSize = 56
  const iconX = x + 24
  const iconY = y + 24
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.beginPath()
  ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2 + 4, 0, Math.PI * 2)
  ctx.fill()
  if (platformImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2 - 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(platformImg, iconX, iconY, iconSize, iconSize)
    ctx.restore()
  } else {
    ctx.fillStyle = design.accentColor
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(input.platform || '招').slice(0, 1), iconX + iconSize / 2, iconY + iconSize / 2)
  }

  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.font = 'bold 48px sans-serif'
  const heroLines = wrapLines(ctx, design.heroTitle, w - 120, 2)
  const heroStartY = y + h * 0.42 - (heroLines.length - 1) * 28
  for (let i = 0; i < heroLines.length; i += 1) {
    ctx.fillText(heroLines[i], x + w / 2, heroStartY + i * 56)
  }

  const tags = (design.tags && design.tags.chipLabels) || []
  drawTagChips(ctx, tags, x + 24, y + h - 36, w - 48)
}

function renderPosterOnContext(ctx, canvas, input, design, bgImg, platformImg) {
  const tmpl = design.template || {}
  const pad = 40
  const cardW = POSTER_W - pad * 2
  const cardH = POSTER_H - pad * 2

  ctx.fillStyle = tmpl.outerBg || '#E5E7EB'
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

  const heroH = 280
  const heroX = pad + 24
  const heroW = cardW - 48
  drawHeroSection(ctx, canvas, input, design, bgImg, platformImg, heroX, y, heroW, heroH)
  y += heroH + 24

  ctx.textAlign = 'left'
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 34px sans-serif'
  const titleLines = wrapLines(ctx, input.title, cardW - 48, 2)
  for (let i = 0; i < titleLines.length; i += 1) {
    ctx.fillText(titleLines[i], pad + 24, y + i * 44)
  }
  y += titleLines.length * 44 + 20

  ctx.font = '26px sans-serif'
  for (let r = 0; r < input.rows.length; r += 1) {
    const row = input.rows[r]
    ctx.fillStyle = '#64748B'
    ctx.fillText(`${row.label}：`, pad + 24, y)
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(truncateText(ctx, row.value, cardW - 220), pad + 170, y)
    ctx.font = '26px sans-serif'
    y += 42
  }

  const qrSize = 164
  const qrX = POSTER_W - pad - 24 - qrSize
  const qrY = pad + cardH - qrSize - 68
  const ring = (tmpl.qrRingColor || design.accentColor)
  const center = (tmpl.qrCenterColor || design.accentColor)
  return drawStyledQr(ctx, input.qrUrl, qrX, qrY, qrSize, ring, center).then(() => {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#64748B'
    ctx.font = '22px sans-serif'
    ctx.fillText('长按识别即可报名', qrX + qrSize / 2, qrY + qrSize + 34)
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

function resolvePosterDesign(order, styleIndex) {
  return posterCore.resolvePosterDesign(order, styleIndex)
}

function buildRecruitmentSharePosterPath(order, styleIndex) {
  const qrUrl = prRecruitQr.buildPrQrScanUrl(order)
  const input = posterCore.buildPosterInput(order, qrUrl)
  const design = resolvePosterDesign(order, styleIndex)
  let canvas
  try {
    canvas = wx.createOffscreenCanvas({ type: '2d', width: POSTER_W, height: POSTER_H })
  } catch (e) {
    return Promise.reject(e)
  }
  const ctx = canvas.getContext('2d')
  const tmpl = design.template || {}
  const tags = design.tags || {}
  return Promise.all([
    loadCanvasImage(canvas, tmpl.backgroundUrl),
    loadCanvasImage(canvas, tags.platformIcon),
  ]).then(([bgImg, platformImg]) =>
    renderPosterOnContext(ctx, canvas, input, design, bgImg, platformImg).then(() =>
      exportCanvasToFile(canvas),
    ),
  )
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
  resolvePosterDesign,
  getPosterTemplateCount: posterTemplates.getPosterTemplateCount,
  normalizePosterStyleIndex: posterTemplates.normalizePosterStyleIndex,
}
