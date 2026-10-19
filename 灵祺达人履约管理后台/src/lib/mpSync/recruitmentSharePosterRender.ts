/**
 * 招募单分享海报 Canvas 绘制（Web / Node）
 */
import type { PosterDesignTokens, PosterInput } from './recruitmentSharePosterCore'
import { posterBackgroundCandidates } from './recruitmentPosterAssets'

export const POSTER_W = 750
export const POSTER_H = 1200
const QR_FRAME_SIZE = 200
const QR_INNER_RATIO = 0.72

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const s = String(text || '')
  if (ctx.measureText(s).width <= maxWidth) return s
  let out = s
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const raw = String(text || '').replace(/\\n/g, '\n')
  const chunks = raw.split('\n')
  const lines: string[] = []
  for (const chunk of chunks) {
    let line = ''
    for (const ch of chunk) {
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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function loadPosterBackground(tmpl: {
  backgroundFile?: string
  backgroundUrl?: string
}): Promise<HTMLImageElement | null> {
  const candidates = posterBackgroundCandidates(tmpl)
  for (const url of candidates) {
    const img = await loadImage(url)
    if (img) return img
  }
  return null
}

function fillLinearGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: string[],
) {
  const list = colors.length ? colors : ['#6366F1', '#8B5CF6']
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  const step = 1 / Math.max(1, list.length - 1)
  list.forEach((color, i) => {
    g.addColorStop(i * step, color)
  })
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

function drawHeroDecor(ctx: CanvasRenderingContext2D, decor: string, x: number, y: number, w: number, h: number) {
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
      ctx.beginPath()
      ctx.arc(x + ((i * 97) % w), y + ((i * 53) % h), 3 + (i % 3), 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (decor === 'stars') {
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i < 24; i += 1) {
      ctx.beginPath()
      ctx.arc(x + ((i * 71) % w), y + ((i * 43) % h), 2 + (i % 2), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawTagChips(ctx: CanvasRenderingContext2D, labels: string[], x: number, y: number, maxWidth: number) {
  const chips = labels.filter(Boolean).slice(0, 4)
  if (!chips.length) return
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
}

function drawHeroSection(
  ctx: CanvasRenderingContext2D,
  input: PosterInput,
  design: PosterDesignTokens,
  bgImg: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const tmpl = design.template
  roundRect(ctx, x, y, w, h, 20)
  ctx.save()
  ctx.clip()
  if (bgImg && !design.forceGradientHero) {
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
  ctx.fillStyle = design.accentColor
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(input.platform || '招').slice(0, 1), iconX + iconSize / 2, iconY + iconSize / 2)

  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.font = 'bold 48px sans-serif'
  const heroLines = wrapLines(ctx, design.heroTitle, w - 120, 2)
  const heroStartY = y + h * 0.42 - (heroLines.length - 1) * 28
  heroLines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, heroStartY + i * 56)
  })

  drawTagChips(ctx, design.tags.chipLabels, x + 24, y + h - 36, w - 48)
}

function drawBlessingSticker(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const source = img as HTMLImageElement
  const iw = Number(source.width) || 0
  const ih = Number(source.height) || 0
  if (!iw || !ih || w < 40 || h < 40) return false
  const scale = Math.min(w / iw, h / ih)
  const dw = Math.max(1, Math.round(iw * scale))
  const dh = Math.max(1, Math.round(ih * scale))
  const dx = Math.round(x)
  const dy = Math.round(y + Math.max(0, h - dh))
  const theme = ctx.getImageData(dx, dy, dw, dh)
  ctx.drawImage(img, dx, dy, dw, dh)
  tintWhitesWithTheme(ctx, theme, dx, dy, dw, dh, 1)
  return true
}

function drawFestivalBlessing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const blessing = String(text || '').trim()
  if (!blessing) return
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 40px sans-serif'
  const lines = wrapLines(ctx, blessing, w - 8, 2)
  const lineH = 52
  const startY = y + h / 2 - ((lines.length - 1) * lineH) / 2
  ctx.lineWidth = 8
  ctx.strokeStyle = 'rgba(255,255,255,0.94)'
  ctx.fillStyle = '#0F172A'
  lines.forEach((line, i) => {
    const ly = startY + i * lineH
    ctx.strokeText(line, x, ly)
    ctx.fillText(line, x, ly)
  })
  ctx.restore()
}

function readableOnLight(hex: string): string {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return '#0F172A'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? '#0F172A' : `#${m[1]}`
}

function drawFooterPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  panel: { slogan?: string; highlights?: string[] },
  design: PosterDesignTokens,
) {
  const slogan = String(panel?.slogan || '').trim()
  const highlights = Array.isArray(panel?.highlights)
    ? panel!.highlights!.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3)
    : []
  if (!slogan && !highlights.length) return

  const accent = design.accentColor || '#6366F1'

  roundRect(ctx, x, y, w, h, 18)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  ctx.fill()
  roundRect(ctx, x, y, w, h, 18)
  ctx.strokeStyle = `${accent}33`
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.save()
  ctx.globalAlpha = 0.1
  ctx.beginPath()
  ctx.arc(x + w - 24, y + 24, 36, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.globalAlpha = 0.06
  ctx.beginPath()
  ctx.arc(x + 32, y + h - 20, 48, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  let textY = y + 38
  if (slogan) {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = readableOnLight(accent)
    ctx.font = 'bold 26px sans-serif'
    const lines = wrapLines(ctx, slogan, w - 32, 2)
    lines.forEach((line, i) => {
      ctx.fillText(line, x + 16, textY + i * 32)
    })
    textY += lines.length * 32 + 8
  }

  if (highlights.length) {
    let chipX = x + 16
    const chipY = textY
    const gap = 10
    const chipH = 34
    ctx.font = '22px sans-serif'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < highlights.length; i += 1) {
      const text = String(highlights[i]).slice(0, 8)
      const textW = ctx.measureText(text).width
      const chipW = textW + 24
      if (chipX + chipW > x + w - 12 && i > 0) break
      roundRect(ctx, chipX, chipY - chipH / 2, chipW, chipH, chipH / 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.strokeStyle = `${accent}44`
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#0F172A'
      ctx.textAlign = 'center'
      ctx.fillText(text, chipX + chipW / 2, chipY + 1)
      chipX += chipW + gap
    }
  }
}

function drawDetailSection(
  ctx: CanvasRenderingContext2D,
  detailText: string,
  x: number,
  y: number,
  maxW: number,
  maxLines: number,
): number {
  const text = String(detailText || '').trim()
  if (!text) return y
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#64748B'
  ctx.font = '26px sans-serif'
  ctx.fillText('招募详情：', x, y)
  let nextY = y + 36
  ctx.fillStyle = '#334155'
  ctx.font = '24px sans-serif'
  const lines = wrapLines(ctx, text, maxW, maxLines)
  lines.forEach((line, i) => {
    ctx.fillText(line, x, nextY + i * 32)
  })
  return nextY + lines.length * 32 + 8
}

function drawWxMiniProgramCode(
  ctx: CanvasRenderingContext2D,
  qrImage: CanvasImageSource,
  x: number,
  y: number,
  size: number,
) {
  const cx = x + size / 2
  const cy = y + size / 2
  const outerR = size / 2 + 10

  ctx.save()
  ctx.shadowColor = 'rgba(15, 23, 42, 0.12)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  ctx.beginPath()
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()

  ctx.drawImage(qrImage, x, y, size, size)
}

function tintWhitesWithTheme(
  ctx: CanvasRenderingContext2D,
  theme: ImageData,
  x: number,
  y: number,
  w: number,
  h: number,
  mix: number,
) {
  const now = ctx.getImageData(x, y, w, h)
  const src = theme.data
  const dst = now.data
  for (let i = 0; i < dst.length; i += 4) {
    if (dst[i] > 228 && dst[i + 1] > 228 && dst[i + 2] > 228) {
      dst[i] = Math.round(dst[i] * (1 - mix) + src[i] * mix)
      dst[i + 1] = Math.round(dst[i + 1] * (1 - mix) + src[i + 1] * mix)
      dst[i + 2] = Math.round(dst[i + 2] * (1 - mix) + src[i + 2] * mix)
      dst[i + 3] = 255
    }
  }
  ctx.putImageData(now, x, y)
}

function drawStyledQr(
  ctx: CanvasRenderingContext2D,
  qrImage: CanvasImageSource,
  x: number,
  y: number,
  frameSize: number,
  revealTheme: boolean,
) {
  const innerSize = Math.round(frameSize * QR_INNER_RATIO)
  const innerX = x + (frameSize - innerSize) / 2
  const innerY = y + (frameSize - innerSize) / 2
  const theme = revealTheme ? ctx.getImageData(x, y, frameSize, frameSize) : null
  if (!revealTheme) {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x, y, frameSize, frameSize)
  }
  ctx.drawImage(
    qrImage,
    revealTheme ? x : innerX,
    revealTheme ? y : innerY,
    revealTheme ? frameSize : innerSize,
    revealTheme ? frameSize : innerSize,
  )
  if (theme) tintWhitesWithTheme(ctx, theme, x, y, frameSize, frameSize, 1)
}

export async function renderRecruitmentPosterCanvas(
  ctx: CanvasRenderingContext2D,
  input: PosterInput,
  design: PosterDesignTokens,
  qrImage?: CanvasImageSource | null,
): Promise<void> {
  const tmpl = design.template
  const pad = design.shareThemeLabel ? 72 : 40
  const cardW = POSTER_W - pad * 2
  const cardH = POSTER_H - pad * 2
  const festivalImg = design.festivalUrl ? await loadImage(design.festivalUrl) : null
  const blessingImg = design.blessingUrl ? await loadImage(design.blessingUrl) : null
  const bgImg = festivalImg || (design.forceGradientHero ? null : await loadPosterBackground(tmpl))
  const brandImg = await loadImage(String(input.inviterAvatarUrl || ''))

  if (festivalImg) {
    const iw = festivalImg.width || POSTER_W
    const ih = festivalImg.height || POSTER_H
    const ir = iw / Math.max(1, ih)
    const r = POSTER_W / POSTER_H
    const dw = ir > r ? POSTER_H * ir : POSTER_W
    const dh = ir > r ? POSTER_H : POSTER_W / ir
    ctx.drawImage(festivalImg, (POSTER_W - dw) / 2, (POSTER_H - dh) / 2, dw, dh)
  } else {
  ctx.fillStyle = design.frameColor || tmpl.outerBg
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)
  }
  if (design.shareThemeLabel) {
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 26px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(design.shareThemeLabel, POSTER_W / 2, 34)
  }

  const glassy = !!festivalImg
  roundRect(ctx, pad, pad, cardW, cardH, 24)
  ctx.fillStyle = glassy ? 'rgba(255,255,255,0.72)' : '#FFFFFF'
  ctx.fill()

  let y = pad + 36
  const avatarR = 28
  const avatarX = pad + 36
  ctx.fillStyle = design.accentLight
  ctx.beginPath()
  ctx.arc(avatarX, y, avatarR, 0, Math.PI * 2)
  ctx.fill()
  if (brandImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarX, y, avatarR - 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(brandImg, avatarX - (avatarR - 2), y - (avatarR - 2), (avatarR - 2) * 2, (avatarR - 2) * 2)
    ctx.restore()
  } else {
    ctx.fillStyle = design.accentColor
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(input.inviterName || '招').slice(0, 1), avatarX, y)
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = '#334155'
  ctx.font = '26px sans-serif'
  ctx.fillText(truncateText(ctx, `${input.inviterName}${design.inviterSuffix}`, cardW - 120), pad + 84, y)
  y += 96

  const heroH = 280
  const heroX = pad + 24
  const heroW = cardW - 48
  if (!glassy) {
    drawHeroSection(ctx, input, design, bgImg, heroX, y, heroW, heroH)
    y += heroH + 24
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 34px sans-serif'
  const titleLines = wrapLines(ctx, input.title, cardW - 48, 2)
  titleLines.forEach((line, i) => {
    ctx.fillText(line, pad + 24, y + i * 44)
  })
  y += titleLines.length * 44 + 20

  ctx.font = '26px sans-serif'
  for (const row of input.rows) {
    ctx.fillStyle = '#64748B'
    ctx.fillText(`${row.label}：`, pad + 24, y)
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(truncateText(ctx, row.value, cardW - 220), pad + 170, y)
    ctx.font = '26px sans-serif'
    y += 42
  }

  const qrFrameSize = QR_FRAME_SIZE
  const qrX = POSTER_W - pad - 24 - qrFrameSize
  const qrY = pad + cardH - qrFrameSize - 68
  const detailX = pad + 24
  const detailMaxW = cardW - 48
  const detailBudget = qrY - (y + 12) - 16
  const detailMaxLines = Math.min(8, Math.floor((detailBudget - 36) / 32))
  if (input.detailText && detailMaxLines >= 1) {
    y = drawDetailSection(ctx, input.detailText, detailX, y + 12, detailMaxW, detailMaxLines)
  }
  const panelX = pad + 24
  const panelW = qrX - panelX - 16
  const panelY = qrY + 6
  const panelH = qrFrameSize + 28 - 12
  if (blessingImg && drawBlessingSticker(ctx, blessingImg, panelX, panelY, panelW, panelH)) {
    /* 节日艺术字贴在左下角 */
  } else if (design.shareBlessing && panelW > 80) {
    drawFestivalBlessing(ctx, design.shareBlessing, panelX, panelY, panelW, panelH)
  } else if (panelW > 120 && design.footerPanel) {
    drawFooterPanel(ctx, panelX, panelY, panelW, panelH, design.footerPanel, design)
  }
  if (qrImage) {
    drawStyledQr(ctx, qrImage, qrX, qrY, qrFrameSize, !!festivalImg)
  }
  const cx = qrX + qrFrameSize / 2
  const cy = qrY + qrFrameSize / 2
  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748B'
  ctx.font = '22px sans-serif'
  ctx.fillText('长按识别即可报名', cx, cy + qrFrameSize / 2 + 14 + 22)
}

export async function renderRecruitmentPosterToDataUrl(
  input: PosterInput,
  design: PosterDesignTokens,
  qrDataUrl: string,
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  const qrImg = await loadImage(qrDataUrl)
  await renderRecruitmentPosterCanvas(ctx, input, design, qrImg)
  return canvas.toDataURL('image/png')
}
