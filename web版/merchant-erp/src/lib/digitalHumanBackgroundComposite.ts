/** 口型驱动前：将人像合成到所选背景（门店实景 / 纯色 / 绿幕等） */

import { mattePortraitWithFallback } from './digitalHumanPortraitMatting'

const OUT_W = 1080
const OUT_H = 1920

function pureBase64ToBlob(b64: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes])
}

async function loadImageFromPureBase64(b64: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(pureBase64ToBlob(b64))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('无法解码人像图片'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToBlobJpeg(c: HTMLCanvasElement, q = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('无法导出画面'))
      },
      'image/jpeg',
      q,
    )
  })
}

async function blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = typeof fr.result === 'string' ? fr.result : ''
      const ix = s.indexOf('base64,')
      resolve(ix >= 0 ? s.slice(ix + 'base64,'.length) : s.replace(/\s/g, ''))
    }
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(blob)
  })
}

function drawStoreInterior(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#f5efe6')
  g.addColorStop(0.45, '#ebe3d6')
  g.addColorStop(1, '#d9cfc0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(w * 0.08, h * 0.06, w * 0.84, h * 0.22)

  ctx.fillStyle = '#c4a882'
  for (let i = 0; i < 4; i++) {
    const y = h * (0.34 + i * 0.11)
    ctx.fillRect(w * 0.06, y, w * 0.88, h * 0.07)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    for (let j = 0; j < 5; j++) {
      ctx.fillRect(w * (0.1 + j * 0.16), y + h * 0.012, w * 0.1, h * 0.045)
    }
    ctx.fillStyle = '#c4a882'
  }

  const lg = ctx.createRadialGradient(w * 0.72, h * 0.18, 0, w * 0.72, h * 0.18, w * 0.35)
  lg.addColorStop(0, 'rgba(255,248,220,0.55)')
  lg.addColorStop(1, 'rgba(255,248,220,0)')
  ctx.fillStyle = lg
  ctx.fillRect(0, 0, w, h * 0.5)
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('无法解码背景图片'))
    img.src = dataUrl
  })
  return img
}

function drawCustomBackgroundImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = img.width * scale
  const sh = img.height * scale
  const sx = (w - sw) / 2
  const sy = (h - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh)
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, backgroundId: string) {
  switch (backgroundId) {
    case 'store':
      drawStoreInterior(ctx, w, h)
      return
    case 'green':
      ctx.fillStyle = '#00b140'
      ctx.fillRect(0, 0, w, h)
      return
    case 'solid-blue':
      ctx.fillStyle = '#1e4fd6'
      ctx.fillRect(0, 0, w, h)
      return
    case 'studio':
    default: {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#f0f0f2')
      g.addColorStop(0.55, '#e6e6ea')
      g.addColorStop(1, '#d8d8de')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      const spot = ctx.createRadialGradient(w * 0.5, h * 0.28, 0, w * 0.5, h * 0.28, w * 0.55)
      spot.addColorStop(0, 'rgba(255,255,255,0.45)')
      spot.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = spot
      ctx.fillRect(0, 0, w, h)
    }
  }
}

/** 非默认演播室灰底时，将裁切后人像叠到场景背景上再送口型驱动 */
export async function compositePortraitWithBackground(
  portraitPureB64: string,
  backgroundId: string,
  frameMode: 'half' | 'full' = 'half',
  customBackgroundDataUrl?: string | null,
): Promise<string> {
  const bg = String(backgroundId || 'studio').trim() || 'studio'
  if (bg === 'custom' && !customBackgroundDataUrl?.trim()) return portraitPureB64

  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持画布导出')

  const hasCustomBgImage =
    (bg === 'custom' || bg === 'store') && Boolean(customBackgroundDataUrl?.trim())
  if (hasCustomBgImage) {
    const bgImg = await loadImageFromDataUrl(customBackgroundDataUrl!.trim())
    drawCustomBackgroundImage(ctx, bgImg, OUT_W, OUT_H)
  } else {
    drawBackground(ctx, OUT_W, OUT_H, bg)
  }

  const mustMatte =
    hasCustomBgImage || bg === 'green' || bg === 'studio' || bg === 'solid-blue' || bg === 'store'
  const mattedB64 = mustMatte
    ? await mattePortraitWithFallback(portraitPureB64, { chromaGreen: bg === 'green' })
    : portraitPureB64
  const img = await loadImageFromPureBase64(mattedB64)
  const portraitMaxH = frameMode === 'full' ? OUT_H * 0.9 : OUT_H * 0.74
  const scale = Math.min(OUT_W * 0.92 / img.width, portraitMaxH / img.height)
  const pw = img.width * scale
  const ph = img.height * scale
  const px = (OUT_W - pw) / 2
  const py = frameMode === 'full' ? OUT_H - ph - OUT_H * 0.02 : OUT_H - ph - OUT_H * 0.04

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, px, py, pw, ph)

  return blobToPureBase64(await canvasToBlobJpeg(canvas, 0.93))
}
