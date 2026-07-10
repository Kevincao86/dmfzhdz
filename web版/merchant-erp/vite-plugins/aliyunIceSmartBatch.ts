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

function normalizeImsMediaUrl(raw: string): string {
  let u = String(raw ?? '').trim()
  if (!u) return u
  // Aliyun IMS 偶发返回 http:/bucket...（缺一个 /）
  if (/^http:\/(?!\/)/i.test(u)) {
    u = `https://${u.slice('http:/'.length)}`
  }
  return ensureIceHttpsUrl(u)
}

function rowDurationSec(row: { timeRange?: string }): number | undefined {
  const p = parseScriptTimeRangeSeconds(String(row.timeRange ?? ''))
  if (!p) return undefined
  const d = p.end - p.start
  return d > 0 ? Math.min(15, Math.max(2, d)) : undefined
}

function buildDefaultEditingConfig(): Record<string, unknown> {
  return {
    ProcessConfig: {
      AllowTransition: true,
      UseUniformTransition: false,
      TransitionList: ['linearblur', 'colordistance', 'crosshatch', 'dreamyzoom'],
      AllowVfxEffect: false,
      EnableClipSplit: true,
      SingleShotDuration: 4,
    },
    MediaConfig: { Volume: 0.15 },
    SpeechConfig: { Volume: 1 },
    BackgroundMusicConfig: { Volume: 0.25 },
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
}): Record<string, unknown> {
  const urls = input.materials
    .map((m) => ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(m.mediaUrl)))
    .filter(Boolean)
  const guidance = input.guidance.trim()
  const rows = input.scriptRows.filter(
    (r) => String(r.dialogue ?? '').trim() || String(r.visual ?? '').trim(),
  )

  const useGrouped =
    rows.length >= 2 &&
    rows.some((r) => String(r.dialogue ?? '').trim().length >= 2)

  if (useGrouped) {
    const mediaGroups = rows.map((row, i) => {
      const mat = input.materials[i % input.materials.length]!
      const url = ensureIceHttpsUrl(sanitizeIcePipelineMediaUrl(mat.mediaUrl))
      const speech = String(row.dialogue ?? '').trim() || String(row.visual ?? '').trim()
      const group: Record<string, unknown> = {
        GroupName: `shot-${i + 1}`.slice(0, 50),
        MediaArray: [url],
        SplitMode: 'NoSplit',
      }
      if (speech.length >= 2) {
        group.SpeechTextArray = [speech.slice(0, 1000)]
      } else {
        const dur = rowDurationSec(row)
        if (dur) group.Duration = dur
      }
      return group
    })
    return {
      MediaGroupArray: mediaGroups,
      TitleArray: guidance ? [guidance.slice(0, 50)] : [`智能成片-${Date.now() % 10000}`],
    }
  }

  const speech =
    guidance.length >= 20
      ? guidance.slice(0, 1000)
      : rows
          .map((r) => String(r.dialogue ?? '').trim() || String(r.visual ?? '').trim())
          .filter(Boolean)
          .join('，')
          .slice(0, 1000)

  return {
    MediaGroupArray: [
      {
        GroupName: 'main',
        MediaArray: urls,
        SplitMode: 'AverageSplit',
      },
    ],
    SpeechTextArray: speech.length >= 4 ? [speech] : [`${speech || '探店好物推荐，快来看看'}`.slice(0, 1000)],
    TitleArray: guidance ? [guidance.slice(0, 50)] : ['智能一键成片'],
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
  const mediaURL = ensureIceHttpsUrl(`${prefix}/smart-batch/${input.clientToken}_{index}.mp4`)
  return {
    ok: true,
    config: {
      MediaURL: mediaURL,
      Count: 1,
      MaxDuration: Math.min(120, Math.max(5, Math.ceil(input.targetTotalSec))),
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
  if (guidance.length < 20 && !scriptRows.some((r) => String(r.dialogue ?? '').trim().length >= 4)) {
    return {
      ok: false,
      message: '请填写至少 20 字指导文案，或在分镜表中填写口播',
      step: 'validate',
    }
  }

  const output = buildOutputConfig(cfg, {
    clientToken: input.clientToken,
    targetTotalSec: input.targetTotalSec,
    width: input.width,
    height: input.height,
  })
  if (!output.ok) return { ok: false, message: output.message, step: 'output' }

  const inputConfig = buildInputConfig({
    materials: input.materials,
    scriptRows,
    guidance,
  })
  const editingConfig = buildDefaultEditingConfig()
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
