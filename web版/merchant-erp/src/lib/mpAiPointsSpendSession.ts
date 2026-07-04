import { createMpAuthRest, reconcileAccountPrFromRegistry, resolveSession } from './mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import {
  assertMpAiPointsAffordable,
  ensureMonthlyGiftPointsGranted,
  spendMpAiPointsWithSnapshot,
  type MpAiPointsSpendResult,
} from './mpAiPointsSpendCore.js'
import type { MpPointsUsageKind } from './mpPointsEconomics.js'

export type { MpAiPointsSpendResult }

import type { MpLibraryRole } from './mpMembershipCatalog.js'
import type { MpPointsUsageKind } from './mpPointsEconomics.js'

export async function spendMpAiPointsForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
  opts: {
    kind: MpPointsUsageKind
    durationSec?: number
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
  opts?: { durationSec?: number; roleHint?: MpLibraryRole | null },
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
  const gift = ensureMonthlyGiftPointsGranted(data, account, { roleHint: opts?.roleHint })
  const result = assertMpAiPointsAffordable(data, account, kind, opts)
  if (gift.granted > 0) {
    await io.save(data)
  }
  return result
}
