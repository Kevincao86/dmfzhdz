/**
 * POST /api/meoo-xpay-goods-notify
 * 微信虚拟支付「道具发货推送」xpay_goods_deliver_notify
 * （小程序后台 → 虚拟支付 → 发货订阅 URL 配到本接口）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { confirmTenantPayFromNotify } from '../src/lib/tenantPaymentChannels.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 30 }

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

function parsePayload(raw: string): Record<string, unknown> {
  const text = String(raw || '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    /* xml-ish fallback */
  }
  const pick = (tag: string) => {
    const m = text.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return m ? String(m[1] || m[2] || '').trim() : ''
  }
  return {
    Event: pick('Event'),
    OutTradeNo: pick('OutTradeNo'),
    OpenId: pick('OpenId'),
    WeChatPayInfo: {
      TransactionId: pick('TransactionId') || pick('MchOrderNo'),
    },
  }
}

function sendOk(res: VercelResponse, jsonMode: boolean): void {
  if (jsonMode) {
    res.status(200).json({ ErrCode: 0, ErrMsg: 'success' })
    return
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.status(200).send('<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>')
}

function sendFail(res: VercelResponse, jsonMode: boolean, msg: string): void {
  if (jsonMode) {
    res.status(200).json({ ErrCode: 1, ErrMsg: msg.slice(0, 200) })
    return
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res
    .status(200)
    .send(`<xml><ErrCode>1</ErrCode><ErrMsg><![CDATA[${msg.slice(0, 120)}]]></ErrMsg></xml>`)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, hint: 'xpay_goods_deliver_notify endpoint' })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const raw = rawBody(req)
  const jsonMode = /^\s*\{/.test(raw)
  const body = parsePayload(raw)
  const event = String(body.Event || body.event || '').trim()
  if (event && event !== 'xpay_goods_deliver_notify') {
    sendOk(res, jsonMode)
    return
  }

  const outTradeNo = String(body.OutTradeNo || body.out_trade_no || body.outTradeNo || '').trim()
  const wechatPay = (body.WeChatPayInfo || body.weChatPayInfo || {}) as Record<string, unknown>
  const transactionId = String(
    wechatPay.TransactionId || wechatPay.transactionId || wechatPay.MchOrderNo || '',
  ).trim()

  if (!outTradeNo) {
    sendFail(res, jsonMode, 'missing OutTradeNo')
    return
  }

  try {
    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length) {
      sendFail(res, jsonMode, 'supabase_not_configured')
      return
    }
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const ok = await confirmTenantPayFromNotify(admin, outTradeNo, transactionId || null)
    if (!ok) {
      sendFail(res, jsonMode, 'confirm_failed')
      return
    }
    sendOk(res, jsonMode)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendFail(res, jsonMode, msg)
  }
}
