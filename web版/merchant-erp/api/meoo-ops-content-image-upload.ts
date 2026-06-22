/**
 * POST /api/meoo-ops-content-image-upload — 运营台图文正文插图（OSS / Supabase）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { uploadMerchantProductImage } from '../vite-plugins/merchantProductImageStorage.js'

export const config = { maxDuration: 60 }

const MAX_BYTES = 5 * 1024 * 1024

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
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
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: { fileName?: string; contentType?: string; contentBase64?: string }
    try {
      body = JSON.parse(rawBody(req) || '{}') as typeof body
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const fileName = String(body.fileName || 'image.jpg').trim()
    const contentType = String(body.contentType || 'image/jpeg').trim()
    const contentBase64 = String(body.contentBase64 || '').trim()
    if (!contentBase64) {
      sendJson(res, 400, { ok: false, error: 'missing_content' })
      return
    }

    let buf: Buffer
    try {
      buf = Buffer.from(contentBase64, 'base64')
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_base64' })
      return
    }
    if (!buf.length || buf.length > MAX_BYTES) {
      sendJson(res, 400, { ok: false, error: 'invalid_size' })
      return
    }

    const safeMime = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(contentType)
      ? contentType.toLowerCase()
      : 'image/jpeg'

    try {
      const uploaded = await uploadMerchantProductImage({
        merchantId: 'ops-content',
        buf,
        safeMime,
        originalName: fileName,
      })
      sendJson(res, 200, { ok: true, imageUrl: uploaded.publicUrl })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendJson(res, 502, { ok: false, error: 'upload_failed', detail: msg.slice(0, 300) })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 300) })
  }
}
