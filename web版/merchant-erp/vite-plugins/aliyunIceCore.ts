/**
 * 阿里云智能媒体服务 ICE（2020-11-09）云剪辑。
 * @see https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-overview
 */
import IceModule, {
  GetMediaInfoRequest,
  GetMediaProducingJobRequest,
  RegisterMediaInfoRequest,
  SubmitMediaProducingJobRequest,
  UploadMediaByURLRequest,
} from '@alicloud/ice20201109'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import {
  buildSubtitleTracksFromPlan,
  parseIceEditBriefPlan,
  type IceBriefTimelinePlan,
} from './iceBriefTimelinePlan.js'

type IceClientClass = {
  new (config: $OpenApiUtil.Config): {
    uploadMediaByURL(req: UploadMediaByURLRequest): Promise<{ body?: Record<string, unknown> }>
    registerMediaInfo(req: RegisterMediaInfoRequest): Promise<{ body?: Record<string, unknown> }>
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

const ICE_DEFAULT_CONNECT_TIMEOUT_MS = 30_000
const ICE_DEFAULT_READ_TIMEOUT_MS = 90_000

function iceSdkTimeouts(env?: Record<string, string | undefined>): {
  connectTimeout: number
  readTimeout: number
} {
  const connect = Number(env?.ALIYUN_ICE_CONNECT_TIMEOUT_MS ?? env?.ICE_CONNECT_TIMEOUT_MS)
  const read = Number(env?.ALIYUN_ICE_READ_TIMEOUT_MS ?? env?.ICE_READ_TIMEOUT_MS)
  return {
    connectTimeout:
      Number.isFinite(connect) && connect >= 5_000 ? Math.min(connect, 120_000) : ICE_DEFAULT_CONNECT_TIMEOUT_MS,
    readTimeout:
      Number.isFinite(read) && read >= 10_000 ? Math.min(read, 300_000) : ICE_DEFAULT_READ_TIMEOUT_MS,
  }
}

function createClient(
  cfg: AliyunIceConfig,
  env?: Record<string, string | undefined>,
): InstanceType<typeof IceClient> {
  const { connectTimeout, readTimeout } = iceSdkTimeouts(env)
  return new IceClient(
    new $OpenApiUtil.Config({
      accessKeyId: cfg.accessKeyId,
      accessKeySecret: cfg.accessKeySecret,
      regionId: cfg.regionId,
      endpoint: `ice.${cfg.regionId}.aliyuncs.com`,
      connectTimeout,
      readTimeout,
    }),
  )
}

export function isIceTransientNetworkError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('connecttimeout') ||
    m.includes('connection timeout') ||
    m.includes('etimedout') ||
    m.includes('econnreset') ||
    m.includes('socket hang up') ||
    m.includes('network error') ||
    m.includes('fetch failed')
  )
}

function formatIceClientError(e: unknown, cfg: AliyunIceConfig): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (isIceTransientNetworkError(raw)) {
    return (
      `${raw}。查询 ICE（${cfg.regionId}）网络超时：请稍后点「继续查询」；` +
      `若部署在 Vercel 海外区域，建议在 Project → Functions → Region 选香港(hkg1)或新加坡(sin1)，或将 API 迁至国内服务器。`
    )
  }
  return raw
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
  /** 运营台 videoAi 优先（与 vendorKeys 一致，避免 Vercel 空 env 盖住注册表） */
  const appId = (reg?.iceAppId?.trim() || fromEnv.appId || '').trim()
  const accessKeyId = (reg?.iceAccessKeyId?.trim() || fromEnv.accessKeyId || '').trim()
  const accessKeySecret = (reg?.iceAccessKeySecret?.trim() || fromEnv.accessKeySecret || '').trim()
  if (!appId || !accessKeyId || !accessKeySecret) return null
  const vod = reg?.iceVodStorageLocation?.trim() || fromEnv.vodStorageLocation
  const oss = reg?.iceOutputOssUrlPrefix?.trim() || fromEnv.outputOssUrlPrefix
  return {
    appId,
    accessKeyId,
    accessKeySecret,
    regionId: reg?.iceRegion?.trim() || fromEnv.regionId || 'cn-shanghai',
    vodStorageLocation: vod,
    outputOssUrlPrefix: oss,
  }
}

export const ICE_EFFECT_PRESETS = [
  { id: 'none', label: '无附加特效' },
  { id: 'fade', label: '淡入淡出' },
] as const

function appendClipEffects(
  effects: Record<string, unknown>[],
  plan: IceBriefTimelinePlan,
  dur: number,
  index: number,
  total: number,
): void {
  if (plan.useFade) {
    effects.push({ Type: 'Fade', SubType: 'In', Duration: Math.min(0.8, dur * 0.2) })
    if (index === total - 1) {
      effects.push({ Type: 'Fade', SubType: 'Out', Duration: Math.min(0.8, dur * 0.2) })
    }
  }
  if (plan.useTransition && index > 0) {
    effects.push({ Type: 'Transition', SubType: 'fade', Duration: Math.min(0.45, dur * 0.15) })
  }
}

function buildTimeline(mediaId: string, plan: IceBriefTimelinePlan): object {
  const clipEndSec = Math.max(1, plan.clipEndSec)
  const clip: Record<string, unknown> = {
    MediaId: mediaId,
    TimelineIn: 0,
    TimelineOut: clipEndSec,
  }
  const effects: Record<string, unknown>[] = []
  appendClipEffects(effects, plan, clipEndSec, 0, 1)
  if (plan.fastPace) {
    effects.push({
      Type: 'Clip',
      SubType: 'RandomClip',
      ClipDuration: Math.min(clipEndSec, Math.max(2, clipEndSec * 0.85)),
    })
  }
  if (effects.length) clip.Effects = effects
  return {
    VideoTracks: [{ VideoTrackClips: [clip] }],
    ...buildSubtitleTracksFromPlan(plan),
  }
}

/** 多图轮播时间线：按文案解析的每张停留时长拼接，并叠加字幕轨 */
function buildTimelineFromImages(
  mediaIds: string[],
  plan: IceBriefTimelinePlan,
  width: number,
  height: number,
): object {
  let cursor = 0
  const clips: Record<string, unknown>[] = []
  const durations =
    plan.imageDurations.length === mediaIds.length
      ? plan.imageDurations
      : Array.from({ length: mediaIds.length }, () =>
          Math.max(0.5, plan.totalDurationSec / mediaIds.length),
        )

  for (let i = 0; i < mediaIds.length; i++) {
    const dur = Math.max(0.5, durations[i] ?? 1)
    const clip: Record<string, unknown> = {
      Type: 'Image',
      MediaId: mediaIds[i],
      TimelineIn: cursor,
      TimelineOut: cursor + dur,
      Width: width,
      Height: height,
    }
    const effects: Record<string, unknown>[] = []
    appendClipEffects(effects, plan, dur, i, mediaIds.length)
    if (effects.length) clip.Effects = effects
    clips.push(clip)
    cursor += dur
  }

  return {
    VideoTracks: [{ VideoTrackClips: clips }],
    ...buildSubtitleTracksFromPlan(plan),
  }
}

/** UploadMediaByURL 必填：目标为 ICE/VOD 点播库，非商户自研 OSS Bucket */
export function buildIceUploadTargetConfig(
  cfg: AliyunIceConfig,
): { ok: true; value: string } | { ok: false; message: string } {
  const raw = cfg.vodStorageLocation?.trim() ?? ''
  if (!raw) {
    return {
      ok: false,
      message:
        '缺少 ICE 点播存储地址：请在运营台「AI模型 → 短视频 API → 灵祺AI云剪」填写 StorageLocation（如 outin-***.oss-cn-shanghai.aliyuncs.com）。粘贴 HTTPS 链接或本地上传后提交云剪均需此项；仅填 OSS 成片前缀不够。',
    }
  }
  let storageLocation = raw
  if (raw.includes('://')) {
    try {
      storageLocation = new URL(raw).hostname
    } catch {
      return { ok: false, message: '点播存储地址格式无效' }
    }
  } else {
    storageLocation = raw.split('/')[0]?.trim() ?? raw
  }
  if (!/\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(storageLocation)) {
    return {
      ok: false,
      message:
        '点播存储地址须为 ICE 控制台中的 VOD StorageLocation（如 outin-***.oss-cn-shanghai.aliyuncs.com），不能填商户 Bucket 的 oss 域名。',
    }
  }
  return {
    ok: true,
    value: JSON.stringify({ StorageType: 'oss', StorageLocation: storageLocation }),
  }
}

const ICE_UPLOAD_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'm4v',
  'avi',
  'mkv',
  'webm',
  'flv',
  'mpeg',
  'mpg',
  '3gp',
  'mp3',
  'm4a',
  'wav',
  'aac',
  'flac',
  'ogg',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'heic',
])

/** ICE UploadMetadata.FileExtension：小写、无点；URL 无后缀时默认 mp4 */
export function parseIceFileExtensionFromUrl(mediaUrl: string): string {
  let pathPart = mediaUrl.trim()
  try {
    pathPart = new URL(mediaUrl).pathname
  } catch {
    pathPart = mediaUrl.split('?')[0]?.split('#')[0] ?? mediaUrl
  }
  const file = pathPart.split('/').filter(Boolean).pop() ?? ''
  const dot = file.lastIndexOf('.')
  if (dot > 0 && dot < file.length - 1) {
    const raw = file.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (raw.length >= 2 && raw.length <= 8 && ICE_UPLOAD_EXTENSIONS.has(raw)) return raw
  }
  return 'mp4'
}

function buildIceUploadMetadata(mediaUrl: string, title: string): string {
  const ext = parseIceFileExtensionFromUrl(mediaUrl)
  return JSON.stringify([
    {
      SourceURL: mediaUrl,
      Title: title.slice(0, 120),
      FileExtension: ext,
    },
  ])
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

/** 图片须走 RegisterMediaInfo；UploadMediaByURL 仅支持音视频 */
async function registerImageUrlToMediaId(
  client: InstanceType<typeof IceClient>,
  imageUrl: string,
  title: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  try {
    const res = await client.registerMediaInfo(
      new RegisterMediaInfoRequest({
        inputURL: imageUrl,
        mediaType: 'image',
        title: title.slice(0, 120),
        overwrite: true,
        registerConfig: JSON.stringify({ NeedSprite: 'false', NeedSnapshot: 'false' }),
      }),
    )
    const body = bodyOf(res)
    const mediaId = typeof body?.mediaId === 'string' ? body.mediaId.trim() : ''
    if (!mediaId) {
      return {
        ok: false,
        message: '图片媒资注册未返回 MediaId，请确认 OSS 地址可被 ICE 访问（与运营台配置的 Bucket 一致）',
      }
    }
    return { ok: true, mediaId }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

async function uploadUrlToMediaId(
  client: InstanceType<typeof IceClient>,
  cfg: AliyunIceConfig,
  mediaUrl: string,
  title: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  const target = buildIceUploadTargetConfig(cfg)
  if (!target.ok) return { ok: false, message: target.message }

  const meta = buildIceUploadMetadata(mediaUrl, title)
  try {
    const res = await client.uploadMediaByURL(
      new UploadMediaByURLRequest({
        uploadURLs: mediaUrl,
        appId: cfg.appId,
        mediaMetaData: meta,
        uploadTargetConfig: target.value,
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

const ICE_MAX_IMAGES_PER_JOB = 30

/** 多图素材：逐张注册媒资 → 拼接时间线 → 合成一条 MP4 */
export async function iceRunImagesPipeline(
  cfg: AliyunIceConfig,
  input: {
    imageUrls: string[]
    projectName: string
    editBrief: string
    width: number
    height: number
    /** 多图合成时的成片总时长（秒），非单张停留时长 */
    totalDurationSec: number
    effectId: string
  },
): Promise<
  | { ok: true; jobId: string; mediaId?: string }
  | { ok: false; message: string; step?: string }
> {
  const urls = input.imageUrls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))
  if (urls.length === 0) {
    return { ok: false, message: '请提供至少一张公网可访问的图片 URL', step: 'validate' }
  }
  if (urls.length > ICE_MAX_IMAGES_PER_JOB) {
    return {
      ok: false,
      message: `单次最多合成 ${ICE_MAX_IMAGES_PER_JOB} 张图片`,
      step: 'validate',
    }
  }

  const client = createClient(cfg)
  const jobKey = `meoo-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const mediaIds: string[] = []

  for (let i = 0; i < urls.length; i++) {
    const title = `${input.projectName}-图${i + 1}`.slice(0, 120)
    const up = await registerImageUrlToMediaId(client, urls[i]!, title)
    if (!up.ok) {
      return { ok: false, message: `第 ${i + 1} 张图片上传失败：${up.message}`, step: 'upload_media' }
    }
    const ready = await waitMediaReady(client, up.mediaId, 12)
    if (!ready.ok) {
      return { ok: false, message: `第 ${i + 1} 张图片媒资未就绪：${ready.message}`, step: 'wait_media' }
    }
    mediaIds.push(up.mediaId)
  }

  const out = buildOutputConfig(cfg, input.width, input.height, jobKey)
  if (!out.ok) {
    return { ok: false, message: out.message, step: 'output_config' }
  }

  const plan = parseIceEditBriefPlan(input.editBrief, {
    clipEndSec: input.totalDurationSec,
    imageCount: urls.length,
    effectId: input.effectId,
  })
  const timeline = buildTimelineFromImages(mediaIds, plan, input.width, input.height)
  try {
    const res = await client.submitMediaProducingJob(
      new SubmitMediaProducingJobRequest({
        timeline: JSON.stringify(timeline),
        outputMediaTarget: out.target,
        outputMediaConfig: JSON.stringify(out.config),
        projectMetadata: JSON.stringify({
          Title: input.projectName.slice(0, 120),
          Description:
            (input.editBrief.slice(0, 400) || '灵祺AI云剪') +
            `；多图 ${urls.length} 张；已应用时间线：${plan.summary}`,
        }),
        editingProduceConfig: JSON.stringify({ AutoRegisterInputVodMedia: 'true' }),
        source: 'OPENAPI',
        clientToken: jobKey,
      }),
    )
    const submitBody = bodyOf(res)
    const jobId = typeof submitBody?.jobId === 'string' ? submitBody.jobId.trim() : ''
    if (!jobId) return { ok: false, message: '未返回剪辑 JobId', step: 'submit_job' }
    const mediaId = typeof submitBody?.mediaId === 'string' ? submitBody.mediaId : undefined
    return { ok: true, jobId, mediaId }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
      step: 'submit_job',
    }
  }
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

  const plan = parseIceEditBriefPlan(input.editBrief, {
    clipEndSec: input.clipEndSec,
    imageCount: 1,
    effectId: input.effectId,
  })
  const timeline = buildTimeline(up.mediaId, plan)
  try {
    const res = await client.submitMediaProducingJob(
      new SubmitMediaProducingJobRequest({
        timeline: JSON.stringify(timeline),
        outputMediaTarget: out.target,
        outputMediaConfig: JSON.stringify(out.config),
        projectMetadata: JSON.stringify({
          Title: input.projectName.slice(0, 120),
          Description:
            (input.editBrief.slice(0, 400) || '灵祺AI云剪') + `；已应用时间线：${plan.summary}`,
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

function readIceJobString(job: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = job[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

async function iceFileUrlFromMediaInfo(
  client: InstanceType<typeof IceClient>,
  mediaId: string,
): Promise<string | undefined> {
  try {
    const res = await client.getMediaInfo(
      new GetMediaInfoRequest({ mediaId, outputType: 'oss' }),
    )
    const info = bodyOf(res)?.mediaInfo as Record<string, unknown> | undefined
    if (!info) return undefined
    const basic = (info.mediaBasicInfo ?? info.MediaBasicInfo) as Record<string, unknown> | undefined
    const fromBasic = readIceJobString(basic ?? {}, 'inputURL', 'InputURL')
    if (fromBasic && /^https?:\/\//i.test(fromBasic)) return fromBasic

    const list = (info.fileInfoList ?? info.FileInfoList) as unknown
    if (!Array.isArray(list)) return undefined
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const fb = (row.fileBasicInfo ?? row.FileBasicInfo) as Record<string, unknown> | undefined
      const fileUrl = readIceJobString(fb ?? row, 'fileUrl', 'FileUrl')
      if (fileUrl && /^https?:\/\//i.test(fileUrl)) return fileUrl
    }
    return undefined
  } catch {
    return undefined
  }
}

/** 解析成片可下载地址（兼容 PascalCase 字段、OutputMediaConfig、OSS 前缀回退、MediaId） */
export async function iceResolveJobDownloadUrl(
  client: InstanceType<typeof IceClient>,
  cfg: AliyunIceConfig,
  job: Record<string, unknown>,
): Promise<string | undefined> {
  let url = readIceJobString(job, 'mediaURL', 'MediaURL', 'mediaUrl', 'MediaUrl')
  if (!url) {
    const configRaw = readIceJobString(job, 'outputMediaConfig', 'OutputMediaConfig')
    if (configRaw) {
      try {
        const o = JSON.parse(configRaw) as Record<string, unknown>
        url = readIceJobString(o, 'MediaURL', 'mediaURL', 'mediaUrl')
      } catch {
        /* ignore */
      }
    }
  }
  if (!url) {
    const prefix = cfg.outputOssUrlPrefix?.replace(/\/+$/, '')
    const token = readIceJobString(job, 'clientToken', 'ClientToken')
    if (prefix && token) url = `${prefix}/${token}.mp4`
  }
  if (!url) {
    const mediaId = readIceJobString(job, 'mediaId', 'MediaId')
    if (mediaId) url = await iceFileUrlFromMediaInfo(client, mediaId)
  }
  return url
}

export async function iceGetProducingJob(
  cfg: AliyunIceConfig,
  jobId: string,
  env?: Record<string, string | undefined>,
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
  | { ok: false; message: string; transient?: boolean }
> {
  const client = createClient(cfg, env)
  const maxAttempts = 5
  let lastMsg = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await client.getMediaProducingJob(new GetMediaProducingJobRequest({ jobId }))
      const job = bodyOf(res)?.mediaProducingJob as Record<string, unknown> | undefined
      if (!job) return { ok: false, message: '未找到剪辑任务' }
      const status = String(job.status ?? job.Status ?? '')
      const st = status.toLowerCase()
      const done = st === 'success'
      const failed = st === 'failed'
      const downloadUrl = done ? await iceResolveJobDownloadUrl(client, cfg, job) : undefined
      return {
        ok: true,
        status,
        done,
        failed,
        downloadUrl,
        progress:
          typeof job.progress === 'number'
            ? job.progress
            : typeof job.Progress === 'number'
              ? job.Progress
              : undefined,
        message: readIceJobString(job, 'message', 'Message'),
      }
    } catch (e) {
      lastMsg = formatIceClientError(e, cfg)
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
  return { ok: false, message: lastMsg || '查询剪辑任务失败', transient: true }
}
