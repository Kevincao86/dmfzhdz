/** 数字人预置形象：9:16 竖版裁切与输出（与 dhS2vPortraitSize.ts 逻辑一致） */
import fs from 'node:fs'
import path from 'node:path'

export const PORTRAIT_W = 1080
export const PORTRAIT_H = 1920
const PORTRAIT_ASPECT = 9 / 16
const ASPECT_EPS = 0.02

/** @returns {{ left: number, top: number, width: number, height: number }} */
export function computePortraitCenterCrop(w, h, frameMode = 'half') {
  if (w <= 0 || h <= 0) throw new Error('无法读取人像尺寸')
  const srcAspect = w / h
  if (Math.abs(srcAspect - PORTRAIT_ASPECT) <= ASPECT_EPS) {
    return { left: 0, top: 0, width: w, height: h }
  }
  if (srcAspect > PORTRAIT_ASPECT) {
    const cropH = h
    const cropW = Math.max(1, Math.round(h * PORTRAIT_ASPECT))
    return { left: Math.max(0, Math.round((w - cropW) / 2)), top: 0, width: cropW, height: cropH }
  }
  if (frameMode === 'full') {
    const cropH = h
    const cropW = Math.max(1, Math.min(w, Math.round(h * PORTRAIT_ASPECT)))
    return { left: Math.max(0, Math.round((w - cropW) / 2)), top: 0, width: cropW, height: cropH }
  }
  const cropW = w
  const cropH = Math.max(1, Math.min(h, Math.round(w / PORTRAIT_ASPECT)))
  return { left: 0, top: 0, width: cropW, height: cropH }
}

/**
 * 裁切 → 1080×1920 → 轻度锐化 → JPEG
 * @param {import('sharp').Sharp} sharpFactory
 * @param {string | Buffer} src
 * @param {'half' | 'full'} bodyFrame
 */
export async function normalizePortraitToFile(sharpFactory, src, dest, bodyFrame) {
  const sharp = sharpFactory
  const meta = await sharp(src).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  const crop = computePortraitCenterCrop(w, h, bodyFrame)
  const outMeta = await sharp(src)
    .extract(crop)
    .resize(PORTRAIT_W, PORTRAIT_H, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.35 })
    .jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(dest)
  const stat = await import('node:fs').then((fs) => fs.statSync(dest))
  return { w: outMeta.width, h: outMeta.height, kb: Math.round(stat.size / 1024) }
}

export function fileToDataUri(filePath) {
  const buf = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}
