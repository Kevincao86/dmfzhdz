/**
 * 数字人口播高清 MP4：豆包 Seedance 一体化图生视频（人物+背景+产品融合）+ TTS 配音混流。
 * 禁止千问口型单引擎与 ffmpeg 产品贴片；与短视频模块同源 Seedance。
 */
import type { DigitalHumanDraft, DigitalHumanWork, FrameMode } from './digitalHumanBroadcast'
import {
  draftForSceneShot,
  findPresetAvatarForDraft,
  loadWorkCustomBackgroundDataUrl,
  loadWorkProductImageDataUrl,
  loadWorkVoiceCloneSampleBlob,
} from './digitalHumanBroadcast'
import { resolveStoreSceneBackgroundDataUrl } from './digitalHumanStoreScenes'
import {
  assertBlobLooksLikeVideo,
  concatAudioMp3Blobs,
  concatVideoSegmentsToMp4,
  muxVideoWithNarrationPreferBrowser,
  probeVideoHasAudioStream,
} from './concatVideoSegments'
import {
  chunkScriptForS2vVideo,
  resolveUploadedNarrationSegments,
  synthesizeDigitalHumanNarration,
} from './digitalHumanRenderAudio'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v, extractVideoLastFramePureBase64 } from './videoFrameUtils'
import {
  concatVideoBlobsOnServer,
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  muxVideoAudioOnServer,
  postProcessVideoOnServer,
  postVideoLastFrameFromUrl,
  runShortVideoJobWithFailover,
} from '../services/videoAiApi'
import { buildSrtContent, probeVideoDurationSec, splitSubtitleLines } from './digitalHumanSubtitle'
import { resolveDhSubtitleStyleForBurn } from './digitalHumanPostProcessStyles'
import {
  buildDhSeedanceSegmentPrompt,
  chunkScriptForSeedanceVideo,
  DH_SEEDANCE_MAX_SEGMENTS,
  DH_SEEDANCE_SEGMENT_SEC,
  estimateDhSegmentCountFromAudioSec,
  estimateDhTargetDurationSec,
} from './digitalHumanSeedancePrompt'
import { buildBriefFromInput, validateBriefFidelity } from './shortVideoGenBrief'
import { buildSeedanceFlagsLine } from './shortVideoRenderFlags'
import { getAudioDurationSec } from './digitalHumanAudioChunks'
import { normalizeArkVideoModelParam } from './arkVideoEndpointsConfig'
import {
  inferGestureFromMotionText,
  motionLineForSegmentIndex,
  parseMotionInstructions,
} from './digitalHumanMotionPlan'
import {
  buildDhSeedanceFusionImages,
  isDhProductFusionSegment,
  prepareDhProductFusionAssets,
} from './digitalHumanProductFusion'
import {
  blobUrlIsReadable,
  loadWorkMp4Blob,
  saveWorkMp4Blob,
} from './digitalHumanWorkBlobStore'

/** 旧 estimateDhSegmentCount 兼容 smoke 脚本 */
const CHARS_PER_SEGMENT = 35
const MAX_DH_SEGMENTS = 20
const MAX_S2V_SEGMENTS = 12

export type DhVideoEngine =
  | 'seedance_lipsync'
  | 'seedance_product_fusion'
  | 'seedance'
  | 'qwen_s2v'
export type DhVideoProvider = 'doubao' | 'qwen'

export function dhVideoEngineLabel(engine: DhVideoEngine | undefined): string {
  if (engine === 'seedance_product_fusion') {
    return '豆包 Seedance 一体化融合（人物+背景+产品）'
  }
  if (engine === 'seedance_lipsync' || engine === 'seedance') {
    return '豆包 Seedance 一体化图生视频'
  }
  return '豆包 Seedance 图生视频'
}

export type DhRenderProgress = {
  phase: 'planning' | 'generating' | 'merging' | 'audio'
  segmentIndex: number
  segmentTotal: number
  progress: number
}

export type DhRenderResult =
  | {
      ok: true
      outputMp4Url: string
      outputBlob: Blob
      segmentCount: number
      engine: DhVideoEngine
      videoProvider: DhVideoProvider
      plannerModel: 'doubao' | 'qwen'
    }
  | { ok: false; message: string }

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/** 数字人口播：优先有免费额度的 1.0-pro-fast / lite-i2v，再 1.5/2.0 */
function sortDhSeedancePoolPreferLongClip(ids: readonly string[]): string[] {
  const tier = (modelId: string): number => {
    const norm = normalizeArkVideoModelParam(modelId).toLowerCase()
    if (/seedance-1-0-pro-fast|seedance-1\.0-pro-fast/.test(norm)) return 1
    if (/lite-i2v/.test(norm)) return 2
    if (/seedance-1-5|seedance-1\.5/.test(norm)) return 3
    if (/seedance-2-0|seedance-2\.0/.test(norm) && !/mini|fast/.test(norm)) return 4
    if (/seedance-2-0-fast|seedance-2\.0-fast/.test(norm)) return 5
    if (/seaweed/.test(norm)) return 6
    if (/seedance-1-0-pro|seedance-1\.0-pro/.test(norm)) return 7
    if (/lite/.test(norm)) return 8
    return 9
  }
  return [...ids].sort((a, b) => {
    const d = tier(a) - tier(b)
    if (d !== 0) return d
    return normalizeArkVideoModelParam(a).localeCompare(normalizeArkVideoModelParam(b))
  })
}

function draftNeedsDualRefPersonScene(draft: DigitalHumanDraft): boolean {
  return (
    (draft.background === 'store' && Boolean(draft.storeScene)) ||
    draft.background === 'custom'
  )
}

export function estimateDhS2vSegmentCount(script: string): number {
  const chunks = chunkScriptForS2vVideo(script.trim())
  return Math.min(MAX_S2V_SEGMENTS, Math.max(1, chunks.length))
}

export function estimateDhSegmentCount(script: string): number {
  const len = script.trim().length
  if (len <= CHARS_PER_SEGMENT) return 1
  return Math.min(MAX_DH_SEGMENTS, Math.max(2, Math.ceil(len / CHARS_PER_SEGMENT)))
}

async function resolveSegmentBackgroundDataUrl(
  work: DigitalHumanWork,
  segmentDraft: DigitalHumanDraft,
  globalCustomBg: string | null,
): Promise<string | null> {
  if (segmentDraft.background === 'store' && segmentDraft.storeScene) {
    try {
      return await resolveStoreSceneBackgroundDataUrl(segmentDraft.storeScene)
    } catch {
      return null
    }
  }
  if (segmentDraft.background === 'custom') {
    return globalCustomBg ?? (await loadWorkCustomBackgroundDataUrl(work))
  }
  return null
}

function canUseSeedance(cfg: Awaited<ReturnType<typeof fetchVideoAiConfig>> | null): boolean {
  return Boolean(cfg?.arkKeyConfigured && (cfg?.arkVideoModels?.length ?? 0) > 0)
}

async function resolvePortraitOnlyBase64(
  draft: DigitalHumanDraft,
  frameMode: FrameMode,
  _customBackgroundDataUrl?: string | null,
): Promise<string | null> {
  let raw: string | null = null
  if (draft.customAvatarDataUrl?.trim()) {
    try {
      raw = await imageUrlToPureBase64(draft.customAvatarDataUrl)
    } catch {
      raw = null
    }
  } else {
    const avatar = findPresetAvatarForDraft(draft)
    if (!avatar?.previewUrl) return null
    const urls: string[] = [avatar.previewUrl]
    // 预置形象再试同源路径（previewUrl 若仍指向 OSS）
    const localMatch = avatar.previewUrl.match(/(\/digital-human\/avatars\/[^?/#]+)/)
    if (localMatch?.[1] && localMatch[1] !== avatar.previewUrl) {
      urls.unshift(localMatch[1])
    } else if (avatar.id.startsWith('av-real-')) {
      const n = avatar.id.replace(/^av-real-/, '')
      urls.unshift(`/digital-human/avatars/av-real-${n}.jpg`)
    }
    for (const u of urls) {
      try {
        raw = await imageUrlToPureBase64(u)
        if (raw) break
      } catch {
        /* try next */
      }
    }
  }
  if (!raw) return null
  try {
    // 门店/自定义背景：只提交完整人像，场景作第二张参考图由 Seedance 融合（禁止本地抠图叠图）
    return await normalizePortraitBase64ForS2v(raw, frameMode)
  } catch {
    return null
  }
}

async function resolveSeedanceSegmentImageB64(
  draft: DigitalHumanDraft,
  frameMode: FrameMode,
  segmentIndex: number,
  prevVideoUrl: string | null,
  portraitB64: string,
  customBackgroundDataUrl?: string | null,
): Promise<string> {
  const portraitRef =
    (await resolvePortraitOnlyBase64(draft, frameMode, customBackgroundDataUrl)) ?? portraitB64

  /** 照片/预置形象：每段固定原参考图，避免续帧换脸 */
  if (draft.avatarKind !== 'video_clone') {
    return portraitRef
  }

  if (segmentIndex === 0) return portraitRef

  const url = String(prevVideoUrl ?? '').trim()
  if (!url) throw new Error(`第 ${segmentIndex + 1} 段缺少上一段视频衔接`)
  const serverFrame = await postVideoLastFrameFromUrl(url)
  if (serverFrame.ok) return serverFrame.pureBase64
  const blob = await downloadVideoUrlAsBlob(url)
  return extractVideoLastFramePureBase64(blob)
}

async function applyDhFinalPostProcess(
  work: DigitalHumanWork,
  finalBlob: Blob,
  script: string,
  baseFrameMode: FrameMode,
  targetDurationSec?: number,
  opts?: { preserveNarrationAudio?: boolean },
): Promise<Blob> {
  const draft = work.draft
  const wantsSubtitle = draft.subtitleEnabled && script.length >= 2
  /**
   * Seedance 已含镜头/人物微动；ffmpeg zoompan(d=1,fps=30) 会把口播时长压成数秒。
   * 成片后处理只烧字幕 + 按口播补齐时长，不再做运镜。
   */
  void baseFrameMode
  if (!wantsSubtitle && !(targetDurationSec && targetDurationSec > 0)) {
    return finalBlob
  }

  let srtContent: string | undefined
  const videoDur = await probeVideoDurationSec(finalBlob)
  if (wantsSubtitle && videoDur > 0) {
    srtContent = buildSrtContent(splitSubtitleLines(script), videoDur)
  }

  return postProcessVideoOnServer(finalBlob, {
    srtContent,
    subtitleStyle: resolveDhSubtitleStyleForBurn(draft.subtitleStyle),
    subtleMotion: false,
    gesturePreset: 'none',
    motionTimeline: undefined,
    minDurationSec: targetDurationSec,
  }).then(async (out) => {
    if (opts?.preserveNarrationAudio) {
      const hasAudio = await probeVideoHasAudioStream(out)
      if (!hasAudio) {
        throw new Error('字幕/运镜后处理丢失了口播音轨，请重试')
      }
    }
    return out
  })
}

function resolveDraftBaseFrameMode(draft: DigitalHumanDraft): FrameMode {
  /** 步骤 3 用户选择的全身/半身优先于预置形象默认构图 */
  if (draft.frameMode === 'full' || draft.frameMode === 'half') {
    return draft.frameMode
  }
  const preset = findPresetAvatarForDraft(draft)
  return preset?.bodyFrame ?? 'half'
}

async function mergeSegmentVideos(blobs: Blob[], sourceUrls: string[]): Promise<Blob> {
  for (let i = 0; i < blobs.length; i++) {
    await assertBlobLooksLikeVideo(blobs[i]!, `第 ${i + 1} 段`)
    assertSegmentBlob(blobs[i]!, i)
  }
  if (blobs.length === 1) return blobs[0]!

  const errors: string[] = []

  try {
    return await concatVideoSegmentsToMp4(blobs)
  } catch (e) {
    errors.push(`浏览器：${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    return await concatVideoBlobsOnServer(blobs)
  } catch (e) {
    errors.push(`Blob 云端：${e instanceof Error ? e.message : String(e)}`)
  }

  const urls = sourceUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))
  if (urls.length >= blobs.length) {
    try {
      return await concatVideoUrlsOnServer(urls)
    } catch (e) {
      errors.push(`URL 云端：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(errors.join('；') || '多段合并失败')
}

function assertSegmentBlob(blob: Blob, index: number): void {
  if (blob.size < 1024) {
    throw new Error(`第 ${index + 1} 段视频过小（${blob.size} 字节），请重新生成`)
  }
}

/** 成片 ffmpeg 原始日志转用户可读说明（避免 Lavc/frame=0 堆在作品状态里） */
function sanitizeDhRenderPipelineError(raw: string, fallback: string): string {
  const t = String(raw || '').trim()
  if (!t) return fallback
  if (/frame=\s*0|Lsize=\s*0kB|video:0kB|size=\s*0kB/i.test(t)) {
    return `${fallback}：编码结果为空（0 帧）。常见原因是混音失败、字幕/运镜后处理失败或某段视频损坏，请重试；仍失败可先关闭字幕后再生成。`
  }
  if (/libx264|Lavc\d|muxing overhead|Side data:|encoder\s*:/i.test(t)) {
    const clipped = t.replace(/\s+/g, ' ').slice(0, 160)
    return `${fallback}（${clipped}）`
  }
  return t.length > 280 ? `${t.slice(0, 280)}…` : t
}

/** Seedance 无声成片混入 TTS 口播（浏览器优先 + 音轨验收） */
async function muxNarrationIntoVideo(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  return muxVideoWithNarrationPreferBrowser(videoBlob, audioBlob, muxVideoAudioOnServer)
}

async function renderWithSeedance(
  work: DigitalHumanWork,
  cfg: NonNullable<Awaited<ReturnType<typeof fetchVideoAiConfig>>>,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const draft = work.draft
  const script = draft.script.trim()
  const isAudioDrive = draft.driveMode === 'audio'

  if (!isAudioDrive && script.length < 8) {
    return { ok: false, message: '口播文案过短，请先填写至少 8 个字' }
  }
  if (isAudioDrive && !work.hasLocalCustomAudio) {
    return {
      ok: false,
      message: '音频驱动模式需要先上传口播音频。请返回步骤 2 选择 MP3/WAV/M4A 后重新提交。',
    }
  }

  // 意图保真：口播须含可识别卖点/场景关键词（无 Skill 时宽松：文案够长即过）
  const fidelityBrief = buildBriefFromInput(script, null)
  if (!isAudioDrive) {
    const fidelity = validateBriefFidelity(fidelityBrief, { prompt: script, skill: null })
    const hard = fidelity.issues.filter(
      (x) => x.includes('过短') || x.includes('补全') || x.includes('意图保真'),
    )
    if (hard.length > 0 && script.length < 24) {
      return { ok: false, message: hard.join('；') }
    }
  }

  const activeSceneShots =
    draft.multiScene && Array.isArray(draft.sceneShots) && draft.sceneShots.length >= 2
      ? draft.sceneShots
      : null
  if (draft.multiScene && !activeSceneShots) {
    return {
      ok: false,
      message: '已开启多场景拼接，请返回步骤 3 添加至少 2 个镜头并配置背景后重试',
    }
  }

  let customBgDataUrl: string | null = null
  if (draft.background === 'custom' || (draft.background === 'store' && draft.storeScene)) {
    customBgDataUrl = await loadWorkCustomBackgroundDataUrl(work)
    if (!customBgDataUrl) {
      return {
        ok: false,
        message:
          draft.background === 'store'
            ? '已选择门店实景，请返回步骤 3 选择具体场景后重试'
            : '已选择自定义背景，请返回步骤 3 上传门店/场景图片（JPG/PNG）后重试',
      }
    }
  }

  const baseFrameMode = resolveDraftBaseFrameMode(draft)
  const portraitB64 = await resolvePortraitOnlyBase64(draft, baseFrameMode, customBgDataUrl)
  if (!portraitB64) {
    return { ok: false, message: '请上传清晰正面人像/实拍视频或选择预置形象后重试' }
  }

  if (draft.productOverlayEnabled) {
    const productDataUrl = await loadWorkProductImageDataUrl(work)
    if (!productDataUrl) {
      return {
        ok: false,
        message: '已开启手持产品展示，请返回步骤 3 上传产品图（JPG/PNG）后重试',
      }
    }
  }

  let productPureB64: string | null = null
  if (draft.productOverlayEnabled) {
    try {
      const productDataUrl = await loadWorkProductImageDataUrl(work)
      if (productDataUrl) productPureB64 = await imageUrlToPureBase64(productDataUrl)
    } catch {
      return { ok: false, message: '产品图无法读取，请重新上传后重试' }
    }
  }

  const motionLines = parseMotionInstructions(draft.motionInstructions)
  const voiceCloneBlob =
    draft.voiceId === 'v-clone' ? await loadWorkVoiceCloneSampleBlob(work) : null

  let scriptChunks: string[] = []
  let segmentAudioBlobs: Blob[] = []

  if (isAudioDrive) {
    const uploaded = await resolveUploadedNarrationSegments(work)
    if (!uploaded.ok) return { ok: false, message: uploaded.message }
    segmentAudioBlobs = uploaded.audioBlobs
    scriptChunks = segmentAudioBlobs.map((_, i) => script.split(/\n+/)[i]?.trim() || `[口播段 ${i + 1}]`)
  } else {
    scriptChunks = chunkScriptForSeedanceVideo(script).slice(0, DH_SEEDANCE_MAX_SEGMENTS)
    for (let i = 0; i < scriptChunks.length; i++) {
      const chunkText = scriptChunks[i] ?? script
      onProgress?.({
        phase: 'audio',
        segmentIndex: i + 1,
        segmentTotal: scriptChunks.length,
        progress: 6 + Math.round((i / Math.max(1, scriptChunks.length)) * 10),
      })
      const narration = await synthesizeDigitalHumanNarration(draft, chunkText, { voiceCloneBlob })
      if (!narration.ok) {
        return {
          ok: false,
          message: `口播配音第 ${i + 1}/${scriptChunks.length} 段失败：${narration.message}`,
        }
      }
      segmentAudioBlobs.push(narration.audioBlob)
    }
  }

  let totalAudioSec = 0
  for (const b of segmentAudioBlobs) {
    try {
      totalAudioSec += await getAudioDurationSec(b)
    } catch {
      /* ignore probe miss */
    }
  }
  if (!(totalAudioSec > 0.3)) {
    totalAudioSec = estimateDhTargetDurationSec(script)
  }

  let segmentTotal = Math.max(
    isAudioDrive ? segmentAudioBlobs.length : scriptChunks.length,
    estimateDhSegmentCountFromAudioSec(totalAudioSec),
  )
  if (activeSceneShots && !isAudioDrive) {
    segmentTotal = Math.max(segmentTotal, activeSceneShots.length)
  }
  segmentTotal = Math.min(DH_SEEDANCE_MAX_SEGMENTS, Math.max(1, segmentTotal))

  const padText = scriptChunks[scriptChunks.length - 1] ?? script
  while (scriptChunks.length < segmentTotal) scriptChunks.push(padText)

  const targetDurationSec = Math.max(
    estimateDhTargetDurationSec(script),
    Math.ceil(totalAudioSec),
  )
  const flags = buildSeedanceFlagsLine({
    durationSec: DH_SEEDANCE_SEGMENT_SEC,
    fps: 24,
    aspect: '9:16',
    watermark: 'off',
  })
  const poolModels = sortDhSeedancePoolPreferLongClip(cfg.arkVideoModels.map((m) => m.endpointId))

  const videoBlobs: Blob[] = []
  const sourceUrls: string[] = []
  let prevVideoUrl: string | null = null
  let usedProductFusion = false

  for (let i = 0; i < segmentTotal; i++) {
    onProgress?.({
      phase: 'generating',
      segmentIndex: i + 1,
      segmentTotal,
      progress: 12 + Math.round((i / segmentTotal) * 48),
    })

    const sceneShot = activeSceneShots?.[i % activeSceneShots.length] ?? null
    const segmentDraft = sceneShot ? draftForSceneShot(draft, sceneShot) : draft
    let segmentCustomBg = customBgDataUrl
    if (sceneShot) {
      segmentCustomBg = await resolveSegmentBackgroundDataUrl(work, segmentDraft, customBgDataUrl)
      if (segmentDraft.background === 'store' && segmentDraft.storeScene && !segmentCustomBg) {
        return {
          ok: false,
          message: `镜头 ${(i % activeSceneShots!.length) + 1} 门店实景加载失败，请检查场景选择`,
        }
      }
      if (segmentDraft.background === 'custom' && !segmentCustomBg) {
        return {
          ok: false,
          message: '多场景镜头使用了自定义背景，请先在步骤 3 上传背景图',
        }
      }
    }

    let segmentImageB64: string
    try {
      segmentImageB64 = await resolveSeedanceSegmentImageB64(
        segmentDraft,
        baseFrameMode,
        i,
        prevVideoUrl,
        portraitB64,
        segmentCustomBg,
      )
    } catch (e) {
      return {
        ok: false,
        message: `第 ${i + 1}/${segmentTotal} 段参考图准备失败：${e instanceof Error ? e.message : String(e)}`,
      }
    }

    let seedanceImages = [segmentImageB64]
    /** 即梦首尾帧布局；有场景/产品双图时开启，禁止多张 reference_image（1.x 会报 r2v） */
    let seedanceImageMode: 'auto' | 'first_last' = 'auto'
    const useDualRefPersonScene =
      draftNeedsDualRefPersonScene(segmentDraft) && Boolean(segmentCustomBg?.trim())
    const useProductFusion =
      Boolean(productPureB64) &&
      isDhProductFusionSegment(i, segmentTotal)

    if (useProductFusion && productPureB64) {
      onProgress?.({
        phase: 'generating',
        segmentIndex: i + 1,
        segmentTotal,
        progress: 14 + Math.round((i / segmentTotal) * 6),
      })
      try {
        /**
         * 产品段：首帧=人物，尾帧=场景纯图（不叠图）；
         * 产品以抠图作为尾帧引导时改用「场景含产品位」作尾帧，仍走首尾帧非 r2v。
         */
        let scenePure = segmentImageB64
        if (useDualRefPersonScene && segmentCustomBg) {
          scenePure = await imageUrlToPureBase64(segmentCustomBg)
        }
        const fusion = await prepareDhProductFusionAssets(scenePure, productPureB64)
        seedanceImages = buildDhSeedanceFusionImages(
          segmentImageB64,
          fusion.sceneWithProductB64,
        )
        seedanceImageMode = 'first_last'
        usedProductFusion = true
      } catch (e) {
        return {
          ok: false,
          message: `第 ${i + 1}/${segmentTotal} 段产品/人物/背景融合参考图失败：${e instanceof Error ? e.message : String(e)}`,
        }
      }
    } else if (useDualRefPersonScene && segmentCustomBg) {
      try {
        /**
         * 即梦首尾帧（与短视频一致）：first_frame=完整人物，last_frame=场景纯图。
         * Seedance 深度融合进景；禁止本地灰底叠片，也禁止多张 reference_image（r2v）。
         */
        const scenePureB64 = await imageUrlToPureBase64(segmentCustomBg)
        seedanceImages = [segmentImageB64, scenePureB64]
        seedanceImageMode = 'first_last'
      } catch (e) {
        return {
          ok: false,
          message: `第 ${i + 1}/${segmentTotal} 段场景参考图准备失败：${e instanceof Error ? e.message : String(e)}`,
        }
      }
    }

    const motionLine = motionLineForSegmentIndex(motionLines, i)
    const segmentGesture =
      draft.gesturePreset !== 'none'
        ? inferGestureFromMotionText(motionLine?.text ?? '', draft.gesturePreset)
        : motionLine?.text
          ? inferGestureFromMotionText(motionLine.text, 'explain')
          : undefined
    const isContinuation = i > 0 && (i >= segmentAudioBlobs.length || draft.avatarKind === 'video_clone')
    const prompt = buildDhSeedanceSegmentPrompt(segmentDraft, scriptChunks[i] ?? script, {
      segmentIndex: i,
      segmentTotal,
      motionText: motionLine?.text,
      gesturePreset: segmentGesture,
      continuation: isContinuation && !sceneShot,
      hasProductFusion: useProductFusion,
      dualRefPersonScene: useDualRefPersonScene || useProductFusion,
      fidelityBrief,
    })

    const job = await runShortVideoJobWithFailover({
      engine: 'seedance',
      body: {
        prompt,
        flags,
        images_base64: seedanceImages,
        i2v_max_images: Math.min(2, seedanceImages.length),
        seedance_image_mode: seedanceImageMode,
        prefer_quota_stable: true,
        skip_qwen: true,
      },
      poolModels,
      allowAutoHalveDuration: false,
      onProgress: (msg) => {
        onProgress?.({
          phase: 'generating',
          segmentIndex: i + 1,
          segmentTotal,
          progress: 20 + Math.round((i / segmentTotal) * 55),
        })
        void msg
      },
    })

    if (!job.ok) {
      return {
        ok: false,
        message: `第 ${i + 1}/${segmentTotal} 段豆包 Seedance 视觉生成失败：${job.message}`,
      }
    }

    const url = String(job.videoUrl || '').trim()
    if (!url) {
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段未返回视频地址` }
    }

    let seedanceBlob: Blob | null = null
    for (let d = 0; d < 4; d++) {
      if (d > 0) await sleep(2000 * d)
      try {
        const candidate = await assertBlobLooksLikeVideo(
          await downloadVideoUrlAsBlob(url),
          `Seedance 第 ${i + 1} 段`,
        )
        if (candidate.size >= 1024) {
          seedanceBlob = candidate
          break
        }
      } catch {
        /* retry */
      }
    }
    if (!seedanceBlob) {
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段豆包视频下载失败` }
    }

    videoBlobs.push(seedanceBlob)
    sourceUrls.push(url)
    prevVideoUrl = url
  }

  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 82 })

  let mergedVideo: Blob
  try {
    mergedVideo = await mergeSegmentVideos(videoBlobs, sourceUrls)
  } catch (e) {
    return {
      ok: false,
      message: sanitizeDhRenderPipelineError(
        e instanceof Error ? e.message : String(e),
        '多段视频合并失败',
      ),
    }
  }

  onProgress?.({ phase: 'audio', segmentIndex: segmentTotal, segmentTotal, progress: 88 })
  let fullNarration: Blob
  try {
    fullNarration =
      segmentAudioBlobs.length === 1
        ? segmentAudioBlobs[0]!
        : await concatAudioMp3Blobs(segmentAudioBlobs)
  } catch (e) {
    return {
      ok: false,
      message: sanitizeDhRenderPipelineError(
        e instanceof Error ? e.message : String(e),
        '口播音频拼接失败',
      ),
    }
  }

  let videoWithNarration: Blob
  try {
    videoWithNarration = await muxNarrationIntoVideo(mergedVideo, fullNarration)
  } catch (e) {
    return {
      ok: false,
      message: sanitizeDhRenderPipelineError(
        e instanceof Error ? e.message : String(e),
        '成片口播混音失败',
      ),
    }
  }

  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 94 })
  let finalBlob: Blob
  try {
    finalBlob = await applyDhFinalPostProcess(
      work,
      videoWithNarration,
      script,
      baseFrameMode,
      targetDurationSec,
      { preserveNarrationAudio: true },
    )
  } catch (e) {
    return {
      ok: false,
      message: sanitizeDhRenderPipelineError(
        e instanceof Error ? e.message : String(e),
        '成片后处理失败（字幕/运镜）',
      ),
    }
  }

  const finalHasAudio = await probeVideoHasAudioStream(finalBlob)
  if (!finalHasAudio) {
    return {
      ok: false,
      message: '成片验收失败：MP4 无口播音轨。请确认运营台已配置 MiniMax/千问 TTS 后重新渲染。',
    }
  }

  return {
    ok: true,
    outputMp4Url: URL.createObjectURL(finalBlob),
    outputBlob: finalBlob,
    segmentCount: segmentTotal,
    engine: usedProductFusion ? 'seedance_product_fusion' : 'seedance',
    videoProvider: 'doubao',
    plannerModel: 'doubao',
  }
}

/** 实拍视频：统一走 Seedance 一体化生成（与照片驱动相同） */
async function renderWithVideoCloneLipsync(
  work: DigitalHumanWork,
  cfg: NonNullable<Awaited<ReturnType<typeof fetchVideoAiConfig>>>,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  return renderWithSeedance(work, cfg, onProgress)
}

export async function renderDigitalHumanMp4(
  work: DigitalHumanWork,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  const draft = work.draft
  if (draft.driveMode !== 'audio' && draft.script.trim().length < 8) {
    return { ok: false, message: '口播文案过短，请先填写至少 8 个字' }
  }
  if (draft.driveMode === 'audio' && !work.hasLocalCustomAudio) {
    return {
      ok: false,
      message: '音频驱动模式需要先上传口播音频。请返回步骤 2 选择 MP3/WAV/M4A 后重新提交。',
    }
  }

  const cfg = await fetchVideoAiConfig()
  if (cfg?.configLoadError) {
    return {
      ok: false,
      message: `视频 AI 配置拉取失败：${cfg.configLoadError}。请确认 /erp-api/meoo-merchant-ai-video-config 可达后重试。`,
    }
  }

  if (draft.avatarKind === 'video_clone') {
    if (!canUseSeedance(cfg)) {
      return {
        ok: false,
        message:
          '数字人口播须配置豆包 Seedance 视频模型，请在运营台配置 MERCHANT_AI_DOUBAO_KEY。',
      }
    }
    return renderWithVideoCloneLipsync(work, cfg!, onProgress)
  }

  if (!canUseSeedance(cfg)) {
    return {
      ok: false,
      message:
        '数字人口播须配置豆包 Seedance 视频模型（与短视频同源）。请在运营台配置 MERCHANT_AI_DOUBAO_KEY 与视频模型。',
    }
  }

  return renderWithSeedance(work, cfg!, onProgress)
}

/** 解析作品成片 Blob：IndexedDB → 有效 blob: URL → 远端 HTTPS */
export async function resolveWorkMp4Blob(work: DigitalHumanWork): Promise<Blob | null> {
  const fromStore = await loadWorkMp4Blob(work.id)
  if (fromStore) return fromStore

  const blobUrl = work.outputBlobUrl?.trim()
  if (blobUrl?.startsWith('blob:') && (await blobUrlIsReadable(blobUrl))) {
    try {
      const b = await fetch(blobUrl).then((r) => r.blob())
      if (b.size >= 1024) return b
    } catch {
      /* fall through */
    }
  }

  const remote = work.outputMp4Url?.trim()
  if (remote && /^https?:\/\//i.test(remote)) {
    try {
      return await downloadVideoUrlAsBlob(remote)
    } catch {
      return null
    }
  }

  return null
}

export function resolveWorkPreviewVideoUrl(work: DigitalHumanWork): string | null {
  const blobUrl = work.outputBlobUrl?.trim()
  if (blobUrl?.startsWith('blob:')) return blobUrl
  const remote = work.outputMp4Url?.trim()
  if (remote && /^https?:\/\//i.test(remote)) return remote
  return null
}

/** 预览用 object URL（调用方应在关闭预览后 revoke） */
export async function createWorkPreviewObjectUrl(work: DigitalHumanWork): Promise<string | null> {
  const existing = resolveWorkPreviewVideoUrl(work)
  if (existing?.startsWith('blob:') && (await blobUrlIsReadable(existing))) return existing
  if (existing?.startsWith('http')) return existing

  const blob = await resolveWorkMp4Blob(work)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

/** 渲染完成后持久化成片（IndexedDB + 本会话 blob URL） */
export async function persistCompletedWorkMp4(
  workId: string,
  blob: Blob,
): Promise<{ blobUrl: string; hasLocalMp4: true }> {
  await saveWorkMp4Blob(workId, blob)
  return { blobUrl: URL.createObjectURL(blob), hasLocalMp4: true }
}

/** 触发浏览器下载高清 MP4 */
export async function downloadDigitalHumanMp4(work: DigitalHumanWork): Promise<{ ok: boolean; message?: string }> {
  const name = `${work.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 48)}.mp4`

  const blob = await resolveWorkMp4Blob(work)
  if (blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { ok: true }
  }

  const staleBlob = work.outputBlobUrl?.trim()
  if (staleBlob?.startsWith('blob:')) {
    return {
      ok: false,
      message: '本地成片已过期（页面刷新后 blob 链接失效）。请点击「再编辑」重新提交渲染。',
    }
  }

  if (!work.outputMp4Url?.trim() && !work.hasLocalMp4) {
    return { ok: false, message: '暂无成片，请等待渲染完成或重新提交' }
  }

  return {
    ok: false,
    message: '找不到本地成片文件。请点击「再编辑」重新提交渲染以生成带口播音频的 MP4。',
  }
}
