/**
 * POST /api/meoo-ops-mp-group-qr-upload-body — 小程序经 JSON base64 上传群二维码（走 erp-api 合法域名，不经 OSS 直 PUT）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { putMpGroupQrBuffer } from '../src/lib/mpGroupQrOss.js'

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

    let body: {
      mpOrderId?: string
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
    const fileName = String(body.fileName || 'group-qr.jpg').trim()
    const contentType = String(body.contentType || 'image/jpeg').trim()
    const contentBase64 = String(body.contentBase64 || '').trim()
    if (!mpOrderId || !contentBase64) {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_upload' })
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

    const put = await putMpGroupQrBuffer({ mpOrderId, fileName, contentType, buffer })
    if (!put.ok) {
      const status =
        put.message === 'invalid_mp_order' || put.message === 'invalid_size' || put.message === 'group_qr_too_large'
          ? 400
          : 503
      sendOpsJson(res, status, { ok: false, error: put.message })
      return
    }

    sendOpsJson(res, 200, {
      ok: true,
      imageUrl: put.imageUrl,
      objectKey: put.objectKey,
      contentType: put.contentType,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, {
      ok: false,
      error: 'group_qr_upload_body_failed',
      detail: msg.slice(0, 400),
    })
  }
}
