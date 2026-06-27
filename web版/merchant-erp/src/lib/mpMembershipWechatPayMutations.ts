import { randomBytes } from 'node:crypto'
import {
  findMembershipPlanVersion,
  listMembershipPlanVersions,
  type MpLibraryRole,
} from './mpMembershipCatalog.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryMpMembershipCheckoutRequest, RegistrySnapshot } from './opsRegistryTypes.js'
import {
  patchPrUserFeatureAccessFromSnapshot,
  patchSupplierTeamFeatureAccessFromSnapshot,
  patchTalentLibraryFeatureAccessFromSnapshot,
} from './mpLibraryRegistryMutations.js'
import {
  buildJsapiPayParams,
  createWechatJsapiOrder,
  createWechatNativeOrder,
  loadWechatPayConfig,
  queryWechatOrderByOutTradeNo,
  type WechatPayConfig,
} from './wechatPayV3.js'

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

function yuanToCents(yuan: number | null | undefined): number {
  if (yuan == null || !Number.isFinite(yuan) || yuan <= 0) return 0
  return Math.round(yuan * 100)
}

function makeOutTradeNo(): string {
  const ts = Date.now().toString(36)
  const rnd = randomBytes(4).toString('hex')
  return `MEOO${ts}${rnd}`.slice(0, 32)
}

export function computeMembershipExpiresAtIso(
  paidAtIso: string,
  billing: 'monthly' | 'yearly',
  existingExpiresAt?: string,
): string {
  const paidAt = new Date(paidAtIso)
  let base = paidAt
  if (existingExpiresAt) {
    const existing = new Date(existingExpiresAt)
    if (!Number.isNaN(existing.getTime()) && existing > paidAt) {
      base = existing
    }
  }
  const d = new Date(base)
  if (billing === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

function readExistingMembershipExpiresAt(
  data: RegistrySnapshot,
  checkout: RegistryMpMembershipCheckoutRequest,
): string | undefined {
  const target = String(checkout.registryTargetId || checkout.lingqiId || '').trim()
  if (!target) return undefined

  if (checkout.role === 'pr') {
    const u = (data.mpPrUsers ?? []).find((x) => x.id === target || x.lingqiPrId === target)
    return u?.mpMembershipExpiresAt
  }
  if (checkout.role === 'talent') {
    const e = (data.talentLibraryEntries ?? []).find(
      (x) => x.id === target || String(x.lingqiTalentId || '').trim() === target,
    )
    if (e?.mpMembershipExpiresAt) return e.mpMembershipExpiresAt
    const member = (data.mpTalentMembers ?? []).find(
      (m) => m.id === target || String(m.lingqiTalentId || '').trim() === target,
    )
    return member?.mpMembershipExpiresAt
  }
  const listKey = checkout.role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((x) => x.id === target)
  if (!entry?.memberId) return undefined
  const member = (data.mpTalentMembers ?? []).find((m) => m.id === entry.memberId)
  return member?.mpMembershipExpiresAt
}

function resolveRegistryTargetId(
  data: RegistrySnapshot,
  account: MpAccountRow,
  role: MpLibraryRole,
): string {
  if (role === 'pr') {
    const prId = String(account.registry_pr_id || '').trim()
    if (prId) return prId
    const lq = String(account.lingqi_pr_id || '').trim()
    const hit = (data.mpPrUsers ?? []).find((u) => u.lingqiPrId === lq || u.id === lq)
    return hit?.id || lq
  }
  const memberId = String(account.registry_member_id || '').trim()
  if (memberId) return memberId
  if (role === 'talent') {
    const lq = String(account.lingqi_talent_id || '').trim()
    const entry = (data.talentLibraryEntries ?? []).find((e) => e.lingqiTalentId === lq || e.id === lq)
    return entry?.id || memberId || lq
  }
  const listKey = role === 'shoot' ? 'shootTeamLibraryEntries' : 'editTeamLibraryEntries'
  const entry = (data[listKey] ?? []).find((e) => e.memberId === memberId)
  return entry?.id || memberId
}

function buildCheckoutBase(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
):
  | { ok: true; checkout: RegistryMpMembershipCheckoutRequest; description: string }
  | { ok: false; error: string; status: number } {
  const role = parseRole(body.workRole ?? body.role)
  if (!role) return { ok: false, error: 'invalid_role', status: 400 }

  const planId = String(body.planId || '').trim()
  if (!planId) return { ok: false, error: 'missing_plan_id', status: 400 }

  const billing = parseBilling(body.billing)
  if (!billing) return { ok: false, error: 'invalid_billing', status: 400 }

  const versions = listMembershipPlanVersions(data, role)
  const plan = findMembershipPlanVersion(versions, planId)
  if (!plan) return { ok: false, error: 'plan_not_found', status: 404 }

  const priceYuan = billing === 'yearly' ? plan.priceYearlyYuan : plan.priceMonthlyYuan
  if (priceYuan == null || priceYuan <= 0) return { ok: false, error: 'plan_is_free', status: 400 }

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
  const outTradeNo = makeOutTradeNo()
  const payModeRaw = String(body.payMode || 'native').trim()
  const payMode =
    payModeRaw === 'jsapi' ? ('wechat_jsapi' as const) : ('wechat_native' as const)

  const checkout: RegistryMpMembershipCheckoutRequest = {
    id: `mpmc_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    role,
    accountId,
    lingqiId: lingqiId || undefined,
    registryTargetId: resolveRegistryTargetId(data, account, role) || undefined,
    displayName: displayName || undefined,
    planId,
    billing,
    amountCents,
    channel: 'wechat',
    status: 'pending',
    createdAt: now,
    outTradeNo,
    payMode,
  }

  const billingLabel = billing === 'yearly' ? '年付' : '月付'
  const description = `灵祺星选${plan.name}${billingLabel}`

  const prev = data.mpMembershipCheckoutRequests ?? []
  data.mpMembershipCheckoutRequests = [checkout, ...prev].slice(0, 500)

  return { ok: true, checkout, description }
}

export async function createMembershipWechatPrepayFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
):
  Promise<
    | {
        ok: true
        requestId: string
        outTradeNo: string
        payMode: 'wechat_native' | 'wechat_jsapi'
        codeUrl?: string
        jsapiParams?: ReturnType<typeof buildJsapiPayParams>
      }
    | { ok: false; error: string; status: number }
  > {
  const cfgResult = loadWechatPayConfig()
  if (!cfgResult.ok) {
    return { ok: false, error: cfgResult.error, status: 503 }
  }
  const cfg = cfgResult.config

  const base = buildCheckoutBase(data, account, body)
  if (!base.ok) return base

  const { checkout, description } = base
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, plan: checkout.planId })

  try {
    if (checkout.payMode === 'wechat_jsapi') {
      const openid = String(body.openid || account.openid || '').trim()
      if (!openid) return { ok: false, error: 'missing_openid', status: 400 }
      const { prepayId } = await createWechatJsapiOrder({
        cfg,
        outTradeNo: checkout.outTradeNo!,
        description,
        amountCents: checkout.amountCents,
        openid,
        attach,
      })
      checkout.wechatPrepayId = prepayId
      return {
        ok: true,
        requestId: checkout.id,
        outTradeNo: checkout.outTradeNo!,
        payMode: 'wechat_jsapi',
        jsapiParams: buildJsapiPayParams(cfg, prepayId),
      }
    }

    const { codeUrl, prepayId } = await createWechatNativeOrder({
      cfg,
      outTradeNo: checkout.outTradeNo!,
      description,
      amountCents: checkout.amountCents,
      attach,
    })
    if (prepayId) checkout.wechatPrepayId = prepayId
    return {
      ok: true,
      requestId: checkout.id,
      outTradeNo: checkout.outTradeNo!,
      payMode: 'wechat_native',
      codeUrl,
    }
  } catch (e) {
    checkout.status = 'rejected'
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 502,
    }
  }
}

function applyMembershipPlanForCheckout(
  data: RegistrySnapshot,
  checkout: RegistryMpMembershipCheckoutRequest,
): { ok: true } | { ok: false; error: string } {
  const paidAt = checkout.paidAt || new Date().toISOString()
  const existingExpires = readExistingMembershipExpiresAt(data, checkout)
  const expiresAt = computeMembershipExpiresAtIso(paidAt, checkout.billing, existingExpires)
  const patch = { membershipPlan: checkout.planId, membershipExpiresAt: expiresAt }
  const target = String(checkout.registryTargetId || checkout.lingqiId || '').trim()
  if (!target) return { ok: false, error: 'missing_registry_target' }

  if (checkout.role === 'pr') {
    const result = patchPrUserFeatureAccessFromSnapshot(data, target, patch)
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }
  if (checkout.role === 'talent') {
    const result = patchTalentLibraryFeatureAccessFromSnapshot(data, target, patch)
    return result.ok ? { ok: true } : { ok: false, error: result.error }
  }
  const result = patchSupplierTeamFeatureAccessFromSnapshot(data, checkout.role, target, patch)
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export function confirmMembershipWechatPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  transactionId?: string,
): { ok: true; already: boolean; requestId: string } | { ok: false; error: string } {
  const list = data.mpMembershipCheckoutRequests ?? []
  const idx = list.findIndex((r) => r.outTradeNo === outTradeNo)
  if (idx < 0) return { ok: false, error: 'order_not_found' }

  const checkout = list[idx]!
  if (checkout.status === 'confirmed') {
    return { ok: true, already: true, requestId: checkout.id }
  }

  const now = new Date().toISOString()
  checkout.status = 'confirmed'
  checkout.paidAt = now
  if (transactionId) checkout.wechatTransactionId = transactionId

  const applied = applyMembershipPlanForCheckout(data, checkout)
  if (!applied.ok) {
    checkout.status = 'pending'
    delete checkout.paidAt
    return applied
  }

  list[idx] = checkout
  data.mpMembershipCheckoutRequests = list
  return { ok: true, already: false, requestId: checkout.id }
}

export async function pollMembershipWechatPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  cfg: WechatPayConfig,
): Promise<
  | { ok: true; status: 'pending' | 'paid'; requestId?: string }
  | { ok: false; error: string }
> {
  const list = data.mpMembershipCheckoutRequests ?? []
  const hit = list.find((r) => r.outTradeNo === outTradeNo)
  if (!hit) return { ok: false, error: 'order_not_found' }
  if (hit.status === 'confirmed') {
    return { ok: true, status: 'paid', requestId: hit.id }
  }

  try {
    const q = await queryWechatOrderByOutTradeNo(cfg, outTradeNo)
    if (q.tradeState === 'SUCCESS') {
      const result = confirmMembershipWechatPayFromSnapshot(data, outTradeNo, q.transactionId)
      if (!result.ok) return result
      return { ok: true, status: 'paid', requestId: result.requestId }
    }
    return { ok: true, status: 'pending' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
