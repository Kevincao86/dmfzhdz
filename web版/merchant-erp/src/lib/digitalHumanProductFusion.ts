/**
 * 数字人口播 · 手持产品：自动抠图 + 双参考图 AI 视频融合（Seedance i2v）
 */
import { mattePortraitPureBase64 } from './digitalHumanPortraitMatting'

const SCENE_W = 1080
const SCENE_H = 1920

async function loadImageFromPureBase64(b64: string): Promise<HTMLImageElement> {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('无法解码图片'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToBlobJpeg(c: HTMLCanvasElement, q = 0.93): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('无法导出画面'))
      },
      'image/jpeg',
      q,
    )
  })
}

async function blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = typeof fr.result === 'string' ? fr.result : ''
      const ix = s.indexOf('base64,')
      resolve(ix >= 0 ? s.slice(ix + 'base64,'.length) : s.replace(/\s/g, ''))
    }
    fr.onerror = () => reject(new Error('读取图片失败'))
    fr.readAsDataURL(blob)
  })
}

/** 自动抠出产品主体（白底/浅底/透明 PNG 均可） */
export async function matteProductPureBase64(productPureB64: string): Promise<string> {
  return mattePortraitPureBase64(productPureB64)
}

/** 将抠图产品预置到人物胸前/掌心区域，供口型驱动参考 */
export async function compositeProductOntoSceneFrame(
  scenePureB64: string,
  mattedProductPureB64: string,
): Promise<string> {
  const scene = await loadImageFromPureBase64(scenePureB64)
  const product = await loadImageFromPureBase64(mattedProductPureB64)
  const canvas = document.createElement('canvas')
  canvas.width = SCENE_W
  canvas.height = SCENE_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return scenePureB64

  const sceneScale = Math.max(SCENE_W / scene.width, SCENE_H / scene.height)
  const sw = scene.width * sceneScale
  const sh = scene.height * sceneScale
  const sx = (SCENE_W - sw) / 2
  const sy = (SCENE_H - sh) / 2
  ctx.drawImage(scene, sx, sy, sw, sh)

  const productMaxW = SCENE_W * 0.42
  const productScale = Math.min(productMaxW / product.width, (SCENE_H * 0.28) / product.height)
  const pw = product.width * productScale
  const ph = product.height * productScale
  const px = (SCENE_W - pw) / 2
  const py = SCENE_H * 0.55 - ph / 2

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(product, px, py, pw, ph)
  return blobToPureBase64(await canvasToBlobJpeg(canvas, 0.93))
}

export type DhProductFusionAssets = {
  mattedProductB64: string
  /** 人物场景 + 产品预置（参考图 1） */
  sceneWithProductB64: string
}

/** 准备产品抠图与场景合成参考图 */
export async function prepareDhProductFusionAssets(
  scenePureB64: string,
  productPureB64: string,
): Promise<DhProductFusionAssets> {
  const mattedProductB64 = await matteProductPureBase64(productPureB64)
  const sceneWithProductB64 = await compositeProductOntoSceneFrame(scenePureB64, mattedProductB64)
  return { mattedProductB64, sceneWithProductB64 }
}

/** Seedance 双参考：场景（含人物+产品位） + 抠图产品 */
export function buildDhSeedanceFusionImages(
  sceneWithProductB64: string,
  mattedProductB64: string,
): string[] {
  return [sceneWithProductB64, mattedProductB64]
}
