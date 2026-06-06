/** 从视频 Blob 截取接近结尾的一帧（纯 base64），供下一段图生视频衔接 */

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

async function canvasToBlobJpeg(c: HTMLCanvasElement, q = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('无法导出画面'))
    }, 'image/jpeg', q)
  })
}

function waitVideoEvent(video: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      video.removeEventListener(event, onOk)
      video.removeEventListener('error', onErr)
      reject(new Error('视频加载超时'))
    }, timeoutMs)
    const onOk = () => {
      window.clearTimeout(timer)
      video.removeEventListener(event, onOk)
      video.removeEventListener('error', onErr)
      resolve()
    }
    const onErr = () => {
      window.clearTimeout(timer)
      video.removeEventListener(event, onOk)
      video.removeEventListener('error', onErr)
      reject(new Error('无法解码该视频片段'))
    }
    video.addEventListener(event, onOk, { once: true })
    video.addEventListener('error', onErr, { once: true })
  })
}

async function captureFrameAtTime(video: HTMLVideoElement, seekTo: number): Promise<string> {
  video.currentTime = seekTo
  await waitVideoEvent(video, 'seeked', 12000)
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) throw new Error('无法读取视频画面尺寸')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持画布导出')
  ctx.drawImage(video, 0, 0, w, h)
  const jpegBlob = await canvasToBlobJpeg(canvas)
  return blobToPureBase64(jpegBlob)
}

export async function extractVideoLastFramePureBase64(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url

  try {
    video.load()
    await waitVideoEvent(video, 'loadedmetadata', 15000)
    const dur = video.duration
    if (!Number.isFinite(dur) || dur <= 0) {
      throw new Error('无法读取视频时长')
    }

    const candidates = [Math.max(0.05, dur - 0.12), Math.max(0, dur * 0.5), 0.05]
    let lastErr: Error | null = null
    for (const seekTo of candidates) {
      try {
        return await captureFrameAtTime(video, seekTo)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('截取尾帧失败')
      }
    }
    throw lastErr ?? new Error('截取尾帧失败')
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

export async function imageUrlToPureBase64(url: string): Promise<string> {
  const trimmed = url.trim()
  if (trimmed.startsWith('data:')) {
    const ix = trimmed.indexOf('base64,')
    return ix >= 0 ? trimmed.slice(ix + 'base64,'.length).replace(/\s/g, '') : trimmed
  }
  const res = await fetch(trimmed)
  if (!res.ok) throw new Error('无法加载形象参考图')
  const blob = await res.blob()
  return blobToPureBase64(blob)
}
