import type { AliyunIceConfig } from './aliyunIceCore.js'
import type { IceAudioClipPlan, IceBriefTimelinePlan } from './iceBriefTimelinePlan.js'
import { ICE_PUBLIC_BGM_URLS } from './iceBriefTimelinePlan.js'
import { buildIceCanonicalOssUrl, parseOssUrlPrefix } from './aliyunOssIceParse.js'

export function merchantIceStockAudioBase(cfg?: AliyunIceConfig): string | null {
  const parsed = parseOssUrlPrefix(cfg?.outputOssUrlPrefix?.trim() ?? '')
  if (!parsed) return null
  const key = [parsed.keyPrefix, 'stock'].filter(Boolean).join('/')
  return buildIceCanonicalOssUrl({ ...parsed, keyPrefix: key }, 'placeholder').replace(
    /\/placeholder$/,
    '',
  )
}

async function probePublicAudioUrl(url: string): Promise<boolean> {
  const u = url.trim()
  if (!u) return false
  try {
    const res = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return false
    const len = Number(res.headers.get('content-length') ?? 0)
    return len > 0
  } catch {
    return false
  }
}

async function resolveAudioUrl(
  primary: string,
  fallbacks: string[],
  probe: (url: string) => Promise<boolean>,
): Promise<string | null> {
  for (const url of [primary, ...fallbacks]) {
    if (!url.trim()) continue
    if (await probe(url)) return url
  }
  return null
}

/** 提交 ICE 前：剔除 404 音轨，并回退到公网示例素材，避免整单失败 */
export async function sanitizeIceBriefAudioPlan(
  plan: IceBriefTimelinePlan,
  cfg?: AliyunIceConfig,
): Promise<IceBriefTimelinePlan> {
  const merchantBase = merchantIceStockAudioBase(cfg)
  const bgmFallbacks = [
    ICE_PUBLIC_BGM_URLS.upbeat,
    ICE_PUBLIC_BGM_URLS.warm,
    ICE_PUBLIC_BGM_URLS.calm,
  ]
  const sfxFallbacks = [...bgmFallbacks]

  let bgmClip: IceAudioClipPlan | undefined = plan.bgmClip
  if (bgmClip?.mediaUrl) {
    const merchantCandidates = merchantBase
      ? [
          bgmClip.mediaUrl,
          `${merchantBase}/bgm-upbeat.mp3`,
          `${merchantBase}/bgm-warm-food.mp3`,
          `${merchantBase}/bgm-calm.mp3`,
        ]
      : [bgmClip.mediaUrl]
    const resolved = await resolveAudioUrl(
      bgmClip.mediaUrl,
      [...new Set([...merchantCandidates.slice(1), ...bgmFallbacks])],
      probePublicAudioUrl,
    )
    bgmClip = resolved ? { ...bgmClip, mediaUrl: resolved } : undefined
  }

  const sfxClips: IceAudioClipPlan[] = []
  for (const sfx of plan.sfxClips) {
    const resolved = await resolveAudioUrl(sfx.mediaUrl, sfxFallbacks, probePublicAudioUrl)
    if (resolved) sfxClips.push({ ...sfx, mediaUrl: resolved })
  }

  const summaryParts = [
    `成片约 ${plan.totalDurationSec.toFixed(1)}s`,
    plan.imageDurations.length > 1 ? `共 ${plan.imageDurations.length} 图` : '',
    plan.openingSec > 0 ? `片头 ${plan.openingSec}s` : '',
    plan.segmentCaptions.length ? `字幕 ${plan.segmentCaptions.length} 条` : '',
    plan.useTransition ? '含转场' : '',
    bgmClip ? '含 BGM' : '',
    sfxClips.length ? `音效 ${sfxClips.length} 处` : '',
  ].filter(Boolean)

  return {
    ...plan,
    bgmClip,
    sfxClips,
    summary: summaryParts.join(' · '),
  }
}
