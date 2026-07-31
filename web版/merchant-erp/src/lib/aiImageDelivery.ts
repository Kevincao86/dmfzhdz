/** 文生图交付：JPEG 压缩与下载 */

import { merchantApiAuthHeaders, resolveMerchantApiBearer } from './merchantApiAuth'
import { merchantErpApiCandidates } from './merchantErpApiBase'

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(new Error('读取图片失败'))
    r.readAsDataURL(file)
  })
}

function isTokenmixCdnUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname.toLowerCase()
    return h === 'cdn.tokenmix.ai' || h === 'tokenmix.ai' || h.endsWith('.tokenmix.ai')
  } catch {
    return false
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isProxyTransientError(msg: string): boolean {
  return /Failed to fetch|fetch failed|NetworkError|Load failed|network error|ECONNRESET|502|503|504|image_fetch_failed|代拉 TokenMix/i.test(
    msg,
  )
}

async function fetchImageBlobViaErpProxy(url: string): Promise<Blob> {
  const auth = await resolveMerchantApiBearer()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(auth.token, auth.source),
  }
  const urls = merchantErpApiCandidates('/api/meoo-ai-agent-image')
  let lastErr = 'image_proxy_unavailable'
  for (let attempt = 1; attempt <= 4; attempt++) {
    for (const endpoint of urls) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ phase: 'fetch', image_url: url }),
        })
        const text = await res.text()
        let json: Record<string, unknown> = {}
        try {
          json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
        } catch {
          json = {}
        }
        if (!res.ok || json.ok !== true) {
          lastErr =
            (typeof json.detail === 'string' && json.detail) ||
            (typeof json.message === 'string' && json.message) ||
            `HTTP ${res.status}`
          if (res.status === 404) continue
          throw new Error(lastErr)
        }
        const dataUrl = typeof json.imageUrl === 'string' ? json.imageUrl.trim() : ''
        if (!dataUrl.startsWith('data:')) throw new Error('代拉成图未返回 data URL')
        const bin = await fetch(dataUrl)
        if (!bin.ok) throw new Error('代拉成图解码失败')
        return bin.blob()
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (!isProxyTransientError(lastErr) && !/HTTP 404/i.test(lastErr)) {
          throw e instanceof Error ? e : new Error(lastErr)
        }
      }
    }
    if (attempt < 4) await sleepMs(Math.min(5000, 800 * attempt))
  }
  throw new Error(lastErr)
}

export async function fetchImageBlob(url: string): Promise<Blob> {
  const src = (url || '').trim()
  if (!src) throw new Error('图片地址为空')
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`读取图片失败 HTTP ${res.status}`)
    return res.blob()
  }
  // TokenMix CDN 无 CORS：直接同源代拉，避免五连图裁切 Failed to fetch
  if (isTokenmixCdnUrl(src)) {
    return fetchImageBlobViaErpProxy(src)
  }
  const res = await fetch(src, { mode: 'cors' })
  if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`)
  return res.blob()
}

/** 将图片压缩为 JPEG，尽量满足 maxBytes（默认 3MB） */
export async function compressImageBlobToJpeg(blob: Blob, maxBytes = 3 * 1024 * 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  let quality = 0.92
  let out = await canvasToJpegBlob(canvas, quality)
  while (out.size > maxBytes && quality > 0.35) {
    quality -= 0.08
    out = await canvasToJpegBlob(canvas, quality)
  }
  if (out.size > maxBytes) {
    const scale = Math.sqrt(maxBytes / out.size) * 0.95
    const w = Math.max(320, Math.round(canvas.width * scale))
    const h = Math.max(320, Math.round(canvas.height * scale))
    const c2 = document.createElement('canvas')
    c2.width = w
    c2.height = h
    const ctx2 = c2.getContext('2d')
    if (!ctx2) throw new Error('Canvas 不可用')
    ctx2.drawImage(canvas, 0, 0, w, h)
    out = await canvasToJpegBlob(c2, 0.85)
  }
  return out
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG 编码失败'))),
      'image/jpeg',
      quality,
    )
  })
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 五连图裁切：整幅横图先按「5×单张」比例居中裁准，再等宽等高切成 N 张，
 * 最后缩放到平台单张像素（抖音/美团单张宽高不同）。
 */
export async function sliceCarouselFiveStrips(
  blob: Blob,
  spec: { slideWidth: number; slideHeight: number; slotCount?: number },
): Promise<Blob[]> {
  const slotCount = Math.max(1, Math.floor(spec.slotCount ?? 5))
  const slideW = Math.max(1, Math.floor(spec.slideWidth))
  const slideH = Math.max(1, Math.floor(spec.slideHeight))
  const bitmap = await createImageBitmap(blob)
  const srcW = bitmap.width
  const srcH = bitmap.height
  if (srcW < slotCount || srcH < 1) {
    bitmap.close()
    throw new Error('主图尺寸过小，无法等分裁切')
  }

  const targetAspect = (slideW * slotCount) / slideH
  const srcAspect = srcW / srcH
  let cropW: number
  let cropH: number
  let cropX: number
  let cropY: number
  if (srcAspect > targetAspect) {
    cropH = srcH
    cropW = Math.max(slotCount, Math.round(srcH * targetAspect))
    cropX = Math.floor((srcW - cropW) / 2)
    cropY = 0
  } else {
    cropW = srcW
    cropH = Math.max(1, Math.round(srcW / targetAspect))
    cropX = 0
    cropY = Math.floor((srcH - cropH) / 2)
  }

  const strips: Blob[] = []
  for (let i = 0; i < slotCount; i++) {
    const sx = cropX + Math.floor((i * cropW) / slotCount)
    const ex = cropX + Math.floor(((i + 1) * cropW) / slotCount)
    const sw = Math.max(1, ex - sx)
    const sh = cropH

    const canvas = document.createElement('canvas')
    canvas.width = slideW
    canvas.height = slideH
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      throw new Error('Canvas 不可用')
    }
    ctx.drawImage(bitmap, sx, cropY, sw, sh, 0, 0, slideW, slideH)

    strips.push(
      await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))),
          'image/png',
        )
      }),
    )
  }

  bitmap.close()
  return strips
}

/**
 * 五连图预览：将已裁切的 1～5 张从左到右拼回一条横幅（仅预览用）。
 */
export async function stitchCarouselFiveStrips(
  sources: Array<Blob | string>,
): Promise<Blob> {
  if (!sources.length) throw new Error('没有可拼接的图片')
  const bitmaps: ImageBitmap[] = []
  try {
    for (const src of sources) {
      const blob = typeof src === 'string' ? await fetchImageBlob(src) : src
      bitmaps.push(await createImageBitmap(blob))
    }
    const h = Math.max(...bitmaps.map((b) => b.height))
    if (h < 1) throw new Error('拼接高度无效')
    const widths = bitmaps.map((b) => Math.max(1, Math.round((b.width * h) / b.height)))
    const totalW = widths.reduce((a, w) => a + w, 0)
    const canvas = document.createElement('canvas')
    canvas.width = totalW
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 不可用')
    let x = 0
    for (let i = 0; i < bitmaps.length; i++) {
      const b = bitmaps[i]!
      const w = widths[i]!
      ctx.drawImage(b, 0, 0, b.width, b.height, x, 0, w, h)
      x += w
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) => (out ? resolve(out) : reject(new Error('拼接编码失败'))),
        'image/png',
      )
    })
  } finally {
    bitmaps.forEach((b) => b.close())
  }
}

export async function pngBlobFromImageUrl(url: string): Promise<Blob> {
  const src = await fetchImageBlob(url)
  const bitmap = await createImageBitmap(src)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))),
      'image/png',
    )
  })
}
