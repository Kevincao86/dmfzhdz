/**
 * POST /api/meoo-ops-mp-recruitment-video-upload-body — 小程序经 JSON base64 上传探店成片并写入注册表。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { readAliyunIceConfigFromEnv, type AliyunIceConfig } from '../vite-plugins/aliyunIceCore.js'
import { putIceSourceObject, resolveIceServerUploadMaxBytes } from '../vite-plugins/aliyunOssIceUpload.js'
import type { MerchantAiEnv } from '../vite-plugins/merchantAiUpstream.js'
import { mergeVideoAiMerchantEnvWithSnapshot } from '../vite-plugins/merchantVideoAiGateway.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { applyVideoDraftToSnapshot } from '../src/lib/mpRecruitmentVideoCore.js'

export const config = { maxDuration: 120 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendCors(res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendOpsJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) {
      sendOpsJson(res, 503, {
        ok: false,
        error: 'supabase_admin_not_configured',
        missing: missingParts,
        hint: merchantSupabaseAdminEnvConfigureHint(missingParts),
      })
      return
    }

    let body: {
      mpOrderId?: string
      applicantId?: string
      fileName?: string
      contentType?: string
      contentBase64?: string
    }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const mpOrderId = String(body.mpOrderId || '').trim()
    const applicantId = String(body.applicantId || '').trim()
    const fileName = String(body.fileName || 'recruit-video.mp4').trim()
    const contentType = String(body.contentType || 'video/mp4').trim()
    const contentBase64 = String(body.contentBase64 || '').trim()
    if (!mpOrderId || !applicantId || !contentBase64) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_upload' })
      return
    }

    const maxBytes = resolveIceServerUploadMaxBytes()
    const approxBytes = Math.ceil((contentBase64.length * 3) / 4)
    if (approxBytes > maxBytes) {
      sendOpsJson(res, 400, {
        ok: false,
        error: 'file_too_large',
        message: `视频过大，请压缩后重试（单文件不超过 ${Math.floor(maxBytes / (1024 * 1024))}MB）`,
      })
      return
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(contentBase64, 'base64')
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_base64' })
      return
    }
    if (!buffer.length) {
      sendOpsJson(res, 400, { ok: false, error: 'empty_file' })
      return
    }

    const rawEnv = { ...process.env } as MerchantAiEnv
    const env = await mergeVideoAiMerchantEnvWithSnapshot(process.cwd(), rawEnv)
    const cfg = readAliyunIceConfigFromEnv(env) as AliyunIceConfig
    const put = await putIceSourceObject(cfg, env, { fileName, contentType, buffer })
    if (!put.ok) {
      sendOpsJson(res, 503, { ok: false, error: 'oss_upload_failed', message: put.message })
      return
    }

    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    const result = applyVideoDraftToSnapshot(data, mpOrderId, applicantId, put.timelineUrl || put.mediaUrl)
    if (!result.ok) {
      sendOpsJson(res, result.status, { ok: false, error: result.error })
      return
    }
    await io.save(data)
    sendOpsJson(res, 200, { ok: true, videoUrl: put.timelineUrl || put.mediaUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'video_upload_body_failed',
      detail: msg.slice(0, 800),
    })
  }
}
