/** 文生图交付：JPEG 压缩与下载 */

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(new Error('读取图片失败'))
    r.readAsDataURL(file)
  })
}

export async function fetchImageBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' })
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

export async function sliceCarouselFiveStrips(
  blob: Blob,
  spec: { slideWidth: number; slideHeight: number; slotCount?: number },
): Promise<Blob[]> {
  const slotCount = spec.slotCount ?? 5
  const bitmap = await createImageBitmap(blob)
  const srcW = bitmap.width
  const srcH = bitmap.height
  const strips: Blob[] = []

  for (let i = 0; i < slotCount; i++) {
    const sx = Math.floor((i * srcW) / slotCount)
    const ex = Math.floor(((i + 1) * srcW) / slotCount)
    const sw = Math.max(1, ex - sx)

    const canvas = document.createElement('canvas')
    canvas.width = spec.slideWidth
    canvas.height = spec.slideHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 不可用')
    ctx.drawImage(bitmap, sx, 0, sw, srcH, 0, 0, spec.slideWidth, spec.slideHeight)

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
