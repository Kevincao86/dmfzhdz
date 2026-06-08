/**
 * POST /api/meoo-ops-mp-recruitment-video-upload-init — 达人探店成片 OSS 直传凭证。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readAliyunIceConfigFromEnv } from '../vite-plugins/aliyunIceCore.js'
import { createIceSourceUploadPlan } from '../vite-plugins/aliyunOssIceUpload.js'
import { mergeVideoAiMerchantEnvWithSnapshot } from '../vite-plugins/merchantVideoAiGateway.js'

export const config = { maxDuration: 60 }

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

    let body: { fileName?: string; contentType?: string; sizeBytes?: number }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const fileName = String(body.fileName || 'recruit-video.mp4').trim()
    const contentType = String(body.contentType || 'video/mp4').trim()
    const sizeBytes = Number(body.sizeBytes) || 0
    if (!sizeBytes || sizeBytes <= 0) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_size' })
      return
    }

    const env = await mergeVideoAiMerchantEnvWithSnapshot(process.cwd(), process.env)
    const cfg = readAliyunIceConfigFromEnv(env)
    const plan = await createIceSourceUploadPlan(cfg, env, { fileName, contentType, sizeBytes })
    if (!plan.ok) {
      sendOpsJson(res, 503, { ok: false, error: 'upload_plan_failed', message: plan.message })
      return
    }
    sendOpsJson(res, 200, {
      ok: true,
      uploadUrl: plan.uploadUrl,
      mediaUrl: plan.mediaUrl,
      contentType: plan.contentType,
      objectKey: plan.objectKey,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'video_upload_init_failed',
      detail: msg.slice(0, 800),
    })
  }
}
