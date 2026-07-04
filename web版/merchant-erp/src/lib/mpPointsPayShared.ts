import { randomBytes } from 'node:crypto'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import { creditMpAiPointsFromSnapshot } from './mpAiPointsBalanceMutations.js'
import type { MpAccountRow } from './mpAccountAuth.js'
import { resolveRechargePointsAndCents } from './mpPointsEconomics.js'
import type { RegistryMpPointsCheckoutRequest, RegistrySnapshot } from './opsRegistryTypes.js'

export type MpPointsPayChannel = 'wechat' | 'alipay' | 'douyin'

/** 待支付积分充值订单有效支付窗口（与微信 Native 默认一致） */
export const MP_POINTS_CHECKOUT_PAY_TTL_MS = 15 * 60 * 1000

export function pointsCheckoutPayDeadlineMs(createdAt: string): number {
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return 0
  return t + MP_POINTS_CHECKOUT_PAY_TTL_MS
}

export function isPointsCheckoutPayExpired(
  checkout: Pick<RegistryMpPointsCheckoutRequest, 'status' | 'createdAt'>,
  nowMs = Date.now(),
): boolean {
  if (checkout.status !== 'pending') return false
  const deadline = pointsCheckoutPayDeadlineMs(checkout.createdAt)
  return deadline > 0 && nowMs >= deadline
}

export function expireStalePointsCheckoutsInSnapshot(
  data: RegistrySnapshot,
  nowMs = Date.now(),
): boolean {
  const list = data.mpPointsCheckoutRequests ?? []
  let changed = false
  for (const row of list) {
    if (row.status === 'pending' && isPointsCheckoutPayExpired(row, nowMs)) {
      row.status = 'rejected'
      changed = true
    }
  }
  if (changed) data.mpPointsCheckoutRequests = list
  return changed
}

export function findAccountPointsCheckoutByOutTradeNo(
  data: RegistrySnapshot,
  accountId: string,
  outTradeNo: string,
): RegistryMpPointsCheckoutRequest | undefined {
  const id = String(accountId || '').trim()
  const tradeNo = String(outTradeNo || '').trim()
  if (!id || !tradeNo) return undefined
  return (data.mpPointsCheckoutRequests ?? []).find(
    (row) => String(row.accountId || '').trim() === id && row.outTradeNo === tradeNo,
  )
}

export function rejectPointsCheckoutIfExpired(
  checkout: RegistryMpPointsCheckoutRequest,
  nowMs = Date.now(),
): boolean {
  if (checkout.status !== 'pending') return false
  if (!isPointsCheckoutPayExpired(checkout, nowMs)) return false
  checkout.status = 'rejected'
  return true
}

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

function resolveWechatPayMode(body: Record<string, unknown>): 'wechat_native' | 'wechat_jsapi' {
  const payModeRaw = String(body.payMode || 'native').trim()
  return payModeRaw === 'jsapi' ? 'wechat_jsapi' : 'wechat_native'
}

export function buildPointsCheckoutBase(
  data: RegistrySnapshot,
  account: MpAccountRow,
  body: Record<string, unknown>,
  opts?: {
    channel?: MpPointsPayChannel
    payMode?: RegistryMpPointsCheckoutRequest['payMode']
  },
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

  const channel = opts?.channel ?? 'wechat'
  const payMode =
    opts?.payMode ??
    (channel === 'wechat' ? resolveWechatPayMode(body) : undefined)

  const now = new Date().toISOString()
  const outTradeNo = makeOutTradeNo()

  const checkout: RegistryMpPointsCheckoutRequest = {
    id: `mppc_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    role,
    accountId,
    lingqiId: lingqiId || undefined,
    registryTargetId: resolveRegistryTargetId(data, account, role) || undefined,
    displayName: displayName || undefined,
    points,
    amountCents,
    channel,
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

export function confirmPointsPayFromSnapshot(
  data: RegistrySnapshot,
  outTradeNo: string,
  opts?: { transactionId?: string; channel?: MpPointsPayChannel },
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
  const tx = String(opts?.transactionId || '').trim()
  const ch = opts?.channel || checkout.channel
  if (tx) {
    if (ch === 'alipay') checkout.alipayTradeNo = tx
    else if (ch === 'douyin') checkout.douyinOrderId = tx
    else checkout.wechatTransactionId = tx
  }

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

export const confirmPointsWechatPayFromSnapshot = confirmPointsPayFromSnapshot
