/**
 * 数字人口播 — 自定义人像/口播音频上传预处理
 *
 * 上传阶段仅做格式校验与过大图缩小，**不做半身裁切**；
 * 全身/半身构图在提交成片时按 draft.frameMode 再处理（见 digitalHumanVideoRender）。
 */
import { extractVideoFirstFramePureBase64 } from './videoFrameUtils'

const MAX_AVATAR_BYTES = 15 * 1024 * 1024
const MAX_AVATAR_SIDE = 4096
const LIBRARY_AVATAR_MAX_SIDE = 1080

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '')
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

async function downscaleDataUrl(dataUrl: string, maxSide: number, quality = 0.92): Promise<string> {
  if (!/^data:image\//i.test(dataUrl)) return dataUrl
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('无法解码照片'))
    img.src = dataUrl
  })
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const longest = Math.max(w, h)
  if (!w || !h || longest <= maxSide) {
    if (/^data:image\/jpe?g/i.test(dataUrl)) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  }

  const scale = maxSide / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

async function downscaleDataUrlIfOversized(dataUrl: string): Promise<string> {
  return downscaleDataUrl(dataUrl, MAX_AVATAR_SIDE, 0.92)
}

/** 形象库持久化：缩至 1080 边长 JPEG，避免 localStorage / IndexedDB 膨胀 */
export async function compressPortraitDataUrlForLibrary(dataUrl: string): Promise<string> {
  return downscaleDataUrl(dataUrl, LIBRARY_AVATAR_MAX_SIDE, 0.85)
}

async function canvasDataUrlFromImageFile(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  if (!/^data:image\//i.test(dataUrl)) {
    throw new Error('无法识别照片格式，请使用 JPG 或 PNG 竖版正面照')
  }
  return downscaleDataUrlIfOversized(dataUrl)
}

/** 将用户上传的照片/短视频转为可用于口型驱动的 data URL（保留原始构图） */
export async function processCustomAvatarFile(file: File): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('人像文件不能超过 15MB，请压缩后重试')
  }

  if (file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
    const frameB64 = await extractVideoFirstFramePureBase64(file)
    return downscaleDataUrlIfOversized(`data:image/jpeg;base64,${frameB64}`)
  }

  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error('请上传 JPG/PNG 照片，或 MP4 参考短视频')
  }

  return canvasDataUrlFromImageFile(file)
}
