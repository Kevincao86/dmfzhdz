/**
 * TokenMix / gpt-image-* 自定义尺寸约束（以中继实际上限为准）：
 * - 两边均为 16 的倍数
 * - 最长边 ≤ 1280（三连超宽优先出图速度；过大 TokenMix 创建/排队易卡死）
 * - 长短边比 ≤ 3:1
 * - 总像素 ∈ [655360, 1280*1280]
 */
const GPT_IMAGE2_MAX_EDGE = 1280
const GPT_IMAGE2_MAX_RATIO = 3
const GPT_IMAGE2_MAX_PIXELS = GPT_IMAGE2_MAX_EDGE * GPT_IMAGE2_MAX_EDGE
const GPT_IMAGE2_MIN_PIXELS = 655_360

function snap16(n: number): number {
  return Math.max(16, Math.floor(n / 16) * 16)
}

export function fitGptImage2Size(
  idealW: number,
  idealH: number,
): { width: number; height: number; size: string; clampedAspect: boolean } {
  let w = Math.max(1, Math.round(idealW))
  let h = Math.max(1, Math.round(idealH))
  const landscape = w >= h
  let ratio = landscape ? w / h : h / w
  let clampedAspect = false
  if (ratio > GPT_IMAGE2_MAX_RATIO) {
    clampedAspect = true
    if (landscape) h = Math.max(1, Math.round(w / GPT_IMAGE2_MAX_RATIO))
    else w = Math.max(1, Math.round(h / GPT_IMAGE2_MAX_RATIO))
    ratio = GPT_IMAGE2_MAX_RATIO
  }

  const maxSide = Math.max(w, h)
  if (maxSide > GPT_IMAGE2_MAX_EDGE) {
    const s = GPT_IMAGE2_MAX_EDGE / maxSide
    w = Math.round(w * s)
    h = Math.round(h * s)
  }

  w = snap16(Math.min(w, GPT_IMAGE2_MAX_EDGE))
  h = snap16(Math.min(h, GPT_IMAGE2_MAX_EDGE))

  if (Math.max(w, h) / Math.min(w, h) > GPT_IMAGE2_MAX_RATIO + 0.001) {
    if (w >= h) h = snap16(Math.ceil(w / GPT_IMAGE2_MAX_RATIO))
    else w = snap16(Math.ceil(h / GPT_IMAGE2_MAX_RATIO))
  }

  while (
    (w * h > GPT_IMAGE2_MAX_PIXELS || w > GPT_IMAGE2_MAX_EDGE || h > GPT_IMAGE2_MAX_EDGE) &&
    Math.min(w, h) > 16
  ) {
    if (w >= h) {
      w = snap16(Math.min(w - 16, GPT_IMAGE2_MAX_EDGE))
      h = snap16(Math.min(Math.round(w / Math.min(ratio, GPT_IMAGE2_MAX_RATIO)), GPT_IMAGE2_MAX_EDGE))
    } else {
      h = snap16(Math.min(h - 16, GPT_IMAGE2_MAX_EDGE))
      w = snap16(Math.min(Math.round(h / Math.min(ratio, GPT_IMAGE2_MAX_RATIO)), GPT_IMAGE2_MAX_EDGE))
    }
  }

  while (w * h < GPT_IMAGE2_MIN_PIXELS && Math.max(w, h) < GPT_IMAGE2_MAX_EDGE) {
    if (w >= h) {
      w = snap16(Math.min(w + 16, GPT_IMAGE2_MAX_EDGE))
      h = snap16(Math.max(16, Math.round(w / Math.min(ratio, GPT_IMAGE2_MAX_RATIO))))
    } else {
      h = snap16(Math.min(h + 16, GPT_IMAGE2_MAX_EDGE))
      w = snap16(Math.max(16, Math.round(h / Math.min(ratio, GPT_IMAGE2_MAX_RATIO))))
    }
  }

  w = snap16(Math.min(w, GPT_IMAGE2_MAX_EDGE))
  h = snap16(Math.min(h, GPT_IMAGE2_MAX_EDGE))

  return { width: w, height: h, size: `${w}x${h}`, clampedAspect }
}

/** 将万相 `W*H` / `WxH` 转为 GPT Image 2 可用 `WxH` */
export function wanxSizeToGptImage2Size(wanxSize: string | undefined): string | undefined {
  const t = (wanxSize ?? '').trim()
  if (!t) return undefined
  const m = t.match(/^(\d+)\s*[x*×]\s*(\d+)$/i)
  if (!m) return undefined
  return fitGptImage2Size(Number(m[1]), Number(m[2])).size
}
