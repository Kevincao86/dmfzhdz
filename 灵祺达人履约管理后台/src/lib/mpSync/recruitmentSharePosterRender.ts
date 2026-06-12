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

export async function renderRecruitmentPosterCanvas(
  ctx: CanvasRenderingContext2D,
  input: PosterInput,
  design: PosterDesignTokens,
  qrImage?: CanvasImageSource | null,
): Promise<void> {
  const pad = 40
  const cardW = POSTER_W - pad * 2
  const cardH = POSTER_H - pad * 2

  ctx.fillStyle = '#E5E7EB'
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)

  roundRect(ctx, pad, pad, cardW, cardH, 24)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()

  let y = pad + 36

  // inviter row
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
  const inviterLine = truncateText(
    ctx,
    `${input.inviterName}${design.inviterSuffix}`,
    cardW - 120,
  )
  ctx.fillText(inviterLine, pad + 84, y)
  y += 56

  // hero block
  const heroH = 300
  roundRect(ctx, pad + 24, y, cardW - 48, heroH, 20)
  ctx.fillStyle = design.accentColor
  ctx.fill()

  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.font = 'bold 52px sans-serif'
  const heroLines = wrapLines(ctx, design.heroTitle, cardW - 120, 2)
  const heroStartY = y + heroH / 2 - ((heroLines.length - 1) * 30)
  heroLines.forEach((line, i) => {
    ctx.fillText(line, POSTER_W / 2, heroStartY + i * 60)
  })
  if (design.heroSubtitle) {
    ctx.font = '24px sans-serif'
    ctx.fillText(design.heroSubtitle, POSTER_W / 2, y + heroH - 36)
  }
  y += heroH + 28

  // title
  ctx.textAlign = 'left'
  ctx.fillStyle = '#0F172A'
  ctx.font = 'bold 34px sans-serif'
  const titleLines = wrapLines(ctx, input.title, cardW - 48, 2)
  titleLines.forEach((line, i) => {
    ctx.fillText(line, pad + 24, y + i * 44)
  })
  y += titleLines.length * 44 + 24

  // info rows
  ctx.font = '26px sans-serif'
  for (const row of input.rows) {
    ctx.fillStyle = '#64748B'
    ctx.fillText(`${row.label}：`, pad + 24, y)
    ctx.fillStyle = '#0F172A'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText(truncateText(ctx, row.value, cardW - 220), pad + 170, y)
    ctx.font = '26px sans-serif'
    y += 44
  }

  // QR footer
  const qrSize = 168
  const qrX = POSTER_W - pad - 24 - qrSize
  const qrY = pad + cardH - qrSize - 72
  if (qrImage) {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16)
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize)
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = '#64748B'
  ctx.font = '22px sans-serif'
  ctx.fillText('长按识别即可报名', qrX + qrSize / 2, qrY + qrSize + 32)
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
