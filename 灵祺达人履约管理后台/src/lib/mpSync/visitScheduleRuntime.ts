import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { postMpRecruitmentAi } from '../mpApi'

export type VisitScheduleRow = {
  applicantId: string
  time: string
  storeName?: string
  tableNote?: string
}

async function postVisit(paths: string[], body: Record<string, unknown>) {
  let lastErr = 'request_failed'
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        lastErr = String(data.message || data.detail || data.error || `http_${res.status}`)
        if (/404|not_found/i.test(lastErr)) continue
        throw new Error(lastErr)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  throw new Error(lastErr)
}

export function parseVisitDayMs(timeStr: string): number {
  const s = String(timeStr || '').trim()
  if (!s) return 0
  const m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const t = new Date(y, mo, d).getTime()
    return Number.isFinite(t) ? t : 0
  }
  const t = Date.parse(s.replace(/\//g, '-'))
  return Number.isFinite(t) ? t : 0
}

export function isVisitCheckInDay(assignedVisitAt: string, nowMs = Date.now()): boolean {
  const dayMs = parseVisitDayMs(assignedVisitAt)
  if (!dayMs) return false
  const start = new Date(dayMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dayMs)
  end.setHours(23, 59, 59, 999)
  return nowMs >= start.getTime() && nowMs <= end.getTime()
}

export function readApplicantVisitFields(applicant: Record<string, unknown> | null | undefined) {
  const a = applicant || {}
  return {
    assignedVisitAt: String(a.assignedVisitAt || '').trim(),
    assignedVisitStore: String(a.assignedVisitStore || '').trim(),
    tableNote: String(a.tableNote || '').trim(),
    visitAssignmentStatus: String(a.visitAssignmentStatus || '').trim(),
    visitCheckInAt: String(a.visitCheckInAt || '').trim(),
    visitStatus: String(a.visitStatus || '').trim(),
    scheduleConfirmedAt: String(a.scheduleConfirmedAt || '').trim(),
  }
}

export async function setVisitSchedule(
  mpOrderId: string,
  payload: {
    mode?: 'manual' | 'ai'
    rows?: VisitScheduleRow[]
    aiRows?: { time: string; talentName: string; storeName?: string; tableNote?: string }[]
    visitSlots?: string[]
    category?: string
    shareTable?: boolean
    mealCount?: number
    tableSize?: number
    storeName?: string
    notify?: boolean
  },
) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-set', '/api/ops-sync/mp-visit-schedule-set'],
    { mpOrderId, ...payload },
  )
}

export async function confirmVisitSchedule(
  mpOrderId: string,
  applicantId: string,
  action: 'accept_selection' | 'confirm_assignment' | 'decline_assignment',
  reason?: string,
) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-confirm', '/api/ops-sync/mp-visit-schedule-confirm'],
    { mpOrderId, applicantId, action, reason },
  )
}

export async function visitCheckIn(mpOrderId: string, applicantId: string, method = 'manual') {
  return postVisit(
    ['/api/meoo-ops-mp-visit-checkin', '/api/ops-sync/mp-visit-checkin'],
    { mpOrderId, applicantId, method },
  )
}

/** 客户端规则排期（AI 失败时回退） */
export function generateClientRuleSchedule(
  selectedApplicants: Record<string, unknown>[],
  opts: {
    visitSlots: string[]
    storeName?: string
    shareTable?: boolean
    mealCount?: number
    tableSize?: number
    category?: string
  },
): VisitScheduleRow[] {
  const slots = (opts.visitSlots || []).filter(Boolean)
  if (!slots.length) slots.push('09:00-12:00', '14:00-17:00')
  const pool = [...selectedApplicants].sort((a, b) => {
    const fa = Number(a.followers) || 0
    const fb = Number(b.followers) || 0
    return fb - fa
  })
  const storeName = String(opts.storeName || '门店').trim()
  const mealCount = Math.max(1, Number(opts.mealCount) || 1)
  const tableSize = Math.max(2, Number(opts.tableSize) || 4)
  const shareTable = opts.shareTable !== false
  const base = new Date()
  base.setDate(base.getDate() + 1)
  return pool.map((a, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + Math.floor(i / slots.length))
    const slot = slots[i % slots.length]!
    const time = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${slot}`
    const tableNote = shareTable
      ? `拼桌 ${tableSize} 人/桌 · 餐食 ${mealCount} 份`
      : `单独探店 · 餐食 ${mealCount} 份`
    return {
      applicantId: String(a.id || ''),
      time,
      storeName,
      tableNote,
    }
  })
}

function applicantDisplayName(a: Record<string, unknown>): string {
  return String(a.platformNickname || a.name || a.platformAccount || a.id || '').trim()
}

function mapAiRowsToVisitRows(
  aiRows: { time: string; talentName: string; storeName?: string; tableNote?: string }[],
  pool: Record<string, unknown>[],
): VisitScheduleRow[] {
  const out: VisitScheduleRow[] = []
  for (const row of aiRows) {
    const name = String(row.talentName || '').trim()
    if (!name) continue
    const hit =
      pool.find((a) => applicantDisplayName(a) === name) ||
      pool.find(
        (a) =>
          applicantDisplayName(a).includes(name) || name.includes(applicantDisplayName(a)),
      )
    if (!hit) continue
    out.push({
      applicantId: String(hit.id),
      time: String(row.time || '').trim(),
      storeName: String(row.storeName || '').trim() || undefined,
      tableNote: String(row.tableNote || '').trim() || undefined,
    })
  }
  return out
}

/** LLM 探店排期（meoo-mp-recruitment-ai visit_schedule），失败回退规则引擎 */
export async function generateAiVisitSchedule(
  selectedApplicants: Record<string, unknown>[],
  opts: {
    visitSlots: string[]
    storeName?: string
    shareTable?: boolean
    mealCount?: number
    tableSize?: number
    category?: string
    title?: string
  },
): Promise<{ rows: VisitScheduleRow[]; source: 'ai' | 'rule' }> {
  const pool = (selectedApplicants || []).filter((a) => a && a.id)
  if (!pool.length) return { rows: [], source: 'rule' }
  const visitSlots = (opts.visitSlots || []).filter(Boolean)
  try {
    const res = (await postMpRecruitmentAi({
      mode: 'visit_schedule',
      context: {
        title: String(opts.title || '').trim(),
        storeName: opts.storeName,
        category: opts.category,
        visitSlots,
        shareTable: opts.shareTable,
        mealCount: opts.mealCount,
        tableSize: opts.tableSize,
        talents: pool.map((a) => ({
          id: String(a.id),
          nickname: applicantDisplayName(a),
          followers: a.followers ?? '',
          visitTimeSlot: String(a.visitTimeSlot || '').trim(),
          scheduleConfirmedAt: String(a.scheduleConfirmedAt || '').trim(),
        })),
      },
    })) as { rows?: { time: string; talentName: string; storeName?: string; tableNote?: string }[] }
    const mapped = mapAiRowsToVisitRows(Array.isArray(res.rows) ? res.rows : [], pool)
    if (mapped.length) return { rows: mapped, source: 'ai' }
  } catch {
    /* 回退规则 */
  }
  return {
    rows: generateClientRuleSchedule(pool, opts),
    source: 'rule',
  }
}
