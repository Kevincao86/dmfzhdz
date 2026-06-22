import { parseSeedanceCliFlags } from './arkVideoEndpointsConfig'
import { parseVideoAspectRatio, type VideoAspectRatio } from './videoOutputScale'

export const DEFAULT_SHORT_VIDEO_ASPECT: VideoAspectRatio = '9:16'

export function parseAspectFromVideoFlags(flags?: string): VideoAspectRatio {
  const ratio = parseSeedanceCliFlags(flags ?? '').ratio
  return parseVideoAspectRatio(ratio ?? DEFAULT_SHORT_VIDEO_ASPECT)
}

/** 写入视频提示词，避免模型忽略 API 画幅参数 */
export function videoPromptAspectSuffix(ratio: VideoAspectRatio): string {
  if (ratio === '9:16') {
    return '【画幅】竖屏9:16，手机全屏纵向构图，人物主体居中，禁止横屏16:9宽银幕'
  }
  if (ratio === '1:1') return '【画幅】方形1:1构图，画面四边等宽'
  return '【画幅】横屏16:9宽银幕构图'
}

export function appendAspectToVideoPrompt(prompt: string, flags?: string): string {
  const p = String(prompt || '').trim()
  if (!p) return p
  if (/【画幅】|竖屏\s*9:16|9:16|16:9/i.test(p)) return p
  const suffix = videoPromptAspectSuffix(parseAspectFromVideoFlags(flags))
  return `${p}\n${suffix}`
}
