import { createMpAuthRest, reconcileAccountPrFromRegistry, resolveSession } from './mpAccountAuth.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import {
  appendMpBriefGenRecord,
  listAccountMpBriefGenRecords,
  MP_BRIEF_GEN_RETENTION_DAYS,
} from './mpBriefGenRecordsCore.js'
import type { RegistryMpBriefGenRecord } from './opsRegistryTypes.js'

export async function saveMpBriefGenRecordForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
  input: {
    orderId: string
    orderTitle: string
    platform: string
    style: string
    outputMode: string
    resultJson: string
    fullMarkdown: string
    idempotencyKey?: string
  },
): Promise<{ ok: true; record: RegistryMpBriefGenRecord; already?: boolean } | { ok: false; message: string }> {
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
    const hit = (data.mpBriefGenRecords ?? []).find(
      (row) =>
        String(row.accountId || '') === String(account.id || '') &&
        String(row.idempotencyKey || '') === idem,
    )
    if (hit) return { ok: true, record: hit, already: true }
  }
  const record = appendMpBriefGenRecord(data, account, input)
  await io.save(data)
  return { ok: true, record, already: false }
}

export async function listMpBriefGenRecordsForSessionToken(
  supabaseUrl: string,
  serviceRole: string,
  token: string,
): Promise<{
  ok: true
  records: RegistryMpBriefGenRecord[]
  retentionDays: number
} | { ok: false; message: string }> {
  const t = String(token || '').trim()
  if (!t) return { ok: false, message: '请先登录' }
  const rest = createMpAuthRest(supabaseUrl, serviceRole)
  const sess = await resolveSession(rest, t)
  if (!sess?.account?.id) return { ok: false, message: '登录已过期' }
  const account = await reconcileAccountPrFromRegistry(supabaseUrl, serviceRole, sess.account)
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const beforeLen = (data.mpBriefGenRecords ?? []).length
  const records = listAccountMpBriefGenRecords(data, account)
  const afterLen = (data.mpBriefGenRecords ?? []).length
  if (afterLen < beforeLen) {
    try {
      await io.save(data)
    } catch {
      /* 列表 prune 失败不阻断 */
    }
  }
  return { ok: true, records, retentionDays: MP_BRIEF_GEN_RETENTION_DAYS }
}
