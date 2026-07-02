import { randomBytes } from 'node:crypto'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import { creditMpAiPointsFromSnapshot } from './mpAiPointsBalanceMutations.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import { resolveRechargePointsAndCents } from './mpPointsEconomics.js'
import type { RegistryMpPointsCheckoutRequest, RegistrySnapshot } from './opsRegistryTypes.js'
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

function makeOutTradeNo(): string {
  const ts = Date.now().toString(36)
  const rnd = randomBytes(4).toString('hex')
  return `MEOO${ts}${rnd}`.slice(0, 32)
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

function buildPointsCheckoutBase(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
):
  | { ok: true; checkout: RegistryMpPointsCheckoutRequest; description: string }
  | { ok: false; error: string; status: number } {
  const role = parseRole(body.workRole ?? body.role)
  if (!role) return { ok: false, error: 'invalid_role', status: 400 }

  const resolved = resolveRechargePointsAndCents({
    points: body.points,
    yuan: body.yuan,
  })
  if ('error' in resolved) return { ok: false, error: resolved.error, status: 400 }

  const { points, amountCents } = resolved
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

  const checkout: RegistryMpPointsCheckoutRequest = {
    id: `mppc_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    role,
    accountId,
    lingqiId: lingqiId || undefined,
    registryTargetId: resolveRegistryTargetId(data, account, role) || undefined,
    displayName: displayName || undefined,
    points,
    amountCents,
    channel: 'wechat',
    status: 'pending',
    createdAt: now,
    outTradeNo,
    payMode,
  }

  const description = `灵祺星选积分充值${points.toLocaleString('zh-CN')}积分`
  const prev = data.mpPointsCheckoutRequests ?? []
  data.mpPointsCheckoutRequests = [checkout, ...prev].slice(0, 500)

  return { ok: true, checkout, description }
}

export async function createPointsWechatPrepayFromSnapshot(
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
        points: number
        amountCents: number
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

  const base = buildPointsCheckoutBase(data, account, body)
  if (!base.ok) return base

  const { checkout, description } = base
  const attach = JSON.stringify({ rid: checkout.id, role: checkout.role, kind: 'points' })

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
        points: checkout.points,
        amountCents: checkout.amountCents,
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
      points: checkout.points,
      amountCents: checkout.amountCents,
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

export function confirmPointsWechatPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  transactionId?: string,
): { ok: true; already: boolean; requestId: string; newBalance?: number } | { ok: false; error: string } {
  const list = data.mpPointsCheckoutRequests ?? []
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

  const credited = creditMpAiPointsFromSnapshot(data, checkout)
  if (!credited.ok) {
    checkout.status = 'pending'
    delete checkout.paidAt
    return credited
  }

  list[idx] = checkout
  data.mpPointsCheckoutRequests = list
  return { ok: true, already: false, requestId: checkout.id, newBalance: credited.newBalance }
}

export async function pollPointsWechatPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  cfg: WechatPayConfig,
): Promise<
  | { ok: true; status: 'pending' | 'paid'; requestId?: string; newBalance?: number }
  | { ok: false; error: string }
> {
  const list = data.mpPointsCheckoutRequests ?? []
  const hit = list.find((r) => r.outTradeNo === outTradeNo)
  if (!hit) return { ok: false, error: 'order_not_found' }
  if (hit.status === 'confirmed') {
    return { ok: true, status: 'paid', requestId: hit.id }
  }

  try {
    const q = await queryWechatOrderByOutTradeNo(cfg, outTradeNo)
    if (q.tradeState === 'SUCCESS') {
      const result = confirmPointsWechatPayFromSnapshot(data, outTradeNo, q.transactionId)
      if (!result.ok) return result
      return {
        ok: true,
        status: 'paid',
        requestId: result.requestId,
        newBalance: result.newBalance,
      }
    }
    return { ok: true, status: 'pending' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
