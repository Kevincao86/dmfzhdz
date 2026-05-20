/**
 * 阿里云 ICE 云剪辑 — 商户端 BFF（AppId / AccessKey 仅存服务端与运营注册表）。
 */
import type { ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'
import type { RegistryVideoAi } from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import {
  ICE_EFFECT_PRESETS,
  iceGetProducingJob,
  iceRunSinglePipeline,
  mergeAliyunIceConfig,
  readAliyunIceConfigFromEnv,
  type AliyunIceConfig,
} from './aliyunIceCore.js'
import { iceOssUploadAvailable } from './aliyunOssIceParse.js'
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
  let reg: RegistryVideoAi = {}
  if (viteRoot) {
    const registryPath = path.join(path.resolve(viteRoot, '..', '..'), '.meoo-dev-sync', 'registry.json')
    try {
      if (fs.existsSync(registryPath)) {
        const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as { videoAi?: unknown }
        reg = normalizeRegistryVideoAi(parsed.videoAi)
      }
    } catch {
      /* ignore */
    }
  }
  const { supabaseUrl, serviceRole } = readMerchantSupabaseAdminEnv()
  if (supabaseUrl && serviceRole) {
    try {
      const { createRegistrySnapshotIoFetch } = await import('../src/lib/registrySnapshotIoFetch.js')
      const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
      const data = await io.load()
      reg = normalizeRegistryVideoAi(data.videoAi)
    } catch {
      /* ignore */
    }
  }
  return reg
}

async function resolveIceConfig(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
): Promise<AliyunIceConfig | null> {
  const fromEnv = readAliyunIceConfigFromEnv(env as Record<string, string | undefined>)
  const reg = await loadRegistryVideoAi(viteRoot)
  return mergeAliyunIceConfig(fromEnv, reg)
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
  viteRoot?: string
  env: MerchantAiEnv
}): Promise<boolean> {
  let { pathname } = input
  const alias = ICE_PATH_ALIASES[pathname]
  if (alias) pathname = alias

  if (!pathname.startsWith('/api/merchant/ai/video/ice')) return false

  const { method, searchParams, res, bodyRaw, viteRoot, env: rawEnv } = input
  const cfg = await resolveIceConfig(viteRoot, rawEnv)

  if (method === 'GET' && pathname === '/api/merchant/ai/video/ice/config') {
    const envMap = rawEnv as Record<string, string | undefined>
    const ossUpload =
      cfg != null ? iceOssUploadAvailable(cfg, envMap) : false
    json(res, 200, {
      configured: !!cfg,
      regionId: cfg?.regionId ?? 'cn-shanghai',
      hasOssOutput: Boolean(cfg?.outputOssUrlPrefix?.trim()),
      hasVodOutput: Boolean(cfg?.vodStorageLocation?.trim()),
      localUploadEnabled: ossUpload,
      presets: ICE_EFFECT_PRESETS.map((p) => p.label),
      effectOptions: ICE_EFFECT_PRESETS,
      urlUploadRequiresVod: Boolean(cfg?.vodStorageLocation?.trim()),
      credentialNote:
        '墨典AI云剪凭据由运营在「AI模型 → 短视频 API」维护。须填写 ICE 点播 StorageLocation（链接/本地上传提交云剪必填）；OSS 成片前缀用于本地上传与成片落盘。',
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
    const mediaUrl = String(parsed.mediaUrl ?? '').trim()
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
      json(res, 400, { ok: false, message: 'mediaUrl 须为公网可访问的 http(s) 音视频地址' })
      return true
    }
    const width = Math.min(4096, Math.max(128, Number(parsed.width) || 1080))
    const height = Math.min(4096, Math.max(128, Number(parsed.height) || 1920))
    const clipEndSec = Math.min(120, Math.max(1, Number(parsed.clipEndSec) || 10))
    const presetLabel = String(parsed.preset ?? '无附加特效').trim()
    const effect =
      ICE_EFFECT_PRESETS.find((p) => p.label === presetLabel || p.id === presetLabel) ??
      ICE_EFFECT_PRESETS[0]
    const projectName = String(parsed.projectName ?? '墨典AI云剪').trim().slice(0, 120)
    const editBrief = String(parsed.editBrief ?? parsed.editInstruction ?? '').trim().slice(0, 500)

    const out = await iceRunSinglePipeline(cfg, {
      mediaUrl,
      projectName,
      editBrief,
      width,
      height,
      clipEndSec,
      effectId: effect.id,
    })
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
    const st = await iceGetProducingJob(cfg, jobId)
    if (!st.ok) {
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
    const inline = searchParams.get('inline') === '1'
    const st = await iceGetProducingJob(cfg, jobId)
    if (!st.ok || !st.downloadUrl) {
      json(res, 404, { ok: false, message: st.ok ? '成片地址尚未生成' : st.message })
      return true
    }
    const evalOut = await evaluateIceOutputReady(cfg, st.downloadUrl)
    if (!evalOut.ready) {
      json(res, 409, {
        ok: false,
        message: evalOut.message ?? '成片尚未就绪，请稍后在任务列表重试下载',
      })
      return true
    }
    const fetched = await fetchIceOutputObject(cfg, st.downloadUrl)
    if (!fetched.ok) {
      json(res, 502, { ok: false, message: fetched.message })
      return true
    }
    res.statusCode = 200
    res.setHeader('Content-Type', fetched.contentType)
    res.setHeader(
      'Content-Disposition',
      inline
        ? `inline; filename="ice-${jobId}.mp4"`
        : `attachment; filename="ice-${jobId}.mp4"`,
    )
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('Content-Length', String(fetched.buf.length))
    res.end(fetched.buf)
    return true
  }

  json(res, 404, { ok: false, message: '未知的 ICE 路由' })
  return true
}
