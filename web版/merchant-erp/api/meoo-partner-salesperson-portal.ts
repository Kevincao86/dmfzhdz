/**
 * POST /api/meoo-partner-salesperson-portal — 分销员短信验证后查看本人推广数据
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { normalizeCnMobile } from '../vite-plugins/authRegistrationOtp.js'
import { verifyRegisterSmsCode } from '../vite-plugins/authSmsAuthShared.js'
import {
  buildSalespersonPortalFromSnapshot,
  lookupSalespersonByPhoneFromSnapshot,
} from '../src/lib/distributionAttributionCore.js'
import { buildDistributionPromoLinks } from '../src/lib/distributionRegistryCore.js'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): Record<string, unknown> {
  try {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}') as Record<string, unknown>
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}') as Record<string, unknown>
    if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>
  } catch {
    /* ignore */
  }
  return {}
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

  const body = rawBody(req)
  const phone = normalizeCnMobile(String(body.phone || ''))
  const smsCode = String(body.smsCode || '').trim()
  if (!phone) {
    sendJson(res, 400, { ok: false, error: 'invalid_phone', message: '请输入有效大陆手机号' })
    return
  }
  if (!/^\d{6}$/.test(smsCode)) {
    sendJson(res, 400, { ok: false, error: 'invalid_sms_code', message: '请输入 6 位验证码' })
    return
  }
  if (!(await verifyRegisterSmsCode(phone, smsCode))) {
    sendJson(res, 400, { ok: false, error: 'sms_code_invalid', message: '验证码错误或已过期' })
    return
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) {
    sendJson(res, 503, { ok: false, error: 'supabase_not_configured', missing: missingParts })
    return
  }

  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const match = lookupSalespersonByPhoneFromSnapshot(data, phone)
  if (!match) {
    sendJson(res, 404, {
      ok: false,
      error: 'salesperson_not_found',
      message: '未找到启用中的分销员账号，请联系服务商管理员确认手机号',
    })
    return
  }

  const portal = buildSalespersonPortalFromSnapshot(data, match.salesperson.id)
  const promoLinks = buildDistributionPromoLinks(match.salesperson.refCode)

  sendJson(res, 200, {
    ok: true,
    partnerName: match.partnerName,
    salesperson: {
      id: match.salesperson.id,
      realName: match.salesperson.realName,
      refCode: match.salesperson.refCode,
      phone: `${phone.slice(0, 3)}****${phone.slice(-4)}`,
      status: match.salesperson.status,
    },
    promoLinks,
    stats: portal.stats,
    attributions: portal.attributions,
  })
}
