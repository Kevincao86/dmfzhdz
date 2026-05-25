/** 商户 ERP 前端触发服务端飞书通知（不暴露 Webhook） */

export async function postFeishuSupportMessageNotify(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
  accessToken: string
}): Promise<void> {
  try {
    await fetch('/api/meoo-feishu-notify-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.accessToken}`,
      },
      body: JSON.stringify({
        scene: 'support',
        sessionId: payload.sessionId,
        enterpriseName: payload.enterpriseName,
        customerId: payload.customerId,
        text: payload.text,
        ts: payload.ts ?? Date.now(),
      }),
    })
  } catch {
    /* 通知失败不影响聊天 */
  }
}

export async function postFeishuPaymentOrderNotify(payload: {
  orderId: string
  orderKind: string
  amountCents: number
  clientNote?: string | null
  accessToken: string
}): Promise<void> {
  try {
    await fetch('/api/meoo-feishu-notify-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${payload.accessToken}`,
      },
      body: JSON.stringify({
        scene: 'payment_order',
        orderId: payload.orderId,
        orderKind: payload.orderKind,
        amountCents: payload.amountCents,
        clientNote: payload.clientNote ?? null,
      }),
    })
  } catch {
    /* ignore */
  }
}
