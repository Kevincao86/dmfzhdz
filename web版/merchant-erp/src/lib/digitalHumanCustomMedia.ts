/**
 * 数字人口播 — 自定义人像/口播音频上传预处理
 */
import { extractVideoLastFramePureBase64, imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'

const MAX_AVATAR_BYTES = 15 * 1024 * 1024

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '')
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

async function canvasDataUrlFromImageFile(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  const pure = await imageUrlToPureBase64(dataUrl)
  try {
    const normalized = await normalizePortraitBase64ForS2v(pure)
    return `data:image/jpeg;base64,${normalized}`
  } catch {
    if (/^data:image\//i.test(dataUrl)) {
      return dataUrl
    }
    throw new Error('无法识别照片格式，请使用 JPG 或 PNG 竖版正面照')
  }
}

/** 将用户上传的照片/短视频转为可用于口型驱动的 JPEG data URL */
export async function processCustomAvatarFile(file: File): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('人像文件不能超过 15MB，请压缩后重试')
  }

  if (file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
    const frameB64 = await extractVideoLastFramePureBase64(file)
    const normalized = await normalizePortraitBase64ForS2v(frameB64)
    return `data:image/jpeg;base64,${normalized}`
  }

  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
    throw new Error('请上传 JPG/PNG 照片，或 MP4 参考短视频')
  }

  return canvasDataUrlFromImageFile(file)
}
