/**
 * 星选爆款 Brief 生成记录（按账号，保留近 7 天）。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryMpBriefGenRecord, RegistrySnapshot } from './opsRegistryTypes.js'

export const MP_BRIEF_GEN_RETENTION_DAYS = 7
export const MP_BRIEF_GEN_RETENTION_MS = MP_BRIEF_GEN_RETENTION_DAYS * 24 * 60 * 60 * 1000
export const MP_BRIEF_GEN_MAX_ROWS_GLOBAL = 600
export const MP_BRIEF_GEN_MAX_ROWS_PER_ACCOUNT = 80
export const MP_BRIEF_GEN_MAX_RESULT_CHARS = 120_000

function accountIdOf(account: MpAccountRow): string {
  return String(account.id || '').trim()
}

function recordTimeMs(row: RegistryMpBriefGenRecord): number {
  const t = new Date(String(row.createdAt || '')).getTime()
  return Number.isFinite(t) ? t : 0
}

function withinRetention(row: RegistryMpBriefGenRecord, nowMs: number): boolean {
  const t = recordTimeMs(row)
  if (!t) return false
  return nowMs - t <= MP_BRIEF_GEN_RETENTION_MS
}

/** 清除全库超过 7 天的记录 */
export function pruneMpBriefGenRecordsInSnapshot(
  data: RegistrySnapshot,
  nowMs = Date.now(),
): { removed: number } {
  const prev = data.mpBriefGenRecords ?? []
  if (!prev.length) return { removed: 0 }
  const next = prev.filter((row) => withinRetention(row, nowMs)).slice(0, MP_BRIEF_GEN_MAX_ROWS_GLOBAL)
  const removed = prev.length - next.length
  if (removed > 0 || next.length !== prev.length) {
    data.mpBriefGenRecords = next
  }
  return { removed }
}

function capAccountRows(rows: RegistryMpBriefGenRecord[], accountId: string): RegistryMpBriefGenRecord[] {
  const id = String(accountId || '').trim()
  if (!id) return rows
  const mine: RegistryMpBriefGenRecord[] = []
  const other: RegistryMpBriefGenRecord[] = []
  for (const row of rows) {
    if (String(row.accountId || '').trim() === id) mine.push(row)
    else other.push(row)
  }
  mine.sort((a, b) => recordTimeMs(b) - recordTimeMs(a))
  return [...mine.slice(0, MP_BRIEF_GEN_MAX_ROWS_PER_ACCOUNT), ...other]
}

export function appendMpBriefGenRecord(
  data: RegistrySnapshot,
  account: MpAccountRow,
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
): RegistryMpBriefGenRecord {
  const accountId = accountIdOf(account)
  if (!accountId) {
    throw new Error('account_invalid')
  }
  const nowMs = Date.now()
  pruneMpBriefGenRecordsInSnapshot(data, nowMs)

  const idem = String(input.idempotencyKey || '').trim()
  if (idem) {
    const hit = (data.mpBriefGenRecords ?? []).find(
      (row) => String(row.accountId || '') === accountId && String(row.idempotencyKey || '') === idem,
    )
    if (hit) return hit
  }

  const resultJson = String(input.resultJson || '').slice(0, MP_BRIEF_GEN_MAX_RESULT_CHARS)
  const fullMarkdown = String(input.fullMarkdown || '').slice(0, MP_BRIEF_GEN_MAX_RESULT_CHARS)
  const row: RegistryMpBriefGenRecord = {
    id: `mpbrief_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    accountId,
    idempotencyKey: idem || undefined,
    orderId: String(input.orderId || '').trim(),
    orderTitle: String(input.orderTitle || '').trim().slice(0, 200),
    platform: String(input.platform || '').trim().slice(0, 32),
    style: String(input.style || '').trim().slice(0, 64),
    outputMode: String(input.outputMode || 'video_brief').trim().slice(0, 32),
    resultJson,
    fullMarkdown,
    createdAt: new Date(nowMs).toISOString(),
  }

  const prev = data.mpBriefGenRecords ?? []
  data.mpBriefGenRecords = capAccountRows([row, ...prev], accountId).slice(0, MP_BRIEF_GEN_MAX_ROWS_GLOBAL)
  return row
}

export function listAccountMpBriefGenRecords(
  data: RegistrySnapshot,
  account: MpAccountRow,
): RegistryMpBriefGenRecord[] {
  const accountId = accountIdOf(account)
  if (!accountId) return []
  pruneMpBriefGenRecordsInSnapshot(data)
  return (data.mpBriefGenRecords ?? [])
    .filter((row) => String(row.accountId || '').trim() === accountId)
    .sort((a, b) => recordTimeMs(b) - recordTimeMs(a))
    .slice(0, MP_BRIEF_GEN_MAX_ROWS_PER_ACCOUNT)
}
