/**
 * 招募单分享海报 Canvas 绘制（Web / Node）
 */
import type { PosterDesignTokens, PosterInput } from './recruitmentSharePosterCore'

export const POSTER_W = 750
export const POSTER_H = 1200

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

function drawStyledQr(
  ctx: CanvasRenderingContext2D,
  qrImage: CanvasImageSource,
  x: number,
  y: number,
  size: number,
  opts: {
    ringColor: string
    centerColor: string
    fgColor?: string
    bgColor?: string
    qrFrameImg?: CanvasImageSource | null
  },
) {
  const { ringColor, centerColor, qrFrameImg } = opts
  const pad = 12
  const frame = size + pad * 2
  const frameX = x - pad
  const frameY = y - pad

  if (qrFrameImg) {
    ctx.drawImage(qrFrameImg, frameX - 8, frameY - 8, frame + 16, frame + 16)
  } else {
    roundRect(ctx, frameX + 3, frameY + 5, frame, frame, 18)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'
    ctx.fill()
    roundRect(ctx, frameX, frameY, frame, frame, 18)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    roundRect(ctx, frameX, frameY, frame, frame, 18)
    ctx.strokeStyle = ringColor
    ctx.lineWidth = 5
    ctx.stroke()
  }

  ctx.save()
  roundRect(ctx, x, y, size, size, 10)
  ctx.clip()
  ctx.drawImage(qrImage, x, y, size, size)
  ctx.restore()

  const dotR = Math.max(8, size * 0.085)
  const cx = x + size / 2
  const cy = y + size / 2
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(cx, cy, dotR + 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = centerColor
  ctx.beginPath()
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
  ctx.fill()
}

export async function renderRecruitmentPosterCanvas(
  ctx: CanvasRenderingContext2D,
  input: PosterInput,
  design: PosterDesignTokens,
  qrImage?: CanvasImageSource | null,
  qrFrameImg?: CanvasImageSource | null,
): Promise<void> {
  const tmpl = design.template
  const pad = 40
  const cardW = POSTER_W - pad * 2
  const cardH = POSTER_H - pad * 2
  const bgImg = await loadImage(tmpl.backgroundUrl)

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

  const qrSize = 164
  const qrX = POSTER_W - pad - 24 - qrSize
  const qrY = pad + cardH - qrSize - 68
  if (qrImage) {
    drawStyledQr(ctx, qrImage, qrX, qrY, qrSize, {
      ringColor: tmpl.qrRingColor || design.accentColor,
      centerColor: tmpl.qrCenterColor || design.accentColor,
      fgColor: tmpl.qrFgColor,
      bgColor: tmpl.qrBgColor,
      qrFrameImg,
    })
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748B'
  ctx.font = '22px sans-serif'
  ctx.fillText('长按识别即可报名', qrX + qrSize / 2, qrY + qrSize + 34)
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
  const qrFrameImg = await loadImage(design.template.qrFrameUrl)
  await renderRecruitmentPosterCanvas(ctx, input, design, qrImg, qrFrameImg)
  return canvas.toDataURL('image/png')
}
