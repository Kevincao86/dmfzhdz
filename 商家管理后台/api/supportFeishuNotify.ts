/**
 * Edge 兼容的客服飞书通知（供 support-poll 等 Edge API 使用，勿引入 node:crypto）。
 */

function notifyEnabled(): boolean {
  const v = (process.env.MEOO_FEISHU_NOTIFY_ENABLED ?? '1').trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off'
}

function webhookUrl(): string {
  return (process.env.MEOO_FEISHU_WEBHOOK_SUPPORT ?? process.env.MEOO_FEISHU_WEBHOOK_URL ?? '').trim()
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

export function notifySupportMerchantMessageFeishu(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
}): void {
  void (async () => {
    if (!notifyEnabled()) return
    const url = webhookUrl()
    if (!url) return
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
    ].join('\n')
    const body = await buildFeishuBody(message)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    })
  })().catch(() => {
    /* 通知失败不影响轮询 */
  })
}
