/**
 * POST /api/meoo-tenant-billing
 * 商家 ERP 租户：订阅/充值/积分在线支付、账单摘要、订单与积分流水。
 *
 * Body: { action, ... }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import {
  buildTenantBillingSummary,
  createTenantPayPrepay,
  listTenantPaymentOrders,
  listTenantPointsLedger,
  pollTenantPayOrder,
  purchaseTenantWithWallet,
} from '../src/lib/tenantPaymentChannels.js'
import type { TenantOrderKind, TenantPayChannel } from '../src/lib/tenantPaymentShared.js'
import {
  matchResolvedTierByCents,
  resolveSubscriptionTiersForTenant,
} from '../../../商家管理后台/api/_lib/regionalPartnerPricing.js'
import {
  assertErpAiPointsAffordable,
  parseErpAiPointsUsageKind,
  spendErpAiPoints,
} from '../src/lib/erpAiPointsSpendCore.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'
import { formatThrowableMessage, tenantPayErrorMessage } from '../src/lib/formatDisplayError.js'
import { resolveErpWxOpenIdForPay } from '../vite-plugins/authWxLoginShared.js'

export const config = { maxDuration: 30 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return '{}'
}

function parseChannel(raw: unknown): TenantPayChannel | null {
  const s = String(raw || '').trim()
  if (s === 'wechat' || s === 'alipay' || s === 'douyin') return s
  return null
}

function parseOrderKind(raw: unknown): TenantOrderKind | null {
  const s = String(raw || '').trim()
  if (s === 'subscription' || s === 'recharge' || s === 'points_recharge') return s
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const auth = await requireMerchantRegistryAuth(req)
  if (!auth.ok) {
    sendJson(res, auth.status, { ok: false, error: auth.error, message: auth.message })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) {
    sendJson(res, 503, { ok: false, error: 'supabase_not_configured', missing: missingParts })
    return
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody(req)) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const action = String(body.action || '').trim()
  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())

  try {
    if (action === 'billing_summary') {
      const summary = await buildTenantBillingSummary(admin, auth.tenantId)
      sendJson(res, 200, { ok: true, summary })
      return
    }

    if (action === 'my_orders') {
      const orders = await listTenantPaymentOrders(admin, auth.tenantId, 60)
      sendJson(res, 200, { ok: true, orders })
      return
    }

    if (action === 'points_ledger') {
      const ledger = await listTenantPointsLedger(admin, auth.tenantId, 100)
      sendJson(res, 200, { ok: true, ledger })
      return
    }

    if (action === 'points_check') {
      const kind = parseErpAiPointsUsageKind(body.kind)
      if (!kind) {
        sendJson(res, 400, { ok: false, error: 'invalid_kind' })
        return
      }
      const durationSec =
        body.durationSec != null && Number.isFinite(Number(body.durationSec))
          ? Math.max(1, Math.ceil(Number(body.durationSec)))
          : undefined
      const result = await assertErpAiPointsAffordable(admin, auth.tenantId, kind, { durationSec })
      if (!result.ok) {
        sendJson(res, 402, {
          ok: false,
          error: result.error,
          message: result.message,
          required: result.required,
          balance: result.balance,
        })
        return
      }
      sendJson(res, 200, {
        ok: true,
        balance: result.balance,
        packageBalance: result.packageBalance,
        rechargeBalance: result.rechargeBalance,
      })
      return
    }

    if (action === 'points_spend') {
      const kind = parseErpAiPointsUsageKind(body.kind)
      if (!kind) {
        sendJson(res, 400, { ok: false, error: 'invalid_kind' })
        return
      }
      const durationSec =
        body.durationSec != null && Number.isFinite(Number(body.durationSec))
          ? Math.max(1, Math.ceil(Number(body.durationSec)))
          : undefined
      const idempotencyKey =
        typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined
      const note = typeof body.note === 'string' ? body.note.trim() : undefined
      const result = await spendErpAiPoints(admin, auth.tenantId, {
        kind,
        durationSec,
        idempotencyKey,
        note,
      })
      if (!result.ok) {
        sendJson(res, result.error === 'insufficient_points' ? 402 : 400, {
          ok: false,
          error: result.error,
          message: result.message,
          required: result.required,
          balance: result.balance,
        })
        return
      }
      sendJson(res, 200, {
        ok: true,
        pointsCharged: result.pointsCharged,
        fromPackage: result.fromPackage,
        fromRecharge: result.fromRecharge,
        packageBalance: result.packageBalance,
        rechargeBalance: result.rechargeBalance,
        balance: result.balance,
        already: result.already ?? false,
      })
      return
    }

    if (action === 'pay_prepay') {
      const orderKind = parseOrderKind(body.orderKind)
      const channel = parseChannel(body.channel)
      const amountCents = Math.floor(Number(body.amountCents) || 0)
      if (!orderKind || !channel || amountCents <= 0) {
        sendJson(res, 400, { ok: false, error: 'invalid_payload' })
        return
      }
      if (orderKind === 'subscription') {
        const resolved = await resolveSubscriptionTiersForTenant(admin, auth.tenantId)
        if (!matchResolvedTierByCents(resolved.tiers, amountCents)) {
          sendJson(res, 400, {
            ok: false,
            error: 'invalid_subscription_tier',
            message: '订阅金额须为当前有效档位（区域加价后以页面展示为准）',
          })
          return
        }
      }
      const payModeRaw = String(body.payMode || 'native').trim()
      const wechatPayMode =
        payModeRaw === 'virtual'
          ? ('virtual' as const)
          : payModeRaw === 'jsapi'
            ? ('jsapi' as const)
            : ('native' as const)
      let wechatOpenId = String(body.openid || '').trim()
      let wechatSessionKey = String(body.sessionKey || body.session_key || '').trim()
      if (
        channel === 'wechat' &&
        (wechatPayMode === 'jsapi' || wechatPayMode === 'virtual') &&
        (!wechatOpenId || (wechatPayMode === 'virtual' && !wechatSessionKey))
      ) {
        const resolved = await resolveErpWxOpenIdForPay({
          userId: auth.userId,
          code: typeof body.code === 'string' ? body.code : undefined,
          stableDevOpenId:
            typeof body.stableDevOpenId === 'string' ? body.stableDevOpenId : undefined,
        })
        if ('error' in resolved) {
          sendJson(res, 400, {
            ok: false,
            error: resolved.error,
            message: resolved.message,
          })
          return
        }
        wechatOpenId = resolved.openid
        if (resolved.session_key) wechatSessionKey = resolved.session_key
      }
      if (channel === 'wechat' && wechatPayMode === 'virtual' && !wechatSessionKey) {
        sendJson(res, 400, {
          ok: false,
          error: 'missing_session_key',
          message: '微信会话已失效，请重新点击微信支付',
        })
        return
      }
      const result = await createTenantPayPrepay(admin, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        orderKind,
        amountCents,
        channel,
        clientNote: typeof body.clientNote === 'string' ? body.clientNote : null,
        wechatPayMode: channel === 'wechat' ? wechatPayMode : undefined,
        wechatOpenId: wechatOpenId || null,
        wechatSessionKey: wechatSessionKey || null,
      })
      if (!result.ok) {
        const missing = Array.isArray(result.missing)
          ? result.missing.filter((x): x is string => typeof x === 'string')
          : undefined
        sendJson(res, result.status, {
          ok: false,
          error: result.error,
          message: result.message || tenantPayErrorMessage(result.error, missing),
          ...(missing?.length ? { missing } : {}),
        })
        return
      }
      sendJson(res, 200, {
        ok: true,
        orderId: result.orderId,
        outTradeNo: result.outTradeNo,
        payMode: result.payMode,
        codeUrl: result.codeUrl,
        qrCode: result.qrCode ?? result.codeUrl,
        payPageUrl: result.payPageUrl,
        jsapiParams: result.jsapiParams,
        virtualPayParams: result.virtualPayParams,
      })
      return
    }

    if (action === 'wallet_pay') {
      const orderKind = parseOrderKind(body.orderKind)
      const amountCents = Math.floor(Number(body.amountCents) || 0)
      if (!orderKind || amountCents <= 0) {
        sendJson(res, 400, { ok: false, error: 'invalid_payload' })
        return
      }
      if (orderKind === 'subscription') {
        const resolved = await resolveSubscriptionTiersForTenant(admin, auth.tenantId)
        if (!matchResolvedTierByCents(resolved.tiers, amountCents)) {
          sendJson(res, 400, {
            ok: false,
            error: 'invalid_subscription_tier',
            message: '订阅金额须为当前有效档位（区域加价后以页面展示为准）',
          })
          return
        }
      }
      const result = await purchaseTenantWithWallet(admin, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        orderKind,
        amountCents,
        clientNote: typeof body.clientNote === 'string' ? body.clientNote : null,
      })
      if (!result.ok) {
        sendJson(res, result.status, {
          ok: false,
          error: result.error,
          message: result.message || tenantPayErrorMessage(result.error),
        })
        return
      }
      sendJson(res, 200, { ok: true, orderId: result.orderId })
      return
    }

    if (action === 'pay_poll') {
      const outTradeNo = String(body.outTradeNo || '').trim()
      if (!outTradeNo) {
        sendJson(res, 400, { ok: false, error: 'missing_out_trade_no' })
        return
      }
      const result = await pollTenantPayOrder(admin, outTradeNo)
      if (!result.ok) {
        sendJson(res, 404, {
          ok: false,
          error: result.error,
          message: tenantPayErrorMessage(result.error),
        })
        return
      }
      sendJson(res, 200, { ok: true, status: result.status, orderId: result.orderId })
      return
    }

    sendJson(res, 400, { ok: false, error: 'invalid_action' })
  } catch (e) {
    const msg = formatThrowableMessage(e, 'billing_failed')
    sendJson(res, 502, {
      ok: false,
      error: 'billing_failed',
      message: msg,
    })
  }
}
