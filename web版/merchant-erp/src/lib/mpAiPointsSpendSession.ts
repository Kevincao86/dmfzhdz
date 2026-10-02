import { createMpAuthRest, reconcileAccountPrFromRegistry, resolveSession } from './mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import {
  assertMpAiPointsAffordable,
  ensureMonthlyGiftPointsGranted,
  spendMpAiPointsWithSnapshot,
  type MpAiPointsSpendResult,
} from './mpAiPointsSpendCore.js'
import type { MpPointsUsageKind } from './mpPointsEconomics.js'
import { talentEvalMonthlyLimit, talentEvalQuotaDeniedMessage } from './mpMembershipQuota.js'
import { consumeTalentEvalQuota, peekTalentEvalQuota } from './talentEvalQuotaStore.js'

export type { MpAiPointsSpendResult }

/**
 * 星选小程序「积分充值/我的订单」展示的是注册表套餐桶+充值桶。
 * 扣费/预检必须与之对齐；禁止改扣 ERP 租户积分（否则界面 64 仍能用、余额不减）。
 */
export async function spendMpAiPointsForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
  opts: {
    kind: MpPointsUsageKind
    durationSec?: number
    motionImitate?: boolean
    idempotencyKey?: string
    note?: string
    roleHint?: MpLibraryRole | null
  },
): Promise<MpAiPointsSpendResult> {
  const t = String(token || '').trim()
  if (!t) {
    return { ok: false, error: 'not_found', message: '请先登录后再使用 AI 功能' }
  }
  const rest = createMpAuthRest(supabaseUrl, serviceRole)
  const sess = await resolveSession(rest, t)
  if (!sess?.account?.id) {
    return { ok: false, error: 'not_found', message: '登录已过期，请重新登录' }
  }
  const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  if (opts.kind === 'talent_eval') {
    const plan = talentEvalMonthlyLimit(data, account, { roleHint: opts.roleHint })
    const used = consumeTalentEvalQuota(String(account.id), plan.limit, plan.paid)
    if (!used.ok) {
      return {
        ok: false,
        error: 'not_found',
        message: talentEvalQuotaDeniedMessage(plan.paid),
        quotaLimit: used.limit,
        quotaRemaining: 0,
        quotaPaid: plan.paid,
      }
    }
    return {
      ok: true,
      pointsCharged: 0,
      newBalance: 0,
      quotaLimit: used.limit,
      quotaRemaining: used.remaining,
      quotaPaid: plan.paid,
    }
  }
  const result = spendMpAiPointsWithSnapshot(data, account, opts)
  if (result.ok && !result.already) {
    await io.save(data)
  }
  return result
}

export async function assertMpAiPointsAffordableForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
  kind: MpPointsUsageKind,
  opts?: { durationSec?: number; motionImitate?: boolean; roleHint?: MpLibraryRole | null },
): Promise<MpAiPointsSpendResult> {
  const t = String(token || '').trim()
  if (!t) {
    return { ok: false, error: 'not_found', message: '请先登录后再使用 AI 功能' }
  }
  const rest = createMpAuthRest(supabaseUrl, serviceRole)
  const sess = await resolveSession(rest, t)
  if (!sess?.account?.id) {
    return { ok: false, error: 'not_found', message: '登录已过期，请重新登录' }
  }
  const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  if (kind === 'talent_eval') {
    const plan = talentEvalMonthlyLimit(data, account, { roleHint: opts?.roleHint })
    const quota = peekTalentEvalQuota(String(account.id), plan.limit, plan.paid)
    if (quota.remaining <= 0) {
      return {
        ok: false,
        error: 'not_found',
        message: talentEvalQuotaDeniedMessage(plan.paid),
        quotaLimit: quota.limit,
        quotaRemaining: 0,
        quotaPaid: plan.paid,
      }
    }
    return {
      ok: true,
      pointsCharged: 0,
      newBalance: 0,
      quotaLimit: quota.limit,
      quotaRemaining: quota.remaining,
      quotaPaid: plan.paid,
    }
  }
  const gift = ensureMonthlyGiftPointsGranted(data, account, { roleHint: opts?.roleHint })
  const result = assertMpAiPointsAffordable(data, account, kind, opts)
  if (gift.granted > 0) {
    await io.save(data)
  }
  return result
}
