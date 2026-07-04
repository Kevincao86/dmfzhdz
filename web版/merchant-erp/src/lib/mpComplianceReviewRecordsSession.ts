import { createMpAuthRest, reconcileAccountPrFromRegistry, resolveSession } from './mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import {
  appendMpComplianceReviewRecord,
  listAccountMpComplianceReviewRecords,
  MP_COMPLIANCE_REVIEW_RETENTION_DAYS,
} from './mpComplianceReviewRecordsCore.js'
import type { RegistryMpComplianceReviewRecord } from './opsRegistryTypes.js'

export async function saveMpComplianceReviewRecordForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
  input: {
    mode: 'video' | 'script'
    label: string
    platform: string
    verdict: string
    statusText: string
    statusTone: string
    detail: string
    resultJson: string
    pointsCharged?: number
    idempotencyKey?: string
  },
): Promise<{ ok: true; record: RegistryMpComplianceReviewRecord; already?: boolean } | { ok: false; message: string }> {
  const t = String(token || '').trim()
  if (!t) return { ok: false, message: '请先登录' }
  const rest = createMpAuthRest(supabaseUrl, serviceRole)
  const sess = await resolveSession(rest, t)
  if (!sess?.account?.id) return { ok: false, message: '登录已过期' }
  const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const idem = String(input.idempotencyKey || '').trim()
  if (idem) {
    const hit = (data.mpComplianceReviewRecords ?? []).find(
      (row) =>
        String(row.accountId || '') === String(account.id || '') &&
        String(row.idempotencyKey || '') === idem,
    )
    if (hit) return { ok: true, record: hit, already: true }
  }
  const record = appendMpComplianceReviewRecord(data, account, input)
  await io.save(data)
  return { ok: true, record, already: false }
}

export async function listMpComplianceReviewRecordsForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
): Promise<
  | {
      ok: true
      records: RegistryMpComplianceReviewRecord[]
      retentionDays: number
    }
  | { ok: false; message: string }
> {
  const t = String(token || '').trim()
  if (!t) return { ok: false, message: '请先登录' }
  const rest = createMpAuthRest(supabaseUrl, serviceRole)
  const sess = await resolveSession(rest, t)
  if (!sess?.account?.id) return { ok: false, message: '登录已过期' }
  const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const beforeLen = (data.mpComplianceReviewRecords ?? []).length
  const records = listAccountMpComplianceReviewRecords(data, account)
  const afterLen = (data.mpComplianceReviewRecords ?? []).length
  if (afterLen < beforeLen) {
    try {
      await io.save(data)
    } catch {
      /* prune 失败不阻断 */
    }
  }
  return { ok: true, records, retentionDays: MP_COMPLIANCE_REVIEW_RETENTION_DAYS }
}
