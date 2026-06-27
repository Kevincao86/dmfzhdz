import {
  findMembershipPlanVersion,
  listMembershipPlanVersions,
  type MpLibraryRole,
} from './mpMembershipCatalog.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryMpMembershipCheckoutRequest, RegistrySnapshot } from './opsRegistryTypes.js'

function parseRole(raw: unknown): MpLibraryRole | null {
  const s = String(raw || '').trim()
  if (s === 'pr' || s === 'talent' || s === 'shoot' || s === 'edit') return s
  return null
}

function parseBilling(raw: unknown): 'monthly' | 'yearly' | null {
  const s = String(raw || '').trim()
  if (s === 'monthly' || s === 'yearly') return s
  return null
}

function parseChannel(raw: unknown): 'wechat' | 'alipay' | null {
  const s = String(raw || '').trim()
  if (s === 'wechat' || s === 'alipay') return s
  return null
}

function yuanToCents(yuan: number | null | undefined): number {
  if (yuan == null || !Number.isFinite(yuan) || yuan <= 0) return 0
  return Math.round(yuan * 100)
}

export function appendMembershipCheckoutFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
):
  | { ok: true; request: RegistryMpMembershipCheckoutRequest }
  | { ok: false; error: string; status: number } {
  const role = parseRole(body.workRole ?? body.role)
  if (!role) return { ok: false, error: 'invalid_role', status: 400 }

  const planId = String(body.planId || '').trim()
  if (!planId) return { ok: false, error: 'missing_plan_id', status: 400 }

  const billing = parseBilling(body.billing)
  if (!billing) return { ok: false, error: 'invalid_billing', status: 400 }

  const channel = parseChannel(body.channel)
  if (!channel) return { ok: false, error: 'invalid_channel', status: 400 }

  const versions = listMembershipPlanVersions(data, role)
  const plan = findMembershipPlanVersion(versions, planId)
  if (!plan) return { ok: false, error: 'plan_not_found', status: 404 }

  const priceYuan =
    billing === 'yearly' ? plan.priceYearlyYuan : plan.priceMonthlyYuan
  if (priceYuan == null || priceYuan <= 0) {
    return { ok: false, error: 'plan_is_free', status: 400 }
  }
  if (billing === 'yearly' && (plan.priceYearlyYuan == null || plan.priceYearlyYuan <= 0)) {
    return { ok: false, error: 'yearly_not_available', status: 400 }
  }

  const amountCents = yuanToCents(priceYuan)
  if (amountCents <= 0) return { ok: false, error: 'invalid_amount', status: 400 }

  const accountId = String(account.id || '').trim()
  if (!accountId) return { ok: false, error: 'invalid_account', status: 400 }

  const lingqiId =
    role === 'pr'
      ? String(account.lingqi_pr_id || '').trim()
      : String(account.lingqi_talent_id || '').trim()

  const displayName = String(
    body.displayName || account.wx_nick_name || account.login_name || '',
  ).trim()

  const now = new Date().toISOString()
  const request: RegistryMpMembershipCheckoutRequest = {
    id: `mpmc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    accountId,
    lingqiId: lingqiId || undefined,
    displayName: displayName || undefined,
    planId,
    billing,
    amountCents,
    channel,
    status: 'pending',
    createdAt: now,
  }

  const prev = data.mpMembershipCheckoutRequests ?? []
  data.mpMembershipCheckoutRequests = [request, ...prev].slice(0, 500)
  return { ok: true, request }
}
