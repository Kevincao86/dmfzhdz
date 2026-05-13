/** 将用户选择的图片压成 JPEG data URL，控制体积便于经网关多模态上传 */
export async function compressImageFileToDataUrl(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const w = bitmap.width
    const h = bitmap.height
    const scale = Math.min(1, maxEdge / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(bitmap, 0, 0, tw, th)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    bitmap.close()
  }
}
