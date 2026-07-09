/**
 * 服务商 fws：星选侧扣费走 ERP 租户积分桶（套餐桶优先，再扣充值积分）。
 * 星选 Web 仍调用既有 mp_ai_points_* 接口，此处按手机号映射 partner 租户后改扣 ERP。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MpAccountRow } from './mpAccountAuth.js'
import {
  assertErpAiPointsAffordable,
  spendErpAiPoints,
  type ErpAiUsageKind,
} from './erpAiPointsSpendCore.js'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import type { MpAiPointsSpendResult } from './mpAiPointsSpendCore.js'
import { parseMpPointsUsageKind, type MpPointsUsageKind } from './mpPointsEconomics.js'
import { findAuthUserByPhone } from '../../vite-plugins/authSmsAuthShared.js'
import { nodeSupabaseClientOptions } from './nodeSupabaseClientOptions.js'
import {
  resolvePartnerBillingContext,
  spendAgentEntitlementPoints,
  assertAgentEntitlementAffordable,
} from './partnerAgentCore.js'

function normalizeCnPhone(raw: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits
  if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2)
  return ''
}

export async function resolvePartnerErpBillingTenantId(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
): Promise<string | null> {
  const phone = normalizeCnPhone(account.login_name)
  if (!phone) return null

  const user = await findAuthUserByPhone(phone)
  if (!user?.userId) return null

  const admin = createClient(supabaseUrl, serviceRole, nodeSupabaseClientOptions())
  const { data: member, error: memErr } = await admin
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (memErr || !member?.tenant_id) return null

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id, edition')
    .eq('id', member.tenant_id)
    .maybeSingle()
  if (tErr || !tenant?.id) return null
  if (String(tenant.edition || '') !== 'partner' && String(tenant.edition || '') !== 'partner_agent') {
    return null
  }
  return tenant.id as string
}

function toMpSpendResultFromErp(
  erp: Awaited<ReturnType<typeof spendErpAiPoints>>,
): MpAiPointsSpendResult {
  if (!erp.ok) {
    return {
      ok: false,
      error:
        erp.error === 'insufficient_points'
          ? 'insufficient_points'
          : erp.error === 'tenant_not_found'
            ? 'not_found'
            : 'invalid_amount',
      message: erp.message,
      required: erp.required,
      balance: erp.balance,
    }
  }
  return {
    ok: true,
    pointsCharged: erp.pointsCharged,
    newBalance: erp.balance,
    already: erp.already === true,
  }
}

export async function spendPartnerXingxuanAsErpPoints(
  admin: SupabaseClient,
  tenantId: string,
  opts: {
    kind: MpPointsUsageKind
    durationSec?: number
    idempotencyKey?: string
    note?: string
    roleHint?: MpLibraryRole | null
  },
): Promise<MpAiPointsSpendResult> {
  void opts.roleHint
  const ctx = await resolvePartnerBillingContext(admin, tenantId)
  if (ctx?.isAgent) {
    const result = await spendAgentEntitlementPoints(admin, tenantId, opts.kind as ErpAiUsageKind, {
      durationSec: opts.durationSec,
      idempotencyKey: opts.idempotencyKey,
    })
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.error === 'insufficient_points'
            ? 'insufficient_points'
            : result.error === 'not_agent'
              ? 'not_found'
              : 'invalid_amount',
        message: result.message,
        required: result.required,
        balance: result.balance,
      }
    }
    return {
      ok: true,
      pointsCharged: result.pointsCharged,
      newBalance: result.balance,
      already: result.already === true,
    }
  }
  const kind = opts.kind as ErpAiUsageKind
  const result = await spendErpAiPoints(admin, tenantId, {
    kind,
    durationSec: opts.durationSec,
    idempotencyKey: opts.idempotencyKey,
    note: opts.note || `星选代操·${kind}`,
  })
  return toMpSpendResultFromErp(result)
}

export async function assertPartnerXingxuanErpAffordable(
  admin: SupabaseClient,
  tenantId: string,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number; roleHint?: MpLibraryRole | null },
): Promise<MpAiPointsSpendResult> {
  void opts?.roleHint
  const ctx = await resolvePartnerBillingContext(admin, tenantId)
  if (ctx?.isAgent) {
    const probe = await assertAgentEntitlementAffordable(admin, tenantId, kind as ErpAiUsageKind, {
      durationSec: opts?.durationSec,
    })
    if (!probe.ok) {
      return {
        ok: false,
        error:
          probe.error === 'insufficient_points'
            ? 'insufficient_points'
            : probe.error === 'not_agent'
              ? 'not_found'
              : 'invalid_amount',
        message: probe.message,
        required: probe.required,
        balance: probe.balance,
      }
    }
    return { ok: true, pointsCharged: 0, newBalance: probe.balance }
  }
  const parsed = parseMpPointsUsageKind(kind)
  if (!parsed) {
    return { ok: false, error: 'invalid_amount', message: '无效扣费类型' }
  }
  const result = await assertErpAiPointsAffordable(admin, tenantId, parsed as ErpAiUsageKind, {
    durationSec: opts?.durationSec,
  })
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === 'insufficient_points'
          ? 'insufficient_points'
          : result.error === 'tenant_not_found'
            ? 'not_found'
            : 'invalid_amount',
      message: result.message,
      required: result.required,
      balance: result.balance,
    }
  }
  return {
    ok: true,
    pointsCharged: 0,
    newBalance: result.balance,
  }
}