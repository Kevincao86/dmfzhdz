/**
 * 阿里云智能媒体服务 ICE（2020-11-09）云剪辑。
 * @see https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-overview
 */
import IceModule, {
  GetMediaInfoRequest,
  GetMediaProducingJobRequest,
  ListMediaBasicInfosRequest,
  RegisterMediaInfoRequest,
  SubmitMediaProducingJobRequest,
  UploadMediaByURLRequest,
} from '@alicloud/ice20201109'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import {
  buildAudioTracksFromPlan,
  buildSubtitleTracksFromPlan,
  enhanceIceMixBriefPlan,
  parseIceEditBriefPlan,
  type IceBriefTimelinePlan,
} from './iceBriefTimelinePlan.js'
import { sanitizeIceBriefAudioPlan } from './iceStockAudio.js'
import { isIceTransientNetworkError } from '../src/lib/iceTransientNetworkError.js'
import { clampMixSourceInSec } from '../src/lib/iceMixPlan.js'

export { isIceTransientNetworkError }
import { ensureIceHttpsUrl, isIceCleanOssTimelineUrl, isIceVodOutinBucket, toIceTimelineOssUrl, validateIcePipelineImageUrl, sanitizeIcePipelineMediaUrl } from './aliyunOssIceParse.js'

export { ICE_EFFECT_PRESETS } from './iceEffectPresets.js'

type IceClientClass = {
  new (config: $OpenApiUtil.Config): {
    uploadMediaByURL(req: UploadMediaByURLRequest): Promise<{ body?: Record<string, unknown> }>
    registerMediaInfo(req: RegisterMediaInfoRequest): Promise<{ body?: Record<string, unknown> }>
    getMediaInfo(req: GetMediaInfoRequest): Promise<{ body?: Record<string, unknown> }>
    submitMediaProducingJob(req: SubmitMediaProducingJobRequest): Promise<{ body?: Record<string, unknown> }>
    getMediaProducingJob(req: GetMediaProducingJobRequest): Promise<{ body?: Record<string, unknown> }>
    listMediaBasicInfos(req: ListMediaBasicInfosRequest): Promise<{ body?: Record<string, unknown> }>
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

function appendClipEffects(
  effects: Record<string, unknown>[],
  plan: IceBriefTimelinePlan,
  dur: number,
  index: number,
  total: number,
): void {
  if (plan.fadeClip) {
    effects.push({ Type: 'Fade', SubType: 'In', Duration: Math.min(0.8, dur * 0.2) })
    if (index === total - 1) {
      effects.push({ Type: 'Fade', SubType: 'Out', Duration: Math.min(0.8, dur * 0.2) })
    }
  }
  const transSub = plan.transitionSubType?.trim()
  if (transSub && index > 0) {
    effects.push({
      Type: 'DLTransition',
      SubType: transSub,
      Duration: Math.min(0.55, Math.max(0.28, dur * 0.1)),
    })
  }
}

function buildTimeline(mediaId: string, plan: IceBriefTimelinePlan, maxSourceSec?: number): object {
  /** 成片总长以 UI「取用/生成时长」为准；不超过 ICE 解析到的源片时长 */
  const requested = Math.max(1, plan.totalDurationSec || plan.clipEndSec)
  const clipEndSec =
    maxSourceSec && maxSourceSec > 0 ? Math.min(requested, maxSourceSec) : requested
  const clip: Record<string, unknown> = {
    MediaId: mediaId,
    In: 0,
    Out: clipEndSec,
    Duration: clipEndSec,
    TimelineIn: 0,
    TimelineOut: clipEndSec,
  }
  const effects: Record<string, unknown>[] = []
  appendClipEffects(effects, plan, clipEndSec, 0, 1)
  /** 不在单视频轨使用 RandomClip：会忽略 TimelineOut，成片常被压到 ~2s */
  if (effects.length) clip.Effects = effects
  return {
    VideoTracks: [{ VideoTrackClips: [clip] }],
    ...buildSubtitleTracksFromPlan(plan),
    ...buildAudioTracksFromPlan(plan),
  }
}

/** 多图轮播：公网 Bucket 用 MediaURL；私有 Bucket 用 RegisterMediaInfo 后的 MediaId */
export function buildTimelineFromImages(
  imageSources: string[],
  plan: IceBriefTimelinePlan,
  width: number,
  height: number,
  mode: 'url' | 'mediaId' = 'url',
): object {
  let cursor = 0
  const clips: Record<string, unknown>[] = []
  const durations =
    plan.imageDurations.length === imageSources.length
      ? plan.imageDurations
      : Array.from({ length: imageSources.length }, () =>
          Math.max(0.5, plan.totalDurationSec / imageSources.length),
        )

  for (let i = 0; i < imageSources.length; i++) {
    const dur = Math.max(0.5, durations[i] ?? 1)
    const ref =
      mode === 'mediaId'
        ? { MediaId: imageSources[i]!.trim() }
        : { MediaURL: toIceTimelineOssUrl(imageSources[i]!) }
    const clip: Record<string, unknown> = {
      Type: 'Image',
      ...ref,
      In: 0,
      Out: dur,
      TimelineIn: cursor,
      TimelineOut: cursor + dur,
      Duration: dur,
      Width: width,
      Height: height,
    }
    const effects: Record<string, unknown>[] = []
    appendClipEffects(effects, plan, dur, i, imageSources.length)
    if (effects.length) clip.Effects = effects
    clips.push(clip)
    cursor += dur
  }

  return {
    VideoTracks: [{ VideoTrackClips: clips }],
    ...buildSubtitleTracksFromPlan(plan),
    ...buildAudioTracksFromPlan(plan),
  }
}

export type IceMixResolvedClip = {
  kind: 'video' | 'image'
  mediaId: string
  /** 无签名 OSS 直链；多段混剪优先 MediaURL，避免 MediaId 入库异常 */
  mediaUrl?: string
  timelineStartSec: number
  timelineEndSec: number
  sourceDurationSec?: number
  /** 源素材内截取起点 */
  sourceInSec?: number
}

/** 多素材混剪：视频轨按分镜时间段拼接；混剪默认去掉原声，仅保留 TTS 口播轨 */
export function buildTimelineFromMixClips(
  resolved: IceMixResolvedClip[],
  plan: IceBriefTimelinePlan,
  width: number,
  height: number,
  opts?: { forceMuteSource?: boolean },
): object {
  const muteSource = opts?.forceMuteSource ?? Boolean(plan.narrationClip || plan.mixAiTtsClip)
  const clips: Record<string, unknown>[] = []
  for (let i = 0; i < resolved.length; i++) {
    const seg = resolved[i]!
    const dur = Math.max(0.35, seg.timelineEndSec - seg.timelineStartSec)
    const ref =
      seg.kind === 'video' && seg.mediaUrl && isIceCleanOssTimelineUrl(seg.mediaUrl)
        ? { MediaURL: seg.mediaUrl.trim() }
        : { MediaId: seg.mediaId.trim() }
    if (seg.kind === 'image') {
      const clip: Record<string, unknown> = {
        Type: 'Image',
        MediaId: seg.mediaId.trim(),
        In: 0,
        Out: dur,
        Duration: dur,
        TimelineIn: seg.timelineStartSec,
        TimelineOut: seg.timelineEndSec,
        Width: width,
        Height: height,
      }
      const effects: Record<string, unknown>[] = []
      if (muteSource) effects.push({ Type: 'Volume', Gain: 0 })
      appendClipEffects(effects, plan, dur, i, resolved.length)
      if (effects.length) clip.Effects = effects
      clips.push(clip)
      continue
    }
    let sourceIn = Math.max(0, seg.sourceInSec ?? 0)
    const srcDur = seg.sourceDurationSec
    const minNeed = Math.max(0.35, dur)
    if (srcDur != null && srcDur > 0) {
      const maxIn = Math.max(0, srcDur - minNeed)
      sourceIn = Math.min(sourceIn, maxIn)
    }
    const avail = srcDur != null && srcDur > sourceIn ? srcDur - sourceIn : dur
    const maxOut = Math.max(0.35, Math.min(dur, avail))
    let outPoint = sourceIn + maxOut
    if (srcDur != null && srcDur > 0 && outPoint > srcDur) {
      outPoint = srcDur
      sourceIn = Math.max(0, outPoint - maxOut)
    }
    const clip: Record<string, unknown> = {
      Type: 'Video',
      ...ref,
      In: sourceIn,
      Out: outPoint,
      Duration: maxOut,
      TimelineIn: seg.timelineStartSec,
      TimelineOut: seg.timelineEndSec,
    }
    const effects: Record<string, unknown>[] = []
    if (muteSource) effects.push({ Type: 'Volume', Gain: 0 })
    appendClipEffects(effects, plan, maxOut, i, resolved.length)
    if (effects.length) clip.Effects = effects
    clips.push(clip)
  }
  return {
    VideoTracks: [{ VideoTrackClips: clips }],
    ...buildSubtitleTracksFromPlan(plan),
    ...buildAudioTracksFromPlan(plan),
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
    const mediaURL = ensureIceHttpsUrl(`${prefix}/${jobKey}.mp4`)
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

/** 本地上传返回带签名的 HTTPS；RegisterMediaInfo 对同账号 OSS 用 oss:// 更稳定 */
function normalizeIceRegisterInputUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim()
  if (trimmed.startsWith('oss://')) return trimmed
  try {
    const url = new URL(trimmed)
    const m = url.hostname.match(/^([^.]+)\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
    if (m?.[1]) {
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      if (key) return `oss://${m[1]}/${key}`
    }
  } catch {
    /* 保留原 URL */
  }
  return trimmed
}

function formatIceRegisterMediaError(raw: string): string {
  if (/403|forbidden|not authorized|无权|拒绝访问/i.test(raw)) {
    return (
      `${raw}。请在阿里云 RAM 为 ICE 所用 AccessKey 用户（如 modian）附加 AliyunICEFullAccess（至少含 ice:RegisterMediaInfo），` +
      `并在智能媒体服务控制台将运营台配置的 OSS Bucket 加入媒资库；` +
      `同时确认运营台已填写 StorageLocation（outin-***.oss-cn-shanghai.aliyuncs.com）。`
    )
  }
  return raw
}

/** IMS 点播 StorageLocation 主机名，写入 RegisterMediaInfo.registerConfig */
function normalizeIceStorageLocationHost(raw: string | undefined): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).hostname.trim()
    } catch {
      return ''
    }
  }
  return (trimmed.split('/')[0] ?? trimmed).trim()
}

/** 从 oss:// 或 HTTPS 地址解析 Bucket 名 */
function iceUrlBucketName(url: string): string | undefined {
  const trimmed = url.trim()
  if (trimmed.startsWith('oss://')) {
    const rest = trimmed.slice(6)
    const slash = rest.indexOf('/')
    if (slash > 0) return rest.slice(0, slash).trim() || undefined
    return rest.trim() || undefined
  }
  try {
    const host = new URL(trimmed).hostname
    const m = host.match(/^([^.]+)\.oss-[a-z0-9-]+\.aliyuncs\.com$/i)
    return m?.[1]
  } catch {
    return undefined
  }
}

/** 自建 OSS 素材：StorageLocation 须与 IMS 已绑定 Bucket 域名一致（勿填 outin 当素材在商户 Bucket） */
function buildIceRegisterConfig(cfg: AliyunIceConfig, inputURL?: string): string {
  const registerConfig: Record<string, string> = {
    NeedSprite: 'false',
    NeedSnapshot: 'false',
  }
  const bucket = inputURL ? iceUrlBucketName(inputURL) : undefined
  const iceRegion = cfg.regionId.replace(/^oss-/, '')

  if (bucket && !isIceVodOutinBucket(bucket)) {
    let host = `${bucket}.oss-${iceRegion}.aliyuncs.com`
    if (inputURL && /^https?:\/\//i.test(inputURL)) {
      try {
        host = new URL(inputURL).hostname
      } catch {
        /* use default host */
      }
    }
    registerConfig.StorageLocation = host
  } else {
    const storage = normalizeIceStorageLocationHost(cfg.vodStorageLocation)
    if (storage) registerConfig.StorageLocation = storage
  }
  return JSON.stringify(registerConfig)
}

function formatIceProduceError(raw: string): string {
  if (/InputFile is bad|inputfile is bad/i.test(raw)) {
    return (
      `${raw}。常见原因：① 素材 Bucket 须与 ICE 同区域且已在 IMS 媒资库绑定；` +
      `② 时间线须使用无签名 OSS 直链（本地上传后由系统生成），勿粘贴带 ?Signature= 的地址；` +
      `③ 请删除旧图后重新本地上传再试。`
    )
  }
  if (/clips url not found|specified clips url not found/i.test(raw)) {
    return (
      `${raw}。常见原因：时间线引用的 BGM/音效 OSS 地址不存在或不可读；` +
      `请重新提交云剪（系统已改用 IMS 公网示例音轨），或删除指令框中的 BGM/音效描述后仅保留字幕再试。`
    )
  }
  return raw
}

/** 轻量探活：区分 RAM 未授权与其它配置问题 */
export async function probeIceRamAccess(
  cfg: AliyunIceConfig,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const client = createClient(cfg)
    await client.listMediaBasicInfos(new ListMediaBasicInfosRequest({ maxResults: 1 }))
    return { ok: true }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    if (/403|forbidden|not authorized|无权|拒绝访问/i.test(raw)) {
      return { ok: false, message: formatIceRegisterMediaError(raw) }
    }
    return { ok: true }
  }
}

/** 图片 / 视频：OSS 或 HTTPS 素材注册到 IMS（比 UploadMediaByURL 更稳，支持私有 Bucket） */
async function registerMediaUrlToMediaId(
  client: InstanceType<typeof IceClient>,
  cfg: AliyunIceConfig,
  mediaUrl: string,
  title: string,
  mediaType: 'image' | 'video' | 'audio',
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  const inputURL = normalizeIceRegisterInputUrl(mediaUrl)
  try {
    const res = await client.registerMediaInfo(
      new RegisterMediaInfoRequest({
        inputURL,
        mediaType,
        businessType: 'general',
        title: title.slice(0, 120),
        overwrite: true,
        registerConfig: buildIceRegisterConfig(cfg, inputURL),
      }),
    )
    const body = bodyOf(res)
    const mediaId = typeof body?.mediaId === 'string' ? body.mediaId.trim() : ''
    if (!mediaId) {
      return {
        ok: false,
        message:
          mediaType === 'video'
            ? '视频媒资注册未返回 MediaId，请确认 OSS 已在 IMS 媒资库绑定且 RAM 含 ice:RegisterMediaInfo'
            : '图片媒资注册未返回 MediaId，请确认 OSS 地址可被 ICE 访问（与运营台配置的 Bucket 一致）',
      }
    }
    return { ok: true, mediaId }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    return { ok: false, message: formatIceRegisterMediaError(raw) }
  }
}

/** @deprecated 使用 registerMediaUrlToMediaId */
async function registerImageUrlToMediaId(
  client: InstanceType<typeof IceClient>,
  cfg: AliyunIceConfig,
  imageUrl: string,
  title: string,
  signedMediaUrl?: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; message: string }> {
  const pipelineUrl = sanitizeIcePipelineMediaUrl(imageUrl, signedMediaUrl)
  const reg = await registerMediaUrlToMediaId(client, cfg, pipelineUrl, title, 'image')
  if (reg.ok) return reg
  const fetchUrl =
    signedMediaUrl?.trim() && /^https?:\/\//i.test(signedMediaUrl.trim())
      ? signedMediaUrl.trim()
      : pipelineUrl
  if (/^https?:\/\//i.test(fetchUrl)) {
    return uploadUrlToMediaId(client, cfg, fetchUrl, title)
  }
  return reg
}

function isIceOssHttpsUrl(url: string): boolean {
  return /^https:\/\/[^/]+\.oss-[a-z0-9-]+\.aliyuncs\.com\//i.test(url.trim())
}

/** 从 GetMediaInfo 读取源片时长（秒），微信/手机视频入库后用于裁剪上限 */
async function readIceMediaDurationSec(
  client: InstanceType<typeof IceClient>,
  mediaId: string,
): Promise<number | undefined> {
  try {
    const res = await client.getMediaInfo(new GetMediaInfoRequest({ mediaId, outputType: 'oss' }))
    const info = bodyOf(res)?.mediaInfo as Record<string, unknown> | undefined
    if (!info) return undefined
    const basic = (info.mediaBasicInfo ?? info.MediaBasicInfo) as Record<string, unknown> | undefined
    const direct = Number(basic?.duration ?? basic?.Duration ?? info.duration ?? info.Duration)
    if (Number.isFinite(direct) && direct > 0.2) return direct

    const list = (info.fileInfoList ?? info.FileInfoList) as unknown
    if (!Array.isArray(list)) return undefined
    let max = 0
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const fb = (row.fileBasicInfo ?? row.FileBasicInfo) as Record<string, unknown> | undefined
      const dur = Number(fb?.duration ?? fb?.Duration ?? row.duration ?? row.Duration)
      if (Number.isFinite(dur) && dur > max) max = dur
    }
    return max > 0.2 ? max : undefined
  } catch {
    return undefined
  }
}

/** 视频 IMS 入库：优先 oss:// RegisterMediaInfo（本地上传微信/手机视频），外链再走 URL 拉取 */
async function ingestVideoUrlToMediaId(
  client: InstanceType<typeof IceClient>,
  cfg: AliyunIceConfig,
  mediaUrl: string,
  signedMediaUrl: string | undefined,
  title: string,
): Promise<{ ok: true; mediaId: string; sourceDurationSec?: number } | { ok: false; message: string }> {
  const pipelineUrl = sanitizeIcePipelineMediaUrl(mediaUrl, signedMediaUrl)
  const trimmed = pipelineUrl.trim()
  const ossCandidate = isIceOssHttpsUrl(trimmed) || trimmed.startsWith('oss://')

  if (ossCandidate) {
    const reg = await registerMediaUrlToMediaId(client, cfg, trimmed, title, 'video')
    if (reg.ok) {
      const ready = await waitIceVideoMediaReady(client, reg.mediaId)
      if (!ready.ok) return ready
      const sourceDurationSec = await readIceMediaDurationSec(client, reg.mediaId)
      return { ok: true, mediaId: reg.mediaId, sourceDurationSec }
    }
    /* Register 失败时继续尝试 URL 拉取（公网素材） */
  }

  const fetchUrl =
    signedMediaUrl?.trim() && /^https?:\/\//i.test(signedMediaUrl.trim())
      ? signedMediaUrl.trim()
      : trimmed
  const up = await uploadUrlToMediaId(client, cfg, fetchUrl, title)
  if (!up.ok) return up
  const ready = await waitIceVideoMediaReady(client, up.mediaId)
  if (!ready.ok) return ready
  const sourceDurationSec = await readIceMediaDurationSec(client, up.mediaId)
  return { ok: true, mediaId: up.mediaId, sourceDurationSec }
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

function iceMediaInfoLooksReady(info: Record<string, unknown>): boolean {
  const basic = (info.mediaBasicInfo ?? info.MediaBasicInfo) as Record<string, unknown> | undefined
  const status = String(info.status ?? basic?.status ?? '').toLowerCase()
  if (status.includes('fail') || status.includes('error')) return false
  if (status.includes('normal') || status.includes('success') || status.includes('ready')) return true

  const inputURL = readIceJobString(basic ?? {}, 'inputURL', 'InputURL')
  if (inputURL?.startsWith('oss://') || /\.oss-[a-z0-9-]+\.aliyuncs\.com\//i.test(inputURL ?? '')) {
    return true
  }

  const list = (info.fileInfoList ?? info.FileInfoList) as unknown
  if (!Array.isArray(list) || list.length === 0) return false
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const fb = (row.fileBasicInfo ?? row.FileBasicInfo) as Record<string, unknown> | undefined
    const fileUrl = readIceJobString(fb ?? row, 'fileUrl', 'FileUrl')
    const fileSize = Number(fb?.fileSize ?? fb?.FileSize ?? 0)
    if (fileUrl && (!Number.isFinite(fileSize) || fileSize > 0)) return true
  }
  return false
}

/** 图片 RegisterMediaInfo 后须等 IMS 入库完成，空 status 不可视为就绪 */
async function waitIceImageMediaReady(
  client: InstanceType<typeof IceClient>,
  mediaId: string,
  maxTries = 24,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await client.getMediaInfo(new GetMediaInfoRequest({ mediaId, outputType: 'oss' }))
      const info = bodyOf(res)?.mediaInfo as Record<string, unknown> | undefined
      if (!info) {
        await sleep(2500)
        continue
      }
      const basic = (info.mediaBasicInfo ?? info.MediaBasicInfo) as Record<string, unknown> | undefined
      const status = String(info.status ?? basic?.status ?? '').toLowerCase()
      if (status.includes('fail') || status.includes('error')) {
        return { ok: false, message: `媒资注册失败：${status}` }
      }
      if (iceMediaInfoLooksReady(info)) return { ok: true }
    } catch {
      /* 注册初期可能尚未可查 */
    }
    await sleep(2500)
  }
  return {
    ok: false,
    message:
      '图片已上传 OSS 但 IMS 媒资库尚未入库完成。请确认该 Bucket 已在智能媒体服务控制台绑定，且与 ICE 同区域（cn-shanghai）。',
  }
}

/** 微信/手机视频：须等 IMS 入库完成并尽量读到有效 duration，避免只合成片头 1～2 秒 */
async function waitIceVideoMediaReady(
  client: InstanceType<typeof IceClient>,
  mediaId: string,
  maxTries = 28,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await client.getMediaInfo(new GetMediaInfoRequest({ mediaId, outputType: 'oss' }))
      const info = bodyOf(res)?.mediaInfo as Record<string, unknown> | undefined
      if (!info) {
        await sleep(2500)
        continue
      }
      const basic = (info.mediaBasicInfo ?? info.MediaBasicInfo) as Record<string, unknown> | undefined
      const status = String(info.status ?? basic?.status ?? '').toLowerCase()
      if (status.includes('fail') || status.includes('error')) {
        return { ok: false, message: `视频媒资入库失败：${status}` }
      }
      if (!iceMediaInfoLooksReady(info)) {
        await sleep(2500)
        continue
      }
      const dur = await readIceMediaDurationSec(client, mediaId)
      if (dur != null && dur >= 0.5) return { ok: true }
      if (i >= 8) return { ok: true }
    } catch {
      /* 注册初期可能尚未可查 */
    }
    await sleep(2500)
  }
  return {
    ok: false,
    message:
      '视频已上传 OSS 但 IMS 媒资库尚未解析完成（常见于微信转存 MP4）。请稍后重试，或确认 Bucket 已在智能媒体服务控制台绑定。',
  }
}

function iceOssRegionFromUrl(url: string): string | undefined {
  try {
    const m = new URL(url).hostname.match(/\.oss-([a-z0-9-]+)\.aliyuncs\.com$/i)
    return m?.[1]
  } catch {
    return undefined
  }
}

function assertIceInputOssRegion(cfg: AliyunIceConfig, urls: string[]): string | null {
  const iceRegion = cfg.regionId.replace(/^oss-/, '').toLowerCase()
  for (let i = 0; i < urls.length; i++) {
    const ossRegion = iceOssRegionFromUrl(urls[i]!)
    if (ossRegion && ossRegion.toLowerCase() !== iceRegion) {
      return `第 ${i + 1} 张图片 Bucket 区域为 ${ossRegion}，与 ICE 区域 ${iceRegion} 不一致，请在运营台核对 OSS 前缀与 ICE 区域`
    }
  }
  return null
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
    subtitleStyleId?: string
  },
): Promise<
  | { ok: true; jobId: string; mediaId?: string }
  | { ok: false; message: string; step?: string }
> {
  if (!cfg.vodStorageLocation?.trim() && !cfg.outputOssUrlPrefix?.trim()) {
    return {
      ok: false,
      message:
        '缺少成片输出配置：请在运营台填写 StorageLocation 或 OSS 成片 URL 前缀，多图成片须将素材写入 IMS 已绑定的 Bucket。',
      step: 'validate',
    }
  }

  const urls = input.imageUrls
    .map((u) => ensureIceHttpsUrl(u.trim()))
    .filter((u) => /^https:\/\//i.test(u))
  if (urls.length === 0) {
    return { ok: false, message: '请提供至少一张公网可访问的图片 URL', step: 'validate' }
  }
  for (let i = 0; i < urls.length; i++) {
    const urlErr = validateIcePipelineImageUrl(urls[i]!)
    if (urlErr) {
      return { ok: false, message: `第 ${i + 1} 张：${urlErr}`, step: 'validate' }
    }
  }
  const regionErr = assertIceInputOssRegion(cfg, urls)
  if (regionErr) {
    return { ok: false, message: regionErr, step: 'validate' }
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

  const { probeIceOutputObjectSize: probeOssObject, probeAnonymousOssReadable } = await import(
    './aliyunOssIceUpload.js'
  )
  for (let i = 0; i < urls.length; i++) {
    const probe = await probeOssObject(cfg, urls[i]!)
    if (!probe.ok) {
      return {
        ok: false,
        message: `第 ${i + 1} 张图片 OSS 探测失败：${probe.message ?? '未知错误'}`,
        step: 'validate',
      }
    }
    if (probe.size <= 0) {
      return {
        ok: false,
        message: `第 ${i + 1} 张图片在 OSS 上不存在或为空，请重新本地上传`,
        step: 'validate',
      }
    }
  }

  for (let i = 0; i < urls.length; i++) {
    const title = `${input.projectName}-图${i + 1}`.slice(0, 120)
    const up = await registerImageUrlToMediaId(client, cfg, urls[i]!, title)
    if (!up.ok) {
      return { ok: false, message: `第 ${i + 1} 张图片上传失败：${up.message}`, step: 'upload_media' }
    }
    const ready = await waitIceImageMediaReady(client, up.mediaId)
    if (!ready.ok) {
      return { ok: false, message: `第 ${i + 1} 张图片媒资未就绪：${ready.message}`, step: 'wait_media' }
    }
    mediaIds.push(up.mediaId)
  }

  const timelineUrls: string[] = []
  let useMediaIdTimeline = false
  for (let i = 0; i < urls.length; i++) {
    const fromInfo = await iceFileUrlFromMediaInfo(client, mediaIds[i]!)
    const candidate = toIceTimelineOssUrl(fromInfo ?? urls[i]!)
    if (!/^https:\/\/[^/]+\.oss-[a-z0-9-]+\.aliyuncs\.com\/.+/i.test(candidate)) {
      return {
        ok: false,
        message: `第 ${i + 1} 张图片无法解析为 OSS 直链，请重新本地上传`,
        step: 'validate',
      }
    }
    if (candidate.includes('?')) {
      return {
        ok: false,
        message: `第 ${i + 1} 张图片地址含签名参数，ICE 无法读取，请重新本地上传`,
        step: 'validate',
      }
    }
    timelineUrls.push(candidate)
    if (!(await probeAnonymousOssReadable(candidate))) {
      useMediaIdTimeline = true
    }
  }

  const out = buildOutputConfig(cfg, input.width, input.height, jobKey)
  if (!out.ok) {
    return { ok: false, message: out.message, step: 'output_config' }
  }

  const rawPlan = parseIceEditBriefPlan(input.editBrief, {
    clipEndSec: input.totalDurationSec,
    imageCount: timelineUrls.length,
    effectId: input.effectId,
    subtitleStyleId: input.subtitleStyleId,
  })
  const plan = await sanitizeIceBriefAudioPlan(rawPlan, cfg)
  const timelineSources = useMediaIdTimeline ? mediaIds : timelineUrls
  const timeline = buildTimelineFromImages(
    timelineSources,
    plan,
    input.width,
    input.height,
    useMediaIdTimeline ? 'mediaId' : 'url',
  )
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
            `；多图 ${timelineSources.length} 张${useMediaIdTimeline ? '（MediaId）' : ''}；已应用时间线：${plan.summary}`,
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
    const raw = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      message: formatIceProduceError(raw),
      step: 'submit_job',
    }
  }
}

/** 单条素材：OSS 注册 / URL 拉取 → 剪辑合成 */
export async function iceRunSinglePipeline(
  cfg: AliyunIceConfig,
  input: {
    mediaUrl: string
    /** 本地上传 OSS 的带签名地址（私有 Bucket Register 失败时回退 UploadMediaByURL） */
    signedMediaUrl?: string
    projectName: string
    editBrief: string
    width: number
    height: number
    clipEndSec: number
    effectId: string
    subtitleStyleId?: string
  },
): Promise<
  | { ok: true; jobId: string; mediaId?: string }
  | { ok: false; message: string; step?: string }
> {
  const client = createClient(cfg)
  const jobKey = `meoo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const up = await ingestVideoUrlToMediaId(
    client,
    cfg,
    input.mediaUrl,
    input.signedMediaUrl,
    input.projectName,
  )
  if (!up.ok) return { ok: false, message: up.message, step: 'upload_media' }

  const out = buildOutputConfig(cfg, input.width, input.height, jobKey)
  if (!out.ok) {
    return { ok: false, message: out.message, step: 'output_config' }
  }

  const rawPlan = parseIceEditBriefPlan(input.editBrief, {
    clipEndSec: input.clipEndSec,
    imageCount: 0,
    effectId: input.effectId,
    subtitleStyleId: input.subtitleStyleId,
  })
  const plan = await sanitizeIceBriefAudioPlan(rawPlan, cfg)
  const timeline = buildTimeline(up.mediaId, plan, up.sourceDurationSec)
  const durationNote =
    up.sourceDurationSec && up.sourceDurationSec < input.clipEndSec - 0.05
      ? `；源片 ${up.sourceDurationSec.toFixed(1)}s，已按源片上限输出`
      : ''
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
            `；已应用时间线：${plan.summary}${durationNote}`,
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

/** AI混剪：多分镜 + 多素材 + TTS 口播 → 单条 ICE 成片 */
export async function iceRunMixPipeline(
  cfg: AliyunIceConfig,
  input: {
    segments: Array<{
      kind: 'video' | 'image'
      mediaUrl: string
      signedMediaUrl?: string
      timelineStartSec: number
      timelineEndSec: number
      caption?: string
      materialIndex?: number
      sourceInSec?: number
      sourceOutSec?: number
    }>
    projectName: string
    editBrief: string
    width: number
    height: number
    totalDurationSec: number
    effectId: string
    subtitleStyleId?: string
    mixNarrationText?: string
    mixVoicePresetId?: string
    mixVoiceCloneBase64?: string
    env?: Record<string, string | undefined>
  },
): Promise<
  | { ok: true; jobId: string; mediaId?: string }
  | { ok: false; message: string; step?: string }
> {
  if (!input.segments.length) {
    return { ok: false, message: '混剪分镜为空', step: 'validate' }
  }

  const urlKeys = input.segments.map((s) => {
    const u = (s.mediaUrl || s.signedMediaUrl || '').trim()
    try {
      const parsed = new URL(u.startsWith('oss://') ? `https://x/${u.slice(6)}` : u)
      return parsed.pathname
    } catch {
      return u.split('?')[0]!
    }
  })
  const distinctUrls = new Set(urlKeys.filter(Boolean))
  const sourceIns = input.segments.map((s) => Math.round((s.sourceInSec ?? 0) * 10) / 10)
  const distinctSourceIns = new Set(sourceIns)
  if (
    input.segments.length >= 2 &&
    distinctUrls.size < 2 &&
    distinctSourceIns.size < 2 &&
    sourceIns.every((x) => x < 0.05)
  ) {
    return {
      ok: false,
      message:
        '混剪须按指令截取不同片段：多条分镜指向同一素材且未规划截取点，请完善分镜画面描述或重新分析素材',
      step: 'validate',
    }
  }

  const client = createClient(cfg)
  const jobKey = `meoo-mix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const resolved: IceMixResolvedClip[] = []
  const seenMediaIds = new Set<string>()
  const mediaCache = new Map<
    string,
    { mediaId: string; sourceDurationSec?: number; kind: 'video' | 'image' }
  >()

  const ossUrlsForRegion = input.segments.map((s) =>
    sanitizeIcePipelineMediaUrl(s.mediaUrl, s.signedMediaUrl),
  )
  const regionErr = assertIceInputOssRegion(cfg, ossUrlsForRegion.filter((u) => /\.oss-/i.test(u)))
  if (regionErr) {
    return { ok: false, message: regionErr.replace('图片', '素材'), step: 'validate' }
  }

  for (let i = 0; i < input.segments.length; i++) {
    const segRaw = input.segments[i]!
    const seg = {
      ...segRaw,
      mediaUrl: sanitizeIcePipelineMediaUrl(segRaw.mediaUrl, segRaw.signedMediaUrl),
    }
    const matNo = (seg.materialIndex ?? i) + 1
    const title = `${input.projectName}-素材${matNo}`.slice(0, 120)
    const cacheKey = `${seg.kind}:${(seg.mediaUrl || seg.signedMediaUrl || '').trim()}`
    const cached = mediaCache.get(cacheKey)

    if (seg.kind === 'image') {
      if (cached) {
        resolved.push({
          kind: 'image',
          mediaId: cached.mediaId,
          timelineStartSec: seg.timelineStartSec,
          timelineEndSec: seg.timelineEndSec,
          sourceInSec: 0,
        })
        continue
      }
      const up = await registerImageUrlToMediaId(
        client,
        cfg,
        seg.mediaUrl,
        title,
        seg.signedMediaUrl,
      )
      if (!up.ok) {
        return { ok: false, message: `第 ${i + 1} 段图片入库失败：${up.message}`, step: 'upload_media' }
      }
      const ready = await waitIceImageMediaReady(client, up.mediaId)
      if (!ready.ok) {
        return { ok: false, message: `第 ${i + 1} 段图片媒资未就绪：${ready.message}`, step: 'wait_media' }
      }
      resolved.push({
        kind: 'image',
        mediaId: up.mediaId,
        timelineStartSec: seg.timelineStartSec,
        timelineEndSec: seg.timelineEndSec,
        sourceInSec: 0,
      })
      mediaCache.set(cacheKey, { mediaId: up.mediaId, kind: 'image' })
      continue
    }
    if (cached?.kind === 'video') {
      resolved.push({
        kind: 'video',
        mediaId: cached.mediaId,
        mediaUrl: isIceCleanOssTimelineUrl(seg.mediaUrl) ? seg.mediaUrl : undefined,
        timelineStartSec: seg.timelineStartSec,
        timelineEndSec: seg.timelineEndSec,
        sourceDurationSec: cached.sourceDurationSec,
        sourceInSec: clampMixSourceInSec(
          seg.sourceInSec ?? 0,
          seg.timelineEndSec - seg.timelineStartSec,
          cached.sourceDurationSec,
        ),
      })
      seenMediaIds.add(cached.mediaId)
      continue
    }
    const up = await ingestVideoUrlToMediaId(
      client,
      cfg,
      seg.mediaUrl,
      seg.signedMediaUrl,
      title,
    )
    if (!up.ok) {
      return { ok: false, message: `第 ${i + 1} 段视频入库失败：${up.message}`, step: 'upload_media' }
    }
    resolved.push({
      kind: 'video',
      mediaId: up.mediaId,
      mediaUrl: isIceCleanOssTimelineUrl(seg.mediaUrl) ? seg.mediaUrl : undefined,
      timelineStartSec: seg.timelineStartSec,
      timelineEndSec: seg.timelineEndSec,
      sourceDurationSec: up.sourceDurationSec,
      sourceInSec: clampMixSourceInSec(
        seg.sourceInSec ?? 0,
        seg.timelineEndSec - seg.timelineStartSec,
        up.sourceDurationSec,
      ),
    })
    mediaCache.set(cacheKey, {
      mediaId: up.mediaId,
      sourceDurationSec: up.sourceDurationSec,
      kind: 'video',
    })
    seenMediaIds.add(up.mediaId)
  }

  const videoSegCount = input.segments.filter((s) => s.kind === 'video').length
  if (videoSegCount >= 2 && seenMediaIds.size < 2) {
    const videoIns = input.segments
      .filter((s) => s.kind === 'video')
      .map((s) => Math.round((s.sourceInSec ?? 0) * 10) / 10)
    const distinctVideoIns = new Set(videoIns)
    if (distinctVideoIns.size < 2 && videoIns.every((x) => x < 0.05)) {
      return {
        ok: false,
        message:
          '混剪须截取源片不同位置：多条视频分镜入库后仍从 0 秒起播，请检查分镜与剪辑方案',
        step: 'validate',
      }
    }
  }

  const out = buildOutputConfig(cfg, input.width, input.height, jobKey)
  if (!out.ok) {
    return { ok: false, message: out.message, step: 'output_config' }
  }

  const rawPlan = parseIceEditBriefPlan(input.editBrief, {
    clipEndSec: input.totalDurationSec,
    imageCount: 0,
    effectId: input.effectId,
    subtitleStyleId: input.subtitleStyleId,
    mixMode: true,
  })
  const captionOverrides = input.segments
    .filter((s) => s.caption?.trim())
    .map((s) => ({
      text: s.caption!.trim(),
      timelineIn: s.timelineStartSec,
      timelineOut: s.timelineEndSec,
    }))
  const plan = await sanitizeIceBriefAudioPlan(
    enhanceIceMixBriefPlan(
      captionOverrides.length
        ? { ...rawPlan, segmentCaptions: captionOverrides, totalDurationSec: input.totalDurationSec }
        : { ...rawPlan, totalDurationSec: input.totalDurationSec },
      input.effectId,
    ),
    cfg,
  )

  let finalPlan = plan
  const narrationText = String(input.mixNarrationText ?? '').trim()
  if (narrationText.length >= 4 && input.env) {
    const { synthesizeIceMixNarrationMp3 } = await import('./iceMixNarrationTts.js')
    const tts = await synthesizeIceMixNarrationMp3(
      cfg,
      input.env,
      narrationText,
      input.mixVoicePresetId,
      input.mixVoiceCloneBase64,
    )
    if (tts.ok) {
      const narTimeline = sanitizeIcePipelineMediaUrl(tts.timelineUrl, tts.mediaUrl)
      const reg = await registerMediaUrlToMediaId(
        client,
        cfg,
        narTimeline,
        `${input.projectName}-口播`.slice(0, 120),
        'audio',
      )
      if (reg.ok) {
        const ready = await waitIceVideoMediaReady(client, reg.mediaId, 16)
        if (ready.ok) {
          finalPlan = {
            ...plan,
            mixAiTtsClip: undefined,
            narrationClip: {
              mediaUrl: narTimeline,
              mediaId: reg.mediaId,
              timelineIn: 0,
              timelineOut: input.totalDurationSec,
              volume: 1,
              label: '混剪 TTS 口播',
            },
            summary: `${plan.summary}${plan.summary ? ' · ' : ''}CosyVoice 口播（MediaId）`,
          }
        }
      }
    }
    if (!finalPlan.narrationClip && !finalPlan.mixAiTtsClip) {
      finalPlan = {
        ...plan,
        mixAiTtsClip: {
          content: narrationText,
          timelineIn: 0,
          timelineOut: input.totalDurationSec,
        },
        summary: `${plan.summary}${plan.summary ? ' · ' : ''}ICE AI_TTS 口播`,
      }
    }
  }

  const timeline = buildTimelineFromMixClips(resolved, finalPlan, input.width, input.height, {
    forceMuteSource: Boolean(finalPlan.narrationClip || finalPlan.mixAiTtsClip),
  })
  try {
    const res = await client.submitMediaProducingJob(
      new SubmitMediaProducingJobRequest({
        timeline: JSON.stringify(timeline),
        outputMediaTarget: out.target,
        outputMediaConfig: JSON.stringify(out.config),
        projectMetadata: JSON.stringify({
          Title: input.projectName.slice(0, 120),
          Description:
            (input.editBrief.slice(0, 400) || 'AI混剪') +
            `；混剪 ${input.segments.length} 段；已应用时间线：${plan.summary}`,
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
        message: formatIceProduceError(readIceJobString(job, 'message', 'Message') ?? ''),
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
