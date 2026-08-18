/**
 * 数字人口播高清 MP4：火山 OmniHuman（单图+TTS 音频驱动口型）为主路径。
 * 先抠人融景成首帧，再音频驱动；成片自带口型音轨，无需后期静音混音。
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
  concatVideoSegmentsToMp4,
  probeVideoHasAudioStream,
} from './concatVideoSegments'
import {
  chunkScriptForS2vVideo,
  resolveUploadedNarrationSegments,
  synthesizeDigitalHumanNarration,
} from './digitalHumanRenderAudio'
import { imageUrlToPureBase64, normalizePortraitBase64ForS2v } from './videoFrameUtils'
import {
  concatVideoBlobsOnServer,
  concatVideoUrlsOnServer,
  downloadVideoUrlAsBlob,
  fetchVideoAiConfig,
  postProcessVideoOnServer,
} from '../services/videoAiApi'
import {
  buildSrtContent,
  buildSrtFromTimedChunks,
  DH_SUBTITLE_MAX_CHARS,
  probeVideoDurationSec,
  splitSubtitleLines,
  type TimedSubtitleChunk,
} from './digitalHumanSubtitle'
import { resolveDhSubtitleStyleForBurn } from './digitalHumanPostProcessStyles'
import { compositePortraitWithBackground } from './digitalHumanBackgroundComposite'
import {
  buildDhOmniHumanPrompt,
  chunkScriptForOmniHumanVideo,
  DH_OMNIHUMAN_MAX_SEGMENTS,
  estimateDhTargetDurationSec,
} from './digitalHumanSeedancePrompt'
import { buildBriefFromInput, validateBriefFidelity } from './shortVideoGenBrief'
import { getAudioDurationSec } from './digitalHumanAudioChunks'
import {
  inferGestureFromMotionText,
  motionLineForSegmentIndex,
  parseMotionInstructions,
} from './digitalHumanMotionPlan'
import { isDhProductFusionSegment, prepareDhProductFusionAssets } from './digitalHumanProductFusion'
import { runDhOmniHumanJob, runDhMotionImitateJob } from './dhOmniHumanVideoApi'
import {
  blobUrlIsReadable,
  loadWorkMp4Blob,
  loadWorkReferenceVideo,
  saveWorkMp4Blob,
} from './digitalHumanWorkBlobStore'

/** 旧 estimateDhSegmentCount 兼容 smoke 脚本 */
const CHARS_PER_SEGMENT = 35
const MAX_DH_SEGMENTS = 20
const MAX_S2V_SEGMENTS = 12

export type DhVideoEngine =
  | 'omnihuman'
  | 'motion_imitate'
  | 'seedance_lipsync'
  | 'seedance_product_fusion'
  | 'seedance'
  | 'qwen_s2v'
export type DhVideoProvider = 'volc' | 'doubao' | 'qwen'

export function dhVideoEngineLabel(engine: DhVideoEngine | undefined): string {
  if (engine === 'motion_imitate') return '即梦动作模仿 2.0（图+参考视频）'
  if (engine === 'omnihuman') return '火山 OmniHuman 音频驱动口播'
  if (engine === 'seedance_product_fusion') {
    return '火山 OmniHuman（人景产品合成）'
  }
  if (engine === 'seedance_lipsync' || engine === 'seedance') {
    return '火山 OmniHuman 音频驱动口播'
  }
  return '火山 OmniHuman 数字人口播'
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

/** OmniHuman 单图驱动：一律先合成进所选背景，避免灰底证件照直接驱动 */
function draftNeedsSceneComposite(_draft: DigitalHumanDraft): boolean {
  void _draft
  return true
}

async function blobToPureBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = typeof fr.result === 'string' ? fr.result : ''
      const ix = s.indexOf('base64,')
      resolve(ix >= 0 ? s.slice(ix + 'base64,'.length) : s.replace(/\s/g, ''))
    }
    fr.onerror = () => reject(new Error('读取文件失败'))
    fr.readAsDataURL(blob)
  })
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

function canUseOmniHuman(cfg: Awaited<ReturnType<typeof fetchVideoAiConfig>> | null): boolean {
  return Boolean(cfg?.omnihumanConfigured)
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
    return await normalizePortraitBase64ForS2v(raw, frameMode)
  } catch {
    return null
  }
}

async function applyDhFinalPostProcess(
  work: DigitalHumanWork,
  finalBlob: Blob,
  script: string,
  baseFrameMode: FrameMode,
  targetDurationSec?: number,
  opts?: {
    preserveNarrationAudio?: boolean
    timedSubtitleChunks?: TimedSubtitleChunk[] | null
  },
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
    const fromChunks = buildSrtFromTimedChunks(opts?.timedSubtitleChunks, {
      maxCharsPerLine: DH_SUBTITLE_MAX_CHARS,
      totalDurationSec: videoDur,
    })
    srtContent =
      fromChunks.trim() ||
      buildSrtContent(splitSubtitleLines(script, DH_SUBTITLE_MAX_CHARS), videoDur)
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
  if (/50400|Access\s*Denied/i.test(t)) {
    return (
      `${fallback}：火山即梦 OmniHuman Access Denied（账号未开通该能力、AK 无权限或余额不足）。` +
      '请到火山控制台开通「即梦 AI · OmniHuman 1.5」，确认轻量 MERCHANT_AI_VOLC_* 对应密钥有权，并有可用余额后重试。'
    )
  }
  if (/frame=\s*0|Lsize=\s*0kB|video:0kB|size=\s*0kB/i.test(t)) {
    return `${fallback}：编码结果为空（0 帧）。常见原因是混音失败、字幕/运镜后处理失败或某段视频损坏，请重试；仍失败可先关闭字幕后再生成。`
  }
  if (/libx264|Lavc\d|muxing overhead|Side data:|encoder\s*:/i.test(t)) {
    const clipped = t.replace(/\s+/g, ' ').slice(0, 160)
    return `${fallback}（${clipped}）`
  }
  return t.length > 280 ? `${t.slice(0, 280)}…` : t
}

async function renderWithOmniHuman(
  work: DigitalHumanWork,
  _cfg: NonNullable<Awaited<ReturnType<typeof fetchVideoAiConfig>>>,
  onProgress?: (p: DhRenderProgress) => void,
): Promise<DhRenderResult> {
  void _cfg
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

  const refVideo = await loadWorkReferenceVideo(work.id)
  const useMotion = Boolean(refVideo && refVideo.size >= 1024)
  if (useMotion && refVideo && refVideo.size > 12 * 1024 * 1024) {
    return { ok: false, message: '动作参考视频请压缩到 12MB 以内后再生成' }
  }

  let productPureB64: string | null = null
  if (draft.productOverlayEnabled) {
    try {
      const productDataUrl = await loadWorkProductImageDataUrl(work)
      if (!productDataUrl) {
        return {
          ok: false,
          message: '已开启手持产品展示，请返回步骤 3 上传产品图（JPG/PNG）后重试',
        }
      }
      productPureB64 = await imageUrlToPureBase64(productDataUrl)
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
    scriptChunks = chunkScriptForOmniHumanVideo(script)
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
      /* ignore */
    }
  }
  if (!(totalAudioSec > 0.3)) {
    totalAudioSec = estimateDhTargetDurationSec(script)
  }

  let segmentTotal = Math.max(
    isAudioDrive ? segmentAudioBlobs.length : scriptChunks.length,
    activeSceneShots && !isAudioDrive ? activeSceneShots.length : 1,
  )
  segmentTotal = Math.min(DH_OMNIHUMAN_MAX_SEGMENTS, Math.max(1, segmentTotal))
  if (useMotion) segmentTotal = 1
  const padText = scriptChunks[scriptChunks.length - 1] ?? script
  while (scriptChunks.length < segmentTotal) scriptChunks.push(padText)
  while (segmentAudioBlobs.length < segmentTotal) {
    segmentAudioBlobs.push(segmentAudioBlobs[segmentAudioBlobs.length - 1]!)
  }

  const targetDurationSec = Math.max(
    estimateDhTargetDurationSec(script),
    Math.ceil(totalAudioSec),
  )

  const videoBlobs: Blob[] = []
  const sourceUrls: string[] = []
  let usedProductFusion = false

  for (let i = 0; i < segmentTotal; i++) {
    onProgress?.({
      phase: 'generating',
      segmentIndex: i + 1,
      segmentTotal,
      progress: 14 + Math.round((i / segmentTotal) * 60),
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

    let sceneImageB64 = portraitB64
    const useProductFusion =
      Boolean(productPureB64) && isDhProductFusionSegment(i, segmentTotal)
    try {
      if (draftNeedsSceneComposite(segmentDraft) || segmentCustomBg) {
        sceneImageB64 = await compositePortraitWithBackground(
          portraitB64,
          segmentDraft.background,
          baseFrameMode,
          segmentCustomBg,
        )
      }
      if (useProductFusion && productPureB64) {
        const fusion = await prepareDhProductFusionAssets(sceneImageB64, productPureB64)
        sceneImageB64 = fusion.sceneWithProductB64
        usedProductFusion = true
      }
    } catch (e) {
      return {
        ok: false,
        message: `第 ${i + 1}/${segmentTotal} 段场景合成失败：${e instanceof Error ? e.message : String(e)}`,
      }
    }

    const motionLine = motionLineForSegmentIndex(motionLines, i)
    const segmentGesture =
      draft.gesturePreset !== 'none'
        ? inferGestureFromMotionText(motionLine?.text ?? '', draft.gesturePreset)
        : motionLine?.text
          ? inferGestureFromMotionText(motionLine.text, 'explain')
          : undefined
    const prompt = buildDhOmniHumanPrompt(segmentDraft, {
      motionText: motionLine?.text,
      gesturePreset: segmentGesture,
      scriptHint: scriptChunks[i] ?? script,
      hasProductFusion: useProductFusion,
    })

    let audioB64: string
    try {
      audioB64 = await blobToPureBase64(segmentAudioBlobs[i]!)
    } catch (e) {
      return {
        ok: false,
        message: `第 ${i + 1}/${segmentTotal} 段音频读取失败：${e instanceof Error ? e.message : String(e)}`,
      }
    }

    const job =
      useMotion && refVideo
        ? await runDhMotionImitateJob({
            image_base64: sceneImageB64,
            video_base64: await blobToPureBase64(refVideo),
            prompt,
            onProgress: (label) => {
              onProgress?.({
                phase: 'generating',
                segmentIndex: i + 1,
                segmentTotal,
                progress: 20 + Math.round((i / segmentTotal) * 55),
              })
              void label
            },
          })
        : await runDhOmniHumanJob({
            image_base64: sceneImageB64,
            audio_base64: audioB64,
            prompt,
            onProgress: (label) => {
              onProgress?.({
                phase: 'generating',
                segmentIndex: i + 1,
                segmentTotal,
                progress: 20 + Math.round((i / segmentTotal) * 55),
              })
              void label
            },
          })
    if (!job.ok) {
      return {
        ok: false,
        message: sanitizeDhRenderPipelineError(
          job.message,
          useMotion
            ? `第 ${i + 1}/${segmentTotal} 段动作模仿生成失败`
            : `第 ${i + 1}/${segmentTotal} 段 OmniHuman 生成失败`,
        ),
      }
    }

    const url = String(job.videoUrl || '').trim()
    if (!url) {
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段未返回视频地址` }
    }

    let ohBlob: Blob | null = null
    for (let d = 0; d < 4; d++) {
      if (d > 0) await sleep(2000 * d)
      try {
        const candidate = await assertBlobLooksLikeVideo(
          await downloadVideoUrlAsBlob(url),
          `OmniHuman 第 ${i + 1} 段`,
        )
        if (candidate.size >= 1024) {
          ohBlob = candidate
          break
        }
      } catch {
        /* retry */
      }
    }
    if (!ohBlob) {
      return { ok: false, message: `第 ${i + 1}/${segmentTotal} 段 OmniHuman 视频下载失败` }
    }

    videoBlobs.push(ohBlob)
    sourceUrls.push(url)
  }

  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 86 })

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

  onProgress?.({ phase: 'merging', segmentIndex: segmentTotal, segmentTotal, progress: 94 })

  const timedSubtitleChunks: TimedSubtitleChunk[] = []
  for (let i = 0; i < segmentTotal; i++) {
    let dur = 0
    try {
      dur = await getAudioDurationSec(segmentAudioBlobs[i]!)
    } catch {
      dur = 0
    }
    if (!(dur > 0.3)) {
      dur = Math.max(2, (scriptChunks[i] ?? '').length / 4)
    }
    timedSubtitleChunks.push({ text: scriptChunks[i] ?? '', durationSec: dur })
  }

  let finalBlob: Blob
  try {
    finalBlob = await applyDhFinalPostProcess(
      work,
      mergedVideo,
      script,
      baseFrameMode,
      targetDurationSec,
      { preserveNarrationAudio: !useMotion, timedSubtitleChunks },
    )
  } catch (e) {
    return {
      ok: false,
      message: sanitizeDhRenderPipelineError(
        e instanceof Error ? e.message : String(e),
        '成片后处理失败（字幕）',
      ),
    }
  }

  const finalHasAudio = await probeVideoHasAudioStream(finalBlob)
  if (!finalHasAudio && !useMotion) {
    return {
      ok: false,
      message: '成片验收失败：MP4 无口播音轨。OmniHuman 应自带音轨，请重试或检查火山视觉任务结果。',
    }
  }

  return {
    ok: true,
    outputMp4Url: URL.createObjectURL(finalBlob),
    outputBlob: finalBlob,
    segmentCount: segmentTotal,
    engine: useMotion
      ? 'motion_imitate'
      : usedProductFusion
        ? 'seedance_product_fusion'
        : 'omnihuman',
    videoProvider: 'volc',
    plannerModel: 'doubao',
  }
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

  if (!canUseOmniHuman(cfg)) {
    return {
      ok: false,
      message:
        '数字人口播已切换为火山 OmniHuman。请在轻量 auth-api.env 配置 MERCHANT_AI_VOLC_ACCESS_KEY 与 MERCHANT_AI_VOLC_SECRET_KEY（即梦/智能视觉控制台 AK/SK），重启 meoo-auth-api 后重试。',
    }
  }

  return renderWithOmniHuman(work, cfg!, onProgress)
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
