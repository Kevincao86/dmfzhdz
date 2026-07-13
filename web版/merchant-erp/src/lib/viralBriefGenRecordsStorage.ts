import {
  MP_BRIEF_GEN_MAX_ROWS_PER_ACCOUNT,
  MP_BRIEF_GEN_RETENTION_DAYS,
  MP_BRIEF_GEN_RETENTION_MS,
} from './mpBriefGenRecordsCore'
import { tenantLocalKey } from './tenantLocalState'

export type ErpBriefGenRecordRow = {
  id: string
  orderId: string
  orderTitle: string
  platform: string
  style: string
  outputMode: string
  resultJson: string
  fullMarkdown: string
  createdAt: string
}

const ERP_BRIEF_GEN_RECORDS_KEY = 'meoo_viral_brief_gen_records'

function recordsKey(): string {
  return tenantLocalKey(ERP_BRIEF_GEN_RECORDS_KEY)
}

function recordTimeMs(row: ErpBriefGenRecordRow): number {
  const t = new Date(String(row.createdAt || '')).getTime()
  return Number.isFinite(t) ? t : 0
}

function pruneErpBriefGenRecords(rows: ErpBriefGenRecordRow[], nowMs = Date.now()): ErpBriefGenRecordRow[] {
  return rows
    .filter((row) => {
      const t = recordTimeMs(row)
      return t > 0 && nowMs - t <= MP_BRIEF_GEN_RETENTION_MS
    })
    .sort((a, b) => recordTimeMs(b) - recordTimeMs(a))
    .slice(0, MP_BRIEF_GEN_MAX_ROWS_PER_ACCOUNT)
}

function readErpBriefGenRecordsRaw(): ErpBriefGenRecordRow[] {
  try {
    const raw = window.localStorage.getItem(recordsKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as ErpBriefGenRecordRow[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeErpBriefGenRecords(rows: ErpBriefGenRecordRow[]): void {
  window.localStorage.setItem(recordsKey(), JSON.stringify(pruneErpBriefGenRecords(rows)))
}

export function listErpBriefGenRecords(): {
  records: ErpBriefGenRecordRow[]
  retentionDays: number
} {
  const records = pruneErpBriefGenRecords(readErpBriefGenRecordsRaw())
  writeErpBriefGenRecords(records)
  return { records, retentionDays: MP_BRIEF_GEN_RETENTION_DAYS }
}

export function appendErpBriefGenRecord(opts: {
  orderId: string
  orderTitle: string
  platform: string
  style: string
  outputMode: string
  resultJson: string
  fullMarkdown: string
  idempotencyKey?: string
}): void {
  const prev = pruneErpBriefGenRecords(readErpBriefGenRecordsRaw())
  const idem = opts.idempotencyKey?.trim()
  if (idem) {
    const hit = prev.find((row) => row.id === idem)
    if (hit) return
  }
  const row: ErpBriefGenRecordRow = {
    id: idem || `brief-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    orderId: opts.orderId,
    orderTitle: opts.orderTitle,
    platform: opts.platform,
    style: opts.style,
    outputMode: opts.outputMode,
    resultJson: opts.resultJson,
    fullMarkdown: opts.fullMarkdown,
    createdAt: new Date().toISOString(),
  }
  writeErpBriefGenRecords([row, ...prev])
}
