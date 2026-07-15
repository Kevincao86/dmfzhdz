/**
 * POST /api/meoo-ops-content-image-upload — 运营台图文正文插图（OSS / Supabase）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { uploadMerchantProductImage } from '../vite-plugins/merchantProductImageStorage.js'

export const config = { maxDuration: 60 }

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** 短视频海报；base64 JSON 体积约 ×1.33，勿过大 */
const MAX_VIDEO_BYTES = 15 * 1024 * 1024

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
    const lowerName = fileName.toLowerCase()
    const isVideo =
      /^video\/(mp4|webm|quicktime|x-m4v)$/i.test(contentType) ||
      /\.(mp4|webm|mov|m4v)$/i.test(lowerName)
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (!buf.length || buf.length > maxBytes) {
      sendJson(res, 400, {
        ok: false,
        error: 'invalid_size',
        detail: isVideo
          ? `视频不超过 ${MAX_VIDEO_BYTES / (1024 * 1024)}MB`
          : `图片/GIF 不超过 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
      })
      return
    }

    let safeMime = 'image/jpeg'
    if (isVideo) {
      if (/webm/i.test(contentType) || lowerName.endsWith('.webm')) safeMime = 'video/webm'
      else if (/quicktime|mov/i.test(contentType) || lowerName.endsWith('.mov'))
        safeMime = 'video/quicktime'
      else safeMime = 'video/mp4'
    } else if (/^image\/(jpeg|jpg|png|webp|gif)$/i.test(contentType)) {
      safeMime = contentType.toLowerCase()
    } else if (lowerName.endsWith('.gif')) {
      safeMime = 'image/gif'
    } else if (lowerName.endsWith('.png')) {
      safeMime = 'image/png'
    } else if (lowerName.endsWith('.webp')) {
      safeMime = 'image/webp'
    }

    try {
      const uploaded = await uploadMerchantProductImage({
        merchantId: 'ops-content',
        buf,
        safeMime,
        originalName: fileName,
      })
      sendJson(res, 200, {
        ok: true,
        imageUrl: uploaded.publicUrl,
        mediaType: isVideo ? 'video' : 'image',
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendJson(res, 502, { ok: false, error: 'upload_failed', detail: msg.slice(0, 300) })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, { ok: false, error: 'internal_error', detail: msg.slice(0, 300) })
  }
}
