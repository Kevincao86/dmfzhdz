/**
 * 阿里云 ICE 云剪 — 爆款字幕样式预设（浏览器 + 服务端共用）。
 * @see https://help.aliyun.com/zh/ims/developer-reference/example-of-subtitle-effects-1
 */

export type IceSubtitleStylePreset = {
  id: string
  label: string
  description: string
  /** UI 角标，如「推荐」「带货」 */
  tag?: string
  alignment: 'BottomCenter' | 'TopCenter' | 'Center' | 'TopLeft' | 'TopRight'
  y: number
  fontSize: number
  fontColor: string
  outline: number
  outlineColour: string
  fontFace?: { Bold?: boolean }
  textWidth?: number
  adaptMode?: 'AutoWrap' | 'AutoWrapAtSpaces'
  aaiMotionInEffect?: string
  aaiMotionIn?: number
  aaiMotionOutEffect?: string
  aaiMotionOut?: number
  aaiMotionLoopEffect?: string
  ratio?: number
}

/** 与 AI 混剪面板 / ICE Timeline 字幕轨同步 */
export const ICE_SUBTITLE_STYLE_PRESETS: readonly IceSubtitleStylePreset[] = [
  {
    id: 'viral-white-pop',
    label: '爆款底部白字弹入',
    description: '抖音/快手最常见口播字幕，弹簧入场',
    tag: '推荐',
    alignment: 'BottomCenter',
    y: 0.82,
    fontSize: 48,
    fontColor: '#ffffff',
    outline: 3,
    outlineColour: '#000000',
    fontFace: { Bold: true },
    textWidth: 0.88,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'spring_in',
    aaiMotionIn: 0.45,
  },
  {
    id: 'viral-yellow-shop',
    label: '带货黄字强调',
    description: '探店/带货爆款，弹性放大入场',
    tag: '带货',
    alignment: 'BottomCenter',
    y: 0.8,
    fontSize: 50,
    fontColor: '#FFE566',
    outline: 3,
    outlineColour: '#1a1a1a',
    fontFace: { Bold: true },
    textWidth: 0.86,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'elasticzoom_in',
    aaiMotionIn: 0.5,
  },
  {
    id: 'typewriter-knowledge',
    label: '打字机知识口播',
    description: '知识/测评类逐字打出效果',
    tag: '知识',
    alignment: 'BottomCenter',
    y: 0.78,
    fontSize: 44,
    fontColor: '#ffffff',
    outline: 2,
    outlineColour: '#000000',
    fontFace: { Bold: true },
    textWidth: 0.9,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'typewriter1_in',
    aaiMotionIn: 0.8,
  },
  {
    id: 'center-hook',
    label: '居中大字吸睛',
    description: '片头/金句居中放大，适合前 3 秒钩子',
    tag: '片头',
    alignment: 'Center',
    y: 0.5,
    fontSize: 56,
    fontColor: '#ffffff',
    outline: 4,
    outlineColour: '#000000',
    fontFace: { Bold: true },
    textWidth: 0.8,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'zoomin_in',
    aaiMotionIn: 0.55,
    aaiMotionOutEffect: 'fade_out',
    aaiMotionOut: 0.35,
  },
  {
    id: 'xiaohongshu-pink',
    label: '小红书粉字种草',
    description: '种草笔记风，粉字上滑入场',
    tag: '种草',
    alignment: 'BottomCenter',
    y: 0.84,
    fontSize: 46,
    fontColor: '#FF8EC8',
    outline: 2,
    outlineColour: '#2d1020',
    fontFace: { Bold: true },
    textWidth: 0.86,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'slide_up_in',
    aaiMotionIn: 0.4,
  },
  {
    id: 'live-green-promo',
    label: '直播绿字促销',
    description: '促销/限时优惠，波浪入场',
    tag: '促销',
    alignment: 'BottomCenter',
    y: 0.8,
    fontSize: 48,
    fontColor: '#66FF99',
    outline: 3,
    outlineColour: '#003311',
    fontFace: { Bold: true },
    textWidth: 0.86,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'wave_in',
    aaiMotionIn: 0.5,
    aaiMotionLoopEffect: 'rainbrush_display',
    ratio: 1.2,
  },
  {
    id: 'news-top-bar',
    label: '顶部新闻条',
    description: '资讯/公告风，黄字黑底新闻条',
    tag: '资讯',
    alignment: 'TopCenter',
    y: 0.12,
    fontSize: 40,
    fontColor: '#FFE566',
    outline: 2,
    outlineColour: '#000000',
    fontFace: { Bold: true },
    textWidth: 0.92,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'slide_down_in',
    aaiMotionIn: 0.4,
  },
  {
    id: 'slide-left-viral',
    label: '左滑入场爆款',
    description: '短剧/剧情类常见侧滑字幕',
    alignment: 'BottomCenter',
    y: 0.82,
    fontSize: 46,
    fontColor: '#ffffff',
    outline: 2,
    outlineColour: '#000000',
    fontFace: { Bold: true },
    textWidth: 0.88,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'slide_left_in',
    aaiMotionIn: 0.4,
  },
  {
    id: 'blur-atmosphere',
    label: '氛围模糊渐入',
    description: 'Vlog/氛围感，柔和模糊入场',
    tag: '氛围',
    alignment: 'BottomCenter',
    y: 0.85,
    fontSize: 40,
    fontColor: '#F0F0F0',
    outline: 1,
    outlineColour: '#333333',
    textWidth: 0.9,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'blur_in',
    aaiMotionIn: 0.6,
    aaiMotionOutEffect: 'dissolve_out',
    aaiMotionOut: 0.35,
  },
  {
    id: 'cinematic-sub',
    label: '电影感小字',
    description: '纪录片/品牌片，底部小字淡入',
    alignment: 'BottomCenter',
    y: 0.9,
    fontSize: 36,
    fontColor: '#E8E8E8',
    outline: 1,
    outlineColour: '#1a1a1a',
    textWidth: 0.92,
    adaptMode: 'AutoWrap',
    aaiMotionInEffect: 'fade_in',
    aaiMotionIn: 0.5,
  },
  {
    id: 'classic-white',
    label: '经典底部白字',
    description: '无动画，稳重白字黑边（旧版默认）',
    alignment: 'BottomCenter',
    y: 0.8,
    fontSize: 44,
    fontColor: '#ffffff',
    outline: 2,
    outlineColour: '#000000',
    fontFace: { Bold: true },
    textWidth: 0.86,
    adaptMode: 'AutoWrap',
  },
] as const

export const ICE_SUBTITLE_STYLE_DEFAULT_ID = 'viral-white-pop'

export function resolveIceSubtitleStylePreset(idOrLabel: string): IceSubtitleStylePreset {
  const key = String(idOrLabel || '').trim()
  const hit = ICE_SUBTITLE_STYLE_PRESETS.find((p) => p.id === key)
  if (hit) return hit
  const byLabel = ICE_SUBTITLE_STYLE_PRESETS.find((p) => p.label === key)
  return byLabel ?? ICE_SUBTITLE_STYLE_PRESETS.find((p) => p.id === ICE_SUBTITLE_STYLE_DEFAULT_ID)!
}

export function buildIceSubtitleTextClip(
  preset: IceSubtitleStylePreset,
  text: string,
  timelineIn: number,
  timelineOut: number,
): Record<string, unknown> {
  const clip: Record<string, unknown> = {
    Type: 'Text',
    Content: text.replace(/\n/g, '\\N'),
    TimelineIn: timelineIn,
    TimelineOut: timelineOut,
    Alignment: preset.alignment,
    Y: preset.y,
    FontSize: preset.fontSize,
    FontColor: preset.fontColor,
    Outline: preset.outline,
    OutlineColour: preset.outlineColour,
    AdaptMode: preset.adaptMode ?? 'AutoWrap',
  }
  if (preset.textWidth != null) clip.TextWidth = preset.textWidth
  if (preset.fontFace) clip.FontFace = preset.fontFace
  if (preset.aaiMotionInEffect) {
    clip.AaiMotionInEffect = preset.aaiMotionInEffect
    clip.AaiMotionIn = preset.aaiMotionIn ?? 0.45
  }
  if (preset.aaiMotionOutEffect) {
    clip.AaiMotionOutEffect = preset.aaiMotionOutEffect
    clip.AaiMotionOut = preset.aaiMotionOut ?? 0.35
  }
  if (preset.aaiMotionLoopEffect) {
    clip.AaiMotionLoopEffect = preset.aaiMotionLoopEffect
    if (preset.ratio != null) clip.Ratio = preset.ratio
  }
  return clip
}

/** IMS 批量一键成片 AsrConfig（Y 为字幕框左上角；竖屏底部官方默认 TopCenter + Y≈0.8） */
export function buildSmartBatchAsrConfig(preset: IceSubtitleStylePreset): Record<string, unknown> {
  let alignment = preset.alignment
  let y = preset.y

  if (preset.alignment === 'BottomCenter') {
    alignment = 'TopCenter'
    y = Math.min(0.9, Math.max(0.74, preset.y))
  } else if (preset.alignment === 'Center') {
    alignment = 'TopCenter'
    y = Math.min(0.62, Math.max(0.35, preset.y - 0.05))
  } else if (preset.alignment === 'TopCenter') {
    y = Math.min(0.2, Math.max(0.06, preset.y))
  }

  const cfg: Record<string, unknown> = {
    Alignment: alignment,
    AdaptMode: preset.adaptMode ?? 'AutoWrap',
    Y: y,
    FontSize: preset.fontSize,
    FontColor: preset.fontColor,
    Outline: preset.outline,
    OutlineColour: preset.outlineColour,
    Font: 'Alibaba PuHuiTi 2.0 65 Medium',
    SizeRequestType: 'Nominal',
    Spacing: -1,
  }
  if (preset.textWidth != null) cfg.TextWidth = preset.textWidth
  if (preset.fontFace) cfg.FontFace = preset.fontFace
  if (preset.aaiMotionInEffect) {
    cfg.AaiMotionInEffect = preset.aaiMotionInEffect
    cfg.AaiMotionIn = preset.aaiMotionIn ?? 0.45
  }
  if (preset.aaiMotionOutEffect) {
    cfg.AaiMotionOutEffect = preset.aaiMotionOutEffect
    cfg.AaiMotionOut = preset.aaiMotionOut ?? 0.35
  }
  if (preset.aaiMotionLoopEffect) {
    cfg.AaiMotionLoopEffect = preset.aaiMotionLoopEffect
    if (preset.ratio != null) cfg.Ratio = preset.ratio
  }
  return cfg
}
