/**
 * 阿里云 IMS 智能一键成片 — SubmitBatchMediaProducingJob / GetBatchMediaProducingJob
 * @see https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-submitbatchmediaproducingjob
 */
import IceModule, {
  GetBatchMediaProducingJobRequest,
  SubmitBatchMediaProducingJobRequest,
} from '@alicloud/ice20201109'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import { ensureIceHttpsUrl, sanitizeIcePipelineMediaUrl } from './aliyunOssIceParse.js'
import { isIceTransientNetworkError } from '../src/lib/iceTransientNetworkError.js'
import { parseScriptTimeRangeSeconds } from '../src/lib/shortVideoScriptTable.js'
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

/** 中文口播约 4 字/秒（偏保守，避免低估 TTS 时长） */
const DIALOGUE_CHARS_PER_SEC = 4

function segmentCountForTarget(targetSec: number): number {
  return Math.max(2, Math.min(8, Math.ceil(targetSec / 4)))
}

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

function rowDurationSec(row: { timeRange?: string }): number | undefined {
  const p = parseScriptTimeRangeSeconds(String(row.timeRange ?? ''))
  if (!p) return undefined
  const d = p.end - p.start
  return d > 0 ? d : undefined
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

type PlannedDialogueRow = {
  dialogue: string
  materialIndex: number
  estSec: number
  rowIndex: number
}

function scriptRowsCoverTarget(
  scriptRows: IceSmartBatchScriptRow[],
  targetSec: number,
): boolean {
  let maxEnd = 0
  let timedCount = 0
  for (const r of scriptRows) {
    const p = parseScriptTimeRangeSeconds(String(r.timeRange ?? ''))
    if (p) {
      maxEnd = Math.max(maxEnd, p.end)
      timedCount++
    }
  }
  return timedCount >= 2 && maxEnd >= targetSec - 1
}

function resolveSpeechRateForTarget(estSec: number, targetSec: number): number {
  if (estSec <= targetSec + 1.5) return 0
  const ratio = estSec / Math.max(1, targetSec)
  // 口播略长时轻微加速，避免截断文案（SpeechRate 正值=加快）
  return Math.min(180, Math.round((ratio - 1) * 350))
}
function planDialogueRowsForTarget(input: {
  scriptRows: IceSmartBatchScriptRow[]
  materialSlots: number[]
  materialCount: number
  targetTotalSec: number
}): { rows: PlannedDialogueRow[]; padSec: number; speechRate: number } {
  const target = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
  const storyboardMode = scriptRowsCoverTarget(input.scriptRows, target)
  const idealSegs = segmentCountForTarget(target)

  const candidates = input.scriptRows
    .map((row, rowIndex) => {
      const dialogue = String(row.dialogue ?? '').trim()
      if (dialogue.length < 2) return null
      const materialIndex =
        input.materialSlots[rowIndex] ?? rowIndex % Math.max(1, input.materialCount)
      return { dialogue, materialIndex, rowIndex, estSec: estimateSpeechSec(dialogue) }
    })
    .filter(Boolean) as Array<{
    dialogue: string
    materialIndex: number
    rowIndex: number
    estSec: number
  }>

  if (candidates.length === 0) return { rows: [], padSec: target, speechRate: 0 }

  let rows: typeof candidates
  if (storyboardMode) {
    rows = candidates.filter((c) => {
      const row = input.scriptRows[c.rowIndex]
      const p = parseScriptTimeRangeSeconds(String(row?.timeRange ?? ''))
      if (!p) return true
      return p.start < target
    })
    if (rows.length < 2) rows = candidates
  } else {
    const minTotalSec = Math.max(target - 2, Math.round(target * 0.88))
    rows = []
    let accSec = 0
    for (const c of candidates) {
      rows.push(c)
      accSec += c.estSec
      if (rows.length >= idealSegs && accSec >= minTotalSec) break
    }
    if (rows.length < 2) {
      rows = candidates.slice(0, Math.min(candidates.length, Math.max(2, idealSegs)))
    }
    let accSec2 = rows.reduce((s, r) => s + r.estSec, 0)
    if (accSec2 > target * 1.35 && rows.length > 0) {
      const budget = Math.max(16, Math.floor(target * DIALOGUE_CHARS_PER_SEC))
      const perRow = Math.max(12, Math.floor(budget / rows.length))
      rows = rows.map((r) => {
        const dialogue = truncateDialogue(r.dialogue, perRow)
        return { ...r, dialogue, estSec: estimateSpeechSec(dialogue) }
      })
    }
  }

  const planned = rows.map((r) => ({
    dialogue: r.dialogue,
    materialIndex: r.materialIndex,
    estSec: r.estSec,
    rowIndex: r.rowIndex,
  }))

  const accSec = planned.reduce((s, r) => s + r.estSec, 0)
  const padSec = storyboardMode ? 0 : Math.max(0, Math.round((target - accSec) * 10) / 10)
  const speechRate = resolveSpeechRateForTarget(accSec, target)
  return { rows: planned, padSec, speechRate }
}

function buildPadMediaGroups(input: {
  materials: IceSmartBatchMaterial[]
  padSec: number
}): Array<Record<string, unknown>> {
  const pad = Math.round(input.padSec * 10) / 10
  if (pad < 1 || input.materials.length === 0) return []
  const first = input.materials[0]!
  const last = input.materials[input.materials.length - 1]!
  const firstUrl = ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(first.mediaUrl))
  const lastUrl = ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(last.mediaUrl))
  const openDur = Math.max(1, Math.round((pad / 2) * 10) / 10)
  const closeDur = Math.max(1, Math.round((pad - openDur) * 10) / 10)
  return [
    {
      GroupName: 'pad-open',
      MediaArray: [firstUrl],
      SplitMode: 'NoSplit',
      Duration: openDur,
      Volume: 0,
      DurationAutoAdapt: true,
    },
    {
      GroupName: 'pad-close',
      MediaArray: [lastUrl],
      SplitMode: 'NoSplit',
      Duration: closeDur,
      Volume: 0,
      DurationAutoAdapt: true,
    },
  ]
}

function buildDefaultEditingConfig(speechRate = 0, subtitleStyleId?: string): Record<string, unknown> {
  const preset = resolveIceSubtitleStylePreset(subtitleStyleId ?? ICE_SUBTITLE_STYLE_DEFAULT_ID)
  return {
    ProcessConfig: {
      AllowTransition: true,
      UseUniformTransition: false,
      TransitionList: ['linearblur', 'colordistance', 'crosshatch', 'dreamyzoom'],
      AllowVfxEffect: false,
      EnableClipSplit: true,
      SingleShotDuration: 4,
      AlignmentMode: 'AutoSpeed',
    },
    // 官方示例 Volume:0 = 原片静音，仅保留 TTS + BGM
    MediaConfig: { Volume: 0 },
    SpeechConfig: {
      Volume: 1,
      SpeechRate: speechRate,
      AsrConfig: buildSmartBatchAsrConfig(preset),
    },
    BackgroundMusicConfig: { Volume: 0.22 },
  }
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

function buildInputConfig(input: {
  materials: IceSmartBatchMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  guidance: string
  targetTotalSec: number
  materialSlots?: number[]
}): { inputConfig: Record<string, unknown>; speechRate: number } {
  const urls = input.materials
    .map((m) => ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(m.mediaUrl)))
    .filter(Boolean)
  const guidance = input.guidance.trim()
  const targetTotalSec = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
  const materialSlots = input.materialSlots ?? []

  const plannedResult = planDialogueRowsForTarget({
    scriptRows: input.scriptRows,
    materialSlots,
    materialCount: input.materials.length,
    targetTotalSec,
  })
  const planned = plannedResult.rows
  const padGroups = buildPadMediaGroups({ materials: input.materials, padSec: plannedResult.padSec })
  const speechRate = plannedResult.speechRate

  // 分组口播：仅用分镜「口播/文案」列；每组 Volume:0 强制原片消音
  if (planned.length >= 2) {
    const speechGroups = planned.map((row, i) => {
      const mat = input.materials[row.materialIndex % input.materials.length]!
      const url = ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(mat.mediaUrl))
      return {
        GroupName: `seg-${i + 1}`.slice(0, 50),
        MediaArray: [url],
        SplitMode: 'NoSplit' as const,
        Volume: 0,
        SpeechTextArray: [row.dialogue.slice(0, 240)],
      }
    })
    const mediaGroups = [...padGroups.slice(0, 1), ...speechGroups, ...padGroups.slice(1)]
    return { inputConfig: { MediaGroupArray: mediaGroups }, speechRate }
  }

  // 全局口播：一句短 hook；原片静音
  const hookMaxChars = Math.max(24, Math.floor(targetTotalSec * DIALOGUE_CHARS_PER_SEC))
  const hook =
    planned[0]?.dialogue ??
    extractShortHookFromGuidance(guidance, Math.min(hookMaxChars, 100))

  return {
    inputConfig: {
      MediaGroupArray: [
        {
          GroupName: 'main',
          MediaArray: urls,
          SplitMode: 'AverageSplit',
          Volume: 0,
        },
      ],
      SpeechTextArray: [truncateDialogue(hook, hookMaxChars)],
    },
    speechRate,
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
  const maxDuration = Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec)))
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
    materialSlots: input.materialSlots,
  })
  const inputConfig = built.inputConfig
  const editingConfig = buildDefaultEditingConfig(built.speechRate, input.subtitleStyleId)
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
