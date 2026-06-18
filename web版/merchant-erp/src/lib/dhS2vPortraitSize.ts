/** wan2.2-s2v 人像分辨率约束（前后端共用） */
export const S2V_MIN_SIDE = 401
export const S2V_MAX_SIDE = 6999
/** 口播成片推荐输入：竖版 9:16，短边至少 720 */
export const S2V_TARGET_MIN_SIDE = 720
export const S2V_PORTRAIT_OUT_WIDTH = 720
export const S2V_PORTRAIT_OUT_HEIGHT = 1280
export const S2V_PORTRAIT_MAX_WIDTH = 1080
export const S2V_PORTRAIT_MAX_HEIGHT = 1920
const PORTRAIT_ASPECT = 9 / 16
const ASPECT_EPS = 0.02

export type PortraitCropRect = {
  left: number
  top: number
  width: number
  height: number
}

/** 居中裁切为 9:16 竖版；半身取上段，全身尽量保留完整纵向画面 */
export function computePortraitCenterCrop(
  w: number,
  h: number,
  frameMode: 'half' | 'full' = 'half',
): PortraitCropRect {
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

export function computeS2vPortraitSize(w: number, h: number, frameMode: 'half' | 'full' = 'half'): { width: number; height: number } {
  if (w <= 0 || h <= 0) throw new Error('无法读取人像尺寸')
  const crop = computePortraitCenterCrop(w, h, frameMode)
  let width = crop.width
  let height = crop.height

  const upscaleIfNeeded = () => {
    const minSide = Math.min(width, height)
    if (minSide < S2V_TARGET_MIN_SIDE) {
      const scale = S2V_TARGET_MIN_SIDE / minSide
      width = Math.max(S2V_MIN_SIDE + 1, Math.round(width * scale))
      height = Math.max(S2V_MIN_SIDE + 1, Math.round(height * scale))
    }
  }
  const downscaleIfNeeded = () => {
    if (width > S2V_PORTRAIT_MAX_WIDTH || height > S2V_PORTRAIT_MAX_HEIGHT) {
      const scale = Math.min(S2V_PORTRAIT_MAX_WIDTH / width, S2V_PORTRAIT_MAX_HEIGHT / height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
    const maxSide = Math.max(width, height)
    if (maxSide >= 7000) {
      const scale = S2V_MAX_SIDE / maxSide
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }
  }

  upscaleIfNeeded()
  downscaleIfNeeded()
  upscaleIfNeeded()
  return { width, height }
}

export function portraitNeedsS2vNormalize(w: number, h: number, frameMode: 'half' | 'full' = 'half'): boolean {
  if (w <= 0 || h <= 0) return true
  const crop = computePortraitCenterCrop(w, h, frameMode)
  const aspectOk = Math.abs(crop.width / crop.height - PORTRAIT_ASPECT) <= ASPECT_EPS
  const minOk = Math.min(crop.width, crop.height) >= S2V_TARGET_MIN_SIDE
  const maxOk = Math.max(crop.width, crop.height) <= S2V_PORTRAIT_MAX_HEIGHT + 8
  const { width, height } = computeS2vPortraitSize(w, h, frameMode)
  return !aspectOk || !minOk || !maxOk || width !== w || height !== h
}
