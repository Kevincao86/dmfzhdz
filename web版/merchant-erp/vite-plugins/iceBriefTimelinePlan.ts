/**
 * 将商户「剪辑文案指令」解析为 ICE Timeline 参数（时长、字幕、转场等）。
 * 此前 editBrief 仅写入 projectMetadata，成片不会按文案包装。
 */
import { resolveIceEffectPreset } from './iceEffectPresets.js'
import {
  buildIceSubtitleTextClip,
  ICE_SUBTITLE_STYLE_DEFAULT_ID,
  resolveIceSubtitleStylePreset,
} from './iceSubtitleStylePresets.js'

/** IMS 官方文档示例纯音乐（勿用 speech.mp3——其为中文朗诵示范，混剪会听到「沙场秋点兵」等诗词） */
export const ICE_PUBLIC_BGM_URLS = {
  warm: 'https://ice-document-materials.oss-cn-shanghai.aliyuncs.com/test_media/music/m1.wav',
  upbeat: 'https://ice-document-materials.oss-cn-shanghai.aliyuncs.com/test_media/music/m1.wav',
  calm: 'https://ice-document-materials.oss-cn-shanghai.aliyuncs.com/test_media/music/m1.wav',
} as const

/** 混剪默认不注入音效轨；保留常量供旧脚本引用，但不再作为 SFX 回退 */
export const ICE_PUBLIC_SFX_URL = ICE_PUBLIC_BGM_URLS.warm

export type IceAudioClipPlan = {
  mediaUrl: string
  /** IMS 入库后的媒资 ID，优先于 MediaURL（更稳定） */
  mediaId?: string
  timelineIn: number
  timelineOut: number
  volume: number
  loop?: boolean
  label: string
}

export type IceBriefTimelinePlan = {
  totalDurationSec: number
  clipEndSec: number
  openingSec: number
  fastPace: boolean
  /** @deprecated 请用 transitionSubType / fadeClip */
  useTransition: boolean
  /** @deprecated 请用 fadeClip */
  useFade: boolean
  effectId: string
  fadeClip: boolean
  transitionSubType?: string
  subtitleStyleId: string
  titleText?: string
  segmentCaptions: Array<{ text: string; timelineIn: number; timelineOut: number }>
  /** 多图时各张停留秒数，长度与图片数一致 */
  imageDurations: number[]
  /** 指令框解析：背景音乐 */
  bgmClip?: IceAudioClipPlan
  /** AI混剪：TTS 口播轨（铺满成片，原视频静音） */
  narrationClip?: IceAudioClipPlan
  /** AI混剪：ICE 内置 AI_TTS（上海区域，优先于外部 MP3） */
  mixAiTtsClip?: { content: string; timelineIn: number; timelineOut: number; voice?: string }
  /** 指令框解析：背景音效片段 */
  sfxClips: IceAudioClipPlan[]
  summary: string
}

const ICE_BGM_PRESETS: Record<string, { url: string; label: string }> = {
  warm: { url: ICE_PUBLIC_BGM_URLS.warm, label: '温暖氛围 BGM' },
  upbeat: { url: ICE_PUBLIC_BGM_URLS.upbeat, label: '轻快 BGM' },
  calm: { url: ICE_PUBLIC_BGM_URLS.calm, label: '舒缓 BGM' },
}

const ICE_SFX_PRESETS: Array<{ re: RegExp; url: string; label: string; dur: number }> = [
  { re: /碗碟音效|餐具碰撞/, url: ICE_PUBLIC_SFX_URL, label: '碗碟音效', dur: 1.2 },
  { re: /厨房音效|炒菜音效/, url: ICE_PUBLIC_SFX_URL, label: '厨房音效', dur: 2 },
  { re: /市井人声|吆喝音效/, url: ICE_PUBLIC_SFX_URL, label: '市井人声', dur: 2.5 },
  { re: /环境音效|街道音效/, url: ICE_PUBLIC_SFX_URL, label: '环境氛围', dur: 3 },
]

function splitBriefBlocks(brief: string): { instruction: string; copy: string } {
  const raw = brief.trim()
  const inst =
    raw.match(/【剪辑指令】\s*([\s\S]*?)(?=\n*【(?:画面指令|字幕文案)】|$)/)?.[1]?.trim() ?? ''
  const copy = raw.match(/【字幕文案】\s*([\s\S]*?)(?=\n*【|$)/)?.[1]?.trim() ?? ''
  if (inst || copy) return { instruction: inst, copy }
  return { instruction: raw, copy: raw }
}

function parseBgmFromInstruction(instruction: string, total: number): IceAudioClipPlan | undefined {
  const t = instruction.trim()
  if (!t) return undefined
  /** 混剪须用户在剪辑指令中明确写 BGM/配乐；勿因「节奏」「氛围」等叙事词误加音轨 */
  if (!/BGM|背景音乐|配乐|背景音/.test(t)) {
    return undefined
  }
  let key: keyof typeof ICE_BGM_PRESETS = 'warm'
  if (/轻快|活泼|愉快|节奏舒适|明快/.test(t)) key = 'upbeat'
  else if (/舒缓|平静|柔和/.test(t)) key = 'calm'
  const preset = ICE_BGM_PRESETS[key]
  return {
    mediaUrl: preset.url,
    timelineIn: 0,
    timelineOut: total,
    volume: /音量低|弱|铺底/.test(t) ? 0.22 : 0.32,
    loop: true,
    label: preset.label,
  }
}

function parseSfxFromInstruction(instruction: string, total: number): IceAudioClipPlan[] {
  const out: IceAudioClipPlan[] = []
  /** 仅剪辑指令中明确写「音效」时才注入，避免画面描述里的「环境/氛围」误触发 */
  if (!/音效|SFX|环境音|背景音效/.test(instruction)) return out
  let cursor = Math.min(1.5, total * 0.15)
  for (const row of ICE_SFX_PRESETS) {
    if (!row.re.test(instruction)) continue
    const dur = Math.min(row.dur, Math.max(0.5, total - cursor))
    if (dur < 0.4 || cursor >= total) continue
    out.push({
      mediaUrl: row.url,
      timelineIn: cursor,
      timelineOut: Math.min(total, cursor + dur),
      volume: 0.55,
      label: row.label,
    })
    cursor += dur + 0.35
    if (out.length >= 4) break
  }
  return out
}

export function parseIceEditBriefPlan(
  editBrief: string,
  opts: {
    clipEndSec: number
    imageCount?: number
    effectId: string
    subtitleStyleId?: string
    /** AI混剪：默认不加 BGM/音效，保留实拍原声 */
    mixMode?: boolean
  },
): IceBriefTimelinePlan {
  const brief = editBrief.trim()
  const { instruction, copy } = splitBriefBlocks(brief)
  const imageCount = Math.max(0, opts.imageCount ?? 0)
  /**
   * 成片总时长以「输出参数 → 生成视频时长」为准，不被指令框里「每张 3-5 秒」等描述覆盖
   * （否则 UI 设 10 秒却会被解析成 4 秒）。
   */
  const totalDurationSec = Math.min(120, Math.max(1, opts.clipEndSec))
  const openingSec = parseOpeningSec(instruction || brief, totalDurationSec)
  const fastPace = /快节奏|紧凑|快剪|切片|吸睛/.test(instruction || brief)
  const effect = resolveIceEffectPreset(opts.effectId)
  const subtitleStyle = resolveIceSubtitleStylePreset(opts.subtitleStyleId ?? ICE_SUBTITLE_STYLE_DEFAULT_ID)
  const fadeClip = opts.mixMode ? false : Boolean(effect.fadeClip)
  const transitionSubType = opts.mixMode ? undefined : effect.transitionSubType
  const useFade = fadeClip
  const useTransition = Boolean(transitionSubType)
  const titleText = extractTitleText(copy || brief)
  const imageDurations = computeImageDurations(imageCount, totalDurationSec, openingSec, fastPace)
  const segmentCaptions = buildSegmentCaptions(copy || brief, totalDurationSec, imageDurations, titleText)
  const wantsBgm = /BGM|背景音乐|配乐|背景音/.test(instruction)
  const bgmClip =
    opts.mixMode && !wantsBgm
      ? undefined
      : parseBgmFromInstruction(instruction, totalDurationSec)
  const sfxClips =
    opts.mixMode && !/音效|SFX|环境音|背景音效/.test(instruction)
      ? []
      : parseSfxFromInstruction(instruction, totalDurationSec)
  const clipEndSec = totalDurationSec

  const summary = [
    `成片约 ${totalDurationSec.toFixed(1)}s`,
    imageCount > 1 ? `共 ${imageCount} 图` : '',
    openingSec > 0 ? `片头 ${openingSec}s` : '',
    segmentCaptions.length ? `字幕 ${segmentCaptions.length} 条` : '',
    useTransition ? '含转场' : '',
    bgmClip ? '含 BGM' : '',
    sfxClips.length ? `音效 ${sfxClips.length} 处` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    totalDurationSec,
    clipEndSec,
    openingSec,
    fastPace,
    useTransition,
    useFade,
    effectId: effect.id,
    fadeClip,
    transitionSubType,
    subtitleStyleId: subtitleStyle.id,
    titleText,
    segmentCaptions,
    imageDurations,
    bgmClip,
    sfxClips,
    summary,
  }
}

function parseOpeningSec(brief: string, total: number): number {
  const m = brief.match(/前\s*(\d+(?:\.\d+)?)\s*秒/)
  if (m) {
    const n = Number(m[1])
    if (n > 0) return Math.min(total * 0.45, Math.max(1, n))
  }
  if (/前\s*[两三3-5]\s*秒|吸睛|片头/.test(brief)) {
    return Math.min(total * 0.35, Math.max(2, Math.min(4, total * 0.3)))
  }
  return 0
}

const META_CAPTION_RE =
  /剪辑文案|文案指令|云剪|灵祺|整体定位|镜头与节奏|字幕与包装|关键帧|输出参数|BGM|背景音乐|画面特效|画幅|每张分配/i

function isMetaCaptionText(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 2) return true
  if (META_CAPTION_RE.test(t)) return true
  if (/^[一二三四五六七八九十百]+[、.．]?\s*[\u4e00-\u9fff]{2,8}$/.test(t)) return true
  return false
}

function normalizeCaptionLine(raw: string): string | undefined {
  const line = raw.replace(/\s+/g, ' ').trim().slice(0, 48)
  if (line.length < 2 || isMetaCaptionText(line)) return undefined
  return line
}

function extractQuotedCaptions(brief: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of brief.matchAll(/[「『"]([^」』"]{2,36})[」』"]/g)) {
    const t = normalizeCaptionLine(m[1] ?? '')
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out.slice(0, 8)
}

function extractTitleText(brief: string): string | undefined {
  const subtitles = extractSubtitleBlockLines(brief)
  if (subtitles[0]) return subtitles[0].slice(0, 20)

  for (const q of extractQuotedCaptions(brief)) {
    if (q.length >= 2 && q.length <= 20) return q
  }
  const slogan = brief.match(/(?:Slogan|口号|品牌\s*Slogan|结尾号召)[：:]\s*([^\n]{2,36})/i)?.[1]
  if (slogan) {
    const t = normalizeCaptionLine(slogan)
    if (t) return t.slice(0, 36)
  }
  const product = brief.match(/(?:突出|主打|主推|展示)[「『"]?([^」』"\n，,；;]{2,24})/)?.[1]
  if (product) {
    const t = normalizeCaptionLine(product)
    if (t) return t.slice(0, 36)
  }
  return undefined
}

function extractSubtitleBlockLines(brief: string): string[] {
  const block =
    brief.match(/【字幕文案】([\s\S]*?)(?=【|$)/)?.[1] ??
    brief.match(/(?:^|\n)字幕文案[：:]\s*\n([\s\S]*?)(?=\n【|\n[一二三四五六七八九十百]+[、.．]|$)/)?.[1]
  if (!block?.trim()) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of block.split('\n')) {
    const quoted = raw.match(/[「『"]([^」』"]{2,36})[」』"]/)
    if (quoted?.[1]) {
      const t = normalizeCaptionLine(quoted[1])
      if (t && !seen.has(t)) {
        seen.add(t)
        out.push(t)
        continue
      }
    }
    const plain = raw.replace(/^[-•·\d.)\s图第张幅]+/, '').trim()
    const t = normalizeCaptionLine(plain)
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out.slice(0, 8)
}

function extractSectionLines(brief: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (raw: string) => {
    const line = normalizeCaptionLine(raw)
    if (!line || seen.has(line)) return
    seen.add(line)
    out.push(line)
  }

  const subtitleBlock = extractSubtitleBlockLines(brief)
  for (const line of subtitleBlock) push(line)
  if (subtitleBlock.length >= 1) return out.slice(0, 8)

  for (const q of extractQuotedCaptions(brief)) push(q)

  const parts = brief.split(/(?=[一二三四五六七八九十百]+[、.．])/)
  for (const part of parts) {
    const head = part.match(/^[一二三四五六七八九十百]+[、.．]\s*([^\n：:]{0,20})[：:]\s*([^\n]{4,80})/)
    if (head?.[2]) {
      push(head[2].split(/[；;。]/)[0] ?? head[2])
      continue
    }
    const bodyLines = part
      .split('\n')
      .slice(1)
      .map((l) => l.replace(/^[-•·]\s*/, '').trim())
      .filter((l) => l.length >= 4 && l.length <= 48)
    for (const line of bodyLines) {
      push(line.split(/[；;。]/)[0] ?? line)
      if (out.length >= 8) break
    }
  }

  const perImage = brief.matchAll(/(?:图|第)\s*(\d+)\s*[张幅][：:]\s*([^\n]{4,48})/g)
  for (const m of perImage) {
    push(m[2] ?? '')
  }

  const slogans = brief.match(/(?:Slogan|口号|结尾|号召)[：:]\s*([^\n]{4,40})/i)
  if (slogans?.[1]) push(slogans[1])

  return out.slice(0, 8)
}

function computeImageDurations(
  imageCount: number,
  total: number,
  openingSec: number,
  fastPace: boolean,
): number[] {
  if (imageCount <= 0) return []
  if (imageCount === 1) return [Math.max(1, total)]

  if (openingSec > 0 && imageCount > 1) {
    const open = Math.min(openingSec, total * 0.4)
    const rest = Math.max(0.5, (total - open) / (imageCount - 1))
    return [open, ...Array.from({ length: imageCount - 1 }, () => rest)]
  }

  const each = Math.max(0.5, total / imageCount)
  if (!fastPace) return Array.from({ length: imageCount }, () => each)

  const weights = Array.from({ length: imageCount }, (_, i) =>
    i === 0 ? 1.35 : i === imageCount - 1 ? 1.15 : 1,
  )
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((w) => Math.max(0.5, (total * w) / sum))
}

function buildSegmentCaptions(
  brief: string,
  total: number,
  imageDurations: number[],
  titleText?: string,
): Array<{ text: string; timelineIn: number; timelineOut: number }> {
  const lines = extractSectionLines(brief)
  const captions: Array<{ text: string; timelineIn: number; timelineOut: number }> = []

  let cursor = 0
  const slots =
    imageDurations.length > 0
      ? imageDurations
      : lines.length > 0
        ? Array.from({ length: lines.length }, () => total / lines.length)
        : [total]

  const texts =
    lines.length > 0
      ? lines
      : titleText
        ? [titleText]
        : []

  for (let i = 0; i < texts.length; i++) {
    const dur = slots[i] ?? slots[slots.length - 1] ?? total / texts.length
    const timelineIn = cursor
    const timelineOut = Math.min(total, cursor + dur)
    if (timelineOut - timelineIn >= 0.4) {
      captions.push({ text: texts[i]!, timelineIn, timelineOut })
    }
    cursor = timelineOut
    if (cursor >= total) break
  }

  const slogan = brief.match(/(?:品牌\s*)?(?:Slogan|口号|结尾)[：:]\s*([^\n]{4,36})/i)?.[1]
  if (slogan && cursor < total - 0.5) {
    captions.push({
      text: slogan.trim(),
      timelineIn: Math.max(0, total - Math.min(3, total * 0.25)),
      timelineOut: total,
    })
  }

  return captions
}

/** AI 混剪：首段居中钩子字幕 + 其余段动效口播字幕 */
export function buildMixAnimatedSubtitleTracks(
  captions: Array<{ text: string; timelineIn: number; timelineOut: number }>,
  subtitleStyleId: string,
): { SubtitleTracks: Array<{ SubtitleTrackClips: Record<string, unknown>[] }> } | Record<string, never> {
  const clips: Record<string, unknown>[] = []
  const mainId =
    subtitleStyleId === 'classic-white' ? 'viral-white-pop' : subtitleStyleId || ICE_SUBTITLE_STYLE_DEFAULT_ID
  const mainStyle = resolveIceSubtitleStylePreset(mainId)
  const hookStyle = resolveIceSubtitleStylePreset('center-hook')

  captions.forEach((cap, i) => {
    const text = cap.text.trim()
    if (text.length < 1) return
    const dur = cap.timelineOut - cap.timelineIn
    const useHook = i === 0 && dur >= 2 && text.length >= 2
    const style = useHook ? hookStyle : mainStyle
    clips.push(buildIceSubtitleTextClip(style, text, cap.timelineIn, cap.timelineOut))
  })

  if (!clips.length) return {}
  return { SubtitleTracks: [{ SubtitleTrackClips: clips }] }
}

/** 混剪成片：段间直切（Fade/DLTransition 在多段 IMS 时间线上易 InputFile is bad） */
export function enhanceIceMixBriefPlan(
  plan: IceBriefTimelinePlan,
  effectId: string,
): IceBriefTimelinePlan {
  const effect = resolveIceEffectPreset(effectId)
  return {
    ...plan,
    fadeClip: false,
    useFade: false,
    useTransition: false,
    transitionSubType: undefined,
    effectId: effect.id,
    summary: `${plan.summary}${plan.summary ? ' · ' : ''}混剪${effect.id === 'none' ? '直切' : `拼接（${effect.label}·直切稳定模式）`}`,
  }
}

export function buildSubtitleTracksFromPlan(
  plan: IceBriefTimelinePlan,
): { SubtitleTracks: Array<{ SubtitleTrackClips: Record<string, unknown>[] }> } | Record<string, never> {
  if ((plan.mixAiTtsClip || plan.narrationClip) && plan.segmentCaptions.length > 0) {
    return buildMixAnimatedSubtitleTracks(plan.segmentCaptions, plan.subtitleStyleId)
  }
  const clips: Record<string, unknown>[] = []
  const style = resolveIceSubtitleStylePreset(plan.subtitleStyleId)

  if (plan.titleText) {
    const out = Math.min(
      plan.totalDurationSec,
      plan.openingSec > 0 ? plan.openingSec : plan.totalDurationSec * 0.28,
    )
    clips.push(
      buildIceSubtitleTextClip(style, plan.titleText, 0, Math.max(1, out)),
    )
  }

  for (const cap of plan.segmentCaptions) {
    if (cap.text === plan.titleText) continue
    clips.push(buildIceSubtitleTextClip(style, cap.text, cap.timelineIn, cap.timelineOut))
  }

  if (!clips.length) return {}
  return { SubtitleTracks: [{ SubtitleTrackClips: clips }] }
}

function buildIceAudioTrackClip(clip: IceAudioClipPlan): Record<string, unknown> {
  const row: Record<string, unknown> = {
    TimelineIn: clip.timelineIn,
    TimelineOut: clip.timelineOut,
    Volume: clip.volume,
    In: 0,
  }
  if (clip.loop) row.Loop = true
  if (clip.mediaId?.trim()) {
    row.MediaId = clip.mediaId.trim()
  } else if (clip.mediaUrl.trim()) {
    row.MediaURL = clip.mediaUrl.trim()
  }
  return row
}

function buildIceAiTtsTrackClip(clip: NonNullable<IceBriefTimelinePlan['mixAiTtsClip']>): Record<string, unknown> {
  return {
    Type: 'AI_TTS',
    Content: clip.content.slice(0, 1200),
    TimelineIn: clip.timelineIn,
    TimelineOut: clip.timelineOut,
    ...(clip.voice?.trim() ? { Voice: clip.voice.trim() } : {}),
  }
}

export function buildAudioTracksFromPlan(
  plan: IceBriefTimelinePlan,
): { AudioTracks: Array<{ AudioTrackClips: Record<string, unknown>[] }> } | Record<string, never> {
  const clips: Record<string, unknown>[] = []
  if (plan.mixAiTtsClip?.content?.trim()) {
    clips.push(buildIceAiTtsTrackClip(plan.mixAiTtsClip))
  } else if (plan.narrationClip) {
    clips.push(buildIceAudioTrackClip(plan.narrationClip))
  }
  if (plan.bgmClip) {
    clips.push({ ...buildIceAudioTrackClip(plan.bgmClip), Volume: Math.min(plan.bgmClip.volume, 0.18) })
  }
  for (const sfx of plan.sfxClips) {
    clips.push(buildIceAudioTrackClip(sfx))
  }
  if (!clips.length) return {}
  return { AudioTracks: [{ AudioTrackClips: clips }] }
}
