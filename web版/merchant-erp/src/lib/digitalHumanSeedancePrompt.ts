/**
 * 数字人口播 — 豆包 Seedance 图生视频提示词（与短视频模块同源约束）
 */
import type { DigitalHumanDraft } from './digitalHumanBroadcast'
import { avatarBodyFrameLabel, backgroundPromptForDraft } from './digitalHumanBroadcast'
import {
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SEEDANCE_I2V_MAX_CONTENT_TEXT,
  clampSeedanceContentText,
  sanitizePromptForVideoModel,
} from './shortVideoNarrationExtract'

export const DH_SEEDANCE_SEGMENT_SEC = 5
export const DH_SEEDANCE_MAX_SEGMENTS = 12

const DH_PROMPT_MAX = SEEDANCE_I2V_MAX_CONTENT_TEXT

function clip(s: string, max: number): string {
  const t = String(s ?? '').trim()
  if (t.length <= max) return t
  return t.slice(0, max).trim()
}

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
  return draft.frameMode === 'full' ? '全身入镜' : '半身胸像'
}

const GESTURE_SEEDANCE_HINTS: Record<string, string> = {
  emphasis: '单手向前强调比划，目光坚定，肩臂自然摆动',
  point: '食指指向画面一侧引导注意力，另一手自然下垂',
  welcome: '面向镜头友好挥手欢迎，表情亲切',
  explain: '双手配合讲解比划，掌心适度展开',
  nod: '口播时轻微点头示意，颈部自然',
  thumbs: '竖起大拇指点赞，手臂在胸前一收一放',
  celebrate: '双臂小幅张开庆祝，活力 upbeat',
}

function motionBlock(
  draft: DigitalHumanDraft,
  segmentMotion?: string,
  gestureOverride?: string,
): string {
  const raw = (segmentMotion ?? '').trim()
  const presetId =
    gestureOverride && gestureOverride !== 'none'
      ? gestureOverride
      : draft.gesturePreset && draft.gesturePreset !== 'none'
        ? draft.gesturePreset
        : ''
  const parts: string[] = []
  if (raw) parts.push(clip(raw, 40))
  const hint = presetId ? GESTURE_SEEDANCE_HINTS[presetId] : ''
  if (hint) parts.push(hint)
  if (!parts.length) parts.push('自然口播微动，口型与语句同步')
  return parts.join('，')
}

/** 单段 Seedance 提示词：紧凑单行，避免方舟 Invalid content.text */
export function buildDhSeedanceSegmentPrompt(
  draft: DigitalHumanDraft,
  scriptChunk: string,
  opts?: {
    segmentIndex?: number
    segmentTotal?: number
    motionText?: string
    gesturePreset?: string
    continuation?: boolean
    hasProductFusion?: boolean
  },
): string {
  void scriptChunk
  const bg = clip(backgroundPromptForDraft(draft), 40)
  const frame = frameDesc(draft)
  const idx = (opts?.segmentIndex ?? 0) + 1
  const total = opts?.segmentTotal ?? 1
  const motion = clip(motionBlock(draft, opts?.motionText, opts?.gesturePreset), 72)
  const outfit = clip(draft.outfit || '同参考', 16)

  let body: string
  if (opts?.continuation) {
    body = [
      '竖屏9:16口播续镜，同一人物同服装同场景，动作连续。',
      `动作：${motion}。`,
      opts?.hasProductFusion ? '双参考图自然手持产品。' : '',
      SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
      SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
    ]
      .filter(Boolean)
      .join('')
  } else {
    body = [
      `竖屏9:16数字人口播，参考图人物为主播，${frame}，保持五官发型一致。`,
      `背景替换为${bg}，服装${outfit}。`,
      total > 1 ? `分镜${idx}/${total}约${DH_SEEDANCE_SEGMENT_SEC}秒。` : '',
      opts?.hasProductFusion ? '人物与抠图产品自然融合，禁止贴片悬浮。' : '',
      `动作：${motion}。`,
      SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
      SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
    ]
      .filter(Boolean)
      .join('')
  }

  body = sanitizePromptForVideoModel(body)
  return clampSeedanceContentText(body, DH_PROMPT_MAX)
}
