/** 数字人口播 · 步骤 4 低清预览：人物+背景参考示意（静态帧，非 Seedance 动态成片） */
import type { DigitalHumanDraft, FrameMode } from './digitalHumanBroadcast'
import { findPresetAvatarForDraft } from './digitalHumanBroadcast'
import { compositePortraitWithBackground } from './digitalHumanBackgroundComposite'
import { resolveStoreSceneBackgroundDataUrl } from './digitalHumanStoreScenes'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'

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
  const { draft, customBackgroundDataUrl } = input
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

  /** 产品不在预览里贴片；成片中段由 Seedance 双参考图一体化融合 */
  return toPreviewDataUrl(scenePureB64)
}
