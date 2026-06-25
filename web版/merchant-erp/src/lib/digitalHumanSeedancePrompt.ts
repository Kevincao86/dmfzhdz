/**
 * 数字人口播 — 豆包 Seedance 图生视频提示词（与短视频模块同源约束）
 */
import type { DigitalHumanDraft } from './digitalHumanBroadcast'
import { avatarBodyFrameLabel, backgroundPromptForDraft } from './digitalHumanBroadcast'
import {
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  sanitizePromptForVideoModel,
} from './shortVideoNarrationExtract'
import { appendAspectToVideoPrompt } from './shortVideoRenderFlags'
import { productFocusPromptSuffix } from '../services/shortVideoGuidanceAi'

export const DH_SEEDANCE_SEGMENT_SEC = 5
export const DH_SEEDANCE_MAX_SEGMENTS = 12

/** 口播稿按约 5 秒一段切分（图生视频 i2v 常用 3/4/5 秒） */
export function chunkScriptForSeedanceVideo(script: string, maxLen = 42): string[] {
  const text = script.trim()
  if (!text) return []
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let rest = text
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('。', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('！', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('？', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('，', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf(' ', maxLen)
    if (cut < 0) cut = maxLen
    chunks.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) chunks.push(rest)
  return chunks.filter((c) => c.length >= 2)
}

export function estimateDhTargetDurationSec(script: string): number {
  const len = script.trim().length
  if (len <= 0) return DH_SEEDANCE_SEGMENT_SEC
  return Math.min(15, Math.max(8, Math.ceil(len * 0.38)))
}

function frameDesc(draft: DigitalHumanDraft): string {
  return draft.frameMode === 'full'
    ? '全身入镜，脚或鞋可见，人物占画面主体'
    : '半身胸像，头部与肩胸清晰'
}

function motionBlock(draft: DigitalHumanDraft, segmentMotion?: string): string {
  const raw = (segmentMotion ?? draft.motionInstructions ?? '').trim()
  const gesture = draft.gesturePreset !== 'none' ? draft.gesturePreset : ''
  const parts: string[] = []
  if (raw) parts.push(`严格执行动作指令：${raw}`)
  if (gesture === 'welcome') parts.push('缓慢拉远镜头，友好挥手')
  if (gesture === 'point') parts.push('手指指向镜头侧方引导')
  if (gesture === 'explain') parts.push('讲解手势，稳镜头微推')
  if (gesture === 'nod') parts.push('轻微点头')
  if (gesture === 'thumbs') parts.push('竖拇指点赞')
  if (gesture === 'celebrate') parts.push('活力庆祝动作')
  if (gesture === 'emphasis') parts.push('缓慢推近强调')
  if (!parts.length) parts.push('自然口播微动，面向镜头，禁止僵硬站桩')
  return parts.join('；')
}

/** 单段 Seedance 提示词：参考图人物 + 场景替换 + 动作 + 禁止画面内文字 */
export function buildDhSeedanceSegmentPrompt(
  draft: DigitalHumanDraft,
  scriptChunk: string,
  opts?: {
    segmentIndex?: number
    segmentTotal?: number
    motionText?: string
    continuation?: boolean
    /** 已上传并抠图的产品参考 */
    hasProductFusion?: boolean
  },
): string {
  const bg = backgroundPromptForDraft(draft)
  const frame = frameDesc(draft)
  const idx = (opts?.segmentIndex ?? 0) + 1
  const total = opts?.segmentTotal ?? 1
  const chunk = scriptChunk.trim()

  const lines: string[] = []
  if (opts?.continuation) {
    lines.push(
      '承接上一段视频结尾画面，同一人物同一服装同一场景，镜头与动作连续，禁止跳切换脸。',
    )
  } else {
    lines.push(
      `竖屏数字人口播短视频。参考图中的人物为主播，${frame}。`,
      `【背景】完全替换参考图中的原始背景，不要保留餐厅/街道/室内杂景；新场景：${bg}。`,
      `人物服装：${draft.outfit || '与参考图一致'}；发型：${draft.hairstyle || '与参考图一致'}。`,
    )
  }

  if (chunk) {
    lines.push(
      `本段为口播第 ${idx}/${total} 段，时长约 ${DH_SEEDANCE_SEGMENT_SEC} 秒；口型与表情自然配合后续配音节奏，流畅全身/半身动作。`,
      '禁止在画面内渲染口播原文、字幕、标题或任何文字字符；文案由后期 TTS 与字幕合成。',
    )
  }

  lines.push(
    '画面要求：动作连贯流畅、镜头稳定、人物完整入镜；口型与后续配音节奏一致，禁止僵硬站桩或仅嘴部抖动。',
  )

  lines.push(`构图：${avatarBodyFrameLabel(draft.frameMode)}，主体居中，9:16 手机竖屏。`)
  lines.push(motionBlock(draft, opts?.motionText))
  if (opts?.hasProductFusion) {
    lines.push(
      '【手持产品融合】参考图1为数字人场景，参考图2为已抠图产品。须将产品自然握持或托举于胸前/掌心，手指与产品边缘遮挡关系真实，光影与场景一致；禁止简单贴片叠加或悬浮。',
      productFocusPromptSuffix(),
    )
  }
  if (total > 1) {
    lines.push(`分镜进度：第 ${idx}/${total} 段，时长约 ${DH_SEEDANCE_SEGMENT_SEC} 秒。`)
  }

  let body = lines.join('\n')
  body = sanitizePromptForVideoModel(body)
  if (!body.includes('【动作运镜】')) {
    body = `${body}\n${SHORT_VIDEO_MOTION_PROMPT_SUFFIX}`
  }
  if (!body.includes('【画面约束】')) {
    body = `${body}\n${SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX}`
  }
  return appendAspectToVideoPrompt(
    body,
    `--dur ${DH_SEEDANCE_SEGMENT_SEC} --ratio 9:16`,
  )
}
