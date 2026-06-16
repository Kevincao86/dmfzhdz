/**
 * POST /api/meoo-ops-mp-group-qr-upload-init — 群二维码 OSS 直传凭证（仅存公网 URL 到注册表）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createMpGroupQrUploadPlan } from '../src/lib/mpGroupQrOss.js'

export const config = { maxDuration: 30 }

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

    let body: { mpOrderId?: string; fileName?: string; contentType?: string; sizeBytes?: number }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const plan = await createMpGroupQrUploadPlan({
      mpOrderId: String(body.mpOrderId || '').trim(),
      fileName: String(body.fileName || 'group-qr.jpg').trim(),
      contentType: String(body.contentType || 'image/jpeg').trim(),
      sizeBytes: Number(body.sizeBytes) || 0,
    })

    if (!plan.ok) {
      const status =
        plan.message === 'invalid_mp_order' || plan.message === 'invalid_size'
          ? 400
          : plan.message === 'group_qr_too_large'
            ? 400
            : 503
      sendOpsJson(res, status, { ok: false, error: plan.message })
      return
    }

    sendOpsJson(res, 200, {
      ok: true,
      uploadUrl: plan.uploadUrl,
      imageUrl: plan.imageUrl,
      contentType: plan.contentType,
      objectKey: plan.objectKey,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, error: 'group_qr_upload_init_failed', detail: msg.slice(0, 400) })
  }
}
