/**
 * 阿里云 IMS 智能一键成片 — SubmitBatchMediaProducingJob / GetBatchMediaProducingJob
 * @see https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-submitbatchmediaproducingjob
 *
 * 多素材策略（写死）：
 * - 全部素材放入一组 AverageSplit，总时长 = 用户目标（允许输出 MaxDuration +3 秒）
 * - 分组口播：每段素材 + 对应口播（画面与 TTS 对齐，禁止全局一条口播硬配）
 */
import IceModule, {
  GetBatchMediaProducingJobRequest,
  SubmitBatchMediaProducingJobRequest,
} from '@alicloud/ice20201109'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import { ensureIceHttpsUrl, sanitizeIcePipelineMediaUrl } from './aliyunOssIceParse.js'
import { isIceTransientNetworkError } from '../src/lib/iceTransientNetworkError.js'
import {
  buildSmartBatchAsrConfig,
  ICE_SUBTITLE_STYLE_DEFAULT_ID,
  resolveIceSubtitleStylePreset,
} from '../src/lib/iceSubtitleStylePresets.js'
import { resolveImsBatchSpeechVoice } from '../src/lib/digitalHumanBroadcast.js'
import {
  buildMixSpeakableNarration,
  parseScriptTimeRangeSeconds,
  planLongformAllFiveSecondDurations,
  sanitizeMixDialogueText,
  scriptTimeRangesFromDurationPlan,
} from '../src/lib/shortVideoScriptTable.js'
import { resolveIceMixBgmUrl } from '../src/lib/iceMixBgmPresets.js'
import {
  type IceSmartBatchMaterial,
  type IceSmartBatchScriptRow,
  pickSmartBatchMaterialIndices,
  pickSmartBatchSegmentCount,
} from '../src/lib/iceSmartBatchPlan.js'
import {
  type AliyunIceConfig,
  iceRegisterSmartBatchBgmMediaId,
  iceRegisterSmartBatchMaterials,
  type IceSmartBatchRegisteredMaterial,
} from './aliyunIceCore.js'

type IceClientClass = {
  new (config: $OpenApiUtil.Config): {
    submitBatchMediaProducingJob(
      req: SubmitBatchMediaProducingJobRequest,
    ): Promise<{ body?: Record<string, unknown> }>
    getBatchMediaProducingJob(
      req: GetBatchMediaProducingJobRequest,
    ): Promise<{ body?: Record<string, unknown> }>
  }
}

function resolveSdkCtor(mod: unknown): IceClientClass {
  if (typeof mod === 'function') return mod as IceClientClass
  if (mod && typeof mod === 'object' && 'default' in mod) {
    const d = (mod as { default: unknown }).default
    if (typeof d === 'function') return d as IceClientClass
  }
  throw new Error('ICE SDK 不可用')
}

const IceClient = resolveSdkCtor(IceModule)

/** 成片时长须与用户目标一致（禁止 +3 秒浮动导致偏短） */
const SMART_BATCH_DURATION_SLACK_SEC = 0

function createClient(cfg: AliyunIceConfig): InstanceType<typeof IceClient> {
  return new IceClient(
    new $OpenApiUtil.Config({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      regionId: cfg.regionId,
      endpoint: `ice.${cfg.regionId}.aliyuncs.com`,
      connectTimeout: 30_000,
      readTimeout: 90_000,
    }),
  )
}

function bodyOf(res: { body?: Record<string, unknown> }): Record<string, unknown> | undefined {
  return res.body
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeImsMediaUrl(raw: string): string {
  let u = String(raw ?? '').trim()
  if (!u) return u
  if (/^http:\/(?!\/)/i.test(u)) {
    u = `https://${u.slice('http:/'.length)}`
  }
  return ensureIceHttpsUrl(u)
}

function isPlaceholderDialogue(text: string): boolean {
  const t = text.trim()
  if (t.length < 8) return true
  if (/^精彩片段$/i.test(t)) return true
  if (/^（无口播）$/i.test(t)) return true
  return false
}

/** 全局口播：仅分镜口播列，禁止掺入指导文案（Timeline 回退路径用） */
function buildSmartBatchNarration(
  _guidance: string,
  scriptRows: IceSmartBatchScriptRow[],
  targetSec: number,
): string {
  const rowDialogues = scriptRows
    .map((r) => sanitizeMixDialogueText(String(r.dialogue ?? '')))
    .filter((d) => !isPlaceholderDialogue(d))

  return buildMixSpeakableNarration(rowDialogues, { targetSec })
}

export { buildSmartBatchSubmitPayload, type IceSmartBatchMaterial, type IceSmartBatchScriptRow } from '../src/lib/iceSmartBatchPlan.js'

function padSmartBatchRowsForTarget(
  rows: IceSmartBatchScriptRow[],
  segmentCount: number,
  targetTotalSec: number,
): IceSmartBatchScriptRow[] {
  const plan = planLongformAllFiveSecondDurations(targetTotalSec)
  const ranges = scriptTimeRangesFromDurationPlan(plan.slice(0, segmentCount))
  const base = rows.slice(0, segmentCount)
  while (base.length < segmentCount) {
    const prev = base[base.length - 1] ?? rows[rows.length - 1]
    base.push({
      timeRange: ranges[base.length] ?? '',
      visual: prev?.visual?.trim() || '延续上一镜头，平滑过渡',
      dialogue: prev?.dialogue?.trim() || '',
    })
  }
  return base.slice(0, segmentCount).map((r, i) => ({
    ...r,
    timeRange: r.timeRange?.trim() ? r.timeRange : (ranges[i] ?? ''),
  }))
}

function segmentDurationFromRow(
  row: IceSmartBatchScriptRow | undefined,
  fallbackSec: number,
  targetTotalSec: number,
  segmentIndex: number,
  segmentCount: number,
): number {
  const range = parseScriptTimeRangeSeconds(String(row?.timeRange ?? ''))
  if (range && range.end > range.start) {
    return Math.max(2, Math.min(15, range.end - range.start))
  }
  const each = targetTotalSec / Math.max(1, segmentCount)
  if (segmentIndex === segmentCount - 1) {
    const prevTotal = each * (segmentCount - 1)
    return Math.max(2, Math.min(15, Math.round((targetTotalSec - prevTotal) * 100) / 100))
  }
  return Math.max(2, Math.min(8, Math.round(each * 100) / 100 || fallbackSec))
}

function buildDefaultEditingConfig(
  speechRate = 0,
  subtitleStyleId?: string,
  singleShotDuration = 3,
  opts?: { voicePresetId?: string; transitionAuto?: boolean; groupedSpeech?: boolean; bgmEnabled?: boolean },
): Record<string, unknown> {
  const preset = resolveIceSubtitleStylePreset(subtitleStyleId ?? ICE_SUBTITLE_STYLE_DEFAULT_ID)
  const shotDur = Math.max(3, Math.min(5, singleShotDuration))
  const imsVoice = resolveImsBatchSpeechVoice(opts?.voicePresetId ?? '')
  const transitionAuto = opts?.transitionAuto !== false
  const grouped = opts?.groupedSpeech !== false
  const processConfig: Record<string, unknown> = {
    AllowTransition: transitionAuto,
    UseUniformTransition: true,
    TransitionList: transitionAuto ? ['directional', 'simplezoom', 'wiperight'] : [],
    AllowVfxEffect: false,
    EnableClipSplit: false,
    SingleShotDuration: Math.round(shotDur * 100) / 100,
  }
  if (!grouped) {
    processConfig.AlignmentMode = 'Cut'
  }
  const editing: Record<string, unknown> = {
    ProcessConfig: processConfig,
    MediaConfig: { Volume: 0 },
    SpeechConfig: {
      Volume: 1,
      SpeechRate: speechRate,
      Voice: imsVoice,
      AsrConfig: buildSmartBatchAsrConfig(preset),
    },
  }
  if (opts?.bgmEnabled) {
    editing.BackgroundMusicConfig = { Volume: 0.12 }
  } else {
    editing.BackgroundMusicConfig = { Volume: 0 }
  }
  return editing
}

/** IMS 分组口播：每段 MediaGroup 绑定一条口播，与分镜表顺序一致 */
function buildInputConfig(input: {
  materials: IceSmartBatchRegisteredMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  guidance: string
  targetTotalSec: number
  materialSlots?: number[]
  bgmMediaId?: string
}): { inputConfig: Record<string, unknown>; speechRate: number; shotDurationSec: number } {
  const materialCount = input.materials.length
  const slots = (input.materialSlots ?? []).filter(
    (n) => Number.isFinite(n) && n >= 0 && n < materialCount,
  )
  const targetTotalSec = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
  const segmentCount = pickSmartBatchSegmentCount(
    input.scriptRows,
    materialCount,
    targetTotalSec,
  )
  const pickedIndices = pickSmartBatchMaterialIndices(materialCount, slots, segmentCount)
  const rows = padSmartBatchRowsForTarget(
    input.scriptRows.slice(0, segmentCount),
    segmentCount,
    targetTotalSec,
  )
  const defaultSegSec = Math.max(
    3,
    Math.min(5, Math.round((targetTotalSec / Math.max(1, pickedIndices.length)) * 100) / 100),
  )

  const mediaGroups = pickedIndices.map((matIndex, i) => {
    const mat = input.materials[matIndex]!
    const mediaId = String(mat.mediaId ?? '').trim()
    if (!mediaId) {
      throw new Error(`第 ${matIndex + 1} 条素材 IMS 媒资 ID 缺失，请重新提交`)
    }
    const row = rows[i]
    const dialogue = sanitizeMixDialogueText(String(row?.dialogue ?? '')).trim()
    const segDur = segmentDurationFromRow(row, defaultSegSec, targetTotalSec, i, pickedIndices.length)
    const group: Record<string, unknown> = {
      GroupName: `storyboard-${i}`,
      MediaArray: [mediaId],
      SplitMode: 'NoSplit',
      Volume: 0,
      Duration: Math.round(segDur * 100) / 100,
    }
    if (dialogue.length >= 2 && !isPlaceholderDialogue(dialogue)) {
      group.SpeechTextArray = [dialogue.slice(0, 200)]
    }
    return group
  })

  const inputConfig: Record<string, unknown> = {
    MediaGroupArray: mediaGroups,
  }
  if (input.bgmMediaId) {
    inputConfig.BackgroundMusicArray = [input.bgmMediaId]
  }

  return {
    inputConfig,
    speechRate: 0,
    shotDurationSec: defaultSegSec,
  }
}

function buildOutputConfig(
  cfg: AliyunIceConfig,
  input: {
    clientToken: string
    targetTotalSec: number
    width: number
    height: number
  },
):
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; message: string } {
  const prefix = cfg.outputOssUrlPrefix?.replace(/\/+$/, '')
  if (!prefix) {
    return {
      ok: false,
      message: '未配置 OSS 成片 URL 前缀，无法输出智能一键成片。',
    }
  }
  const target = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
  const maxDuration = Math.min(123, target + SMART_BATCH_DURATION_SLACK_SEC)
  const mediaURL = ensureIceHttpsUrl(`${prefix}/smart-batch/${input.clientToken}_{index}.mp4`)
  return {
    ok: true,
    config: {
      MediaURL: mediaURL,
      Count: 1,
      MaxDuration: maxDuration,
      Width: input.width,
      Height: input.height,
      Video: { Crf: 27 },
    },
  }
}

export async function iceSubmitSmartBatchJob(
  cfg: AliyunIceConfig,
  input: {
    materials: IceSmartBatchMaterial[]
    scriptRows?: IceSmartBatchScriptRow[]
    guidance?: string
    targetTotalSec: number
    width: number
    height: number
    projectName?: string
    templateIds?: string[]
    clientToken: string
    materialSlots?: number[]
    subtitleStyleId?: string
    mixVoicePresetId?: string
    transitionMode?: 'auto' | string
    bgmPresetId?: string
    mixBgmUrl?: string
  },
): Promise<
  | { ok: true; batchJobId: string }
  | { ok: false; message: string; step?: string }
> {
  if (input.materials.length < 2) {
    return { ok: false, message: '智能成片至少需要 2 条素材', step: 'validate' }
  }
  const guidance = String(input.guidance ?? '').trim()
  const scriptRows = input.scriptRows ?? []
  const hasDialogue = scriptRows.some((r) => String(r.dialogue ?? '').trim().length >= 2)
  if (guidance.length < 20 && !hasDialogue) {
    return {
      ok: false,
      message: '请填写至少 20 字指导文案，或在分镜表中填写口播',
      step: 'validate',
    }
  }

  const targetTotalSec = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))

  const output = buildOutputConfig(cfg, {
    clientToken: input.clientToken,
    targetTotalSec,
    width: input.width,
    height: input.height,
  })
  if (!output.ok) return { ok: false, message: output.message, step: 'output' }

  const materialCount = input.materials.length
  const slots = (input.materialSlots ?? []).filter(
    (n) => Number.isFinite(n) && n >= 0 && n < materialCount,
  )
  const segmentCount = pickSmartBatchSegmentCount(scriptRows, materialCount, targetTotalSec)
  const pickedIndices = pickSmartBatchMaterialIndices(materialCount, slots, segmentCount)
  const projectName = String(input.projectName ?? '智能成片').trim() || '智能成片'

  const registered = await iceRegisterSmartBatchMaterials(
    cfg,
    input.materials,
    projectName,
    pickedIndices,
  )
  if (!registered.ok) return registered

  const bgmUrl = resolveIceMixBgmUrl({
    presetId: input.bgmPresetId,
    customUrl: input.mixBgmUrl,
  })
  let bgmMediaId: string | undefined
  if (bgmUrl) {
    const bgmReg = await iceRegisterSmartBatchBgmMediaId(cfg, bgmUrl, `${projectName}-BGM`)
    if (bgmReg.ok) {
      bgmMediaId = bgmReg.mediaId
    }
    // BGM 为可选增强：入库失败时不阻断智能成片主流程
  }

  const built = buildInputConfig({
    materials: registered.materials,
    scriptRows,
    guidance,
    targetTotalSec,
    materialSlots: input.materialSlots,
    bgmMediaId,
  })
  let inputConfig: Record<string, unknown>
  try {
    inputConfig = built.inputConfig
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg, step: 'register_media' }
  }
  const bgmEnabled = Boolean(bgmMediaId)
  const editingConfig = buildDefaultEditingConfig(
    built.speechRate,
    input.subtitleStyleId,
    built.shotDurationSec,
    {
      voicePresetId: input.mixVoicePresetId,
      transitionAuto: input.transitionMode !== 'none' && input.transitionMode !== 'fade',
      groupedSpeech: true,
      bgmEnabled,
    },
  )
  const templateIds = (input.templateIds ?? []).filter(Boolean).slice(0, 50)

  const client = createClient(cfg)
  try {
    const req = new SubmitBatchMediaProducingJobRequest({
      clientToken: input.clientToken,
      inputConfig: JSON.stringify(inputConfig),
      editingConfig: JSON.stringify(editingConfig),
      outputConfig: JSON.stringify(output.config),
      ...(templateIds.length ? { templateConfig: JSON.stringify(templateIds) } : {}),
    })
    const res = await client.submitBatchMediaProducingJob(req)
    const jobId = String(bodyOf(res)?.jobId ?? bodyOf(res)?.JobId ?? '').trim()
    if (!jobId) {
      return { ok: false, message: 'SubmitBatchMediaProducingJob 未返回 JobId', step: 'submit' }
    }
    return { ok: true, batchJobId: jobId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg, step: 'submit' }
  }
}

export async function iceGetSmartBatchJob(
  cfg: AliyunIceConfig,
  batchJobId: string,
): Promise<
  | {
      ok: true
      status: string
      done: boolean
      failed: boolean
      downloadUrl?: string
      outputBytes?: number
      durationSec?: number
      message?: string
    }
  | { ok: false; message: string; transient?: boolean }
> {
  const client = createClient(cfg)
  const maxAttempts = 5
  let lastMsg = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await client.getBatchMediaProducingJob(
        new GetBatchMediaProducingJobRequest({ jobId: batchJobId }),
      )
      const batch = (bodyOf(res)?.editingBatchJob ?? bodyOf(res)?.EditingBatchJob) as
        | Record<string, unknown>
        | undefined
      if (!batch) return { ok: false, message: '未找到批量一键成片任务' }

      const status = String(batch.status ?? batch.Status ?? '')
      const st = status.toLowerCase()
      const subJobs = (batch.subJobList ?? batch.SubJobList) as Array<Record<string, unknown>> | undefined
      const firstSub = subJobs?.[0]
      const subStatus = String(firstSub?.status ?? firstSub?.Status ?? '').toLowerCase()

      const failed = st === 'failed' || subStatus === 'failed'
      const done =
        !failed &&
        (st === 'finished' || st === 'success') &&
        (subStatus === 'success' || subStatus === 'finished')

      let downloadUrl: string | undefined
      let durationSec: number | undefined
      if (done && firstSub) {
        downloadUrl =
          normalizeImsMediaUrl(String(firstSub.mediaURL ?? firstSub.MediaURL ?? '')) || undefined
        const dur = Number(firstSub.duration ?? firstSub.Duration)
        if (Number.isFinite(dur) && dur > 0) durationSec = dur
      }

      const extend = batch.extend ?? batch.Extend
      let message: string | undefined
      if (extend && typeof extend === 'object') {
        const ext = extend as Record<string, unknown>
        message = String(ext.errorMessage ?? ext.ErrorMessage ?? '').trim() || undefined
      }
      if (failed && firstSub) {
        message =
          String(firstSub.errorMessage ?? firstSub.ErrorMessage ?? message ?? '').trim() ||
          '智能成片失败'
      }

      return {
        ok: true,
        status: subStatus ? `${status}/${subStatus}` : status,
        done,
        failed,
        downloadUrl,
        durationSec,
        message,
      }
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : String(e)
      if (!isIceTransientNetworkError(lastMsg) || attempt >= maxAttempts - 1) {
        return {
          ok: false,
          message: lastMsg,
          transient: isIceTransientNetworkError(lastMsg),
        }
      }
      await sleep(1500 * (attempt + 1))
    }
  }
  return { ok: false, message: lastMsg || '查询智能成片任务失败', transient: true }
}

/** 是否可用 MiniMax/通义做与面板一致的口播 TTS */
export function merchantIceMixTtsEnvReady(env?: Record<string, string | undefined>): boolean {
  if (!env) return false
  return Boolean(
    (env.MERCHANT_AI_MINIMAX_KEY ?? env.MINIMAX_API_KEY ?? '').trim()
      || (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim(),
  )
}

export type SmartBatchTimelineProduceInput = {
  segments: Array<{
    kind: 'video' | 'image'
    mediaUrl: string
    timelineStartSec: number
    timelineEndSec: number
    caption?: string
    materialIndex?: number
    sourceInSec?: number
    sourceOutSec?: number
  }>
  narration: string
  editBrief: string
}

/** 智能成片改走 Timeline + 所选口播音色（MiniMax/通义），与试听/混剪一致 */
export function buildSmartBatchTimelineProduceInput(input: {
  materials: IceSmartBatchMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  guidance: string
  targetTotalSec: number
  materialSlots?: number[]
}): SmartBatchTimelineProduceInput {
  const targetTotalSec = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
  const baseUrls = input.materials
    .map((m) => ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(m.mediaUrl)))
    .filter(Boolean)
  const slots = (input.materialSlots ?? []).filter(
    (n) => Number.isFinite(n) && n >= 0 && n < baseUrls.length,
  )
  const segmentCount = pickSmartBatchSegmentCount(input.scriptRows, baseUrls.length, targetTotalSec)
  const pickedIndices = pickSmartBatchMaterialIndices(baseUrls.length, slots, segmentCount)
  const narration = buildSmartBatchNarration(input.guidance, input.scriptRows, targetTotalSec)
  const each = targetTotalSec / Math.max(1, pickedIndices.length)

  const segments = pickedIndices.map((matIdx, i) => {
    const mat = input.materials[matIdx] ?? input.materials[i] ?? input.materials[0]!
    const url = baseUrls[matIdx] ?? baseUrls[i] ?? baseUrls[0]!
    const row = input.scriptRows[i]
    const start = Math.round(i * each * 10) / 10
    const end = i === pickedIndices.length - 1 ? targetTotalSec : Math.round((i + 1) * each * 10) / 10
    const clipDur = Math.max(0.45, end - start)
    const sourceIn =
      mat.kind === 'video' ? Math.min(1.2 + (i % 4) * 1.35, Math.max(1.2, clipDur)) : 0
    return {
      kind: mat.kind,
      mediaUrl: url,
      timelineStartSec: start,
      timelineEndSec: end,
      caption: String(row?.dialogue ?? '').trim() || undefined,
      materialIndex: matIdx >= 0 ? matIdx : i,
      sourceInSec: mat.kind === 'video' ? sourceIn : undefined,
      sourceOutSec: mat.kind === 'video' ? sourceIn + clipDur : undefined,
    }
  })

  const editBrief = [
    '智能一键成片（口播与所选音色一致）',
    `目标时长约 ${targetTotalSec} 秒`,
    '原素材静音，服务端按所选口播音色合成讲解',
    input.guidance.trim().slice(0, 240),
  ]
    .filter(Boolean)
    .join('；')

  return { segments, narration, editBrief }
}
