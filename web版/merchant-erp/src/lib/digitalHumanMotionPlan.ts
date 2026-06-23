import type { FrameMode } from './digitalHumanBroadcast'

export type ParsedMotionSegment = {
  startSec: number
  endSec: number
  text: string
}

export type MotionTimelineSegment = {
  startSec: number
  endSec: number
  gesturePreset: string
  frameMode: FrameMode
}

/** 解析 [0-3s] 全身镜头… 格式 */
export function parseMotionInstructions(text: string): ParsedMotionSegment[] {
  const segments: ParsedMotionSegment[] = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(
      /^\[(\d+(?:\.\d+)?)\s*[-–—~至]\s*(\d+(?:\.\d+)?)\s*s?\]\s*(.+)$/i,
    )
    if (m) {
      const startSec = Number(m[1])
      const endSec = Number(m[2])
      if (endSec > startSec) {
        segments.push({ startSec, endSec, text: m[3]!.trim() })
      }
      continue
    }
    segments.push({ startSec: segments.length * 3, endSec: (segments.length + 1) * 3, text: trimmed })
  }
  return segments
}

export function inferFrameModeFromMotionText(text: string, fallback: FrameMode): FrameMode {
  const t = String(text || '')
  if (/全身|full\s*body|远景|站姿|腿部|双脚|full/i.test(t)) return 'full'
  if (/半身|胸像|近景|half/i.test(t)) return 'half'
  return fallback
}

/** 步骤3 画幅优先：选全身时除非动作行明确写「半身」，否则全程全身 */
export function resolveSegmentFrameMode(
  draftFrameMode: FrameMode,
  motionText?: string,
): FrameMode {
  if (draftFrameMode === 'full') {
    if (/半身|胸像|近景|half/i.test(String(motionText ?? ''))) return 'half'
    return 'full'
  }
  return inferFrameModeFromMotionText(motionText ?? '', draftFrameMode)
}

export function inferGestureFromMotionText(text: string, fallback = 'emphasis'): string {
  const t = String(text || '')
  if (/指点|食指|指向|太阳穴/.test(t)) return 'point'
  if (/点头/.test(t)) return 'nod'
  if (/挥手|欢迎/.test(t)) return 'welcome'
  if (/竖拇|点赞|大拇指/.test(t)) return 'thumbs'
  if (/庆祝/.test(t)) return 'celebrate'
  if (/讲解|比划|配合|托举|掌心/.test(t)) return 'explain'
  if (/推近|强调|特写/.test(t)) return 'emphasis'
  return fallback
}

export function motionLineForSegmentIndex(
  motions: ParsedMotionSegment[],
  index: number,
): ParsedMotionSegment | null {
  if (!motions.length) return null
  return motions[Math.min(index, motions.length - 1)] ?? null
}

/** 将动作指令转为成片后处理时间轴（按秒） */
export function buildMotionTimeline(
  motionText: string,
  draftFrameMode: FrameMode,
  draftGesture: string,
  videoDurationSec: number,
): MotionTimelineSegment[] {
  const parsed = parseMotionInstructions(motionText)
  if (!parsed.length) return []

  const dur = Math.max(1, videoDurationSec)
  const out: MotionTimelineSegment[] = []

  for (const row of parsed) {
    const startSec = Math.max(0, Math.min(row.startSec, dur))
    const endSec = Math.max(startSec + 0.2, Math.min(row.endSec, dur))
    if (endSec <= startSec) continue
    out.push({
      startSec,
      endSec,
      gesturePreset: inferGestureFromMotionText(row.text, draftGesture),
      frameMode: resolveSegmentFrameMode(draftFrameMode, row.text),
    })
  }

  return out
}

export function hasUsableMotionInstructions(text: string): boolean {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  if (parseMotionInstructions(raw).some((s) => s.text.trim().length >= 2)) return true
  return /挥手|点头|指向|比划|动作|走动|转身|展示|竖拇|庆祝|讲解|推近|强调|全身|半身/.test(raw)
}

/** 无分镜格式时，按整段口播生成单段动作时间轴 */
export function buildWholeVideoMotionTimeline(
  motionText: string,
  draftFrameMode: FrameMode,
  draftGesture: string,
  videoDurationSec: number,
): MotionTimelineSegment[] {
  const parsed = parseMotionInstructions(motionText)
  if (parsed.length) return buildMotionTimeline(motionText, draftFrameMode, draftGesture, videoDurationSec)
  const raw = String(motionText ?? '').trim()
  if (!raw && draftGesture === 'none') return []
  const dur = Math.max(1, videoDurationSec)
  return [
    {
      startSec: 0,
      endSec: dur,
      gesturePreset: inferGestureFromMotionText(raw || '讲解', draftGesture === 'none' ? 'explain' : draftGesture),
      frameMode: resolveSegmentFrameMode(draftFrameMode, raw),
    },
  ]
}
