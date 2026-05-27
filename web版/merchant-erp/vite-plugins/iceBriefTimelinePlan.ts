/**
 * 将商户「剪辑文案指令」解析为 ICE Timeline 参数（时长、字幕、转场等）。
 * 此前 editBrief 仅写入 projectMetadata，成片不会按文案包装。
 */

export type IceBriefTimelinePlan = {
  totalDurationSec: number
  clipEndSec: number
  openingSec: number
  fastPace: boolean
  useTransition: boolean
  useFade: boolean
  titleText?: string
  segmentCaptions: Array<{ text: string; timelineIn: number; timelineOut: number }>
  /** 多图时各张停留秒数，长度与图片数一致 */
  imageDurations: number[]
  summary: string
}

export function parseIceEditBriefPlan(
  editBrief: string,
  opts: {
    clipEndSec: number
    imageCount?: number
    effectId: string
  },
): IceBriefTimelinePlan {
  const brief = editBrief.trim()
  const imageCount = Math.max(0, opts.imageCount ?? 0)
  /** clipEndSec：单视频为片段时长；多图时为「生成视频总时长」 */
  const fallbackTotal = Math.min(120, Math.max(imageCount > 1 ? 3 : 1, opts.clipEndSec))

  const totalDurationSec = parseTotalDurationSec(brief, fallbackTotal)
  const openingSec = parseOpeningSec(brief, totalDurationSec)
  const fastPace = /快节奏|紧凑|快剪|切片|吸睛/.test(brief)
  const useFade = opts.effectId === 'fade' || /淡入|淡出|fade/i.test(brief)
  const useTransition =
    useFade || fastPace || /转场|切换|叠化/.test(brief)
  const titleText = extractTitleText(brief)
  const imageDurations = computeImageDurations(imageCount, totalDurationSec, openingSec, fastPace)
  const segmentCaptions = buildSegmentCaptions(brief, totalDurationSec, imageDurations, titleText)
  const clipEndSec =
    imageCount > 0
      ? imageCount === 1
        ? totalDurationSec
        : imageDurations[0] ?? opts.clipEndSec
      : totalDurationSec

  const summary = [
    `成片约 ${totalDurationSec.toFixed(1)}s`,
    imageCount > 1 ? `共 ${imageCount} 图` : '',
    openingSec > 0 ? `片头 ${openingSec}s` : '',
    segmentCaptions.length ? `字幕 ${segmentCaptions.length} 条` : '',
    useTransition ? '含转场' : '',
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
    titleText,
    segmentCaptions,
    imageDurations,
    summary,
  }
}

function parseTotalDurationSec(brief: string, fallback: number): number {
  const range1 = brief.match(
    /(?:总时长|全片|成片|时长)[^0-9]{0,16}(\d+(?:\.\d+)?)\s*[-~～至到]\s*(\d+(?:\.\d+)?)\s*秒/,
  )
  if (range1) {
    const a = Number(range1[1])
    const b = Number(range1[2])
    if (a > 0 && b > 0) return Math.min(120, Math.max(3, (a + b) / 2))
  }
  const range2 = brief.match(/(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*秒/)
  if (range2) {
    const a = Number(range2[1])
    const b = Number(range2[2])
    if (a > 0 && b > 0 && b <= 60) return Math.min(120, Math.max(3, (a + b) / 2))
  }
  const single = brief.match(/(?:总时长|控制在|时长约?)[^0-9]{0,12}(\d+(?:\.\d+)?)\s*秒/)
  if (single) {
    const n = Number(single[1])
    if (n > 0) return Math.min(120, n)
  }
  return Math.min(120, Math.max(1, fallback))
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
  /剪辑文案|文案指令|云剪|整体定位|镜头与节奏|字幕与包装|关键帧|输出参数|BGM|背景音乐|画面特效|画幅|每张分配/i

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

  for (const line of extractSubtitleBlockLines(brief)) push(line)
  if (out.length >= 2) return out.slice(0, 8)

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

export function buildSubtitleTracksFromPlan(
  plan: IceBriefTimelinePlan,
): { SubtitleTracks: Array<{ SubtitleTrackClips: Record<string, unknown>[] }> } | Record<string, never> {
  const clips: Record<string, unknown>[] = []

  if (plan.titleText) {
    const out = Math.min(
      plan.totalDurationSec,
      plan.openingSec > 0 ? plan.openingSec : plan.totalDurationSec * 0.28,
    )
    clips.push({
      Type: 'Text',
      Content: plan.titleText,
      TimelineIn: 0,
      TimelineOut: Math.max(1, out),
      Alignment: 'TopCenter',
      Y: 0.14,
      FontSize: 64,
      FontColor: '#ffffff',
      Outline: 3,
      OutlineColour: '#000000',
      FontFace: { Bold: true },
    })
  }

  for (const cap of plan.segmentCaptions) {
    if (cap.text === plan.titleText) continue
    clips.push({
      Type: 'Text',
      Content: cap.text.replace(/\n/g, '\\N'),
      TimelineIn: cap.timelineIn,
      TimelineOut: cap.timelineOut,
      Alignment: 'BottomCenter',
      Y: 0.8,
      FontSize: 44,
      FontColor: '#ffffff',
      Outline: 2,
      OutlineColour: '#000000',
      AdaptMode: 'AutoWrap',
      TextWidth: 0.86,
      FontFace: { Bold: true },
    })
  }

  if (!clips.length) return {}
  return { SubtitleTracks: [{ SubtitleTrackClips: clips }] }
}
