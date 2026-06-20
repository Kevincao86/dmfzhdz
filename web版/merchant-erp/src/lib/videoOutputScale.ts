/** 短视频生成：画面比例 / 帧率 → 拼接归一化像素与 ffmpeg 滤镜 */

export type VideoAspectRatio = '16:9' | '9:16' | '1:1'

export function parseVideoAspectRatio(raw?: string): VideoAspectRatio {
  if (raw === '16:9' || raw === '1:1' || raw === '9:16') return raw
  return '9:16'
}

export function parseVideoFps(raw?: number | string): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
  if (n === 24 || n === 30) return n
  return 24
}

/** 720p 档位目标像素（与 Seedance / 千问 720P 输出一致，供拼接归一化） */
export function videoScaleDims720(ratio: VideoAspectRatio): { w: number; h: number } {
  if (ratio === '16:9') return { w: 1280, h: 720 }
  if (ratio === '1:1') return { w: 720, h: 720 }
  return { w: 720, h: 1280 }
}

export function buildFfmpegScalePadFpsFilter(w: number, h: number, fps: number): string {
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`
}

export type VideoConcatNormalizeOpts = {
  ratio?: string
  fps?: number | string
}

export function resolveConcatNormalizeFilter(opts?: VideoConcatNormalizeOpts): string {
  const ratio = parseVideoAspectRatio(opts?.ratio)
  const fps = parseVideoFps(opts?.fps)
  const { w, h } = videoScaleDims720(ratio)
  return buildFfmpegScalePadFpsFilter(w, h, fps)
}
