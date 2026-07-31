/**
 * 数字人口播 — 豆包 Seedance 图生视频提示词（与短视频模块同源约束）
 */
import type { DigitalHumanDraft } from './digitalHumanBroadcast'
import { backgroundPromptForDraft } from './digitalHumanBroadcast'
import { briefPromptSuffix, type ShortVideoGenBrief } from './shortVideoGenBrief'
import {
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SEEDANCE_I2V_MAX_CONTENT_TEXT,
  clampSeedanceContentText,
  sanitizePromptForVideoModel,
} from './shortVideoNarrationExtract'

export const DH_SEEDANCE_SEGMENT_SEC = 5
export const DH_SEEDANCE_MAX_SEGMENTS = 12
/** 中文口播约 4 字/秒 → 5 秒画面约 18～20 字，避免一段 TTS 远长于画面 */
export const DH_SEEDANCE_CHARS_PER_SEGMENT = 20

/** OmniHuman 单段音频建议 ≤30s（API 约 35s 上限）；中文约 4 字/秒 → ~110 字 */
export const DH_OMNIHUMAN_CHARS_PER_SEGMENT = 110
export const DH_OMNIHUMAN_MAX_AUDIO_SEC = 30
export const DH_OMNIHUMAN_MAX_SEGMENTS = 8

const DH_PROMPT_MAX = SEEDANCE_I2V_MAX_CONTENT_TEXT

function clip(s: string, max: number): string {
  const t = String(s ?? '').trim()
  if (t.length <= max) return t
  return t.slice(0, max).trim()
}

/** OmniHuman：按口播秒数切分文案（单段约 30s） */
export function chunkScriptForOmniHumanVideo(script: string): string[] {
  return chunkScriptForSeedanceVideo(script, DH_OMNIHUMAN_CHARS_PER_SEGMENT).slice(
    0,
    DH_OMNIHUMAN_MAX_SEGMENTS,
  )
}

/** OmniHuman 单段驱动提示（可选，控制表情/动作） */
export function buildDhOmniHumanPrompt(
  draft: DigitalHumanDraft,
  opts?: {
    motionText?: string
    gesturePreset?: string
    /** 本段口播摘要，用于手势/主题一致 */
    scriptHint?: string
    /** 已上传产品图并做手持融合时为 true */
    hasProductFusion?: boolean
  },
): string {
  const bg = clip(backgroundPromptForDraft(draft), 36)
  const frame = frameDesc(draft)
  const motion = clip(motionBlock(draft, opts?.motionText, opts?.gesturePreset), 56)
  const theme = opts?.scriptHint?.trim()
    ? `口播主题：${clip(opts.scriptHint, 40)}，手势含义须与主题一致。`
    : ''
  // 未开启手持产品时：禁止模型凭空捏造瓶罐/化妆品等实物（常见误伤）
  const hands = opts?.hasProductFusion
    ? '人物自然手持参考图中的产品，禁止换成其它品类。'
    : '双手自然空闲或仅做空手比划，禁止凭空手持瓶罐、化妆品、面霜、包装盒、餐盒等任何实物道具；口播提到食品时用手势比划外形即可，画面不得出现未提供的实物。'
  const body = [
    `竖屏9:16数字人口播，人物已站在场景（${bg}）中，${frame}。`,
    '口型与驱动音频严格同步，表情自然，禁止灰底矩形贴片。',
    theme,
    hands,
    `动作：${motion}。`,
    SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  ]
    .filter(Boolean)
    .join('')
  return clampSeedanceContentText(sanitizePromptForVideoModel(body), DH_PROMPT_MAX)
}

/** 口播稿按约 5 秒一段切分（图生视频 i2v 常用 3/4/5 秒） */
export function chunkScriptForSeedanceVideo(
  script: string,
  maxLen = DH_SEEDANCE_CHARS_PER_SEGMENT,
): string[] {
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

/** 目标成片时长：跟口播字数走，上限 = 最大段数 × 段长 */
export function estimateDhTargetDurationSec(script: string): number {
  const len = script.trim().length
  if (len <= 0) return DH_SEEDANCE_SEGMENT_SEC
  const maxSec = DH_SEEDANCE_MAX_SEGMENTS * DH_SEEDANCE_SEGMENT_SEC
  /** ~4 字/秒口播 */
  const byChars = Math.ceil(len / 4)
  return Math.min(maxSec, Math.max(DH_SEEDANCE_SEGMENT_SEC, byChars))
}

/** 按口播音频秒数估算 Seedance 需要几段 */
export function estimateDhSegmentCountFromAudioSec(audioSec: number): number {
  if (!Number.isFinite(audioSec) || audioSec <= 0) return 1
  return Math.min(
    DH_SEEDANCE_MAX_SEGMENTS,
    Math.max(1, Math.ceil(audioSec / DH_SEEDANCE_SEGMENT_SEC)),
  )
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
    /**
     * 即梦式首尾帧：首帧=完整人物，尾帧=场景；
     * 由豆包 Seedance 深度融合（非本地叠图、非 r2v 多参考）。
     */
    dualRefPersonScene?: boolean
    /** 意图保真：mustInclude / mustAvoid 注入 */
    fidelityBrief?: ShortVideoGenBrief | null
  },
): string {
  void scriptChunk
  const bg = clip(backgroundPromptForDraft(draft), 40)
  const frame = frameDesc(draft)
  const idx = (opts?.segmentIndex ?? 0) + 1
  const total = opts?.segmentTotal ?? 1
  const motion = clip(motionBlock(draft, opts?.motionText, opts?.gesturePreset), 72)
  const outfit = clip(draft.outfit || '同参考', 16)
  const fidelity = opts?.fidelityBrief ? clip(briefPromptSuffix(opts.fidelityBrief).trim(), 80) : ''

  let body: string
  if (opts?.continuation) {
    body = [
      '竖屏9:16口播续镜，同一人物同服装同场景，动作连续，五官发型不变。',
      opts?.dualRefPersonScene ? '继续沿用首尾帧人物与场景的深度融合结果。' : '',
      `动作：${motion}。`,
      opts?.hasProductFusion
        ? '双参考图自然手持产品。'
        : '双手空手比划，禁止凭空手持瓶罐化妆品等实物。',
      fidelity,
      SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
      SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
    ]
      .filter(Boolean)
      .join('')
  } else if (opts?.dualRefPersonScene) {
    body = [
      `竖屏9:16数字人口播，即梦首尾帧：首帧为完整人物（五官发型皮肤清晰），尾帧为场景（${bg}）。`,
      `将首帧人物深度自然融入尾帧场景全程口播，${frame}，光影透视一致，服装${outfit}，禁止灰底矩形贴片、禁止硬抠叠图、禁止裁脸。`,
      total > 1 ? `分镜${idx}/${total}约${DH_SEEDANCE_SEGMENT_SEC}秒。` : '',
      opts?.hasProductFusion
        ? '人物与产品自然融合，禁止贴片悬浮。'
        : '双手空手比划，禁止凭空手持瓶罐化妆品等实物。',
      `动作：${motion}。`,
      fidelity,
      SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
      SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
    ]
      .filter(Boolean)
      .join('')
  } else {
    body = [
      `竖屏9:16数字人口播，参考图人物为主播，${frame}，保持五官发型一致。`,
      `背景为${bg}，服装${outfit}。`,
      total > 1 ? `分镜${idx}/${total}约${DH_SEEDANCE_SEGMENT_SEC}秒。` : '',
      opts?.hasProductFusion
        ? '人物与抠图产品自然融合，禁止贴片悬浮。'
        : '双手空手比划，禁止凭空手持瓶罐化妆品等实物。',
      `动作：${motion}。`,
      fidelity,
      SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
      SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
    ]
      .filter(Boolean)
      .join('')
  }

  body = sanitizePromptForVideoModel(body)
  return clampSeedanceContentText(body, DH_PROMPT_MAX)
}
