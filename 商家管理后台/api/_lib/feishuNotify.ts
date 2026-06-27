/**
 * 飞书群自定义机器人 Webhook 通知（服务端专用，勿暴露 Webhook URL 到前端）。
 *
 * 环境变量：
 * - MEOO_FEISHU_WEBHOOK_URL：默认 Webhook（未配置分场景 URL 时使用）
 * - MEOO_FEISHU_WEBHOOK_RECRUITMENT / _SUPPORT / _ORDER / _CUSTOMER：分场景覆盖
 * - MEOO_FEISHU_WEBHOOK_SECRET：飞书机器人「签名校验」密钥（开启签名校验时必填）
 * - MEOO_FEISHU_NOTIFY_ENABLED：设为 0/false 关闭全部通知
 */

import { createHmac } from 'node:crypto'

export type FeishuNotifyScene = 'recruitment' | 'support' | 'payment_order' | 'customer'

export type FeishuNotifyResult = {
  ok: boolean
  skipped?: boolean
  error?: string
  status?: number
}

function notifyEnabled(): boolean {
  const v = (process.env.MEOO_FEISHU_NOTIFY_ENABLED ?? '1').trim().toLowerCase()
  return v !== '0' && v !== 'false' && v !== 'off'
}

function webhookForScene(scene: FeishuNotifyScene): string {
  const byScene: Record<FeishuNotifyScene, string | undefined> = {
    recruitment: process.env.MEOO_FEISHU_WEBHOOK_RECRUITMENT,
    support: process.env.MEOO_FEISHU_WEBHOOK_SUPPORT,
    payment_order: process.env.MEOO_FEISHU_WEBHOOK_ORDER,
    customer: process.env.MEOO_FEISHU_WEBHOOK_CUSTOMER,
  }
  const sceneUrl = (byScene[scene] ?? '').trim()
  if (sceneUrl) return sceneUrl
  return (process.env.MEOO_FEISHU_WEBHOOK_URL ?? '').trim()
}

function buildFeishuTextBody(text: string): Record<string, unknown> {
  const content = { text: text.trim().slice(0, 4000) || '（空消息）' }
  const secret = (process.env.MEOO_FEISHU_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return { msg_type: 'text', content }
  }
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = createHmac('sha256', secret).update(`${timestamp}\n`).digest('base64')
  return {
    timestamp: String(timestamp),
    sign,
    msg_type: 'text',
    content,
  }
}

export async function sendFeishuTextNotify(
  scene: FeishuNotifyScene,
  text: string,
): Promise<FeishuNotifyResult> {
  if (!notifyEnabled()) return { ok: true, skipped: true }
  const url = webhookForScene(scene)
  if (!url) return { ok: true, skipped: true, error: 'webhook_not_configured' }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildFeishuTextBody(text)),
    })
    const raw = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: raw.slice(0, 300) || `HTTP ${res.status}`,
      }
    }
    let parsed: { code?: number; msg?: string; StatusCode?: number; StatusMessage?: string } = {}
    try {
      parsed = JSON.parse(raw) as typeof parsed
    } catch {
      /* 部分 Webhook 返回空 body */
    }
    const code = parsed.code ?? parsed.StatusCode
    if (code != null && code !== 0) {
      return {
        ok: false,
        status: res.status,
        error: parsed.msg ?? parsed.StatusMessage ?? raw.slice(0, 200),
      }
    }
    return { ok: true, status: res.status }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** 异步发送，不阻塞主流程 */
export function notifyFeishuAsync(scene: FeishuNotifyScene, text: string): void {
  void sendFeishuTextNotify(scene, text).catch(() => {
    /* 通知失败不影响业务 */
  })
}
