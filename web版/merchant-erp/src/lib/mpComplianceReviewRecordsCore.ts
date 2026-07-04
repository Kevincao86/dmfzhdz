/**
 * 星选 AI 合规检核记录（文稿/短视频，按账号，保留近 7 天）。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryMpComplianceReviewRecord, RegistrySnapshot } from './opsRegistryTypes.js'

export const MP_COMPLIANCE_REVIEW_RETENTION_DAYS = 7
export const MP_COMPLIANCE_REVIEW_RETENTION_MS = MP_COMPLIANCE_REVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000
export const MP_COMPLIANCE_REVIEW_MAX_ROWS_GLOBAL = 600
export const MP_COMPLIANCE_REVIEW_MAX_ROWS_PER_ACCOUNT = 80
export const MP_COMPLIANCE_REVIEW_MAX_RESULT_CHARS = 80_000

function accountIdOf(account: MpAccountRow): string {
  return String(account.id || '').trim()
}

function recordTimeMs(row: RegistryMpComplianceReviewRecord): number {
  const t = new Date(String(row.createdAt || '')).getTime()
  return Number.isFinite(t) ? t : 0
}

function withinRetention(row: RegistryMpComplianceReviewRecord, nowMs: number): boolean {
  const t = recordTimeMs(row)
  if (!t) return false
  return nowMs - t <= MP_COMPLIANCE_REVIEW_RETENTION_MS
}

export function pruneMpComplianceReviewRecordsInSnapshot(
  data: RegistrySnapshot,
  nowMs = Date.now(),
): { removed: number } {
  const prev = data.mpComplianceReviewRecords ?? []
  if (!prev.length) return { removed: 0 }
  const next = prev.filter((row) => withinRetention(row, nowMs)).slice(0, MP_COMPLIANCE_REVIEW_MAX_ROWS_GLOBAL)
  const removed = prev.length - next.length
  if (removed > 0 || next.length !== prev.length) {
    data.mpComplianceReviewRecords = next
  }
  return { removed }
}

function capAccountRows(
  rows: RegistryMpComplianceReviewRecord[],
  accountId: string,
): RegistryMpComplianceReviewRecord[] {
  const id = String(accountId || '').trim()
  if (!id) return rows
  const mine: RegistryMpComplianceReviewRecord[] = []
  const other: RegistryMpComplianceReviewRecord[] = []
  for (const row of rows) {
    if (String(row.accountId || '').trim() === id) mine.push(row)
    else other.push(row)
  }
  mine.sort((a, b) => recordTimeMs(b) - recordTimeMs(a))
  return [...mine.slice(0, MP_COMPLIANCE_REVIEW_MAX_ROWS_PER_ACCOUNT), ...other]
}

export function appendMpComplianceReviewRecord(
  data: RegistrySnapshot,
  account: MpAccountRow,
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
): RegistryMpComplianceReviewRecord {
  const accountId = accountIdOf(account)
  if (!accountId) throw new Error('account_invalid')
  const nowMs = Date.now()
  pruneMpComplianceReviewRecordsInSnapshot(data, nowMs)

  const idem = String(input.idempotencyKey || '').trim()
  if (idem) {
    const hit = (data.mpComplianceReviewRecords ?? []).find(
      (row) => String(row.accountId || '') === accountId && String(row.idempotencyKey || '') === idem,
    )
    if (hit) return hit
  }

  const mode = input.mode === 'video' ? 'video' : 'script'
  const row: RegistryMpComplianceReviewRecord = {
    id: `mpcr_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    accountId,
    idempotencyKey: idem || undefined,
    mode,
    label: String(input.label || '').trim().slice(0, 200) || '未命名',
    platform: String(input.platform || '').trim().slice(0, 32),
    verdict: String(input.verdict || 'normal').trim().slice(0, 32),
    statusText: String(input.statusText || '').trim().slice(0, 200),
    statusTone: String(input.statusTone || '').trim().slice(0, 16),
    detail: String(input.detail || '').trim().slice(0, 4000),
    resultJson: String(input.resultJson || '').slice(0, MP_COMPLIANCE_REVIEW_MAX_RESULT_CHARS),
    pointsCharged:
      typeof input.pointsCharged === 'number' && Number.isFinite(input.pointsCharged)
        ? Math.max(0, Math.floor(input.pointsCharged))
        : undefined,
    createdAt: new Date(nowMs).toISOString(),
  }

  const prev = data.mpComplianceReviewRecords ?? []
  data.mpComplianceReviewRecords = capAccountRows([row, ...prev], accountId).slice(
    0,
    MP_COMPLIANCE_REVIEW_MAX_ROWS_GLOBAL,
  )
  return row
}

export function listAccountMpComplianceReviewRecords(
  data: RegistrySnapshot,
  account: MpAccountRow,
): RegistryMpComplianceReviewRecord[] {
  const accountId = accountIdOf(account)
  if (!accountId) return []
  pruneMpComplianceReviewRecordsInSnapshot(data)
  return (data.mpComplianceReviewRecords ?? [])
    .filter((row) => String(row.accountId || '').trim() === accountId)
    .sort((a, b) => recordTimeMs(b) - recordTimeMs(a))
    .slice(0, MP_COMPLIANCE_REVIEW_MAX_ROWS_PER_ACCOUNT)
}
