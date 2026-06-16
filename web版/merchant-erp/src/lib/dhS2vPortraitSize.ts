/** wan2.2-s2v 人像分辨率约束（前后端共用） */
export const S2V_MIN_SIDE = 401
export const S2V_MAX_SIDE = 6999
export const S2V_TARGET_MIN_SIDE = 480

export function computeS2vPortraitSize(w: number, h: number): { width: number; height: number } {
  if (w <= 0 || h <= 0) throw new Error('无法读取人像尺寸')
  let width = w
  let height = h
  const upscaleIfNeeded = () => {
    const minSide = Math.min(width, height)
    if (minSide <= S2V_MIN_SIDE) {
      const scale = S2V_TARGET_MIN_SIDE / minSide
      width = Math.max(S2V_MIN_SIDE + 1, Math.round(width * scale))
      height = Math.max(S2V_MIN_SIDE + 1, Math.round(height * scale))
    }
  }
  const downscaleIfNeeded = () => {
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

export function portraitNeedsS2vNormalize(w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return true
  const { width, height } = computeS2vPortraitSize(w, h)
  return width !== w || height !== h || Math.min(w, h) <= S2V_MIN_SIDE || Math.max(w, h) >= 7000
}
