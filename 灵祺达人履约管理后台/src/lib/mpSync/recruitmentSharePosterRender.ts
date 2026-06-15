/**
 * 招募单分享海报 Canvas 绘制（Web / Node）
 */
import type { PosterDesignTokens, PosterInput } from './recruitmentSharePosterCore'
import { posterBackgroundCandidates, posterQrFrameCandidates } from './recruitmentPosterAssets'

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

async function loadPosterQrFrame(tmpl: {
  qrFrameFile?: string
  qrFrameUrl?: string
}): Promise<HTMLImageElement | null> {
  const candidates = posterQrFrameCandidates(tmpl)
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
  const accentLight = design.accentLight || '#EEF2FF'

  roundRect(ctx, x, y, w, h, 18)
  ctx.fillStyle = accentLight
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
    ctx.fillStyle = accent
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
      ctx.fillStyle = '#334155'
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

function drawStyledQr(
  ctx: CanvasRenderingContext2D,
  qrImage: CanvasImageSource,
  frameImage: HTMLImageElement | null,
  x: number,
  y: number,
  frameSize: number,
) {
  const innerSize = Math.round(frameSize * QR_INNER_RATIO)
  const innerX = x + (frameSize - innerSize) / 2
  const innerY = y + (frameSize - innerSize) / 2

  if (frameImage) {
    ctx.drawImage(frameImage, x, y, frameSize, frameSize)
    ctx.drawImage(qrImage, innerX, innerY, innerSize, innerSize)
    return
  }

  drawWxMiniProgramCode(ctx, qrImage, innerX, innerY, innerSize)
}

export async function renderRecruitmentPosterCanvas(
  ctx: CanvasRenderingContext2D,
  input: PosterInput,
  design: PosterDesignTokens,
  qrImage?: CanvasImageSource | null,
): Promise<void> {
  const tmpl = design.template
  const pad = 40
  const cardW = POSTER_W - pad * 2
  const cardH = POSTER_H - pad * 2
  const bgImg = await loadPosterBackground(tmpl)
  const qrFrameImg = await loadPosterQrFrame(tmpl)

  ctx.fillStyle = tmpl.outerBg
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)

  roundRect(ctx, pad, pad, cardW, cardH, 24)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  let y = pad + 36
  const avatarR = 28
  const avatarX = pad + 36
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
  ctx.fillText(truncateText(ctx, `${input.inviterName}${design.inviterSuffix}`, cardW - 120), pad + 84, y)
  y += 56

  const heroH = 280
  const heroX = pad + 24
  const heroW = cardW - 48
  drawHeroSection(ctx, input, design, bgImg, heroX, y, heroW, heroH)
  y += heroH + 24

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
  const detailMaxLines = Math.max(2, Math.min(4, Math.floor((qrY - y - 24) / 32)))
  if (input.detailText && detailMaxLines >= 2 && qrY - y > 48) {
    y = drawDetailSection(ctx, input.detailText, detailX, y + 12, detailMaxW, detailMaxLines)
  }
  const panelX = pad + 24
  const panelW = qrX - panelX - 16
  const panelY = qrY + 6
  const panelH = qrFrameSize + 28 - 12
  if (panelW > 120 && design.footerPanel) {
    drawFooterPanel(ctx, panelX, panelY, panelW, panelH, design.footerPanel, design)
  }
  if (qrImage) {
    drawStyledQr(ctx, qrImage, qrFrameImg, qrX, qrY, qrFrameSize)
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
