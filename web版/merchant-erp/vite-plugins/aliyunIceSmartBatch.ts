/**
 * 阿里云 IMS 智能一键成片 — SubmitBatchMediaProducingJob / GetBatchMediaProducingJob
 * @see https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-submitbatchmediaproducingjob
 *
 * 多素材策略（写死）：
 * - 全部素材放入一组 AverageSplit，总时长 = 用户目标（允许输出 MaxDuration +3 秒）
 * - 仅一条全局口播（时长按目标秒数裁剪），禁止每素材独立 TTS（否则成片会被口播拉长到数分钟）
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
import type { AliyunIceConfig } from './aliyunIceCore.js'

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

/** 中文口播约 4 字/秒 */
const DIALOGUE_CHARS_PER_SEC = 4
/** 成片允许超出用户目标的最长时间（秒） */
const SMART_BATCH_DURATION_SLACK_SEC = 3

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

function estimateSpeechSec(text: string): number {
  const len = text.trim().length
  if (len <= 0) return 0
  return Math.max(2, Math.ceil(len / DIALOGUE_CHARS_PER_SEC))
}

function truncateDialogue(text: string, maxChars: number): string {
  const t = text.trim()
  if (t.length <= maxChars) return t
  const cut = t.slice(0, maxChars)
  const lastPunc = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'), cut.lastIndexOf('！'))
  if (lastPunc >= Math.floor(maxChars * 0.5)) return cut.slice(0, lastPunc + 1)
  return `${cut}…`
}

/** 从指导文案取一句短口播（禁止整段执行文稿上屏/入 TTS） */
function extractShortHookFromGuidance(guidance: string, maxChars: number): string {
  const t = guidance.trim()
  if (!t) return '探店好物推荐，快来看看'
  const sentences = t.split(/(?<=[。！？!?])\s*/).map((s) => s.trim()).filter(Boolean)
  const pick = sentences.find((s) => s.length >= 6 && s.length <= maxChars) ?? sentences[0] ?? t
  return truncateDialogue(pick, maxChars)
}

function resolveSpeechRateForTarget(estSec: number, targetSec: number): number {
  if (estSec <= targetSec + 1) return 0
  const ratio = estSec / Math.max(1, targetSec)
  return Math.min(200, Math.round((ratio - 1) * 400))
}

/** 全局口播：字数严格按目标时长裁剪（约 4 字/秒） */
function buildSmartBatchNarration(
  guidance: string,
  scriptRows: IceSmartBatchScriptRow[],
  targetSec: number,
): string {
  const maxChars = Math.max(16, Math.floor(targetSec * DIALOGUE_CHARS_PER_SEC))
  const pool = scriptRows
    .map((r) => String(r.dialogue ?? '').trim())
    .filter((d) => d.length >= 4 && !/^（无口播）$/i.test(d))
  const short = pool.find((d) => d.length <= maxChars)
  if (short) return short
  const joined = truncateDialogue(pool.slice(0, 3).join('，'), maxChars)
  if (joined.length >= 8) return joined
  return extractShortHookFromGuidance(guidance, maxChars)
}

export type IceSmartBatchMaterial = {
  kind: 'video' | 'image'
  mediaUrl: string
  label?: string
}

export type IceSmartBatchScriptRow = {
  timeRange?: string
  visual?: string
  dialogue?: string
}

function buildDefaultEditingConfig(
  speechRate = 0,
  subtitleStyleId?: string,
  singleShotDuration = 2,
): Record<string, unknown> {
  const preset = resolveIceSubtitleStylePreset(subtitleStyleId ?? ICE_SUBTITLE_STYLE_DEFAULT_ID)
  const shotDur = Math.max(0.45, Math.min(8, singleShotDuration))
  return {
    ProcessConfig: {
      AllowTransition: true,
      UseUniformTransition: false,
      TransitionList: ['linearblur', 'colordistance', 'crosshatch', 'dreamyzoom'],
      AllowVfxEffect: false,
      EnableClipSplit: true,
      SingleShotDuration: Math.round(shotDur * 100) / 100,
      /** 以视频总时长为准裁剪，避免口播把成片拉长 */
      AlignmentMode: 'Cut',
    },
    MediaConfig: { Volume: 0 },
    SpeechConfig: {
      Volume: 1,
      SpeechRate: speechRate,
      AsrConfig: buildSmartBatchAsrConfig(preset),
    },
    BackgroundMusicConfig: { Volume: 0.22 },
  }
}

function buildInputConfig(input: {
  materials: IceSmartBatchMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  guidance: string
  targetTotalSec: number
}): { inputConfig: Record<string, unknown>; speechRate: number; shotDurationSec: number } {
  const urls = input.materials
    .map((m) => ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(m.mediaUrl)))
    .filter(Boolean)
  const guidance = input.guidance.trim()
  const targetTotalSec = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
  const shotDurationSec = Math.max(0.45, Math.round((targetTotalSec / Math.max(1, urls.length)) * 100) / 100)
  const narration = buildSmartBatchNarration(guidance, input.scriptRows, targetTotalSec)
  const estSpeech = estimateSpeechSec(narration)
  const speechRate = resolveSpeechRateForTarget(estSpeech, targetTotalSec)

  return {
    inputConfig: {
      MediaGroupArray: [
        {
          GroupName: 'main-all-materials',
          MediaArray: urls,
          SplitMode: 'AverageSplit',
          Duration: targetTotalSec,
          Volume: 0,
        },
      ],
      SpeechTextArray: [narration],
    },
    speechRate,
    shotDurationSec,
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

  const built = buildInputConfig({
    materials: input.materials,
    scriptRows,
    guidance,
    targetTotalSec,
  })
  const inputConfig = built.inputConfig
  const editingConfig = buildDefaultEditingConfig(
    built.speechRate,
    input.subtitleStyleId,
    built.shotDurationSec,
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
