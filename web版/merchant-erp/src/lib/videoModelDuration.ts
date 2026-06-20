/**
 * 短视频模型时长能力：自动切换时仅尝试支持用户所选秒数（5s / 10s 等）的模型。
 */
import {
  clampSeedanceVideoDuration,
  isArkVideoEndpointId,
  isDoubaoSeedanceModelId,
  normalizeArkVideoModelParam,
  parseSeedanceCliFlags,
} from './arkVideoEndpointsConfig'
import { SEEDANCE_SERVER_AUTO } from './shortVideoUiLabels'

type DurationSpec =
  | { type: 'range'; min: number; max: number }
  | { type: 'discrete'; values: readonly number[] }

function seedanceModelDurationSpec(modelId: string): DurationSpec {
  const m = normalizeArkVideoModelParam(modelId).toLowerCase()
  if (/wan2-1-14b|wan2\.1/.test(m)) return { type: 'discrete', values: [3, 4, 5] }
  if (/seedance-1-0-lite|lite-i2v|lite-t2v/.test(m)) return { type: 'discrete', values: [3, 4, 5] }
  if (/seedance-2-0|seedance-2\.0/.test(m)) return { type: 'range', min: 4, max: 15 }
  if (/seedance-1-5|seedance-1\.5/.test(m)) return { type: 'range', min: 4, max: 12 }
  if (/seedance|seaweed|doubao-seaweed/.test(m)) return { type: 'range', min: 2, max: 12 }
  if (isArkVideoEndpointId(m)) return { type: 'discrete', values: [5] }
  return { type: 'range', min: 3, max: 12 }
}

function qwenModelDurationSpec(modelId: string): DurationSpec {
  const m = modelId.trim().toLowerCase()
  if (/wan2\.7/.test(m)) return { type: 'range', min: 2, max: 15 }
  if (/wan2\.6/.test(m)) return { type: 'range', min: 2, max: 10 }
  if (/wan2\.5|wan2\.2-i2v|wan2\.2-t2v|wan2\.2-kf2v|wan2\.1-i2v|wan2\.1-t2v/.test(m)) {
    return { type: 'discrete', values: [3, 4, 5] }
  }
  if (/wan2\.2|wan2\.1/.test(m)) return { type: 'discrete', values: [3, 4, 5] }
  return { type: 'range', min: 3, max: 10 }
}

/** 解析 UI `--dur` 尾随参数，默认 5 秒 */
export function parseVideoDurationFromFlags(flags?: string): number {
  const parsed = parseSeedanceCliFlags(flags ?? '')
  const d = parsed.duration
  return d && Number.isFinite(d) && d > 0 ? Math.round(d) : 5
}

export function videoModelDurationSpec(modelId: string): DurationSpec {
  const m = modelId.trim()
  if (!m || m === SEEDANCE_SERVER_AUTO) return { type: 'range', min: 2, max: 15 }
  const norm = normalizeArkVideoModelParam(m)
  if (isDoubaoSeedanceModelId(norm) || isArkVideoEndpointId(norm) || /^wan2/i.test(norm)) {
    return seedanceModelDurationSpec(norm)
  }
  return qwenModelDurationSpec(m)
}

export function videoModelSupportsDuration(modelId: string, durationSec: number): boolean {
  const d = Math.round(Number(durationSec))
  if (!Number.isFinite(d) || d < 1) return false
  const spec = videoModelDurationSpec(modelId)
  if (spec.type === 'discrete') return spec.values.includes(d)
  return d >= spec.min && d <= spec.max
}

/** 过滤模型列表，保留支持目标时长的项；`__server_auto__` 始终保留由服务端再筛 */
export function filterVideoModelsByDuration(
  modelIds: readonly string[],
  durationSec: number,
): string[] {
  const out: string[] = []
  for (const raw of modelIds) {
    const t = raw.trim()
    if (!t) continue
    if (t === SEEDANCE_SERVER_AUTO) {
      out.push(t)
      continue
    }
    if (videoModelSupportsDuration(t, durationSec)) out.push(t)
  }
  return out
}

/** Seedance 模型提交时长（在支持范围内钳制，不改变用户 5/10 意图） */
export function resolveSeedancePayloadDuration(modelId: string, requestedSec: number): number | undefined {
  if (!isDoubaoSeedanceModelId(modelId)) return undefined
  const d = Math.round(requestedSec)
  if (!videoModelSupportsDuration(modelId, d)) return undefined
  return clampSeedanceVideoDuration(modelId, d)
}
