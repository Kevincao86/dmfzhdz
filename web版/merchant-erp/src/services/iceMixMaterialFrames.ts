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

async function extractOneVideoFrame(
  mat: IceMixMaterialSlot,
  opts?: { skipLocalDownload?: boolean },
): Promise<{ label: string; dataUrl: string } | null> {
  const label = mat.label || '视频素材'
  const urls = visionUrlCandidates(mat)
  if (urls.length === 0) return null

  for (const url of urls) {
    const serverFrame = await postVideoLastFrameFromUrl(url, { frame: 'opening' })
    if (serverFrame.ok) {
      return { label, dataUrl: `data:image/jpeg;base64,${serverFrame.pureBase64}` }
    }
  }

  if (opts?.skipLocalDownload) return null

  for (const url of urls) {
    try {
      const blob = await downloadVideoUrlAsBlob(url, { maxAttempts: 2 })
      const pure = await extractVideoFirstFramePureBase64(blob)
      if (pure.length >= 64) {
        return { label, dataUrl: `data:image/jpeg;base64,${pure}` }
      }
    } catch {
      /* try next url */
    }
  }
  return null
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
  const frame = await extractOneVideoFrame(mat, { skipLocalDownload })
  if (!frame) return null
  return { index, label: frame.label, dataUrl: frame.dataUrl }
}

/** 为每条素材快速截一帧，供视觉模型剪辑匹配（最多 8 条） */
export async function collectMixMaterialFramesForEditPlan(
  materials: IceMixMaterialSlot[],
  opts?: { maxFrames?: number; onProgress?: (msg: string) => void },
): Promise<Array<{ index: number; label: string; dataUrl: string }>> {
  const max = Math.min(materials.length, opts?.maxFrames ?? 8)
  const targets = materials.slice(0, max)
  const out: Array<{ index: number; label: string; dataUrl: string }> = []

  await runIceUploadPool(targets, FRAME_CONCURRENCY, async (mat) => {
    const idx = materials.indexOf(mat)
    const index = idx >= 0 ? idx : out.length
    opts?.onProgress?.(`采样素材 ${index + 1}/${max}…`)
    const sample = await withTimeout(
      collectMaterialFrame(mat, index, true),
      FRAME_TIMEOUT_MS,
      null,
    )
    if (sample) out.push(sample)
    return sample
  })

  return out.sort((a, b) => a.index - b.index)
}
