/** 云剪上传前压缩大图，减轻经 BFF Base64 中转的体积与耗时 */
const COMPRESS_IF_LARGER_BYTES = 900 * 1024
const MAX_EDGE = 1920
const JPEG_QUALITY = 0.82

function isCompressibleImage(file: File): boolean {
  if (/\.gif$/i.test(file.name)) return false
  return file.type.startsWith('image/') && !file.type.includes('gif')
}

export async function compressIceImageIfNeeded(file: File): Promise<File> {
  if (!isCompressibleImage(file) || file.size <= COMPRESS_IF_LARGER_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
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
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/i, '') || 'image'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
