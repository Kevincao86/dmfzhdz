/** 混剪素材截帧（供视觉模型匹配），与指导文案分析解耦避免循环依赖 */
import { extractVideoFirstFramePureBase64, imageUrlToPureBase64 } from '../lib/videoFrameUtils'
import { downloadVideoUrlAsBlob, postVideoLastFrameFromUrl } from './videoAiApi'
import type { IceMixMaterialSlot } from '../lib/iceMixPlan'
import { runIceUploadPool } from '../lib/iceUploadPool'

const FRAME_CONCURRENCY = 5
const FRAME_TIMEOUT_MS = 20_000

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

async function extractVideoSampleFrames(
  mat: IceMixMaterialSlot,
  opts?: { skipLocalDownload?: boolean },
): Promise<Array<{ label: string; dataUrl: string; tag: string }>> {
  const label = mat.label || '视频素材'
  const urls = visionUrlCandidates(mat)
  if (urls.length === 0) return []

  const out: Array<{ label: string; dataUrl: string; tag: string }> = []
  for (const url of urls) {
    for (const frame of ['opening', 'last'] as const) {
      const serverFrame = await postVideoLastFrameFromUrl(url, { frame })
      if (serverFrame.ok) {
        out.push({
          label,
          dataUrl: `data:image/jpeg;base64,${serverFrame.pureBase64}`,
          tag: frame,
        })
      }
    }
    if (out.length > 0) break
  }

  if (out.length > 0 || opts?.skipLocalDownload) return out

  for (const url of urls) {
    try {
      const blob = await downloadVideoUrlAsBlob(url, { maxAttempts: 2 })
      const pure = await extractVideoFirstFramePureBase64(blob)
      if (pure.length >= 64) {
        out.push({ label, dataUrl: `data:image/jpeg;base64,${pure}`, tag: 'opening' })
        break
      }
    } catch {
      /* try next url */
    }
  }
  return out
}

async function collectMaterialFrame(
  mat: IceMixMaterialSlot,
  index: number,
  skipLocalDownload: boolean,
): Promise<{ index: number; label: string; dataUrl: string } | null> {
  const label = mat.label || `素材${index + 1}`
  if (mat.kind === 'image') {
    for (const url of visionUrlCandidates(mat)) {
      try {
        const pure = await imageUrlToPureBase64(url)
        if (pure.length >= 64) {
          return { index, label, dataUrl: `data:image/jpeg;base64,${pure}` }
        }
      } catch {
        /* try next */
      }
    }
    return null
  }
  const frame = await extractVideoSampleFrames(mat, { skipLocalDownload })
  if (frame.length === 0) return null
  const pick = frame[0]!
  return { index, label: pick.label, dataUrl: pick.dataUrl }
}

/** 为每条素材截帧，供视觉模型剪辑匹配（视频含首帧+尾帧，最多 12 张） */
export async function collectMixMaterialFramesForEditPlan(
  materials: IceMixMaterialSlot[],
  opts?: { maxFrames?: number; onProgress?: (msg: string) => void },
): Promise<Array<{ index: number; label: string; dataUrl: string }>> {
  const max = Math.min(materials.length * 2, opts?.maxFrames ?? 12)
  const out: Array<{ index: number; label: string; dataUrl: string }> = []

  await runIceUploadPool(materials, FRAME_CONCURRENCY, async (mat) => {
    const idx = materials.indexOf(mat)
    const index = idx >= 0 ? idx : out.length
    if (out.length >= max) return null
    opts?.onProgress?.(`采样素材 ${index + 1}/${materials.length}…`)
    if (mat.kind === 'image') {
      const sample = await withTimeout(
        collectMaterialFrame(mat, index, true),
        FRAME_TIMEOUT_MS,
        null,
      )
      if (sample && out.length < max) out.push(sample)
      return sample
    }
    const frames = await withTimeout(
      extractVideoSampleFrames(mat, { skipLocalDownload: true }),
      FRAME_TIMEOUT_MS,
      [],
    )
    for (const f of frames) {
      if (out.length >= max) break
      out.push({ index, label: `${f.label}·${f.tag === 'opening' ? '首帧' : '尾帧'}`, dataUrl: f.dataUrl })
    }
    return frames[0] ?? null
  })

  return out.sort((a, b) => a.index - b.index || a.label.localeCompare(b.label))
}
