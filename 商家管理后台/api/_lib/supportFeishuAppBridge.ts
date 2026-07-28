/**
 * 飞书企业自建应用：出站卡片 + 入站事件验签/解密 + session 映射。
 *
 * 环境变量：
 * - FEISHU_APP_ID / FEISHU_APP_SECRET
 * - FEISHU_ENCRYPT_KEY / FEISHU_VERIFICATION_TOKEN（事件订阅）
 * - FEISHU_SUPPORT_RECEIVE_ID（客服群 chat_id 或坐席 open_id）
 * - FEISHU_SUPPORT_RECEIVE_ID_TYPE（chat_id | open_id，默认 chat_id）
 */
import { createHash, createDecipheriv } from 'node:crypto'
import {
  readSupportRelaySupabaseAdminEnv,
  supportRelayAdminFetch,
} from '../../../web版/merchant-erp/vite-plugins/merchantSupabaseAdminEnv.js'

export type FeishuAppPushResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  messageId?: string
}

type TokenCache = { token: string; expireAt: number }
let tokenCache: TokenCache | null = null

function appConfigured(): boolean {
  return Boolean((process.env.FEISHU_APP_ID ?? '').trim() && (process.env.FEISHU_APP_SECRET ?? '').trim())
}

function receiveId(): { id: string; idType: 'chat_id' | 'open_id' } | null {
  const id = (process.env.FEISHU_SUPPORT_RECEIVE_ID ?? '').trim()
  if (!id) return null
  const raw = (process.env.FEISHU_SUPPORT_RECEIVE_ID_TYPE ?? 'chat_id').trim().toLowerCase()
  const idType = raw === 'open_id' ? 'open_id' : 'chat_id'
  return { id, idType }
}

function serviceHeaders(serviceRole: string) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
  } as const
}

export function decryptFeishuEncrypt(encrypt: string, encryptKey: string): string {
  const key = createHash('sha256').update(encryptKey).digest()
  const buf = Buffer.from(encrypt, 'base64')
  const iv = buf.subarray(0, 16)
  const encrypted = buf.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let out = decipher.update(encrypted, undefined, 'utf8')
  out += decipher.final('utf8')
  return out
}

export function verifyFeishuEventSignature(opts: {
  timestamp: string
  nonce: string
  encryptKey: string
  body: string
  signature: string
}): boolean {
  const h = createHash('sha256')
  h.update(opts.timestamp + opts.nonce + opts.encryptKey + opts.body)
  const expect = h.digest('hex')
  return expect === opts.signature
}

export async function getFeishuTenantAccessToken(): Promise<string | null> {
  const appId = (process.env.FEISHU_APP_ID ?? '').trim()
  const appSecret = (process.env.FEISHU_APP_SECRET ?? '').trim()
  if (!appId || !appSecret) return null
  const now = Date.now()
  if (tokenCache && tokenCache.expireAt > now + 60_000) return tokenCache.token

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = (await res.json()) as {
    code?: number
    msg?: string
    tenant_access_token?: string
    expire?: number
  }
  if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
    return null
  }
  const expireSec = Number(data.expire ?? 7200)
  tokenCache = {
    token: data.tenant_access_token,
    expireAt: now + Math.max(60, expireSec - 120) * 1000,
  }
  return tokenCache.token
}

function isMpSession(sessionId: string): boolean {
  return /^lq-mp[-:]/i.test(sessionId) || /^mp[-_]/i.test(sessionId)
}

function buildSupportCard(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
}): string {
  const when = payload.ts
    ? new Date(payload.ts).toLocaleString('zh-CN', { hour12: false })
    : new Date().toLocaleString('zh-CN', { hour12: false })
  const preview = payload.text.trim().slice(0, 800)
  const channel = isMpSession(payload.sessionId) ? '小程序' : '商家 ERP'
  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `在线客服 · ${channel}新消息` },
    },
    elements: [
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**企业**\n${payload.enterpriseName?.trim() || '—'}`,
            },
          },
          {
            is_short: true,
            text: {
              tag: 'lark_md',
              content: `**客户 ID**\n${payload.customerId?.trim() || '—'}`,
            },
          },
        ],
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**会话**\n\`${payload.sessionId}\``,
        },
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**内容**\n${preview}${payload.text.length > 800 ? '…' : ''}`,
        },
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `时间 ${when} · 直接回复本条消息即可回客户（勿 @ 机器人）`,
          },
        ],
      },
    ],
  }
  return JSON.stringify(card)
}

export async function upsertFeishuThreadMap(opts: {
  sessionId: string
  feishuChatId?: string
  feishuRootMsgId?: string
  feishuOpenId?: string
  enterpriseName?: string
  customerId?: string
}): Promise<void> {
  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0) return

  const channel = isMpSession(opts.sessionId) ? 'mp' : 'erp'
  const row = {
    session_id: opts.sessionId,
    feishu_chat_id: opts.feishuChatId ?? null,
    feishu_root_msg_id: opts.feishuRootMsgId ?? null,
    feishu_open_id: opts.feishuOpenId ?? null,
    channel,
    enterprise_name: opts.enterpriseName ?? null,
    customer_id: opts.customerId ?? null,
    updated_at: new Date().toISOString(),
  }

  await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_feishu_thread_map`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(serviceRole),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  })
}

export async function lookupSessionByFeishuMsgId(msgId: string): Promise<string | null> {
  const id = msgId.trim()
  if (!id) return null
  const { supabaseUrl, serviceRole, missingParts } = readSupportRelaySupabaseAdminEnv()
  if (missingParts.length > 0) return null

  const q = new URLSearchParams({
    or: `(feishu_root_msg_id.eq.${id})`,
    select: 'session_id',
    limit: '1',
  })
  const res = await supportRelayAdminFetch(`${supabaseUrl}/rest/v1/support_feishu_thread_map?${q}`, {
    headers: serviceHeaders(serviceRole),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ session_id?: string }>
  const sid = Array.isArray(rows) ? String(rows[0]?.session_id || '').trim() : ''
  return sid || null
}

/** 出站：推送交互卡片到客服群/坐席，并写入 thread map */
export async function pushSupportFeishuAppCard(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
}): Promise<FeishuAppPushResult> {
  if (!appConfigured()) return { ok: true, skipped: true, error: 'feishu_app_not_configured' }
  const recv = receiveId()
  if (!recv) return { ok: true, skipped: true, error: 'feishu_receive_id_not_configured' }

  const token = await getFeishuTenantAccessToken()
  if (!token) return { ok: false, error: 'feishu_token_failed' }

  const content = buildSupportCard(payload)
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${recv.idType}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        receive_id: recv.id,
        msg_type: 'interactive',
        content,
      }),
    })
    const raw = await res.text()
    let parsed: { code?: number; msg?: string; data?: { message_id?: string; chat_id?: string } } = {}
    try {
      parsed = JSON.parse(raw) as typeof parsed
    } catch {
      /* ignore */
    }
    if (!res.ok || parsed.code !== 0) {
      return { ok: false, error: parsed.msg ?? (raw.slice(0, 300) || `HTTP ${res.status}`) }
    }
    const messageId = String(parsed.data?.message_id || '').trim()
    const chatId = String(parsed.data?.chat_id || recv.id).trim()
    if (messageId) {
      await upsertFeishuThreadMap({
        sessionId: payload.sessionId,
        feishuChatId: chatId,
        feishuRootMsgId: messageId,
        enterpriseName: payload.enterpriseName,
        customerId: payload.customerId,
      })
    }
    return { ok: true, messageId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function extractPlainTextFromFeishuMessage(contentRaw: string, messageType: string): string {
  try {
    const c = JSON.parse(contentRaw) as Record<string, unknown>
    if (messageType === 'text' && typeof c.text === 'string') return c.text.trim()
    if (messageType === 'post') {
      // 简化：拼接 post 内容
      const title = typeof c.title === 'string' ? c.title : ''
      return `${title} ${JSON.stringify(c.content ?? '')}`.trim().slice(0, 2000)
    }
    if (typeof c.text === 'string') return c.text.trim()
  } catch {
    /* ignore */
  }
  return contentRaw.trim().slice(0, 2000)
}

/** 从回复正文中兜底解析 session（卡片说明里的会话 id） */
export function extractSessionIdFromReplyText(text: string): string | null {
  const m =
    text.match(/`?(lq-mp[-:][A-Za-z0-9._:-]+|mp[-_][A-Za-z0-9._:-]+|sess_[A-Za-z0-9._:-]+|[0-9a-f]{8}-[0-9a-f-]{20,})`?/i) ||
    text.match(/会话[：:\s]*`?([A-Za-z0-9._:-]{8,})`?/)
  const sid = m?.[1]?.trim()
  return sid || null
}
