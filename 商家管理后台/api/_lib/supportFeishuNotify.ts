/**
 * Edge 兼容的客服飞书通知（供 support-poll 等使用）。
 * 优先飞书自建应用卡片（双向）；无凭证时降级群 Webhook 仅通知。
 */

import { pushSupportFeishuAppCard } from './supportFeishuAppBridge.js'
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
} from '../../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'

export type SupportFeishuNotifyResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  via?: 'app' | 'webhook'
}

function notifyEnabled(): boolean {
  const v = (process.env.MEOO_FEISHU_NOTIFY_ENABLED ?? '1').trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off'
}

function webhookUrl(): string {
  const support = (process.env.MEOO_FEISHU_WEBHOOK_SUPPORT ?? '').trim()
  if (support) return support
  return (process.env.MEOO_FEISHU_WEBHOOK_URL ?? '').trim()
}

async function feishuSign(timestamp: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}\n`))
  const bytes = new Uint8Array(sig)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function buildFeishuBody(text: string): Promise<Record<string, unknown>> {
  const content = { text: text.trim().slice(0, 4000) || '（空消息）' }
  const secret = (process.env.MEOO_FEISHU_WEBHOOK_SECRET ?? '').trim()
  if (!secret) return { msg_type: 'text', content }
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = await feishuSign(timestamp, secret)
  return { timestamp: String(timestamp), sign, msg_type: 'text', content }
}

async function sendWebhook(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
}): Promise<SupportFeishuNotifyResult> {
  const url = webhookUrl()
  if (!url) return { ok: true, skipped: true, error: 'webhook_not_configured', via: 'webhook' }

  const preview = payload.text.trim().slice(0, 400)
  const when = payload.ts
    ? new Date(payload.ts).toLocaleString('zh-CN', { hour12: false })
    : new Date().toLocaleString('zh-CN', { hour12: false })
  const message = [
    '【在线客服 · 商户新消息】',
    `企业：${payload.enterpriseName?.trim() || '—'}`,
    `客户 ID：${payload.customerId?.trim() || '—'}`,
    `会话：${payload.sessionId}`,
    `内容：${preview}${payload.text.length > 400 ? '…' : ''}`,
    `时间：${when}`,
    '（提示：配置飞书自建应用后可在飞书直接回复）',
  ].join('\n')

  try {
    const body = await buildFeishuBody(message)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    })
    const raw = await res.text()
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 300) || `HTTP ${res.status}`, via: 'webhook' }
    }
    let parsed: { code?: number; msg?: string } = {}
    try {
      parsed = JSON.parse(raw) as typeof parsed
    } catch {
      /* ignore */
    }
    if (parsed.code != null && parsed.code !== 0) {
      return { ok: false, error: parsed.msg ?? raw.slice(0, 200), via: 'webhook' }
    }
    return { ok: true, via: 'webhook' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), via: 'webhook' }
  }
}

type FeishuClaim = 'claimed' | 'already' | 'unavailable'

/** 原子 claim：仅首次把 feishu_notified_at 置上的调用方负责发飞书 */
async function claimSupportFeishuNotify(row: {
  sessionId: string
  clientMsgId: string
}): Promise<FeishuClaim> {
  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0 || !row.clientMsgId) return 'unavailable'
  const q = new URLSearchParams({
    session_id: `eq.${row.sessionId}`,
    client_msg_id: `eq.${row.clientMsgId}`,
    from_role: 'eq.user',
    feishu_notified_at: 'is.null',
  })
  try {
    const r = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_relay_messages?${q}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ feishu_notified_at: new Date().toISOString() }),
    })
    if (!r.ok) return 'unavailable'
    const updated = (await r.json()) as unknown[]
    return Array.isArray(updated) && updated.length > 0 ? 'claimed' : 'already'
  } catch {
    return 'unavailable'
  }
}

/** 写入后或轮询发现新消息时调用。claim 成功才发，避免运营台和入库各发一次。 */
export async function notifySupportUserMessageOnce(row: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
  clientMsgId: string
}): Promise<void> {
  const text = row.text.trim()
  if (!text || !row.sessionId || row.sessionId.startsWith('__')) return
  const claim = await claimSupportFeishuNotify({ sessionId: row.sessionId, clientMsgId: row.clientMsgId })
  if (claim === 'already') return
  await sendSupportMerchantMessageFeishu({
    sessionId: row.sessionId,
    enterpriseName: row.enterpriseName,
    customerId: row.customerId,
    text,
    ts: row.ts,
  })
}

export async function sendSupportMerchantMessageFeishu(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
}): Promise<SupportFeishuNotifyResult> {
  if (!notifyEnabled()) return { ok: true, skipped: true }

  try {
    const appResult = await pushSupportFeishuAppCard(payload)
    if (appResult.ok && !appResult.skipped) {
      return { ok: true, via: 'app' }
    }
    if (appResult.ok && appResult.skipped) {
      // 无应用凭证 → Webhook 降级
      return sendWebhook(payload)
    }
    // 应用推送失败时仍尝试 Webhook，避免坐席完全收不到
    const wh = await sendWebhook(payload)
    if (wh.ok && !wh.skipped) return wh
    return { ok: false, error: appResult.error ?? wh.error, via: 'app' }
  } catch {
    return sendWebhook(payload)
  }
}
