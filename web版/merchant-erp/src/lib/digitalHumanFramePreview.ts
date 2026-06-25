/** 数字人口播 · 步骤 4 低清预览：与成片相同的抠图 / 背景 / 产品预置逻辑（静态帧，非 Seedance 视频） */
import type { DigitalHumanDraft, FrameMode } from './digitalHumanBroadcast'
import { findPresetAvatarForDraft } from './digitalHumanBroadcast'
import { compositePortraitWithBackground } from './digitalHumanBackgroundComposite'
import { matteProductPureBase64 } from './digitalHumanProductFusion'
import { resolveStoreSceneBackgroundDataUrl } from './digitalHumanStoreScenes'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'

const PREVIEW_W = 1080
const PREVIEW_H = 1920

export type DhFramePreviewInput = {
  draft: DigitalHumanDraft
  customBackgroundDataUrl?: string | null
  productImageDataUrl?: string | null
  /** 当前选中形象（含用户形象库）的人像 data URL */
  portraitDataUrl?: string | null
}

function resolveFrameMode(draft: DigitalHumanDraft): FrameMode {
  if (draft.frameMode === 'full' || draft.frameMode === 'half') return draft.frameMode
  return findPresetAvatarForDraft(draft)?.bodyFrame ?? 'half'
}

async function resolveBackgroundDataUrl(
  draft: DigitalHumanDraft,
  customBackgroundDataUrl?: string | null,
): Promise<string | null> {
  if (customBackgroundDataUrl?.trim()) return customBackgroundDataUrl.trim()
  if (draft.background === 'store' && draft.storeScene) {
    return resolveStoreSceneBackgroundDataUrl(draft.storeScene)
  }
  return null
}

function toPreviewDataUrl(pureB64: string): string {
  const b64 = pureB64.replace(/\s/g, '')
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`
}

async function loadImageFromPureBase64(b64: string): Promise<HTMLImageElement> {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  let lastErr: Error | null = null
  for (const mime of ['image/jpeg', 'image/png', 'image/webp'] as const) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('无法解码预览图'))
        img.src = url
      })
      return img
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  throw lastErr ?? new Error('无法解码预览图')
}

async function canvasToBlobJpeg(c: HTMLCanvasElement, q = 0.93): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('无法导出预览图'))
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
    fr.onerror = () => reject(new Error('读取预览图失败'))
    fr.readAsDataURL(blob)
  })
}

/** 在已含人像的场景帧上叠加产品（不重采样裁切场景，避免人物被裁掉） */
async function overlayProductOnPreviewFrame(
  scenePureB64: string,
  mattedProductPureB64: string,
): Promise<string> {
  const scene = await loadImageFromPureBase64(scenePureB64)
  const product = await loadImageFromPureBase64(mattedProductPureB64)
  const canvas = document.createElement('canvas')
  canvas.width = PREVIEW_W
  canvas.height = PREVIEW_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return scenePureB64

  if (scene.width === PREVIEW_W && scene.height === PREVIEW_H) {
    ctx.drawImage(scene, 0, 0)
  } else {
    const scale = Math.min(PREVIEW_W / scene.width, PREVIEW_H / scene.height)
    const sw = scene.width * scale
    const sh = scene.height * scale
    ctx.drawImage(scene, (PREVIEW_W - sw) / 2, PREVIEW_H - sh, sw, sh)
  }

  const productMaxW = PREVIEW_W * 0.42
  const productScale = Math.min(productMaxW / product.width, (PREVIEW_H * 0.28) / product.height)
  const pw = product.width * productScale
  const ph = product.height * productScale
  const px = (PREVIEW_W - pw) / 2
  const py = PREVIEW_H * 0.55 - ph / 2

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(product, px, py, pw, ph)
  return blobToPureBase64(await canvasToBlobJpeg(canvas, 0.93))
}

async function resolvePortraitRawB64(input: DhFramePreviewInput): Promise<string> {
  const { draft, portraitDataUrl } = input
  const url =
    portraitDataUrl?.trim() ||
    draft.customAvatarDataUrl?.trim() ||
    findPresetAvatarForDraft(draft)?.previewUrl?.trim()
  if (!url) throw new Error('请先选择形象')
  return imageUrlToPureBase64(url)
}

export async function buildDigitalHumanFramePreviewDataUrl(
  input: DhFramePreviewInput,
): Promise<string> {
  const { draft, customBackgroundDataUrl, productImageDataUrl } = input
  const frameMode = resolveFrameMode(draft)

  const raw = await resolvePortraitRawB64(input)
  const normalized = await normalizePortraitBase64ForS2v(raw, frameMode)
  const bgDataUrl = await resolveBackgroundDataUrl(draft, customBackgroundDataUrl)
  const needsBgComposite =
    draft.background === 'custom' ||
    (draft.background === 'store' && Boolean(draft.storeScene)) ||
    draft.background === 'studio' ||
    draft.background === 'green' ||
    draft.background === 'solid-blue'

  let scenePureB64 = normalized
  if (needsBgComposite) {
    scenePureB64 = await compositePortraitWithBackground(
      normalized,
      draft.background,
      frameMode,
      bgDataUrl,
    )
  }

  if (draft.productOverlayEnabled && productImageDataUrl?.trim()) {
    const productPure = await imageUrlToPureBase64(productImageDataUrl.trim())
    const mattedProduct = await matteProductPureBase64(productPure)
    const withProduct = await overlayProductOnPreviewFrame(scenePureB64, mattedProduct)
    return toPreviewDataUrl(withProduct)
  }

  return toPreviewDataUrl(scenePureB64)
}
