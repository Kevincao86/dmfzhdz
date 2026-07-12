/** 混剪素材截帧（供视觉模型匹配），与指导文案分析解耦避免循环依赖 */
import {
  extractVideoFirstFramePureBase64,
  extractVideoFramesAtTimesPureBase64,
  imageUrlToPureBase64,
} from '../lib/videoFrameUtils'
import { downloadVideoUrlAsBlob, postVideoLastFrameFromUrl } from './videoAiApi'
import { sampleMixMaterialsEvenly, type IceMixMaterialSlot } from '../lib/iceMixPlan'
import { runIceUploadPool } from '../lib/iceUploadPool'
import { MIX_DEFAULT_SOURCE_DURATION_SEC } from '../lib/iceMixPlan'

const FRAME_CONCURRENCY = 4
const FRAME_TIMEOUT_MS = 28_000
/** 单帧服务端截帧超时（避免 180s 挂死） */
const FRAME_SERVER_TIMEOUT_MS = 18_000
/** 单条视频最多采样帧数（均匀覆盖全片） */
export const MIX_FRAMES_PER_VIDEO = 5
/** 全局视觉匹配帧上限 */
export const MIX_MAX_VISION_FRAMES = 64

function visionUrlCandidates(mat: IceMixMaterialSlot): string[] {
  const media = (mat.mediaUrl || '').trim()
  const signed = (mat.signedMediaUrl || '').trim()
  const out: string[] = []
  if (media) out.push(media)
  if (signed && signed !== media) out.push(signed)
  return out
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms)
    }),
  ])
}

/** 按源片时长均匀采样关键帧时间点（秒） */
export function computeVideoFrameSamplePoints(
  durationSec: number,
  opts?: { maxFrames?: number; intervalSec?: number },
): number[] {
  const dur = Math.max(1.2, Math.min(Number(durationSec) || MIX_DEFAULT_SOURCE_DURATION_SEC, 45))
  const maxFrames = Math.max(2, Math.min(opts?.maxFrames ?? MIX_FRAMES_PER_VIDEO, 8))
  const interval = opts?.intervalSec ?? Math.max(0.75, dur / maxFrames)
  const points: number[] = []
  for (let t = 0; t < dur - 0.15 && points.length < maxFrames; t += interval) {
    points.push(Math.round(t * 10) / 10)
  }
  if (points.length === 0) points.push(0)
  const tail = Math.max(0, Math.round((dur - 0.2) * 10) / 10)
  if (tail > (points[points.length - 1] ?? 0) + 0.35 && points.length < maxFrames) {
    points.push(tail)
  }
  return points
}

async function postVideoFrameWithTimeout(
  url: string,
  atSec: number,
): Promise<{ ok: true; pureBase64: string } | { ok: false; message: string }> {
  return withTimeout(
    postVideoLastFrameFromUrl(url, { atSec }),
    FRAME_SERVER_TIMEOUT_MS,
    { ok: false, message: '服务端截帧超时' },
  )
}

async function extractVideoSampleFramesLocal(
  urls: string[],
  samplePoints: number[],
  label: string,
): Promise<Array<{ label: string; dataUrl: string; tag: string; atSec: number }>> {
  const out: Array<{ label: string; dataUrl: string; tag: string; atSec: number }> = []
  for (const url of urls) {
    try {
      const blob = await withTimeout(downloadVideoUrlAsBlob(url, { maxAttempts: 2 }), 45_000, null)
      if (!blob) continue
      const localFrames = await withTimeout(
        extractVideoFramesAtTimesPureBase64(blob, samplePoints),
        40_000,
        [],
      )
      for (const frame of localFrames) {
        out.push({
          label,
          dataUrl: `data:image/jpeg;base64,${frame.pureBase64}`,
          tag: `${frame.atSec.toFixed(1)}s`,
          atSec: frame.atSec,
        })
      }
      if (out.length > 0) return out
      const pure = await extractVideoFirstFramePureBase64(blob)
      if (pure.length >= 64) {
        out.push({ label, dataUrl: `data:image/jpeg;base64,${pure}`, tag: '0.0s', atSec: 0 })
        return out
      }
    } catch {
      /* try next url */
    }
  }
  return out
}

async function extractVideoSampleFrames(
  mat: IceMixMaterialSlot,
  opts?: { skipLocalDownload?: boolean; durationSec?: number; maxFrames?: number },
): Promise<Array<{ label: string; dataUrl: string; tag: string; atSec: number }>> {
  const label = mat.label || '视频素材'
  const urls = visionUrlCandidates(mat)
  if (urls.length === 0) return []

  const samplePoints = computeVideoFrameSamplePoints(opts?.durationSec ?? MIX_DEFAULT_SOURCE_DURATION_SEC, {
    maxFrames: opts?.maxFrames ?? MIX_FRAMES_PER_VIDEO,
  })
  const out: Array<{ label: string; dataUrl: string; tag: string; atSec: number }> = []

  for (const url of urls) {
    for (const atSec of samplePoints) {
      const serverFrame = await postVideoFrameWithTimeout(url, atSec)
      if (serverFrame.ok) {
        out.push({
          label,
          dataUrl: `data:image/jpeg;base64,${serverFrame.pureBase64}`,
          tag: `${atSec.toFixed(1)}s`,
          atSec,
        })
      }
    }
    if (out.length > 0) break
  }

  if (out.length > 0 || opts?.skipLocalDownload) return out
  return extractVideoSampleFramesLocal(urls, samplePoints, label)
}

async function collectMaterialFrame(
  mat: IceMixMaterialSlot,
  index: number,
  skipLocalDownload: boolean,
  durationSec?: number,
): Promise<{ index: number; label: string; dataUrl: string; atSec?: number; tag?: string } | null> {
  const label = mat.label || `素材${index + 1}`
  if (mat.kind === 'image') {
    for (const url of visionUrlCandidates(mat)) {
      try {
        const pure = await imageUrlToPureBase64(url)
        if (pure.length >= 64) {
          return { index, label, dataUrl: `data:image/jpeg;base64,${pure}`, atSec: 0, tag: '图片' }
        }
      } catch {
        /* try next */
      }
    }
    return null
  }
  const frames = await extractVideoSampleFrames(mat, { skipLocalDownload, durationSec })
  if (frames.length === 0) return null
  const pick = frames[0]!
  return {
    index,
    label: pick.label,
    dataUrl: pick.dataUrl,
    atSec: pick.atSec,
    tag: pick.tag,
  }
}

export type MixMaterialFrameSample = {
  index: number
  label: string
  dataUrl: string
  tag?: string
  /** 源素材内该帧对应秒数 */
  atSec?: number
}

/** 单条素材全时间轴采样（AI 分析 / 叙事截取点精修） */
export async function collectMaterialTimelineFrames(
  mat: IceMixMaterialSlot,
  materialIndex: number,
  opts?: { durationSec?: number; maxFrames?: number; skipLocalDownload?: boolean },
): Promise<MixMaterialFrameSample[]> {
  if (mat.kind === 'image') {
    const one = await collectMaterialFrame(mat, materialIndex, true)
    return one ? [one] : []
  }
  const frames = await extractVideoSampleFrames(mat, {
    skipLocalDownload: opts?.skipLocalDownload !== false,
    durationSec: opts?.durationSec,
    maxFrames: opts?.maxFrames ?? MIX_FRAMES_PER_VIDEO,
  })
  return frames.map((f) => ({
    index: materialIndex,
    label: `${f.label}·${f.tag}`,
    dataUrl: f.dataUrl,
    tag: f.tag,
    atSec: f.atSec,
  }))
}

/** 为每条素材截帧，供视觉模型剪辑匹配（视频均匀多帧；≤48 条时全量采样） */
export async function collectMixMaterialFramesForEditPlan(
  materials: IceMixMaterialSlot[],
  opts?: {
    maxFrames?: number
    onProgress?: (msg: string) => void
    allMaterials?: boolean
    materialDurations?: Map<number, number>
  },
): Promise<MixMaterialFrameSample[]> {
  const allMaterials = opts?.allMaterials !== false && materials.length <= 48
  const perVideoFrames = MIX_FRAMES_PER_VIDEO
  const defaultMax = allMaterials
    ? Math.min(MIX_MAX_VISION_FRAMES, materials.length * perVideoFrames)
    : Math.min(32, Math.max(16, Math.min(materials.length, 12) * perVideoFrames))
  const max = Math.min(defaultMax, opts?.maxFrames ?? defaultMax)
  const frameMaterialCap = allMaterials
    ? materials.length
    : Math.min(materials.length, Math.max(6, Math.ceil(max / perVideoFrames)))
  const targets =
    materials.length <= frameMaterialCap
      ? materials
      : sampleMixMaterialsEvenly(materials, frameMaterialCap)
  const out: MixMaterialFrameSample[] = []

  await runIceUploadPool(targets, FRAME_CONCURRENCY, async (mat) => {
    const idx = materials.indexOf(mat)
    const index = idx >= 0 ? idx : out.length
    if (out.length >= max) return null
    opts?.onProgress?.(`密集采样素材 ${index + 1}/${materials.length}（逐帧理解）…`)
    if (mat.kind === 'image') {
      const sample = await withTimeout(
        collectMaterialFrame(mat, index, true),
        FRAME_TIMEOUT_MS,
        null,
      )
      if (sample && out.length < max) out.push(sample)
      return sample
    }
    const dur = opts?.materialDurations?.get(index) ?? MIX_DEFAULT_SOURCE_DURATION_SEC
    const frames = await withTimeout(
      extractVideoSampleFrames(mat, { skipLocalDownload: true, durationSec: dur }),
      FRAME_TIMEOUT_MS,
      [],
    )
    for (const f of frames) {
      if (out.length >= max) break
      out.push({
        index,
        label: `${f.label}·${f.tag}`,
        dataUrl: f.dataUrl,
        tag: f.tag,
        atSec: f.atSec,
      })
    }
    return frames[0] ?? null
  })

  return out.sort(
    (a, b) => a.index - b.index || (a.atSec ?? 0) - (b.atSec ?? 0) || a.label.localeCompare(b.label),
  )
}

/** 按素材索引分组的多帧采样（叙事规划截取点精修用） */
export function groupMixFramesByMaterialIndex(
  frames: MixMaterialFrameSample[],
): Map<number, MixMaterialFrameSample[]> {
  const map = new Map<number, MixMaterialFrameSample[]>()
  for (const f of frames) {
    const list = map.get(f.index) ?? []
    list.push(f)
    map.set(f.index, list)
  }
  return map
}
