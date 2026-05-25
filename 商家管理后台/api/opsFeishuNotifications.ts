import type { RegistryRecruitmentOrder, RegistryTenant } from '../src/meooRegistryShared/opsRegistryTypes.js'
import { notifyFeishuAsync, sendFeishuTextNotify, type FeishuNotifyResult } from './feishuNotify.js'

function yuan(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2)
}

const ORDER_KIND_LABEL: Record<string, string> = {
  subscription: '订阅',
  recharge: '充值',
  refund: '退款',
}

export async function notifyFeishuRecruitmentOrderCreated(
  order: RegistryRecruitmentOrder,
): Promise<FeishuNotifyResult> {
  const summary = (order.infoSummary ?? '').trim().slice(0, 280)
  return sendFeishuTextNotify(
    'recruitment',
    [
      '【达人招募 · 新订单】',
      `订单号：${order.id}`,
      `客户 / 门店：${order.customerName} · ${order.storeName}`,
      `金额：¥${order.serviceAmount.toLocaleString('zh-CN')}（佣 ${order.commissionPct}%）`,
      `状态：待处理`,
      summary ? `摘要：${summary}${(order.infoSummary?.length ?? 0) > 280 ? '…' : ''}` : '',
      `时间：${order.createdAt || new Date().toLocaleString('zh-CN', { hour12: false })}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

export function notifyFeishuSupportMerchantMessage(payload: {
  sessionId: string
  enterpriseName?: string
  customerId?: string
  text: string
  ts?: number
}): void {
  const preview = payload.text.trim().slice(0, 400)
  const when = payload.ts
    ? new Date(payload.ts).toLocaleString('zh-CN', { hour12: false })
    : new Date().toLocaleString('zh-CN', { hour12: false })
  notifyFeishuAsync(
    'support',
    [
      '【在线客服 · 商户新消息】',
      `企业：${payload.enterpriseName?.trim() || '—'}`,
      `客户 ID：${payload.customerId?.trim() || '—'}`,
      `会话：${payload.sessionId}`,
      `内容：${preview}${payload.text.length > 400 ? '…' : ''}`,
      `时间：${when}`,
    ].join('\n'),
  )
}

export function notifyFeishuPaymentOrderCreated(payload: {
  orderId: string
  tenantId: string
  orderKind: string
  amountCents: number
  clientNote?: string | null
}): void {
  notifyFeishuAsync(
    'payment_order',
    [
      '【订单管理 · 新订单】',
      `订单号：${payload.orderId}`,
      `租户：${payload.tenantId}`,
      `类型：${ORDER_KIND_LABEL[payload.orderKind] ?? payload.orderKind}`,
      `金额：¥${yuan(payload.amountCents)}`,
      `状态：待核验`,
      payload.clientNote?.trim() ? `备注：${payload.clientNote.trim().slice(0, 200)}` : '',
      `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

export function notifyFeishuCustomerCreated(payload: {
  tenantId: string
  merchantName: string
  loginName?: string
  source: 'provision' | 'manual' | 'erp'
}): void {
  const sourceLabel =
    payload.source === 'provision'
      ? '运营开户'
      : payload.source === 'manual'
        ? '运营手动录入'
        : 'ERP 同步'
  notifyFeishuAsync(
    'customer',
    [
      '【客户管理 · 新客户】',
      `租户 ID：${payload.tenantId}`,
      `商户名：${payload.merchantName}`,
      payload.loginName?.trim() ? `登录名：${payload.loginName.trim()}` : '',
      `来源：${sourceLabel}`,
      `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

export function notifyFeishuRegistryTenantCreated(tenant: RegistryTenant, source: 'manual' | 'erp'): void {
  notifyFeishuCustomerCreated({
    tenantId: tenant.id,
    merchantName: tenant.merchantName,
    loginName: tenant.loginName,
    source,
  })
}
