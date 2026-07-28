/**
 * 飞书事件订阅回调：url_verification + im.message.receive_v1 → 写入 support_relay。
 * 公网：POST https://mofangdianai.com/erp-api/meoo-support-feishu-callback
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { insertSupportOpsReply } from '../supportOpsSendCore.js'
import {
  decryptFeishuEncrypt,
  extractPlainTextFromFeishuMessage,
  extractSessionIdFromReplyText,
  lookupSessionByFeishuMsgId,
  verifyFeishuEventSignature,
} from '../supportFeishuAppBridge.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function readRawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return ''
}

type FeishuEventBody = {
  challenge?: string
  type?: string
  token?: string
  encrypt?: string
  schema?: string
  header?: { event_type?: string; token?: string }
  event?: {
    message?: {
      message_id?: string
      root_id?: string
      parent_id?: string
      chat_id?: string
      message_type?: string
      content?: string
    }
    sender?: {
      sender_type?: string
      sender_id?: { open_id?: string; user_id?: string }
    }
  }
}

async function parseFeishuBody(req: VercelRequest): Promise<{
  body: FeishuEventBody
  raw: string
  decrypted?: boolean
}> {
  const raw = readRawBody(req)
  let parsed: FeishuEventBody = {}
  try {
    parsed = (typeof req.body === 'object' && req.body !== null
      ? req.body
      : JSON.parse(raw || '{}')) as FeishuEventBody
  } catch {
    parsed = {}
  }

  const encryptKey = (process.env.FEISHU_ENCRYPT_KEY ?? '').trim()
  if (parsed.encrypt && encryptKey) {
    try {
      const plain = decryptFeishuEncrypt(parsed.encrypt, encryptKey)
      const inner = JSON.parse(plain) as FeishuEventBody
      return { body: inner, raw, decrypted: true }
    } catch {
      return { body: parsed, raw }
    }
  }
  return { body: parsed, raw }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Lark-Signature, X-Lark-Request-Timestamp, X-Lark-Request-Nonce')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const { body, raw } = await parseFeishuBody(req)

  // URL 验证（配置事件订阅时）
  if (body.type === 'url_verification' || (body.challenge && !body.event && !body.header)) {
    const token = (process.env.FEISHU_VERIFICATION_TOKEN ?? '').trim()
    if (token && body.token && body.token !== token) {
      sendJson(res, 401, { ok: false, error: 'invalid_verification_token' })
      return
    }
    sendJson(res, 200, { challenge: body.challenge })
    return
  }

  const encryptKey = (process.env.FEISHU_ENCRYPT_KEY ?? '').trim()
  const verificationToken = (process.env.FEISHU_VERIFICATION_TOKEN ?? '').trim()
  const timestamp = String(req.headers['x-lark-request-timestamp'] ?? '')
  const nonce = String(req.headers['x-lark-request-nonce'] ?? '')
  const signature = String(req.headers['x-lark-signature'] ?? '')

  if (encryptKey && timestamp && nonce && signature) {
    const ok = verifyFeishuEventSignature({
      timestamp,
      nonce,
      encryptKey,
      body: raw,
      signature,
    })
    if (!ok) {
      sendJson(res, 401, { ok: false, error: 'invalid_signature' })
      return
    }
  } else if (verificationToken) {
    const evtToken = String(body.token ?? body.header?.token ?? '').trim()
    if (evtToken && evtToken !== verificationToken) {
      sendJson(res, 401, { ok: false, error: 'invalid_token' })
      return
    }
  }

  const eventType = String(body.header?.event_type ?? body.type ?? '').trim()
  if (eventType && eventType !== 'im.message.receive_v1') {
    sendJson(res, 200, { ok: true, skipped: true, reason: 'event_ignored', eventType })
    return
  }

  const msg = body.event?.message
  const sender = body.event?.sender
  if (!msg?.message_id) {
    sendJson(res, 200, { ok: true, skipped: true, reason: 'no_message' })
    return
  }
  if (sender?.sender_type && sender.sender_type !== 'user') {
    sendJson(res, 200, { ok: true, skipped: true, reason: 'not_user' })
    return
  }

  const messageType = String(msg.message_type || 'text')
  const text = extractPlainTextFromFeishuMessage(String(msg.content || ''), messageType)
  if (!text) {
    sendJson(res, 200, { ok: true, skipped: true, reason: 'empty_text' })
    return
  }

  const parentId = String(msg.parent_id || '').trim()
  const rootId = String(msg.root_id || '').trim()
  let sessionId: string | null = null
  if (parentId) sessionId = await lookupSessionByFeishuMsgId(parentId)
  if (!sessionId && rootId) sessionId = await lookupSessionByFeishuMsgId(rootId)
  if (!sessionId) sessionId = extractSessionIdFromReplyText(text)

  if (!sessionId) {
    sendJson(res, 200, {
      ok: true,
      skipped: true,
      reason: 'session_not_mapped',
      hint: '请回复机器人发出的客服卡片消息',
    })
    return
  }

  const clientMsgId = `feishu:${msg.message_id}`
  const result = await insertSupportOpsReply({
    sessionId,
    text,
    id: clientMsgId,
  })

  if (!result.ok) {
    sendJson(res, result.status, {
      ok: false,
      error: result.error,
      detail: result.detail,
      sessionId,
    })
    return
  }

  sendJson(res, 200, {
    ok: true,
    sessionId,
    verified: result.verified,
    clientMsgId,
  })
}
