/** 数字人口播 · 步骤 4 低清预览：与成片相同的抠图 / 背景 / 产品预置逻辑（静态帧，非 Seedance 视频） */
import type { DigitalHumanDraft, FrameMode } from './digitalHumanBroadcast'
import { findPresetAvatarForDraft } from './digitalHumanBroadcast'
import { compositePortraitWithBackground } from './digitalHumanBackgroundComposite'
import { prepareDhProductFusionAssets } from './digitalHumanProductFusion'
import { resolveStoreSceneBackgroundDataUrl } from './digitalHumanStoreScenes'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'

export type DhFramePreviewInput = {
  draft: DigitalHumanDraft
  customBackgroundDataUrl?: string | null
  productImageDataUrl?: string | null
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

export async function buildDigitalHumanFramePreviewDataUrl(
  input: DhFramePreviewInput,
): Promise<string> {
  const { draft, customBackgroundDataUrl, productImageDataUrl } = input
  const frameMode = resolveFrameMode(draft)

  let raw: string | null = null
  if (draft.customAvatarDataUrl?.trim()) {
    raw = await imageUrlToPureBase64(draft.customAvatarDataUrl.trim())
  } else {
    const avatar = findPresetAvatarForDraft(draft)
    if (avatar?.previewUrl) raw = await imageUrlToPureBase64(avatar.previewUrl)
  }
  if (!raw) throw new Error('请先选择形象')

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
    const fusion = await prepareDhProductFusionAssets(scenePureB64, productPure)
    return toPreviewDataUrl(fusion.sceneWithProductB64)
  }

  return toPreviewDataUrl(scenePureB64)
}
