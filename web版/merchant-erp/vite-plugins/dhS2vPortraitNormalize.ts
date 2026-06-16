import type { Buffer } from 'node:buffer'
import {
  computePortraitCenterCrop,
  computeS2vPortraitSize,
  portraitNeedsS2vNormalize,
} from '../src/lib/dhS2vPortraitSize.js'

export type NormalizedPortrait = {
  buffer: Buffer
  contentType: string
  fileName: string
}

/** 服务端兜底：上传 OSS / 调千问前把人像裁成竖版 9:16 并规范到 ≥720×1280 */
export async function normalizePortraitBufferForS2v(
  buffer: Buffer,
  contentType: string,
  fileName: string,
): Promise<NormalizedPortrait> {
  const fallback = (): NormalizedPortrait => ({ buffer, contentType, fileName })
  if (!buffer.length) return fallback()
  try {
    const sharpMod = await import('sharp')
    const sharp = sharpMod.default
    const meta = await sharp(buffer).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (!portraitNeedsS2vNormalize(w, h)) return fallback()
    const crop = computePortraitCenterCrop(w, h)
    const { width, height } = computeS2vPortraitSize(w, h)
    const out = await sharp(buffer)
      .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
    return {
      buffer: out,
      contentType: 'image/jpeg',
      fileName: fileName.replace(/\.(png|webp|gif)$/i, '.jpg') || `dh-s2v-${Date.now()}.jpg`,
    }
  } catch (e) {
    console.warn('[dh-s2v] portrait normalize failed, using original buffer:', e)
    return fallback()
  }
}
