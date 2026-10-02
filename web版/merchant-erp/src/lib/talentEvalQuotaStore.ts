import fs from 'node:fs'
import path from 'node:path'
import { currentGiftMonthKey } from './mpAiPointsBuckets.js'

type QuotaRow = { month: string; used: number }

function quotaDir() {
  return path.join(process.cwd(), 'data', 'talent-eval-quota')
}

function quotaFile(accountId: string) {
  const safe = String(accountId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown'
  return path.join(quotaDir(), `${safe}.json`)
}

function readRow(accountId: string): QuotaRow {
  try {
    const raw = fs.readFileSync(quotaFile(accountId), 'utf8')
    const parsed = JSON.parse(raw) as QuotaRow
    if (parsed && typeof parsed.month === 'string' && Number.isFinite(Number(parsed.used))) {
      return { month: parsed.month, used: Math.max(0, Math.floor(Number(parsed.used))) }
    }
  } catch {
    /* 还没有记录 */
  }
  return { month: '', used: 0 }
}

export function peekTalentEvalQuota(accountId: string, limit: number, paid: boolean) {
  const month = currentGiftMonthKey()
  const row = readRow(accountId)
  const used = row.month === month ? row.used : 0
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    paid,
  }
}

export function consumeTalentEvalQuota(accountId: string, limit: number, paid: boolean) {
  const month = currentGiftMonthKey()
  const row = readRow(accountId)
  const used = row.month === month ? row.used : 0
  if (used >= limit) {
    return { ok: false as const, limit, used, remaining: 0, paid }
  }
  const next = used + 1
  fs.mkdirSync(quotaDir(), { recursive: true })
  fs.writeFileSync(quotaFile(accountId), JSON.stringify({ month, used: next }))
  return { ok: true as const, limit, used: next, remaining: Math.max(0, limit - next), paid }
}
