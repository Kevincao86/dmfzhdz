/** 数字人口播：自定义背景前强制人像抠图（去除预置灰底/绿幕等） */

const CORNER_PATCH = 14

function pureBase64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function loadImageFromPureBase64(b64: string): Promise<HTMLImageElement> {
  let lastErr: Error | null = null
  for (const mime of ['image/jpeg', 'image/png', 'image/webp'] as const) {
    const url = URL.createObjectURL(pureBase64ToBlob(b64, mime))
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('无法解码人像图片'))
        img.src = url
      })
      return img
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  throw lastErr ?? new Error('无法解码人像图片')
}

async function canvasToBlobPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('无法导出去背人像'))
      },
      'image/png',
      1,
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
    fr.onerror = () => reject(new Error('读取去背图失败'))
    fr.readAsDataURL(blob)
  })
}

function rgbDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114)
}

function sampleCornerRgb(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const xEnd = Math.min(w, x0 + CORNER_PATCH)
  const yEnd = Math.min(h, y0 + CORNER_PATCH)
  for (let y = y0; y < yEnd; y++) {
    for (let x = x0; x < xEnd; x++) {
      const i = (y * w + x) * 4
      r += data[i]!
      g += data[i + 1]!
      b += data[i + 2]!
      n++
    }
  }
  if (!n) return [240, 240, 244]
  return [r / n, g / n, b / n]
}

function estimateBackgroundRgb(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const patches = [
    sampleCornerRgb(data, w, h, 0, 0),
    sampleCornerRgb(data, w, h, Math.max(0, w - CORNER_PATCH), 0),
    sampleCornerRgb(data, w, h, 0, Math.max(0, h - CORNER_PATCH)),
    sampleCornerRgb(data, w, h, Math.max(0, w - CORNER_PATCH), Math.max(0, h - CORNER_PATCH)),
  ]
  const rs = patches.map((p) => p[0]).sort((a, b) => a - b)
  const gs = patches.map((p) => p[1]).sort((a, b) => a - b)
  const bs = patches.map((p) => p[2]).sort((a, b) => a - b)
  const mid = Math.floor(patches.length / 2)
  return [rs[mid]!, gs[mid]!, bs[mid]!]
}

function isGreenScreenPixel(r: number, g: number, b: number): boolean {
  return g > 95 && g > r * 1.28 + 18 && g > b * 1.18 + 18
}

function buildBackgroundMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bgRgb: [number, number, number],
  chromaGreen: boolean,
): Uint8Array {
  const bg = new Uint8Array(w * h)
  const low = chromaGreen ? 22 : 28
  const high = chromaGreen ? 58 : 72

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const dist = rgbDist(r, g, b, bgRgb[0], bgRgb[1], bgRgb[2])
      const greenish = chromaGreen && isGreenScreenPixel(r, g, b)
      const score = greenish ? Math.min(dist, 8) : dist
      if (score <= low) bg[y * w + x] = 1
    }
  }

  const queue: number[] = []
  for (let x = 0; x < w; x++) {
    if (bg[x] === 1) queue.push(x)
    const bottom = (h - 1) * w + x
    if (bg[bottom] === 1) queue.push(bottom)
  }
  for (let y = 0; y < h; y++) {
    const left = y * w
    const right = y * w + (w - 1)
    if (bg[left] === 1) queue.push(left)
    if (bg[right] === 1) queue.push(right)
  }

  const visited = new Uint8Array(w * h)
  while (queue.length) {
    const idx = queue.pop()!
    if (visited[idx]) continue
    visited[idx] = 1
    const x = idx % w
    const y = (idx / w) | 0
    const i = idx * 4
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const dist = rgbDist(r, g, b, bgRgb[0], bgRgb[1], bgRgb[2])
    const greenish = chromaGreen && isGreenScreenPixel(r, g, b)
    if (!greenish && dist > high) continue

    bg[idx] = 1
    if (x > 0) queue.push(idx - 1)
    if (x + 1 < w) queue.push(idx + 1)
    if (y > 0) queue.push(idx - w)
    if (y + 1 < h) queue.push(idx + w)
  }

  return bg
}

function featherAlpha(alpha: Float32Array, w: number, h: number): void {
  const tmp = new Float32Array(alpha.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          sum += alpha[ny * w + nx]!
          n++
        }
      }
      tmp[y * w + x] = sum / n
    }
  }
  alpha.set(tmp)
}

/**
 * 去除人像周围背景，返回带透明通道的 PNG pure base64。
 * 自定义背景合成前必须调用。
 */
export async function mattePortraitPureBase64(
  portraitPureB64: string,
  opts?: { chromaGreen?: boolean },
): Promise<string> {
  const img = await loadImageFromPureBase64(portraitPureB64)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (w < 8 || h < 8) return portraitPureB64

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return portraitPureB64

  ctx.drawImage(img, 0, 0, w, h)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const chromaGreen = Boolean(opts?.chromaGreen)
  const bgRgb = chromaGreen ? ([0, 177, 64] as [number, number, number]) : estimateBackgroundRgb(data, w, h)
  const bgMask = buildBackgroundMask(data, w, h, bgRgb, chromaGreen)

  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    alpha[i] = bgMask[i] === 1 ? 0 : 1
  }
  featherAlpha(alpha, w, h)
  featherAlpha(alpha, w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const pi = idx * 4
      data[pi + 3] = Math.round(Math.min(1, Math.max(0, alpha[idx]!)) * 255)
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return blobToPureBase64(await canvasToBlobPng(canvas))
}

/** 去背后主体不透明像素占比（0~1），用于判断抠图是否误删人像 */
export async function estimatePortraitOpaqueRatio(portraitPureB64: string): Promise<number> {
  const img = await loadImageFromPureBase64(portraitPureB64)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (w < 8 || h < 8) return 1

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 1
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  let opaque = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 24) opaque++
  }
  return opaque / (w * h)
}

/** 抠图失败（主体被误删）时回退原图，避免预览/成片只剩背景 */
export async function mattePortraitWithFallback(
  portraitPureB64: string,
  opts?: { chromaGreen?: boolean },
): Promise<string> {
  const matted = await mattePortraitPureBase64(portraitPureB64, opts)
  const ratio = await estimatePortraitOpaqueRatio(matted)
  if (ratio >= 0.06) return matted
  return portraitPureB64
}
