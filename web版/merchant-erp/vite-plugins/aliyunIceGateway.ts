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
      credentialNote:
        '墨典AI云剪凭据由运营在「AI模型 → 短视频 API」维护；配置 OSS URL 前缀后可本地上传素材，成片输出需点播存储或 OSS 前缀。',
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
      json(res, 502, { ok: false, message: out.message, step: out.step })
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
    json(res, 200, {
      ok: true,
      status: st.status,
      progress: st.progress,
      done: st.done,
      failed: st.failed,
      downloadUrl: st.downloadUrl,
      message: st.message,
    })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/ice/job-download') {
    const jobId = searchParams.get('id')?.trim()
    if (!jobId) {
      json(res, 400, { ok: false, message: '缺少 id' })
      return true
    }
    const st = await iceGetProducingJob(cfg, jobId)
    if (!st.ok || !st.downloadUrl) {
      json(res, 404, { ok: false, message: st.ok ? '成片地址尚未生成' : st.message })
      return true
    }
    let upstream: Response
    try {
      upstream = await fetch(st.downloadUrl, { redirect: 'follow' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      json(res, 502, { ok: false, message: msg })
      return true
    }
    if (!upstream.ok) {
      json(res, upstream.status, { ok: false, message: `拉取成片失败 HTTP ${upstream.status}` })
      return true
    }
    const ct = upstream.headers.get('content-type') ?? 'video/mp4'
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.statusCode = 200
    res.setHeader('Content-Type', ct)
    res.setHeader('Content-Disposition', `attachment; filename="ice-${jobId}.mp4"`)
    res.end(buf)
    return true
  }

  json(res, 404, { ok: false, message: '未知的 ICE 路由' })
  return true
}
