/**
 * 百炼 / 通义千问视觉模型全量目录（控制台「视觉模型」已开通项）。
 * 内置手写目录 + generated/qwenVisionModelSeed.json；额度超限或报错时按 kind 同型自动切换。
 */
import type { ArkCatalogEntry } from './arkModelCatalog.js'
import { mergeCatalogModelIds } from './arkModelCatalog.js'
import { buildVendorModelCandidates } from './vendorModelPool.js'
import { randomRotateModelIds } from './vendorModelPool.js'
import { qwenVisionModelSeed as visionSeed } from './generated/qwenVisionModelSeed.js'

export type QwenVisionEntry = ArkCatalogEntry

/** 文生图 t2i */
const QWEN_T2I: QwenVisionEntry[] = [
  { label: 'wan2.7-image-pro', modelId: 'wan2.7-image-pro', kind: 'image_t2i', priority: 1 },
  { label: 'wan2.7-image', modelId: 'wan2.7-image', kind: 'image_t2i', priority: 2 },
  { label: 'wan2.6-t2i', modelId: 'wan2.6-t2i', kind: 'image_t2i', priority: 3 },
  { label: 'wan2.6-image', modelId: 'wan2.6-image', kind: 'image_t2i', priority: 4 },
  { label: 'wan2.5-t2i-preview', modelId: 'wan2.5-t2i-preview', kind: 'image_t2i', priority: 5 },
  { label: 'wan2.2-t2i-plus', modelId: 'wan2.2-t2i-plus', kind: 'image_t2i', priority: 6 },
  { label: 'wan2.2-t2i-flash', modelId: 'wan2.2-t2i-flash', kind: 'image_t2i', priority: 7 },
  { label: 'wanx2.1-t2i-plus', modelId: 'wanx2.1-t2i-plus', kind: 'image_t2i', priority: 8 },
  { label: 'wanx2.0-t2i-turbo', modelId: 'wanx2.0-t2i-turbo', kind: 'image_t2i', priority: 9 },
  { label: 'wanx-v1', modelId: 'wanx-v1', kind: 'image_t2i', priority: 10 },
  { label: 'qwen-image-max-2025-12-30', modelId: 'qwen-image-max-2025-12-30', kind: 'image_t2i', priority: 11 },
  { label: 'qwen-image-max', modelId: 'qwen-image-max', kind: 'image_t2i', priority: 12 },
  { label: 'qwen-image-2.0-pro-2026-04-22', modelId: 'qwen-image-2.0-pro-2026-04-22', kind: 'image_t2i', priority: 13 },
  { label: 'qwen-image-2.0-pro-2026-03-03', modelId: 'qwen-image-2.0-pro-2026-03-03', kind: 'image_t2i', priority: 14 },
  { label: 'qwen-image-2.0-pro', modelId: 'qwen-image-2.0-pro', kind: 'image_t2i', priority: 15 },
  { label: 'qwen-image-2.0', modelId: 'qwen-image-2.0', kind: 'image_t2i', priority: 16 },
  { label: 'qwen-image-plus-2026-01-09', modelId: 'qwen-image-plus-2026-01-09', kind: 'image_t2i', priority: 17 },
  { label: 'qwen-image-plus', modelId: 'qwen-image-plus', kind: 'image_t2i', priority: 18 },
  { label: 'qwen-image', modelId: 'qwen-image', kind: 'image_t2i', priority: 19 },
  { label: 'z-image-turbo', modelId: 'z-image-turbo', kind: 'image_t2i', priority: 20 },
  { label: 'wanx-sketch-to-image-lite', modelId: 'wanx-sketch-to-image-lite', kind: 'image_t2i', priority: 21 },
  { label: 'wanx-poster-generation-v1', modelId: 'wanx-poster-generation-v1', kind: 'image_t2i', priority: 22 },
  { label: 'wanx-x-painting', modelId: 'wanx-x-painting', kind: 'image_t2i', priority: 23 },
  { label: 'wanx-virtualmodel', modelId: 'wanx-virtualmodel', kind: 'image_t2i', priority: 24 },
  { label: 'wanx-background-generation-v2', modelId: 'wanx-background-generation-v2', kind: 'image_t2i', priority: 25 },
  { label: 'wordart-semantic', modelId: 'wordart-semantic', kind: 'image_t2i', priority: 26 },
  { label: 'wordart-texture', modelId: 'wordart-texture', kind: 'image_t2i', priority: 27 },
  { label: 'aitryon', modelId: 'aitryon', kind: 'image_t2i', priority: 28 },
  { label: 'aitryon-plus', modelId: 'aitryon-plus', kind: 'image_t2i', priority: 29 },
  { label: 'aitryon-refiner', modelId: 'aitryon-refiner', kind: 'image_t2i', priority: 30 },
  { label: 'qwen-mt-image', modelId: 'qwen-mt-image', kind: 'image_t2i', priority: 31 },
]

/** 图生图 / 图像编辑 i2i */
const QWEN_I2I: QwenVisionEntry[] = [
  { label: 'qwen-image-edit-max-2026-01-16', modelId: 'qwen-image-edit-max-2026-01-16', kind: 'image_i2i', priority: 1 },
  { label: 'qwen-image-edit-max', modelId: 'qwen-image-edit-max', kind: 'image_i2i', priority: 2 },
  { label: 'qwen-image-edit-plus-2025-12-15', modelId: 'qwen-image-edit-plus-2025-12-15', kind: 'image_i2i', priority: 3 },
  { label: 'qwen-image-edit-plus-2025-10-30', modelId: 'qwen-image-edit-plus-2025-10-30', kind: 'image_i2i', priority: 4 },
  { label: 'qwen-image-edit-plus', modelId: 'qwen-image-edit-plus', kind: 'image_i2i', priority: 5 },
  { label: 'qwen-image-edit', modelId: 'qwen-image-edit', kind: 'image_i2i', priority: 6 },
  { label: 'wanx2.1-imageedit', modelId: 'wanx2.1-imageedit', kind: 'image_i2i', priority: 7 },
  { label: 'wanx-style-repaint-v1', modelId: 'wanx-style-repaint-v1', kind: 'image_i2i', priority: 8 },
  { label: 'wan2.5-i2i-preview', modelId: 'wan2.5-i2i-preview', kind: 'image_i2i', priority: 9 },
  { label: 'image-out-painting', modelId: 'image-out-painting', kind: 'image_i2i', priority: 10 },
]

/** 文生视频 */
const QWEN_T2V: QwenVisionEntry[] = [
  { label: 'wan2.7-t2v-2026-04-25', modelId: 'wan2.7-t2v-2026-04-25', kind: 'video_t2v', priority: 1 },
  { label: 'wan2.7-t2v', modelId: 'wan2.7-t2v', kind: 'video_t2v', priority: 2 },
  { label: 'wan2.6-t2v', modelId: 'wan2.6-t2v', kind: 'video_t2v', priority: 3 },
  { label: 'wanx2.2-t2v-plus', modelId: 'wanx2.2-t2v-plus', kind: 'video_t2v', priority: 4 },
  { label: 'wanx2.1-t2v-plus', modelId: 'wanx2.1-t2v-plus', kind: 'video_t2v', priority: 5 },
  { label: 'wanx2.1-t2v-turbo', modelId: 'wanx2.1-t2v-turbo', kind: 'video_t2v', priority: 6 },
  { label: 'wan2.5-t2v-preview', modelId: 'wan2.5-t2v-preview', kind: 'video_t2v', priority: 7 },
  { label: 'happyhorse-1.0-t2v', modelId: 'happyhorse-1.0-t2v', kind: 'video_t2v', priority: 8 },
]

/** 图生视频 */
const QWEN_I2V: QwenVisionEntry[] = [
  { label: 'wan2.7-i2v-2026-04-25', modelId: 'wan2.7-i2v-2026-04-25', kind: 'video_i2v', priority: 1 },
  { label: 'wan2.6-i2v-flash', modelId: 'wan2.6-i2v-flash', kind: 'video_i2v', priority: 2 },
  { label: 'wan2.6-i2v', modelId: 'wan2.6-i2v', kind: 'video_i2v', priority: 3 },
  { label: 'wan2.5-i2v-preview', modelId: 'wan2.5-i2v-preview', kind: 'video_i2v', priority: 4 },
  { label: 'wan2.2-i2v-plus', modelId: 'wan2.2-i2v-plus', kind: 'video_i2v', priority: 5 },
  { label: 'wan2.2-i2v-flash', modelId: 'wan2.2-i2v-flash', kind: 'video_i2v', priority: 6 },
  { label: 'wanx2.1-i2v-plus', modelId: 'wanx2.1-i2v-plus', kind: 'video_i2v', priority: 7 },
  { label: 'wanx2.1-i2v-turbo', modelId: 'wanx2.1-i2v-turbo', kind: 'video_i2v', priority: 8 },
  { label: 'wan2.1-i2v', modelId: 'wan2.1-i2v', kind: 'video_i2v', priority: 9 },
  { label: 'happyhorse-1.0-i2v', modelId: 'happyhorse-1.0-i2v', kind: 'video_i2v', priority: 10 },
  { label: 'wanx2.1-kf2v-plus', modelId: 'wanx2.1-kf2v-plus', kind: 'video_i2v', priority: 11 },
  { label: 'wan2.2-kf2v-flash', modelId: 'wan2.2-kf2v-flash', kind: 'video_i2v', priority: 12 },
]

/** 参考生视频 r2v */
const QWEN_R2V: QwenVisionEntry[] = [
  { label: 'wan2.7-r2v', modelId: 'wan2.7-r2v', kind: 'video_r2v', priority: 1 },
  { label: 'wan2.6-r2v', modelId: 'wan2.6-r2v', kind: 'video_r2v', priority: 2 },
  { label: 'wan2.6-r2v-flash', modelId: 'wan2.6-r2v-flash', kind: 'video_r2v', priority: 3 },
  { label: 'happyhorse-1.0-r2v', modelId: 'happyhorse-1.0-r2v', kind: 'video_r2v', priority: 4 },
  { label: 'wanx2.1-vace-plus', modelId: 'wanx2.1-vace-plus', kind: 'video_r2v', priority: 5 },
]

/** 数字人 / 口播 / 人像驱动（图生视频同型兜底） */
const QWEN_PORTRAIT: QwenVisionEntry[] = [
  { label: 'liveportrait', modelId: 'liveportrait', kind: 'video_portrait', priority: 1 },
  { label: 'animate-anyone-gen2', modelId: 'animate-anyone-gen2', kind: 'video_portrait', priority: 2 },
  { label: 'animate-anyone-template-gen2', modelId: 'animate-anyone-template-gen2', kind: 'video_portrait', priority: 3 },
  { label: 'videoretalk', modelId: 'videoretalk', kind: 'video_portrait', priority: 4 },
  { label: 'emo-v1', modelId: 'emo-v1', kind: 'video_portrait', priority: 5 },
  { label: 'wan2.2-animate-move', modelId: 'wan2.2-animate-move', kind: 'video_portrait', priority: 6 },
  { label: 'wan2.2-animate-mix', modelId: 'wan2.2-animate-mix', kind: 'video_portrait', priority: 7 },
  { label: 'wan2.2-s2v', modelId: 'wan2.2-s2v', kind: 'video_portrait', priority: 8 },
]

/** 视频编辑 */
const QWEN_VIDEO_EDIT: QwenVisionEntry[] = [
  { label: 'wan2.1-videoedit', modelId: 'wan2.1-videoedit', kind: 'video_edit', priority: 1 },
  { label: 'happyhorse-1.0-video-edit', modelId: 'happyhorse-1.0-video-edit', kind: 'video_edit', priority: 2 },
  { label: 'video-style-transform', modelId: 'video-style-transform', kind: 'video_edit', priority: 3 },
]

export const QWEN_IMAGE_CATALOG: QwenVisionEntry[] = [...QWEN_T2I, ...QWEN_I2I]

export const QWEN_VIDEO_CATALOG: QwenVisionEntry[] = [
  ...QWEN_T2V,
  ...QWEN_I2V,
  ...QWEN_R2V,
  ...QWEN_PORTRAIT,
  ...QWEN_VIDEO_EDIT,
]

export type QwenVisionMode = 't2i' | 'i2i' | 't2v' | 'i2v'

/** 千问视觉：按能力合并候选（含运营台覆盖 + 随机起点） */
export function qwenVisionModelCandidates(
  catalog: readonly QwenVisionEntry[],
  envRaw: string | undefined,
  preferredId: string | undefined,
  mode: QwenVisionMode,
): string[] {
  void catalog
  const tier = mode === 't2i' ? 'image_text' : 'vision'
  return buildVendorModelCandidates('qwen', tier, {
    envRaw,
    preferredId,
    mode,
  })
}

export function qwenImageModelCandidates(
  envRaw: string | undefined,
  preferredId: string | undefined,
  mode: 't2i' | 'i2i',
): string[] {
  return qwenVisionModelCandidates(QWEN_IMAGE_CATALOG, envRaw, preferredId, mode)
}

export function qwenVideoModelCandidates(
  envRaw: string | undefined,
  preferredId: string | undefined,
  mode: 't2v' | 'i2v',
): string[] {
  return buildVendorModelCandidates('qwen', 'vision', {
    envRaw,
    preferredId,
    mode,
  })
}

function mergeHandAndSeedCatalog(hand: QwenVisionEntry[]): QwenVisionEntry[] {
  const rows = visionSeed.models ?? []
  const out: QwenVisionEntry[] = [...hand]
  const seen = new Set(hand.map((e) => e.modelId))
  for (const r of rows) {
    if (seen.has(r.modelId)) continue
    seen.add(r.modelId)
    out.push({
      label: r.label,
      modelId: r.modelId,
      kind: r.kind as ArkCatalogEntry['kind'],
      priority: r.priority,
    })
  }
  return out
}

export const QWEN_VISION_FULL_CATALOG: QwenVisionEntry[] = mergeHandAndSeedCatalog([
  ...QWEN_IMAGE_CATALOG,
  ...QWEN_VIDEO_CATALOG,
])

/** 数字人口播口型：video_portrait 全池（默认 wan2.2-s2v 优先） */
export function qwenPortraitModelCandidates(
  envRaw: string | undefined,
  preferredId?: string,
): string[] {
  const portrait = QWEN_VISION_FULL_CATALOG.filter((e) => e.kind === 'video_portrait')
  const pref = (preferredId ?? 'wan2.2-s2v').trim()
  const merged = mergeCatalogModelIds(portrait, envRaw, pref, 'portrait')
  if (merged.length <= 1) return merged
  const prefNorm = pref
  if (merged[0] === prefNorm) {
    const rest = merged.slice(1)
    return rest.length ? [prefNorm, ...randomRotateModelIds(rest)] : [prefNorm]
  }
  return randomRotateModelIds(merged)
}
