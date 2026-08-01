/**
 * POST /api/meoo-official-contact — 官网咨询表单（公开）
 *
 * body.source:
 * - modian（默认）→ MEOO_FEISHU_WEBHOOK_OFFICIAL (+ SECRET)
 * - lingqi → MEOO_FEISHU_WEBHOOK_LINGQI (+ SECRET)
 *
 * 亦支持自建应用投递（仅 modian 回落）：
 * FEISHU_OFFICIAL_APP_ID + FEISHU_OFFICIAL_APP_SECRET + FEISHU_OFFICIAL_RECEIVE_ID
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac } from 'node:crypto'

export const config = { maxDuration: 30 }

const MAX = {
  name: 80,
  company: 120,
  phone: 40,
  need: 120,
  message: 2000,
  source: 32,
} as const

type ContactChannel = 'modian' | 'lingqi'

function corsOrigin(req: VercelRequest): string {
  const origin = String(req.headers.origin || '').trim()
  if (!origin) return '*'
  try {
    const host = new URL(origin).hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.mofangdianai.com') ||
      host === 'mofangdianai.com' ||
      host.endsWith('.vercel.app') ||
      host === 'vercel.app'
    ) {
      return origin
    }
  } catch {
    /* ignore */
  }
  return '*'
}

function applyCors(req: VercelRequest, res: VercelResponse): void {
  const allow = corsOrigin(req)
  res.setHeader('Access-Control-Allow-Origin', allow)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (allow !== '*') res.setHeader('Vary', 'Origin')
}

function sendJson(req: VercelRequest, res: VercelResponse, status: number, body: Record<string, unknown>): void {
  applyCors(req, res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
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

function trimField(v: unknown, max: number): string {
  return String(v ?? '')
    .trim()
    .slice(0, max)
}

function resolveChannel(raw: string, need: string, message: string): ContactChannel {
  const s = raw.toLowerCase()
  if (s === 'lingqi' || s === '灵祺' || s.includes('lingqi')) return 'lingqi'
  if (need.includes('灵祺官网') || message.includes('灵祺官网') || message.includes('来源：灵祺')) {
    return 'lingqi'
  }
  return 'modian'
}

function channelWebhook(channel: ContactChannel): { url: string; secret: string; title: string } {
  if (channel === 'lingqi') {
    return {
      url: (process.env.MEOO_FEISHU_WEBHOOK_LINGQI ?? '').trim(),
      secret: (process.env.MEOO_FEISHU_WEBHOOK_LINGQI_SECRET ?? '').trim(),
      title: '【灵祺官网咨询】',
    }
  }
  return {
    url: (process.env.MEOO_FEISHU_WEBHOOK_OFFICIAL ?? '').trim(),
    secret: (process.env.MEOO_FEISHU_WEBHOOK_OFFICIAL_SECRET ?? '').trim(),
    title: '【墨典官网咨询】',
  }
}

/** 飞书自定义机器人签名：key = `${timestamp}\\n${secret}`，对空串做 HmacSHA256 再 Base64 */
function buildWebhookBody(text: string, secret: string): Record<string, unknown> {
  const content = { text: text.trim().slice(0, 4000) || '（空消息）' }
  if (!secret) {
    return { msg_type: 'text', content }
  }
  const timestamp = Math.floor(Date.now() / 1000)
  const stringToSign = `${timestamp}\n${secret}`
  const sign = createHmac('sha256', stringToSign).update('').digest('base64')
  return {
    timestamp: String(timestamp),
    sign,
    msg_type: 'text',
    content,
  }
}

async function sendViaWebhook(
  url: string,
  secret: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!url) return { ok: false, error: 'webhook_not_configured' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildWebhookBody(text, secret)),
    })
    const raw = await res.text()
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 300) || `HTTP ${res.status}` }
    }
    let parsed: { code?: number; msg?: string; StatusCode?: number; StatusMessage?: string } = {}
    try {
      parsed = JSON.parse(raw) as typeof parsed
    } catch {
      /* 部分 Webhook 返回空 body */
    }
    const code = parsed.code ?? parsed.StatusCode
    if (code != null && code !== 0) {
      return { ok: false, error: parsed.msg ?? parsed.StatusMessage ?? raw.slice(0, 200) }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function getOfficialTenantToken(): Promise<string | null> {
  const appId = (process.env.FEISHU_OFFICIAL_APP_ID ?? '').trim()
  const appSecret = (process.env.FEISHU_OFFICIAL_APP_SECRET ?? '').trim()
  if (!appId || !appSecret) return null
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = (await res.json()) as {
    code?: number
    tenant_access_token?: string
  }
  if (!res.ok || data.code !== 0 || !data.tenant_access_token) return null
  return data.tenant_access_token
}

async function sendViaAppIm(text: string): Promise<{ ok: boolean; error?: string }> {
  const appId = (process.env.FEISHU_OFFICIAL_APP_ID ?? '').trim()
  const appSecret = (process.env.FEISHU_OFFICIAL_APP_SECRET ?? '').trim()
  const receiveId = (process.env.FEISHU_OFFICIAL_RECEIVE_ID ?? '').trim()
  if (!appId || !appSecret || !receiveId) {
    return { ok: false, error: 'app_im_not_configured' }
  }
  const rawType = (process.env.FEISHU_OFFICIAL_RECEIVE_ID_TYPE ?? 'chat_id').trim().toLowerCase()
  const idType = rawType === 'open_id' ? 'open_id' : 'chat_id'
  const token = await getOfficialTenantToken()
  if (!token) return { ok: false, error: 'feishu_token_failed' }

  const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${idType}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text: text.trim().slice(0, 4000) || '（空消息）' }),
      }),
    })
    const raw = await res.text()
    let parsed: { code?: number; msg?: string } = {}
    try {
      parsed = JSON.parse(raw) as typeof parsed
    } catch {
      /* ignore */
    }
    if (!res.ok || parsed.code !== 0) {
      return { ok: false, error: parsed.msg ?? (raw.slice(0, 300) || `HTTP ${res.status}`) }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function channelConfigured(channel: ContactChannel): boolean {
  const { url } = channelWebhook(channel)
  if (url) return true
  if (channel === 'modian') {
    return Boolean(
      (process.env.FEISHU_OFFICIAL_APP_ID ?? '').trim() &&
        (process.env.FEISHU_OFFICIAL_APP_SECRET ?? '').trim() &&
        (process.env.FEISHU_OFFICIAL_RECEIVE_ID ?? '').trim(),
    )
  }
  return false
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      applyCors(req, res)
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(req, res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(req, res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const name = trimField(body.name, MAX.name)
    const company = trimField(body.company, MAX.company)
    const phone = trimField(body.phone, MAX.phone)
    const need = trimField(body.need, MAX.need)
    const message = trimField(body.message, MAX.message)
    const sourceRaw = trimField(body.source, MAX.source)
    const channel = resolveChannel(sourceRaw, need, message)

    if (!channelConfigured(channel)) {
      sendJson(req, res, 503, {
        ok: false,
        error: 'feishu_not_configured',
        channel,
        message:
          channel === 'lingqi'
            ? '灵祺官网咨询飞书未配置：请在轻量 meoo-auth-api 环境设置 MEOO_FEISHU_WEBHOOK_LINGQI（可选 MEOO_FEISHU_WEBHOOK_LINGQI_SECRET）'
            : '墨典官网咨询飞书未配置：请在轻量 meoo-auth-api 环境设置 MEOO_FEISHU_WEBHOOK_OFFICIAL（可选 MEOO_FEISHU_WEBHOOK_OFFICIAL_SECRET），或 FEISHU_OFFICIAL_APP_ID + FEISHU_OFFICIAL_APP_SECRET + FEISHU_OFFICIAL_RECEIVE_ID',
      })
      return
    }

    const missing: string[] = []
    if (!name) missing.push('name')
    if (!company) missing.push('company')
    if (!phone) missing.push('phone')
    if (!need) missing.push('need')
    if (missing.length) {
      sendJson(req, res, 400, { ok: false, error: 'validation_failed', missing })
      return
    }

    const { url, secret, title } = channelWebhook(channel)
    const when = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
    const text = [
      title,
      `姓名：${name}`,
      `公司：${company}`,
      `手机/微信：${phone}`,
      `需求：${need}`,
      `描述：${message || '（无）'}`,
      `时间：${when}`,
    ].join('\n')

    let result: { ok: boolean; error?: string }
    if (url) {
      result = await sendViaWebhook(url, secret, text)
    } else {
      result = await sendViaAppIm(text)
    }

    if (!result.ok) {
      sendJson(req, res, 502, {
        ok: false,
        error: 'feishu_send_failed',
        detail: (result.error || '').slice(0, 300),
      })
      return
    }

    sendJson(req, res, 200, { ok: true, channel })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(req, res, 500, { ok: false, error: 'official_contact_failed', detail: msg.slice(0, 400) })
  }
}
