/**
 * POST /api/meoo-ops-mp-order-group-chat
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { uploadMerchantProductImage } from '../vite-plugins/merchantProductImageStorage.js'
import {
  createOrderGroupChatInSnapshot,
  getOrderGroupChatInSnapshot,
  listOrderGroupChatsForParticipant,
  sendOrderGroupChatMessageInSnapshot,
} from '../src/lib/mpOrderGroupChatCore.js'

const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const VIDEO_MAX_BYTES = 15 * 1024 * 1024

export const config = { maxDuration: 60 }

function sendOpsJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendOpsJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const action = String(body.action || '').trim()
    const mpOrderId = String(body.mpOrderId || '').trim()
    const participantKey = String(body.participantKey || '').trim()
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()

    if (action === 'list_mine') {
      if (!participantKey) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_participant_key' })
        return
      }
      const groups = listOrderGroupChatsForParticipant(data, participantKey)
      sendOpsJson(res, 200, { ok: true, groups })
      return
    }

    if (action === 'create') {
      if (!mpOrderId) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_mp_order_id' })
        return
      }
      const result = createOrderGroupChatInSnapshot(data, mpOrderId, participantKey)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      await io.save(result.data)
      sendOpsJson(res, 200, result.body)
      return
    }

    if (action === 'get') {
      if (!mpOrderId || !participantKey) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_params' })
        return
      }
      const result = getOrderGroupChatInSnapshot(data, mpOrderId, participantKey)
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      await io.save(result.data)
      sendOpsJson(res, 200, result.body)
      return
    }

    if (action === 'upload_media') {
      const contentBase64 = String(body.contentBase64 || '').trim()
      const contentType = String(body.contentType || 'image/jpeg').trim()
      if (!contentBase64) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_content' })
        return
      }
      let buf: Buffer
      try {
        buf = Buffer.from(contentBase64, 'base64')
      } catch {
        sendOpsJson(res, 400, { ok: false, error: 'invalid_base64' })
        return
      }
      const isVideo = /^video\//i.test(contentType)
      const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES
      if (!buf.length || buf.length > maxBytes) {
        sendOpsJson(res, 400, { ok: false, error: 'invalid_size', message: isVideo ? '视频过大，请压缩后重试' : '图片过大' })
        return
      }
      const safeMime = isVideo
        ? /^video\/(mp4|quicktime|mpeg)$/i.test(contentType)
          ? contentType.toLowerCase()
          : 'video/mp4'
        : /^image\/(jpeg|jpg|png|webp|gif)$/i.test(contentType)
          ? contentType.toLowerCase()
          : 'image/jpeg'
      try {
        const uploaded = await uploadMerchantProductImage({
          merchantId: 'mp-order-group-chat',
          buf,
          safeMime,
          originalName: String(body.fileName || (isVideo ? 'chat.mp4' : 'chat.jpg')),
        })
        sendOpsJson(res, 200, { ok: true, mediaUrl: uploaded.publicUrl, contentType: safeMime })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        sendOpsJson(res, 500, { ok: false, error: 'upload_failed', message: msg.slice(0, 120) })
      }
      return
    }

    if (action === 'send') {
      if (!mpOrderId || !participantKey) {
        sendOpsJson(res, 400, { ok: false, error: 'missing_params' })
        return
      }
      const result = sendOrderGroupChatMessageInSnapshot(data, mpOrderId, participantKey, {
        type: body.type === 'image' || body.type === 'video' ? body.type : 'text',
        text: String(body.text || ''),
        mediaUrl: String(body.mediaUrl || ''),
      })
      if (!result.ok) {
        sendOpsJson(res, result.status, { ok: false, error: result.error, message: result.message })
        return
      }
      await io.save(result.data)
      sendOpsJson(res, 200, result.body)
      return
    }

    sendOpsJson(res, 400, { ok: false, error: 'unknown_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendOpsJson(res, 500, { ok: false, error: 'internal_error', message: msg.slice(0, 200) })
  }
}
