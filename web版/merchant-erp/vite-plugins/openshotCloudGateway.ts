/**
 * OpenShot Cloud API — 商户端 BFF（密钥仅存服务端 / 运营注册表）。
 */
import type { ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { MerchantAiEnv } from './merchantAiUpstream.js'
import { readMerchantSupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'
import type { RegistryVideoAi } from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import {
  mergeOpenshotCredsFromRegistry,
  openshotGetExport,
  openshotRunSinglePipeline,
  readOpenshotCredsFromEnv,
  openshotExportDownloadPath,
  type OpenshotCreds,
} from './openshotCloudCore.js'

export const OPENCUT_PRESET_OPTIONS = [
  'Zoom In',
  'Zoom Out',
  'Fade',
  'Slide Left',
  'Slide Right',
] as const

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

async function resolveOpenshotCreds(
  viteRoot: string | undefined,
  env: MerchantAiEnv,
): Promise<OpenshotCreds | null> {
  const fromEnv = readOpenshotCredsFromEnv(env as Record<string, string | undefined>)
  const reg = await loadRegistryVideoAi(viteRoot)
  return mergeOpenshotCredsFromRegistry(fromEnv, reg)
}

export async function handleOpenshotCloudRoutes(input: {
  method: string
  pathname: string
  searchParams: URLSearchParams
  res: ServerResponse
  bodyRaw: string
  viteRoot?: string
  env: MerchantAiEnv
}): Promise<boolean> {
  const { method, pathname, searchParams, res, bodyRaw, viteRoot, env: rawEnv } = input

  if (!pathname.startsWith('/api/merchant/ai/video/openshot')) return false

  const creds = await resolveOpenshotCreds(viteRoot, rawEnv)

  if (method === 'GET' && pathname === '/api/merchant/ai/video/openshot/config') {
    json(res, 200, {
      configured: !!creds,
      apiBase: creds?.apiBase ?? 'https://cloud.openshot.org',
      presets: [...OPENCUT_PRESET_OPTIONS],
      credentialNote:
        'OpenShot Cloud 账号由运营在「AI模型 → 短视频 API」维护 openshot 字段，或配置服务端 OPENCUT_CLOUD_USER / OPENCUT_CLOUD_PASSWORD。媒体须为公网可访问 HTTPS 地址。',
      docsUrl: 'https://www.openshot.org/zh-hant/cloud-api/',
    })
    return true
  }

  if (!creds) {
    json(res, 503, {
      ok: false,
      message:
        '未配置 OpenShot Cloud：请设置 OPENSHOT_CLOUD_USER 与 OPENSHOT_CLOUD_PASSWORD（或运营注册表 videoAi.openshot*），详见 OpenShot 云 API 文档。',
    })
    return true
  }

  if (method === 'POST' && pathname === '/api/merchant/ai/video/openshot/pipeline') {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(bodyRaw || '{}') as Record<string, unknown>
    } catch {
      json(res, 400, { ok: false, message: '请求体必须为 JSON' })
      return true
    }
    const mediaUrl = String(parsed.mediaUrl ?? '').trim()
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
      json(res, 400, { ok: false, message: 'mediaUrl 须为公网可访问的 http(s) 地址' })
      return true
    }
    const width = Math.min(3840, Math.max(320, Number(parsed.width) || 1080))
    const height = Math.min(3840, Math.max(320, Number(parsed.height) || 1920))
    const clipEndSec = Math.min(120, Math.max(1, Number(parsed.clipEndSec) || 10))
    const preset = String(parsed.preset ?? 'Zoom In').trim() || 'Zoom In'
    const presetLengthSec = Math.min(clipEndSec, Math.max(0.5, Number(parsed.presetLengthSec) || 3))
    const projectName = String(parsed.projectName ?? '墨典批量云剪').trim().slice(0, 120)

    const out = await openshotRunSinglePipeline(creds, {
      mediaUrl,
      projectName,
      width,
      height,
      clipEndSec,
      preset,
      presetLengthSec,
      curve: String(parsed.curve ?? 'Ease In'),
    })
    if (!out.ok) {
      json(res, 502, { ok: false, message: out.message, step: out.step })
      return true
    }
    json(res, 200, {
      ok: true,
      projectId: out.projectId,
      exportId: out.exportId,
      exportUrl: out.exportUrl,
      downloadPath: openshotExportDownloadPath(creds, out.exportId),
    })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/openshot/export') {
    const exportId = searchParams.get('id')?.trim()
    if (!exportId) {
      json(res, 400, { ok: false, message: '缺少 id 查询参数' })
      return true
    }
    const st = await openshotGetExport(creds, exportId)
    if (!st.ok) {
      json(res, 502, { ok: false, message: st.message })
      return true
    }
    const status = (st.export.status ?? '').toLowerCase()
    const done = status === 'completed' || status === 'complete' || status === 'finished'
    const failed = status === 'failed' || status === 'error'
    let downloadUrl: string | undefined
    if (done) {
      downloadUrl =
        st.export.video_url ||
        openshotExportDownloadPath(creds, exportId)
    }
    json(res, 200, {
      ok: true,
      status: st.export.status,
      progress: st.export.progress,
      done,
      failed,
      downloadUrl,
      raw: st.export.json,
    })
    return true
  }

  if (method === 'GET' && pathname === '/api/merchant/ai/video/openshot/export-download') {
    const exportId = searchParams.get('id')?.trim()
    if (!exportId) {
      json(res, 400, { ok: false, message: '缺少 id' })
      return true
    }
    const target = openshotExportDownloadPath(creds, exportId)
    let upstream: Response
    try {
      const token = Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64')
      upstream = await fetch(target, {
        headers: { Authorization: `Basic ${token}` },
        redirect: 'follow',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      json(res, 502, { ok: false, message: msg })
      return true
    }
    if (!upstream.ok) {
      json(res, upstream.status, { ok: false, message: `下载失败 HTTP ${upstream.status}` })
      return true
    }
    const ct = upstream.headers.get('content-type') ?? 'video/mp4'
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.statusCode = 200
    res.setHeader('Content-Type', ct)
    res.setHeader('Content-Disposition', `attachment; filename="openshot-${exportId}.mp4"`)
    res.end(buf)
    return true
  }

  json(res, 404, { ok: false, message: '未知的 OpenShot 路由' })
  return true
}
