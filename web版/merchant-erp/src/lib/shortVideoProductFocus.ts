/**
 * 短视频 · 重点产品图：分镜段识别、抠图参考、成片时段叠加
 */
import { mattePortraitWithFallback } from './digitalHumanPortraitMatting'

export const SHORT_VIDEO_PRODUCT_SEGMENT_MARKER = '【产品特写段】'

const PRODUCT_SEGMENT_RE =
  /产品特写|产品展示|包装展示|商品特写|卖点展示|手持产品|展示产品|产品镜头|产品画面|【产品呈现】|【产品特写段】|product\s*(shot|close|hero)/i

/** 上传产品图后写入分镜策划的说明（开场不抢产品，中后段特写） */
export function shortVideoProductPlannerHint(): string {
  return (
    '【产品呈现】用户已上传重点产品参考图。整体先铺垫场景/人物/卖点，在中后段（约总时长 35%～80%）安排 1 段产品特写分镜；' +
    '该段 visual/prompt 须含「产品特写」或「包装展示」，并在段首标注「【产品特写段】」；开场段勿让产品占满画面。'
  )
}

export function productSegmentI2vPromptSuffix(): string {
  return (
    `${SHORT_VIDEO_PRODUCT_SEGMENT_MARKER}参考图1为已抠图产品主体，须与场景自然融合：` +
    '产品居中或略偏下，占画面 35%～55%，轮廓与包装细节清晰锐利，柔光与轻微侧光突出材质质感与高光，缓慢推近或环绕，景深干净，禁止模糊遮挡、灰雾与文字乱码。'
  )
}

export function isProductFocusSegmentPrompt(prompt: string): boolean {
  return PRODUCT_SEGMENT_RE.test(String(prompt || ''))
}

/** 从策划分镜中找出应挂载产品参考图的段序号 */
export function resolveProductFocusSegmentIndices(prompts: string[]): number[] {
  const out: number[] = []
  for (let i = 0; i < prompts.length; i++) {
    if (isProductFocusSegmentPrompt(prompts[i]!)) out.push(i)
  }
  return out
}

/** 未标注产品段时：默认中后段（非开场）展示产品 */
export function resolveDefaultProductSegmentIndex(segmentCount: number): number {
  if (segmentCount <= 1) return 0
  if (segmentCount === 2) return 1
  return Math.min(segmentCount - 1, Math.max(1, Math.floor(segmentCount * 0.42)))
}

export function effectiveProductFocusIndices(prompts: string[]): number[] {
  const found = resolveProductFocusSegmentIndices(prompts)
  if (found.length) return found
  if (prompts.length <= 0) return []
  return [resolveDefaultProductSegmentIndex(prompts.length)]
}

export async function prepareShortVideoProductRefDataUrl(productPureB64: string): Promise<string> {
  const matted = await mattePortraitWithFallback(productPureB64.replace(/\s/g, ''))
  const b = matted.replace(/\s/g, '')
  return b.startsWith('data:') ? b : `data:image/png;base64,${b}`
}

/** 单段短片：中后段叠加产品（与口播铺垫衔接） */
export function resolveShortVideoProductOverlayWindow(videoDurSec: number): {
  startSec: number
  endSec: number
} {
  const dur = Math.max(1, videoDurSec)
  const startSec = Math.min(Math.max(dur * 0.32, 1.2), dur - 1.8)
  const endSec = Math.min(dur - 0.2, Math.max(startSec + 1.5, dur * 0.88))
  return { startSec, endSec }
}

/** 长视频：按产品特写分镜的实际时间段叠加 */
export function resolveProductOverlayWindowForSegment(
  segmentDurations: number[],
  productSegmentIndex: number,
): { startSec: number; endSec: number } {
  let start = 0
  for (let i = 0; i < productSegmentIndex; i++) start += segmentDurations[i] ?? 0
  const segDur = segmentDurations[productSegmentIndex] ?? 5
  const pad = Math.min(0.35, segDur * 0.1)
  return {
    startSec: start + pad,
    endSec: start + Math.max(segDur - pad, pad + 0.8),
  }
}

export function appendProductSegmentI2vPrompt(prompt: string): string {
  const p = prompt.trim()
  const suffix = productSegmentI2vPromptSuffix()
  if (p.includes(SHORT_VIDEO_PRODUCT_SEGMENT_MARKER)) return p
  return `${p}\n${suffix}`
}

/** 将产品参考图与段参考图合并（产品图优先作参考图1） */
export function mergeProductRefImages(
  productRefDataUrl: string,
  segmentImages: string[] | undefined,
): string[] {
  const seg = (segmentImages ?? []).filter(Boolean)
  const withoutDup = seg.filter((u) => u !== productRefDataUrl)
  return [productRefDataUrl, ...withoutDup]
}
