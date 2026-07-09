/**
 * 阿里云 ICE 云剪辑 — 商户端 BFF（AppId / AccessKey 仅存服务端与运营注册表）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import type { RegistryVideoAi } from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import {
  ICE_EFFECT_PRESETS,
  resolveIceEffectPreset,
} from './iceEffectPresets.js'
import {
  ICE_SUBTITLE_STYLE_DEFAULT_ID,
  ICE_SUBTITLE_STYLE_PRESETS,
  resolveIceSubtitleStylePreset,
} from './iceSubtitleStylePresets.js'
import {
  iceGetProducingJob,
  iceRunImagesPipeline,
  iceRunMixPipeline,
  iceRunSinglePipeline,
  mergeAliyunIceConfig,
  probeIceRamAccess,
  readAliyunIceConfigFromEnv,
  type AliyunIceConfig,
} from './aliyunIceCore.js'
import { describeIceUploadBucketSelection, iceOssUploadAvailable } from './aliyunOssIceParse.js'
import { evaluateIceOutputReady, fetchIceOutputObject } from './aliyunOssIceUpload.js'

function iceJobDownloadProxyPath(jobId: string, inline?: boolean): string {
  const q = new URLSearchParams({ id: jobId })
  if (inline) q.set('inline', '1')
  return `/api/meoo-merchant-ai-video-ice-job-download?${q.toString()}`
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function loadRegistryVideoAi(viteRoot?: string): Promise<RegistryVideoAi> {
  try {
    const { loadRegistrySnapshotForServer } = await import('../src/lib/registrySnapshotServerLoad.js')
    const data = await loadRegistrySnapshotForServer(viteRoot)
    if (data?.videoAi) return normalizeRegistryVideoAi(data.videoAi)
  } catch {
    /* fallback local dev file */
  }
  if (!viteRoot) return {}
  const registryPath = path.join(path.resolve(viteRoot, '..', '..'), '.meoo-dev-sync', 'registry.json')
  try {
    if (!fs.existsSync(registryPath)) return {}
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as { videoAi?: unknown }
    return normalizeRegistryVideoAi(parsed.videoAi)
  } catch {
    return {}
  }
}

async function resolveIceConfig(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
): Promise<AliyunIceConfig | null> {
  const fromEnv = readAliyunIceConfigFromEnv(env as Record<string, string | undefined>)
  const reg = await loadRegistryVideoAi(viteRoot)
  return mergeAliyunIceConfig(fromEnv, reg)
}

export async function loadIceGatewayConfig(
  viteRoot: string | undefined,
  env: Record<string, string | undefined>,
): Promise<AliyunIceConfig | null> {
  return resolveIceConfig(viteRoot, env as MerchantAiEnv)
}

export type IceJobDownloadPayload =
  | { ok: true; buf: Buffer }
  | { ok: false; status: number; message: string }

/** 供 Vercel 扁平下载 API 直连，避免 node-mocks-http 丢失二进制 body */
export async function fetchIceJobDownloadBuffer(
  cfg: AliyunIceConfig,
  jobId: string,
  env?: Record<string, string | undefined>,
): Promise<IceJobDownloadPayload> {
  const st = await iceGetProducingJob(cfg, jobId, env)
  if (!st.ok) return { ok: false, status: 502, message: st.message }
  if (!st.downloadUrl) {
    return { ok: false, status: 404, message: '成片地址尚未生成' }
  }
  const evalOut = await evaluateIceOutputReady(cfg, st.downloadUrl)
  if (!evalOut.ready) {
    return {
      ok: false,
      status: 409,
      message: evalOut.message ?? '成片尚未就绪，请稍后在任务列表重试下载',
    }
  }
  const fetched = await fetchIceOutputObject(cfg, st.downloadUrl)
  if (!fetched.ok) return { ok: false, status: 502, message: fetched.message }
  return { ok: true, buf: fetched.buf }
}

/** 兼容旧 OpenShot 路径，统一转发到 ICE */
const ICE_PATH_ALIASES: Record<string, string> = {
  '/api/merchant/ai/video/openshot/config': '/api/merchant/ai/video/ice/config',
  '/api/merchant/ai/video/openshot/pipeline': '/api/merchant/ai/video/ice/pipeline',
  '/api/merchant/ai/video/openshot/export': '/api/merchant/ai/video/ice/job',
  '/api/merchant/ai/video/openshot/export-download': '/api/merchant/ai/video/ice/job-download',
}

export async function handleAliyunIceRoutes(input: {
  method: string
  pathname: string
  searchParams: URLSearchParams
  res: ServerResponse
  bodyRaw: string
  req?: IncomingMessage
  viteRoot?: string
  env: MerchantAiEnv
}): Promise<boolean> {
  let { pathname } = input
  const alias = ICE_PATH_ALIASES[pathname]
  if (alias) pathname = alias

  if (!pathname.startsWith('/api/merchant/ai/video/ice')) return false

  const { method, searchParams, res, bodyRaw, req, viteRoot, env: rawEnv } = input
  const cfg = await resolveIceConfig(viteRoot, rawEnv)

  if (method === 'GET' && pathname === '/api/merchant/ai/video/ice/config') {
    const envMap = rawEnv as Record<string, string | undefined>
    const ossUpload =
      cfg != null ? iceOssUploadAvailable(cfg, envMap) : false
    const bucketSel = cfg
      ? describeIceUploadBucketSelection(cfg, envMap)
      : {
          uploadBucket: null,
          uploadBuckets: [] as string[],
          outputPrefixParseOk: false,
          skippedOutinSources: [] as string[],
        }
    const ramProbe = cfg ? await probeIceRamAccess(cfg) : { ok: false as const, message: '未配置 ICE' }
    json(res, 200, {
      configured: !!cfg,
      regionId: cfg?.regionId ?? 'cn-shanghai',
      hasOssOutput: Boolean(cfg?.outputOssUrlPrefix?.trim()),
      hasVodOutput: Boolean(cfg?.vodStorageLocation?.trim()),
      localUploadEnabled: ossUpload,
      uploadBucket: bucketSel.uploadBucket,
      uploadBuckets: bucketSel.uploadBuckets,
      outputPrefixParseOk: bucketSel.outputPrefixParseOk,
      uploadBucketHint:
        bucketSel.uploadBucket == null
          ? '请在运营台「OSS 成片 URL 前缀」填写自建 Bucket（如 https://mxslearningbiz.oss-cn-shanghai.aliyuncs.com/meoo/），勿填 outin 点播库。'
          : bucketSel.skippedOutinSources.length
            ? bucketSel.skippedOutinSources.join('；')
            : null,
      iceRamAuthorized: ramProbe.ok,
      iceRamIssue: ramProbe.ok ? null : ramProbe.message,
      presets: ICE_EFFECT_PRESETS.map((p) => p.label),
      effectOptions: ICE_EFFECT_PRESETS,
      subtitleStyleOptions: ICE_SUBTITLE_STYLE_PRESETS,
      urlUploadRequiresVod: Boolean(cfg?.vodStorageLocation?.trim()),
      credentialNote:
        '灵祺AI云剪：本地上传写入运营台「OSS 成片 URL 前缀」对应 Bucket（须 IMS 媒资库已绑定 + RAM 含 oss:PutObject）；StorageLocation（outin-*）用于成片输出与 RegisterMediaInfo；RAM 还须 AliyunICEFullAccess。',
      docsUrl:
        'https://help.aliyun.com/zh/ims/developer-reference/api-ice-2020-11-09-overview',
    })
    return true
  }

  if (!cfg) {
    json(res, 503, {
      ok: false,
      message:
        '未配置阿里云 ICE：请在运营台填写 AppId、AccessKey ID、AccessKey Secret，或配置环境变量 ALIYUN_ICE_APP_ID / ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET。',
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/ice/upload') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const fileName = String(parsed.fileName ?? 'video.mp4').trim() || 'video.mp4'
    const contentType = String(parsed.contentType ?? 'video/mp4').trim() || 'video/mp4'
    const contentBase64 = typeof parsed.contentBase64 === 'string' ? parsed.contentBase64.trim() : ''
    if (!contentBase64) {
      json(res, 400, { ok: false, message: '缺少 contentBase64' })
      return true
    }
    const { resolveIceServerUploadMaxBytes, putIceSourceObject } = await import('./aliyunOssIceUpload.js')
    const maxBytes = resolveIceServerUploadMaxBytes()
    const approxBytes = Math.ceil((contentBase64.length * 3) / 4)
    if (approxBytes > maxBytes) {
      json(res, 400, {
        ok: false,
        message: `单请求超过 ${Math.floor(maxBytes / (1024 * 1024))}MB，请由前端自动走分片上传；若仍失败可改用 HTTPS 链接添加素材。`,
      })
      return true
    }
    let buf: Buffer
    try {
      buf = Buffer.from(contentBase64, 'base64')
    } catch {
      json(res, 400, { ok: false, message: 'contentBase64 非法' })
      return true
    }
    const put = await putIceSourceObject(cfg, rawEnv as Record<string, string | undefined>, {
      fileName,
      contentType,
      buffer: buf,
    })
    if (!put.ok) {
      json(res, 400, { ok: false, message: put.message })
      return true
    }
    json(res, 200, {
      ok: true,
      mediaUrl: put.mediaUrl,
      timelineUrl: put.timelineUrl,
      objectKey: put.objectKey,
      label: fileName.replace(/\.[^.]+$/, '') || fileName,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/ice/multipart') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON。' })
      return true
    }
    const step = String(parsed.step ?? '').trim()
    const envMap = rawEnv as Record<string, string | undefined>
    const {
      ICE_UPLOAD_CHUNK_BYTES,
      initIceMultipartUpload,
      uploadIceMultipartPart,
      completeIceMultipartUpload,
    } = await import('./aliyunOssIceUpload.js')

    if (step === 'init') {
      const fileName = String(parsed.fileName ?? 'video.mp4').trim() || 'video.mp4'
      const contentType = String(parsed.contentType ?? 'video/mp4').trim() || 'video/mp4'
      const sizeBytes = Number(parsed.sizeBytes ?? 0)
      const init = await initIceMultipartUpload(cfg, envMap, { fileName, contentType, sizeBytes })
      if (!init.ok) {
        json(res, 400, { ok: false, message: init.message })
        return true
      }
      json(res, 200, {
        ok: true,
        uploadId: init.uploadId,
        objectKey: init.objectKey,
        partSize: init.partSize,
        partCount: init.partCount,
      })
      return true
    }

    if (step === 'part') {
      const objectKey = String(parsed.objectKey ?? '').trim()
      const uploadId = String(parsed.uploadId ?? '').trim()
      const partNumber = Number(parsed.partNumber ?? 0)
      const contentBase64 = typeof parsed.contentBase64 === 'string' ? parsed.contentBase64.trim() : ''
      if (!objectKey || !uploadId || !contentBase64) {
        json(res, 400, { ok: false, message: '缺少 objectKey、uploadId 或 contentBase64' })
        return true
      }
      const approxBytes = Math.ceil((contentBase64.length * 3) / 4)
      if (approxBytes > ICE_UPLOAD_CHUNK_BYTES + 256 * 1024) {
        json(res, 400, { ok: false, message: '单片过大' })
        return true
      }
      let buf: Buffer
      try {
        buf = Buffer.from(contentBase64, 'base64')
      } catch {
        json(res, 400, { ok: false, message: 'contentBase64 非法' })
        return true
      }
      const part = await uploadIceMultipartPart(cfg, envMap, {
        objectKey,
        uploadId,
        partNumber,
        buffer: buf,
      })
      if (!part.ok) {
        json(res, 400, { ok: false, message: part.message })
        return true
      }
      json(res, 200, { ok: true, etag: part.etag, partNumber })
      return true
    }

    if (step === 'complete') {
      const objectKey = String(parsed.objectKey ?? '').trim()
      const uploadId = String(parsed.uploadId ?? '').trim()
      const fileName = String(parsed.fileName ?? 'video.mp4').trim() || 'video.mp4'
      const partsRaw = parsed.parts
      if (!objectKey || !uploadId || !Array.isArray(partsRaw)) {
        json(res, 400, { ok: false, message: '缺少 objectKey、uploadId 或 parts' })
        return true
      }
      const parts = partsRaw
        .map((p) => {
          const row = p as Record<string, unknown>
          return {
            partNumber: Number(row.partNumber ?? 0),
            etag: String(row.etag ?? '').trim(),
          }
        })
        .filter((p) => p.partNumber >= 1 && p.etag)
      const done = await completeIceMultipartUpload(cfg, envMap, { objectKey, uploadId, parts })
      if (!done.ok) {
        json(res, 400, { ok: false, message: done.message })
        return true
      }
      json(res, 200, {
        ok: true,
        mediaUrl: done.mediaUrl,
        timelineUrl: done.timelineUrl,
        objectKey: done.objectKey,
        label: fileName.replace(/\.[^.]+$/, '') || fileName,
      })
      return true
    }

    json(res, 400, { ok: false, message: 'step 须为 init、part 或 complete' })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/ice/upload-init') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON' })
      return true
    }
    const fileName = String(parsed.fileName ?? 'video.mp4').trim()
    const contentType = String(parsed.contentType ?? 'video/mp4').trim()
    const sizeBytes = Number(parsed.sizeBytes ?? parsed.size ?? 0)
    const { createIceSourceUploadPlan } = await import('./aliyunOssIceUpload.js')
    const plan = await createIceSourceUploadPlan(cfg, rawEnv as Record<string, string | undefined>, {
      fileName,
      contentType,
      sizeBytes,
    })
    if (!plan.ok) {
      json(res, 400, { ok: false, message: plan.message })
      return true
    }
    json(res, 200, {
      ok: true,
      uploadUrl: plan.uploadUrl,
      contentType: plan.contentType,
      mediaUrl: plan.mediaUrl,
      timelineUrl: plan.timelineUrl,
      objectKey: plan.objectKey,
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/ice/pipeline') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON' })
      return true
    }
    const imageUrlsRaw = parsed.imageUrls
    const imageUrls = Array.isArray(imageUrlsRaw)
      ? imageUrlsRaw
          .map((u) => String(u ?? '').trim())
          .filter((u) => /^https?:\/\//i.test(u))
      : []
    if (imageUrls.length > 0) {
      const { validateIcePipelineImageUrl } = await import('./aliyunOssIceParse.js')
      for (let i = 0; i < imageUrls.length; i++) {
        const urlErr = validateIcePipelineImageUrl(imageUrls[i]!)
        if (urlErr) {
          json(res, 400, { ok: false, message: `第 ${i + 1} 张：${urlErr}`, step: 'validate' })
          return true
        }
      }
    }
    const mediaUrl = String(parsed.mediaUrl ?? '').trim()
    const signedMediaUrl = String(parsed.signedMediaUrl ?? '').trim() || undefined
    const width = Math.min(4096, Math.max(128, Number(parsed.width) || 1080))
    const height = Math.min(4096, Math.max(128, Number(parsed.height) || 1920))
    const clipEndSec = Math.min(120, Math.max(1, Number(parsed.clipEndSec) || 10))
    const presetLabel = String(parsed.preset ?? '无附加特效').trim()
    const effectIdRaw = String(parsed.effectId ?? '').trim()
    const effect = effectIdRaw
      ? resolveIceEffectPreset(effectIdRaw)
      : resolveIceEffectPreset(presetLabel)
    const subtitleStyleId = String(parsed.subtitleStyleId ?? '').trim()
    const subtitleStyle = resolveIceSubtitleStylePreset(
      subtitleStyleId || ICE_SUBTITLE_STYLE_DEFAULT_ID,
    )
    const projectName = String(parsed.projectName ?? 'AI混剪').trim().slice(0, 120)
    const editBrief = String(parsed.editBrief ?? parsed.editInstruction ?? '').trim().slice(0, 500)

    const mixNarrationText = String(parsed.mixNarrationText ?? parsed.narrationText ?? '').trim()
    const mixSegmentsRaw = parsed.mixSegments
    const mixSegments = Array.isArray(mixSegmentsRaw)
      ? mixSegmentsRaw
          .map((row) => {
            const s = row as Record<string, unknown>
            const kind = String(s.kind ?? 'video').trim() === 'image' ? 'image' : 'video'
            const mediaUrl = String(s.mediaUrl ?? '').trim()
            const signedMediaUrl = String(s.signedMediaUrl ?? '').trim() || undefined
            const timelineStartSec = Math.max(0, Number(s.timelineStartSec) || 0)
            const timelineEndSec = Math.max(timelineStartSec + 0.35, Number(s.timelineEndSec) || timelineStartSec + 1)
            const caption = String(s.caption ?? '').trim() || undefined
            const materialIndex = Number.isFinite(Number(s.materialIndex))
              ? Math.max(0, Number(s.materialIndex))
              : undefined
            const urlOk =
              /^https?:\/\//i.test(mediaUrl) ||
              mediaUrl.startsWith('oss://') ||
              (signedMediaUrl ? /^https?:\/\//i.test(signedMediaUrl) : false)
            if (!urlOk) return null
            const pipelineUrl =
              mediaUrl.startsWith('oss://') || /^https?:\/\//i.test(mediaUrl)
                ? mediaUrl
                : signedMediaUrl!
            return {
              kind,
              mediaUrl: pipelineUrl,
              signedMediaUrl,
              timelineStartSec,
              timelineEndSec,
              caption,
              materialIndex,
            }
          })
          .filter(Boolean)
      : []

    let pipelineImageUrls = imageUrls
    if (imageUrls.length > 0) {
      const { ensureIcePublicImageUrls } = await import('./aliyunOssIceUpload.js')
      const normalized = await ensureIcePublicImageUrls(
        cfg,
        rawEnv as Record<string, string | undefined>,
        imageUrls,
      )
      if (!normalized.ok) {
        json(res, 400, { ok: false, message: normalized.message, step: 'normalize_images' })
        return true
      }
      pipelineImageUrls = normalized.urls
    }

    const out =
      mixSegments.length >= 2
        ? await iceRunMixPipeline(cfg, {
            segments: mixSegments as Array<{
              kind: 'video' | 'image'
              mediaUrl: string
              signedMediaUrl?: string
              timelineStartSec: number
              timelineEndSec: number
              caption?: string
              materialIndex?: number
            }>,
            projectName,
            editBrief,
            width,
            height,
            totalDurationSec: clipEndSec,
            effectId: effect.id,
            subtitleStyleId: subtitleStyle.id,
            mixNarrationText,
            env: rawEnv as Record<string, string | undefined>,
          })
        : pipelineImageUrls.length > 0
        ? await iceRunImagesPipeline(cfg, {
            imageUrls: pipelineImageUrls,
            projectName,
            editBrief,
            width,
            height,
            totalDurationSec: clipEndSec,
            effectId: effect.id,
            subtitleStyleId: subtitleStyle.id,
          })
        : mediaUrl && /^https?:\/\//i.test(mediaUrl)
          ? await iceRunSinglePipeline(cfg, {
              mediaUrl,
              signedMediaUrl,
              projectName,
              editBrief,
              width,
              height,
              clipEndSec,
              effectId: effect.id,
              subtitleStyleId: subtitleStyle.id,
            })
          : { ok: false as const, message: '请提供 mediaUrl 或 imageUrls（公网 https 图片）', step: 'validate' }
    if (!out.ok) {
      const clientErr = /InvalidParameter|MissingParameter/i.test(out.message)
      json(res, clientErr ? 400 : 502, { ok: false, message: out.message, step: out.step })
      return true
    }
    json(res, 200, {
      ok: true,
      jobId: out.jobId,
      exportId: out.jobId,
      projectId: out.mediaId,
    })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/ice/job') {
    const jobId = searchParams.get('id')?.trim()
    if (!jobId) {
      json(res, 400, { ok: false, message: '缺少 id 查询参数' })
      return true
    }
    const envMap = rawEnv as Record<string, string | undefined>
    const st = await iceGetProducingJob(cfg, jobId, envMap)
    if (!st.ok) {
      if (st.transient) {
        json(res, 200, {
          ok: true,
          status: 'Processing',
          progress: undefined,
          done: false,
          failed: false,
          outputPending: false,
          message:
            st.message ||
            '查询 ICE 状态暂时超时，云端任务可能仍在进行，请稍后在任务列表点「继续查询」。',
        })
        return true
      }
      json(res, 502, { ok: false, message: st.message })
      return true
    }
    let outputBytes = 0
    let outputReady = false
    let pendingMessage = '剪辑已完成，成片正在写入 OSS…'
    if (st.done && !st.failed) {
      if (!st.downloadUrl) {
        pendingMessage =
          '剪辑已完成，但未解析到成片地址。请确认运营台已配置「OSS 成片 URL 前缀」且 ICE 对 Bucket 有写入权限。'
      } else {
        const evalOut = await evaluateIceOutputReady(cfg, st.downloadUrl)
        outputBytes = evalOut.bytes
        outputReady = evalOut.ready
        if (evalOut.message) pendingMessage = evalOut.message
      }
    }
    const outputPending = st.done && !st.failed && !outputReady
    json(res, 200, {
      ok: true,
      status: st.status,
      progress: st.progress,
      done: outputReady,
      failed: st.failed,
      outputPending,
      outputBytes: outputBytes > 0 ? outputBytes : undefined,
      downloadUrl: outputReady ? iceJobDownloadProxyPath(jobId) : undefined,
      previewUrl: outputReady ? iceJobDownloadProxyPath(jobId, true) : undefined,
      message: outputPending ? pendingMessage : st.message,
    })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/ice/job-download') {
    const jobId = searchParams.get('id')?.trim()
    if (!jobId) {
      json(res, 400, { ok: false, message: '缺少 id' })
      return true
    }
    if (!cfg) {
      json(res, 503, { ok: false, message: '灵祺AI云剪未配置' })
      return true
    }
    const inline = searchParams.get('inline') === '1'
    const payload = await fetchIceJobDownloadBuffer(cfg, jobId, rawEnv as Record<string, string | undefined>)
    if (!payload.ok) {
      json(res, payload.status, { ok: false, message: payload.message })
      return true
    }
    const total = payload.buf.length
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader(
      'Content-Disposition',
      inline
        ? `inline; filename="ice-${jobId}.mp4"`
        : `attachment; filename="ice-${jobId}.mp4"`,
    )
    res.setHeader('Cache-Control', 'private, max-age=300')

    const rangeHeader = req?.headers?.range
    if (inline && typeof rangeHeader === 'string') {
      const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
      if (m) {
        const start = m[1] ? Number.parseInt(m[1], 10) : 0
        const end = m[2] ? Number.parseInt(m[2], 10) : total - 1
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          end >= start &&
          end < total
        ) {
          const chunk = payload.buf.subarray(start, end + 1)
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
          res.setHeader('Content-Length', String(chunk.length))
          res.end(chunk)
          return true
        }
      }
    }

    res.statusCode = 200
    res.setHeader('Content-Length', String(total))
    res.end(payload.buf)
    return true
  }

  json(res, 404, { ok: false, message: '未知的 ICE 路由' })
  return true
}
