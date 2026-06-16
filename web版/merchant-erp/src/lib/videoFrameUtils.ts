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

/** wan2.2-s2v 人像约束：短边 > 400，长边 < 7000 */
const S2V_MIN_SIDE = 401
const S2V_MAX_SIDE = 6999
/** 预置缩略图等过小图统一放大到此短边，留余量避免边界拒识 */
const S2V_TARGET_MIN_SIDE = 480

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

function computeS2vPortraitSize(w: number, h: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) throw new Error('无法读取人像尺寸')
  let width = w
  let height = h
  const upscaleIfNeeded = () => {
    const minSide = Math.min(width, height)
    if (minSide <= S2V_MIN_SIDE) {
      const scale = S2V_TARGET_MIN_SIDE / minSide
      width = Math.max(S2V_MIN_SIDE + 1, Math.round(width * scale))
      height = Math.max(S2V_MIN_SIDE + 1, Math.round(height * scale))
    }
  }
  const downscaleIfNeeded = () => {
    const maxSide = Math.max(width, height)
    if (maxSide >= 7000) {
      const scale = S2V_MAX_SIDE / maxSide
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
  }
  upscaleIfNeeded()
  downscaleIfNeeded()
  upscaleIfNeeded()
  return { width, height }
}

/** 将人像 base64 规范到 wan2.2-s2v 可接受分辨率（预置 500×333 等会自动放大） */
export async function normalizePortraitBase64ForS2v(pureB64: string): Promise<string> {
  const raw = pureB64.replace(/\s/g, '')
  if (!raw) throw new Error('人像图片为空')
  const img = await loadImageFromPureBase64(raw)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const { width, height } = computeS2vPortraitSize(srcW, srcH)
  if (
    width === srcW &&
    height === srcH &&
    Math.min(srcW, srcH) > S2V_MIN_SIDE &&
    Math.max(srcW, srcH) < 7000
  ) {
    return raw
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持画布导出')
  ctx.drawImage(img, 0, 0, width, height)
  const jpegBlob = await canvasToBlobJpeg(canvas, 0.92)
  return blobToPureBase64(jpegBlob)
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
