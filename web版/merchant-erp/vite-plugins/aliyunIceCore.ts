/**
 * 阿里云智能媒体服务 ICE（2020-11-09）云剪辑。
 * @see https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-overview
 */
import IceModule, {
  GetMediaInfoRequest,
  GetMediaProducingJobRequest,
  SubmitMediaProducingJobRequest,
  UploadMediaByURLRequest,
} from '@alicloud/ice20201109'
import { $OpenApiUtil } from '@alicloud/openapi-core'

type IceClientClass = {
  new (config: $OpenApiUtil.Config): {
    uploadMediaByURL(req: UploadMediaByURLRequest): Promise<{ body?: Record<string, unknown> }>
    getMediaInfo(req: GetMediaInfoRequest): Promise<{ body?: Record<string, unknown> }>
    submitMediaProducingJob(req: SubmitMediaProducingJobRequest): Promise<{ body?: Record<string, unknown> }>
    getMediaProducingJob(req: GetMediaProducingJobRequest): Promise<{ body?: Record<string, unknown> }>
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

export type AliyunIceConfig = {
  appId: string
  accessKeyId: string
  accessKeySecret: string
  regionId: string
  /** 输出到点播 VOD 时的 StorageLocation（无 OSS 输出前缀时必填） */
  vodStorageLocation?: string
  /** 输出到 OSS 时 MediaURL 前缀，如 https://bucket.oss-cn-shanghai.aliyuncs.com/meoo-out/clip */
  outputOssUrlPrefix?: string
}

function createClient(cfg: AliyunIceConfig): InstanceType<typeof IceClient> {
  return new IceClient(
    new $OpenApiUtil.Config({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      regionId: cfg.regionId,
      endpoint: `ice.${cfg.regionId}.aliyuncs.com`,
    }),
  )
}

function bodyOf(res: { body?: Record<string, unknown> }): Record<string, unknown> | undefined {
  return res.body
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function readAliyunIceConfigFromEnv(
  env: Record<string, string | undefined>,
): Partial<AliyunIceConfig> {
  return {
    appId: (env.ALIYUN_ICE_APP_ID ?? env.ICE_APP_ID ?? '').trim() || undefined,
    accessKeyId: (
      env.ALIYUN_ICE_ACCESS_KEY_ID ??
      env.ALIBABA_CLOUD_ACCESS_KEY_ID ??
      ''
    ).trim() || undefined,
    accessKeySecret: (
      env.ALIYUN_ICE_ACCESS_KEY_SECRET ??
      env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ??
      ''
    ).trim() || undefined,
    regionId: (env.ALIYUN_ICE_REGION ?? 'cn-shanghai').trim(),
    vodStorageLocation: (env.ALIYUN_ICE_VOD_STORAGE_LOCATION ?? '').trim() || undefined,
    outputOssUrlPrefix: (env.ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX ?? '').trim() || undefined,
  }
}

export function mergeAliyunIceConfig(
  fromEnv: Partial<AliyunIceConfig>,
  reg?: {
    iceAppId?: string
    iceAccessKeyId?: string
    iceAccessKeySecret?: string
    iceRegion?: string
    iceVodStorageLocation?: string
    iceOutputOssUrlPrefix?: string
  },
): AliyunIceConfig | null {
  const appId = reg?.iceAppId?.trim() || fromEnv.appId || ''
  const accessKeyId = reg?.iceAccessKeyId?.trim() || fromEnv.accessKeyId || ''
  const accessKeySecret = reg?.iceAccessKeySecret?.trim() || fromEnv.accessKeySecret || ''
  if (!appId || !accessKeyId || !accessKeySecret) return null
  return {
    appId,
    accessKeyId,
    accessKeySecret,
    regionId: reg?.iceRegion?.trim() || fromEnv.regionId || 'cn-shanghai',
    vodStorageLocation: reg?.iceVodStorageLocation?.trim() || fromEnv.vodStorageLocation,
    outputOssUrlPrefix: reg?.iceOutputOssUrlPrefix?.trim() || fromEnv.outputOssUrlPrefix,
  }
}

export const ICE_EFFECT_PRESETS = [
  { id: 'none', label: '无附加特效' },
  { id: 'fade', label: '淡入淡出' },
] as const

function buildTimeline(mediaId: string, clipEndSec: number, effectId: string): object {
  const clip: Record<string, unknown> = {
    MediaId: mediaId,
    TimelineIn: 0,
    TimelineOut: clipEndSec,
  }
  if (effectId === 'fade') {
    clip.Effects = [{ Type: 'Fade', SubType: 'In', Duration: Math.min(1, clipEndSec * 0.15) }]
  }
  return {
    VideoTracks: [{ VideoTrackClips: [clip] }],
  }
}

function buildOutputConfig(
  cfg: AliyunIceConfig,
  width: number,
  height: number,
  jobKey: string,
):
  | { ok: true; target: string; config: Record<string, unknown> }
  | { ok: false; message: string } {
  const prefix = cfg.outputOssUrlPrefix?.replace(/\/+$/, '')
  if (prefix) {
    const mediaURL = `${prefix}/${jobKey}.mp4`
    return {
      ok: true,
      target: 'oss-object',
      config: {
        MediaURL: mediaURL,
        Width: width,
        Height: height,
        Bitrate: 2500,
      },
    }
  }
  const storage = cfg.vodStorageLocation?.trim()
  if (!storage) {
    return {
      ok: false,
      message:
        '未配置成片输出：请在运营台填写「ICE 点播存储地址」或「OSS 输出 URL 前缀」，或设置环境变量 ALIYUN_ICE_VOD_STORAGE_LOCATION / ALIYUN_ICE_OUTPUT_OSS_URL_PREFIX。',
    }
  }
  return {
    ok: true,
    target: 'vod-media',
    config: {
      StorageLocation: storage,
      FileName: `${jobKey}.mp4`,
      Width: width,
      Height: height,
      Bitrate: 2500,
      VodTemplateGroupId: 'VOD_NO_TRANSCODE',
    },
  }
}

async function uploadUrlToMediaId(
  client: InstanceType<typeof IceClient>,
  cfg: AliyunIceConfig,
  mediaUrl: string,
  title: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  const meta = JSON.stringify([{ SourceURL: mediaUrl, Title: title.slice(0, 120) }])
  try {
    const res = await client.uploadMediaByURL(
      new UploadMediaByURLRequest({
        uploadURLs: mediaUrl,
        appId: cfg.appId,
        mediaMetaData: meta,
      }),
    )
    const jobs = bodyOf(res)?.uploadJobs as { mediaId?: string }[] | undefined
    const first = jobs?.[0]
    const mediaId = first?.mediaId?.trim()
    if (!mediaId) {
      return { ok: false, message: 'URL 上传未返回 MediaId，请确认素材为公网可访问的音视频地址' }
    }
    return { ok: true, mediaId }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function waitMediaReady(
  client: InstanceType<typeof IceClient>,
  mediaId: string,
  maxTries = 20,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await client.getMediaInfo(new GetMediaInfoRequest({ mediaId }))
      const info = bodyOf(res)?.mediaInfo as Record<string, unknown> | undefined
      const basic = info?.mediaBasicInfo as Record<string, unknown> | undefined
      const status = String(info?.status ?? basic?.status ?? '').toLowerCase()
      if (!status || status.includes('normal') || status.includes('success') || status.includes('ready')) {
        return { ok: true }
      }
      if (status.includes('fail')) {
        return { ok: false, message: `媒资注册失败：${status}` }
      }
    } catch {
      /* 上传初期可能尚未可查，继续等待 */
    }
    await sleep(2500)
  }
  return { ok: true }
}

/** 单条素材：URL 拉取上传 → 剪辑合成 */
export async function iceRunSinglePipeline(
  cfg: AliyunIceConfig,
  input: {
    mediaUrl: string
    projectName: string
    editBrief: string
    width: number
    height: number
    clipEndSec: number
    effectId: string
  },
): Promise<
  | { ok: true; jobId: string; mediaId?: string }
  | { ok: false; message: string; step?: string }
> {
  const client = createClient(cfg)
  const jobKey = `meoo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const up = await uploadUrlToMediaId(client, cfg, input.mediaUrl, input.projectName)
  if (!up.ok) return { ok: false, message: up.message, step: 'upload_media' }

  const ready = await waitMediaReady(client, up.mediaId)
  if (!ready.ok) return { ok: false, message: ready.message, step: 'wait_media' }

  const out = buildOutputConfig(cfg, input.width, input.height, jobKey)
  if (!out.ok) {
    return { ok: false, message: out.message, step: 'output_config' }
  }

  const timeline = buildTimeline(up.mediaId, input.clipEndSec, input.effectId)
  try {
    const res = await client.submitMediaProducingJob(
      new SubmitMediaProducingJobRequest({
        timeline: JSON.stringify(timeline),
        outputMediaTarget: out.target,
        outputMediaConfig: JSON.stringify(out.config),
        projectMetadata: JSON.stringify({
          Title: input.projectName.slice(0, 120),
          Description: input.editBrief.slice(0, 500) || '墨典AI云剪',
        }),
        editingProduceConfig: JSON.stringify({ AutoRegisterInputVodMedia: 'true' }),
        source: 'OPENAPI',
        clientToken: jobKey,
      }),
    )
    const submitBody = bodyOf(res)
    const jobId = typeof submitBody?.jobId === 'string' ? submitBody.jobId.trim() : ''
    if (!jobId) return { ok: false, message: '未返回剪辑 JobId', step: 'submit_job' }
    const mediaId =
      typeof submitBody?.mediaId === 'string' ? submitBody.mediaId : undefined
    return { ok: true, jobId, mediaId }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      step: 'submit_job',
    }
  }
}

export async function iceGetProducingJob(
  cfg: AliyunIceConfig,
  jobId: string,
): Promise<
  | {
      ok: true
      status: string
      done: boolean
      failed: boolean
      downloadUrl?: string
      progress?: number
      message?: string
    }
  | { ok: false; message: string }
> {
  const client = createClient(cfg)
  try {
    const res = await client.getMediaProducingJob(new GetMediaProducingJobRequest({ jobId }))
    const job = bodyOf(res)?.mediaProducingJob as Record<string, unknown> | undefined
    if (!job) return { ok: false, message: '未找到剪辑任务' }
    const status = String(job.status ?? '')
    const st = status.toLowerCase()
    const done = st === 'success'
    const failed = st === 'failed'
    const downloadUrl =
      typeof job.mediaURL === 'string' ? job.mediaURL.trim() || undefined : undefined
    return {
      ok: true,
      status,
      done,
      failed,
      downloadUrl,
      progress: typeof job.progress === 'number' ? job.progress : undefined,
      message: typeof job.message === 'string' ? job.message : undefined,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
