/**
 * 短视频模型时长能力：按用户所选秒数 + 文生/图生模式筛选，自动切换时绝不尝试不兼容模型。
 */
import {
  clampSeedanceVideoDuration,
  isArkVideoEndpointId,
  isDoubaoSeedanceModelId,
  normalizeArkVideoModelParam,
  parseSeedanceCliFlags,
} from './arkVideoEndpointsConfig'
import { DOUBAO_VIDEO_CATALOG } from './arkModelCatalog'
import { QWEN_VIDEO_CATALOG } from './qwenVisionCatalog'
import { isQwenSingleFrameI2vModel, sortQwenSingleFrameI2vModels } from './qwenVisionApi'
import { SEEDANCE_SERVER_AUTO } from './shortVideoUiLabels'

export type VideoGenMode = 't2v' | 'i2v'

type DurationSpec =
  | { type: 'range'; min: number; max: number }
  | { type: 'discrete'; values: readonly number[] }

function seedanceModelDurationSpec(modelId: string, mode: VideoGenMode = 't2v'): DurationSpec {
  const m = normalizeArkVideoModelParam(modelId).toLowerCase()
  if (/wan2-1-14b|wan2\.1-14b|wan2\.1/.test(m)) return { type: 'discrete', values: [3, 4, 5] }
  if (/seedance-1-0-lite|lite-i2v|lite-t2v/.test(m)) return { type: 'discrete', values: [3, 4, 5] }
  if (/seedance-2-0|seedance-2\.0/.test(m)) return { type: 'range', min: 4, max: 15 }
  if (/seedance-1-5|seedance-1\.5/.test(m)) return { type: 'range', min: 4, max: 12 }
  /** 1.0-pro / seaweed 图生视频官方仅 3/4/5 秒；文生可到 12 秒 */
  if (
    mode === 'i2v' &&
    (/seedance-1-0|seaweed|doubao-seaweed/.test(m) && !/seedance-1-5|seedance-2-0/.test(m))
  ) {
    return { type: 'discrete', values: [3, 4, 5] }
  }
  if (/seedance|seaweed|doubao-seaweed/.test(m)) return { type: 'range', min: 2, max: 12 }
  if (isArkVideoEndpointId(m)) return { type: 'discrete', values: [5] }
  return { type: 'range', min: 3, max: 12 }
}

function qwenModelDurationSpec(modelId: string): DurationSpec {
  const m = modelId.trim().toLowerCase()
  if (/wan2\.7/.test(m)) return { type: 'range', min: 2, max: 15 }
  if (/wan2\.6/.test(m)) return { type: 'range', min: 2, max: 10 }
  if (/wan2\.5|wan2\.2-i2v|wan2\.2-t2v|wan2\.2-kf2v|wan2\.1-i2v|wan2\.1-t2v|wanx2\.1-i2v|wanx2\.1-t2v/.test(m)) {
    return { type: 'discrete', values: [3, 4, 5] }
  }
  if (/wan2\.2|wan2\.1|wanx2\.1|wanx2\.2/.test(m)) return { type: 'discrete', values: [3, 4, 5] }
  return { type: 'range', min: 3, max: 10 }
}

/** 解析 UI `--dur` 尾随参数，默认 5 秒 */
export function parseVideoDurationFromFlags(flags?: string): number {
  const parsed = parseSeedanceCliFlags(flags ?? '')
  const d = parsed.duration
  return d && Number.isFinite(d) && d > 0 ? Math.round(d) : 5
}

export function videoModelDurationSpec(modelId: string, mode: VideoGenMode = 't2v'): DurationSpec {
  const m = modelId.trim()
  if (!m || m === SEEDANCE_SERVER_AUTO) return { type: 'range', min: 2, max: 15 }
  const norm = normalizeArkVideoModelParam(m)
  if (isDoubaoSeedanceModelId(norm) || isArkVideoEndpointId(norm) || /^wan2/i.test(norm)) {
    return seedanceModelDurationSpec(norm, mode)
  }
  return qwenModelDurationSpec(m)
}

export function videoModelSupportsDuration(
  modelId: string,
  durationSec: number,
  mode: VideoGenMode = 't2v',
): boolean {
  const d = Math.round(Number(durationSec))
  if (!Number.isFinite(d) || d < 1) return false
  const spec = videoModelDurationSpec(modelId, mode)
  if (spec.type === 'discrete') return spec.values.includes(d)
  return d >= spec.min && d <= spec.max
}

/** 过滤模型列表，保留支持目标时长 + 模式的项；`__server_auto__` 由服务端再筛 */
export function filterVideoModelsByDuration(
  modelIds: readonly string[],
  durationSec: number,
  mode: VideoGenMode = 't2v',
): string[] {
  const out: string[] = []
  for (const raw of modelIds) {
    const t = raw.trim()
    if (!t) continue
    if (t === SEEDANCE_SERVER_AUTO) {
      out.push(t)
      continue
    }
    if (videoModelSupportsDuration(t, durationSec, mode)) out.push(t)
  }
  return out
}

/** Seedance 模型提交时长（在支持范围内钳制，不改变用户 5/10 意图） */
export function resolveSeedancePayloadDuration(
  modelId: string,
  requestedSec: number,
  mode: VideoGenMode = 't2v',
): number | undefined {
  if (!isDoubaoSeedanceModelId(modelId)) return undefined
  const d = Math.round(requestedSec)
  if (!videoModelSupportsDuration(modelId, d, mode)) return undefined
  return clampSeedanceVideoDuration(modelId, d)
}

/** 数字人口播产品融合等场景可传 2 张参考图；默认仍只保留 1 张以免误触 lite 时长校验 */
export function parseI2vMaxImagesFromBody(body?: Record<string, unknown>): number {
  const n = body?.i2v_max_images
  if (typeof n === 'number' && Number.isFinite(n)) {
    return Math.min(3, Math.max(1, Math.round(n)))
  }
  return 1
}

/** 图生视频 API 参考图数量上限（默认 1；数字人产品融合可传 2） */
export function clampI2vImagesForApi(
  images?: string[],
  maxCount = 1,
): string[] | undefined {
  if (!Array.isArray(images) || images.length === 0) return undefined
  const max = Math.min(3, Math.max(1, maxCount))
  const rows = images.map((x) => String(x).trim()).filter(Boolean).slice(0, max)
  return rows.length ? rows : undefined
}

export type VideoTryStep = {
  model: string
  preferProvider?: 'qwen'
  label: string
}

function catalogArkVideoIds(mode: VideoGenMode): string[] {
  const kinds =
    mode === 'i2v'
      ? (['video_both', 'video_i2v'] as const)
      : (['video_both', 'video_t2v'] as const)
  return [...DOUBAO_VIDEO_CATALOG]
    .filter((e) => (kinds as readonly string[]).includes(e.kind))
    .sort((a, b) => a.priority - b.priority)
    .map((e) => e.modelId)
}

function catalogQwenVideoIds(mode: VideoGenMode): string[] {
  const kinds =
    mode === 'i2v'
      ? (['video_both', 'video_i2v'] as const)
      : (['video_both', 'video_t2v'] as const)
  let ids = [...QWEN_VIDEO_CATALOG]
    .filter((e) => (kinds as readonly string[]).includes(e.kind))
    .sort((a, b) => a.priority - b.priority)
    .map((e) => e.modelId)
  if (mode === 'i2v') {
    ids = ids.filter((id) => isQwenSingleFrameI2vModel(id))
    ids = sortQwenSingleFrameI2vModels(ids)
  }
  return ids
}

/**
 * 按用户所选时长生成完整尝试队列（豆包目录 → 运营池 → 千问目录 → 服务端自动）。
 * 10 秒图生视频优先 Seedance 1.5 / 2.0，绝不包含 lite / 1.0-i2v / ep-。
 */
export function buildVideoDurationMatchedTryPlan(input: {
  durationSec: number
  hasImages: boolean
  poolModels?: string[]
  preferred?: string
}): VideoTryStep[] {
  const mode: VideoGenMode = input.hasImages ? 'i2v' : 't2v'
  const dur = Math.round(input.durationSec)
  const pool = input.poolModels ?? []
  const preferred = input.preferred?.trim() ?? ''
  const steps: VideoTryStep[] = []
  const seen = new Set<string>()

  const pushArk = (raw: string, label?: string) => {
    const id = normalizeArkVideoModelParam(raw.trim())
    if (!id || id === SEEDANCE_SERVER_AUTO || seen.has(`ark:${id}`)) return
    if (!videoModelSupportsDuration(id, dur, mode)) return
    seen.add(`ark:${id}`)
    steps.push({ model: id, label: label ?? id })
  }

  const pushQwen = (raw: string, label?: string) => {
    const id = raw.trim()
    if (!id || seen.has(`qwen:${id}`)) return
    if (mode === 'i2v' && !isQwenSingleFrameI2vModel(id)) return
    if (!videoModelSupportsDuration(id, dur, mode)) return
    seen.add(`qwen:${id}`)
    steps.push({ model: id, preferProvider: 'qwen', label: label ?? id })
  }

  const pushServerAuto = (provider?: 'qwen') => {
    const key = provider === 'qwen' ? 'srv:qwen' : 'srv:ark'
    if (seen.has(key)) return
    seen.add(key)
    steps.push({
      model: SEEDANCE_SERVER_AUTO,
      preferProvider: provider,
      label: provider === 'qwen' ? '千问自动轮询' : '豆包自动轮询(含千问)',
    })
  }

  if (preferred && preferred !== SEEDANCE_SERVER_AUTO) {
    pushArk(preferred, '已选模型')
  }

  const catalogArk = filterVideoModelsByDuration(catalogArkVideoIds(mode), dur, mode)
  const poolArk = filterVideoModelsByDuration(pool, dur, mode)
  const catalogQwen = filterVideoModelsByDuration(catalogQwenVideoIds(mode), dur, mode)

  if (dur >= 10) {
    for (const id of catalogArk) pushArk(id)
    for (const id of poolArk) pushArk(id)
    for (const id of catalogQwen) pushQwen(id)
  } else {
    for (const id of poolArk) pushArk(id)
    for (const id of catalogArk) pushArk(id)
    for (const id of catalogQwen) pushQwen(id)
  }

  pushServerAuto()
  /** 千问兜底：wan2.6 优先（支持 base64），wan2.7 需 OSS */
  pushServerAuto('qwen')

  return steps
}

/** 将 flags 中的 `--dur` 替换为目标秒数（长视频 10→5 秒降级用） */
export function replaceVideoDurationInFlags(flags: string, durationSec: number): string {
  const dur = Math.round(durationSec)
  const trimmed = flags.trim()
  if (/--dur\s+\d+/.test(trimmed)) {
    return trimmed.replace(/--dur\s+\d+/, `--dur ${dur}`)
  }
  return `${trimmed} --dur ${dur}`.trim()
}
