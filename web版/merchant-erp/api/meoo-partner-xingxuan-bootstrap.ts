/**
 * POST /api/meoo-partner-xingxuan-bootstrap
 * 服务商 fws 登录后：自动开通/同步星选 PR 账号并返回 mp 会话（不修改星选 Web 源码）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import { ensurePartnerXingxuanMpSession } from '../src/lib/partnerXingxuanBootstrapCore.js'
import { phoneFromAuthUser } from '../src/lib/tenantLocalState.js'
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.js'
import { nodeSupabaseClientOptions } from '../src/lib/nodeSupabaseClientOptions.js'

export const config = { maxDuration: 60 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(body))
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

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id, edition, name')
    .eq('id', auth.tenantId)
    .maybeSingle()
  if (tErr || !tenant) {
    sendJson(res, 404, { ok: false, error: 'tenant_not_found', message: '租户不存在' })
    return
  }
  if (String(tenant.edition || '') !== 'partner' && String(tenant.edition || '') !== 'partner_agent') {
    sendJson(res, 403, { ok: false, error: 'not_partner', message: '仅服务商版可开通星选账号' })
    return
  }

  const userClient = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const { data: userData } = await userClient.auth.admin.getUserById(auth.userId)
  const meta = (userData?.user?.user_metadata ?? {}) as { phone?: string; merchant_name?: string; login_name?: string }
  let phone = phoneFromAuthUser({
    phone: userData?.user?.phone,
    user_metadata: meta,
  })
  if (!phone && meta.login_name) {
    const digits = String(meta.login_name).replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) phone = digits
  }

  try {
    const out = await ensurePartnerXingxuanMpSession({
      supabaseUrl,
      serviceRole,
      tenantId: auth.tenantId,
      phone,
      companyName: String(tenant.name || meta.merchant_name || '').trim(),
    })

    if (!out.ok) {
      sendJson(res, 400, { ok: false, error: out.error, message: out.message })
      return
    }

    sendJson(res, 200, {
      ok: true,
      mpSessionToken: out.mpSessionToken,
      accountId: out.accountId,
      lingqiPrId: out.lingqiPrId,
      registryPrId: out.registryPrId,
      created: out.created,
      account: out.account,
      billingMode: 'erp_tenant_points',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendJson(res, 500, {
      ok: false,
      error: 'bootstrap_failed',
      message: msg.includes('mp_account') ? '星选账号写入失败，请联系运营排查' : `星选账号同步异常：${msg.slice(0, 120)}`,
    })
  }
}
