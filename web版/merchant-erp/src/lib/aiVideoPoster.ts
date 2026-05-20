/** 从本地视频截取首帧，供多模态对话与气泡缩略图使用 */
export async function extractVideoPosterDataUrl(
  file: File,
  maxEdge = 1280,
  quality = 0.82,
): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('无法读取视频'))
    })
    const seekTo = Number.isFinite(video.duration)
      ? Math.min(Math.max(video.duration * 0.05, 0.05), 0.5)
      : 0.1
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('无法定位视频帧'))
      video.currentTime = seekTo
    })
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) throw new Error('视频无有效画面')
    const scale = Math.min(1, maxEdge / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    ctx.drawImage(video, 0, 0, tw, th)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function isComposerVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name)
}

export function isComposerImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
