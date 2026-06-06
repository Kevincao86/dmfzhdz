/** 云剪上传前压缩：超过 4MB 时尝试压至上限内 */
const COMPRESS_IF_LARGER_BYTES = 900 * 1024
const MAX_EDGE = 1920
const JPEG_QUALITY = 0.82
const COMPRESS_TIMEOUT_MS = 8_000

/** 云剪本地上传单张图片上限 */
export const ICE_LOCAL_IMAGE_MAX_BYTES = 4 * 1024 * 1024

/** 单请求上传目标上限（≤4MB 时走单次 Base64；更大走分片） */
const ICE_UPLOAD_TARGET_MAX_BYTES = ICE_LOCAL_IMAGE_MAX_BYTES
const ICE_UPLOAD_MAX_EDGE = 1280

function isCompressibleImage(file: File): boolean {
  if (/\.gif$/i.test(file.name)) return false
  return file.type.startsWith('image/') && !file.type.includes('gif')
}

async function bitmapFromUploadFile(file: File): Promise<ImageBitmap | null> {
  try {
    const buf = await file.arrayBuffer()
    const blob = new Blob([buf], { type: file.type?.trim() || 'image/jpeg' })
    return await createImageBitmap(blob)
  } catch {
    try {
      return await createImageBitmap(file)
    } catch {
      return null
    }
  }
}

async function compressIceImageWithParams(
  file: File,
  maxEdge: number,
  quality: number,
): Promise<File> {
  const bitmap = await bitmapFromUploadFile(file)
  if (!bitmap) return file
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) return file
  const base = file.name.replace(/\.[^.]+$/i, '') || 'image'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

async function withCompressTimeout(file: File, maxEdge: number, quality: number): Promise<File> {
  return Promise.race([
    compressIceImageWithParams(file, maxEdge, quality),
    new Promise<File>((_, reject) => {
      window.setTimeout(() => reject(new Error('compress_timeout')), COMPRESS_TIMEOUT_MS)
    }),
  ])
}

export async function compressIceImageIfNeeded(file: File): Promise<File> {
  if (!isCompressibleImage(file) || file.size <= COMPRESS_IF_LARGER_BYTES) return file
  try {
    return await withCompressTimeout(file, MAX_EDGE, JPEG_QUALITY)
  } catch {
    return file
  }
}

/** 云剪本地上传：≤4MB 原图直传；更大则压缩至 4MB 内 */
export async function compressIceImageForUpload(file: File): Promise<File> {
  if (!isCompressibleImage(file)) return file
  if (file.size <= ICE_UPLOAD_TARGET_MAX_BYTES) return file

  try {
    let edge = ICE_UPLOAD_MAX_EDGE
    let quality = 0.82
    let best = file
    for (let i = 0; i < 5; i++) {
      const out = await withCompressTimeout(file, edge, quality)
      if (out.size <= ICE_UPLOAD_TARGET_MAX_BYTES) return out
      if (out.size < best.size) best = out
      quality = Math.max(0.5, quality - 0.1)
      edge = Math.max(640, Math.round(edge * 0.85))
    }
    return best
  } catch {
    return file
  }
}
