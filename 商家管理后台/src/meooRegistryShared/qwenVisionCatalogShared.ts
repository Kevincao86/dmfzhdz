/**
 * 千问 / 百炼视频模型内置目录（与 ERP `qwenVisionCatalog.ts` 保持同步）。
 */
import type { ArkCatalogEntry } from './arkModelCatalogShared.js'

/** 文生视频 */
const QWEN_T2V: ArkCatalogEntry[] = [
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
const QWEN_I2V: ArkCatalogEntry[] = [
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

/** 参考生视频 */
const QWEN_R2V: ArkCatalogEntry[] = [
  { label: 'wan2.7-r2v', modelId: 'wan2.7-r2v', kind: 'video_r2v', priority: 1 },
  { label: 'wan2.6-r2v', modelId: 'wan2.6-r2v', kind: 'video_r2v', priority: 2 },
  { label: 'wan2.6-r2v-flash', modelId: 'wan2.6-r2v-flash', kind: 'video_r2v', priority: 3 },
  { label: 'happyhorse-1.0-r2v', modelId: 'happyhorse-1.0-r2v', kind: 'video_r2v', priority: 4 },
  { label: 'wanx2.1-vace-plus', modelId: 'wanx2.1-vace-plus', kind: 'video_r2v', priority: 5 },
]

/** 数字人 / 口播 */
const QWEN_PORTRAIT: ArkCatalogEntry[] = [
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
const QWEN_VIDEO_EDIT: ArkCatalogEntry[] = [
  { label: 'wan2.1-videoedit', modelId: 'wan2.1-videoedit', kind: 'video_edit', priority: 1 },
  { label: 'happyhorse-1.0-video-edit', modelId: 'happyhorse-1.0-video-edit', kind: 'video_edit', priority: 2 },
  { label: 'video-style-transform', modelId: 'video-style-transform', kind: 'video_edit', priority: 3 },
]

/** 运营台「千问 · 视频模型」内置全量目录 */
export const QWEN_VIDEO_CATALOG: ArkCatalogEntry[] = [
  ...QWEN_T2V,
  ...QWEN_I2V,
  ...QWEN_R2V,
  ...QWEN_PORTRAIT,
  ...QWEN_VIDEO_EDIT,
]
