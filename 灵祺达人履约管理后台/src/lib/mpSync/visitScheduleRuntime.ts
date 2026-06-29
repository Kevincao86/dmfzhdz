import { apiUrl } from '../mpApiBase'
import { getToken } from '../mpSession'
import { postMpRecruitmentAi } from '../mpApi'

export type VisitScheduleRow = {
  applicantId: string
  time: string
  storeName?: string
  tableNote?: string
  tableGroupId?: string
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
    confirmEffective?: boolean
    notifyApplicantIds?: string[]
    datesOnly?: boolean
    visitPlanDates?: { date: string; slots: string[] }[]
  },
) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-set', '/api/ops-sync/mp-visit-schedule-set'],
    { mpOrderId, ...payload },
  )
}

export async function updateVisitPlan(
  mpOrderId: string,
  applicantId: string,
  visitDate: string,
  visitTimeSlot: string,
) {
  return confirmVisitSchedule(mpOrderId, applicantId, 'update_visit_plan', '', {
    visitDate,
    visitTimeSlot,
  })
}

export async function confirmVisitSchedule(
  mpOrderId: string,
  applicantId: string,
  action: 'accept_selection' | 'confirm_assignment' | 'decline_assignment' | 'update_visit_plan',
  reason?: string,
  opts?: { visitDate?: string; visitTimeSlot?: string; forceConfirm?: boolean },
) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-confirm', '/api/ops-sync/mp-visit-schedule-confirm'],
    {
      mpOrderId,
      applicantId,
      action,
      reason,
      visitDate: opts?.visitDate,
      visitTimeSlot: opts?.visitTimeSlot,
      forceConfirm: opts?.forceConfirm === true,
    },
  )
}

const SCHEDULE_CONFLICT_PROMPT =
  '该日期时段已有其它探店档期，继续提交可能存在爽约风险。是否仍要提交探店意向？'

export function isScheduleConflictError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e || '')
  return /schedule_conflict|探店档期|爽约风险/i.test(msg)
}

function promptScheduleConflictContinue(): boolean {
  return window.confirm(`${SCHEDULE_CONFLICT_PROMPT}\n\n点「确定」继续提交，点「取消」重新选择时间。`)
}

export async function confirmVisitScheduleWithConflictPrompt(
  mpOrderId: string,
  applicantId: string,
  action: 'accept_selection' | 'confirm_assignment' | 'decline_assignment' | 'update_visit_plan',
  reason?: string,
  opts?: { visitDate?: string; visitTimeSlot?: string; forceConfirm?: boolean },
) {
  try {
    return await confirmVisitSchedule(mpOrderId, applicantId, action, reason, opts)
  } catch (e) {
    if (opts?.forceConfirm || !isScheduleConflictError(e)) throw e
    if (!promptScheduleConflictContinue()) {
      const err = new Error('cancelled') as Error & { code?: string }
      err.code = 'schedule_conflict_cancelled'
      throw err
    }
    return confirmVisitSchedule(mpOrderId, applicantId, action, reason, { ...opts, forceConfirm: true })
  }
}

export const DEFAULT_VISIT_SLOTS = ['09:00-12:00', '14:00-17:00', '17:00-20:00']

export function padVisitTimeHm(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return ''
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`
}

/** 07:00–23:30 每 30 分钟（Web 下拉与小程序 time picker 粒度对齐） */
export function buildVisitHmSelectOptions(): string[] {
  const out: string[] = []
  for (let h = 7; h <= 23; h++) {
    for (const m of [0, 30]) {
      if (h === 23 && m > 0) break
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
}

export function filterVisitEndTimeOptions(start: string, options = buildVisitHmSelectOptions()): string[] {
  const sm = visitTimeMinutes(start)
  if (sm < 0) return options.slice(1)
  return options.filter((t) => visitTimeMinutes(t) > sm)
}

export function parseVisitTimeRange(slot: string): { start: string; end: string } {
  const s = String(slot || '').trim()
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (m) {
    return { start: padVisitTimeHm(m[1]!) || '09:00', end: padVisitTimeHm(m[2]!) || '12:00' }
  }
  return { start: '09:00', end: '12:00' }
}

export function buildVisitTimeRange(start: string, end: string): string {
  const s = padVisitTimeHm(start)
  const e = padVisitTimeHm(end)
  if (!s || !e) return ''
  return `${s}-${e}`
}

function visitTimeMinutes(raw: string): number {
  const t = padVisitTimeHm(raw)
  if (!t) return -1
  const p = t.split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

export function formatScheduleTableNote(
  shareTable: boolean,
  opts?: { tableSize?: number; mealCount?: number; tableIndex?: number; tableCount?: number },
): string {
  if (shareTable) {
    const tableSize = Math.max(1, opts?.tableSize || 4)
    const mealCount = Math.max(1, opts?.mealCount || 1)
    const tIdx = (opts?.tableIndex ?? 0) + 1
    const count = opts?.tableCount || 1
    return `拼桌 ${tableSize} 人/桌 · 餐食 ${mealCount} 份 · 第${tIdx}桌${count > 1 ? `（${count}人）` : ''}`
  }
  return '单独探店'
}

export function isValidVisitTimeRange(start: string, end: string): boolean {
  const s = padVisitTimeHm(start)
  const e = padVisitTimeHm(end)
  if (!s || !e) return false
  return visitTimeMinutes(e) > visitTimeMinutes(s)
}

export function resolveVisitSlotOptions(mp: Record<string, unknown> | null | undefined): string[] {
  if (!mp) return [...DEFAULT_VISIT_SLOTS]
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}) as Record<
    string,
    unknown
  >
  const scheduleMeta =
    meta.visitScheduleMeta && typeof meta.visitScheduleMeta === 'object'
      ? (meta.visitScheduleMeta as Record<string, unknown>)
      : {}
  const fromSchedule = Array.isArray(scheduleMeta.visitSlots) ? scheduleMeta.visitSlots : []
  const fromOrder = Array.isArray(mp.visitSlots) ? mp.visitSlots : []
  const slots: string[] = []
  const seen = new Set<string>()
  for (const raw of [...fromOrder, ...fromSchedule, ...DEFAULT_VISIT_SLOTS]) {
    const s = String(raw || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    slots.push(s)
  }
  return slots.length ? slots : [...DEFAULT_VISIT_SLOTS]
}

export function defaultVisitPlanDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function visitCheckIn(mpOrderId: string, applicantId: string, method = 'manual') {
  return postVisit(
    ['/api/meoo-ops-mp-visit-checkin', '/api/ops-sync/mp-visit-checkin'],
    { mpOrderId, applicantId, method },
  )
}

/** 客户端规则排期（AI 失败时回退） */
function normalizeIsoDateKey(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

function normalizeSlotCompareKey(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (m) {
    const pad = (t: string) => {
      const p = t.split(':')
      return `${String(Number(p[0])).padStart(2, '0')}:${p[1]}`
    }
    return `${pad(m[1])}-${pad(m[2])}`
  }
  return s.replace(/\s+/g, ' ')
}

function pickBestVisitSlot(preferred: string, visitSlots: string[], fallbackIdx: number): string {
  const slots = (visitSlots || []).filter(Boolean)
  if (!slots.length) return ''
  const pref = String(preferred || '').trim()
  if (!pref) return slots[fallbackIdx % slots.length]!
  const prefParts = pref.match(/^(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\s+(.+)$/)
  const prefDate = prefParts ? normalizeIsoDateKey(prefParts[1]) : ''
  const prefSlot = normalizeSlotCompareKey(prefParts ? prefParts[2] : pref)
  let best = slots[fallbackIdx % slots.length]!
  let bestScore = -1
  for (const slot of slots) {
    const m = slot.match(/^(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\s+(.+)$/)
    const slotDate = m ? normalizeIsoDateKey(m[1]) : ''
    const slotKey = normalizeSlotCompareKey(m ? m[2] : slot)
    let score = 0
    if (prefDate && slotDate === prefDate) score += 10
    if (prefSlot && slotKey === prefSlot) score += 10
    if (prefDate && prefSlot && slotDate === prefDate && slotKey === prefSlot) score += 20
    if (score > bestScore) {
      bestScore = score
      best = slot
    }
  }
  return best
}

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
  const usedSlotCounts = new Map<string, number>()
  return pool.map((a, i) => {
    const preferred = resolveApplicantVisitPreference(a)
    let time = pickBestVisitSlot(preferred, slots, i)
    if (!time) time = slots[i % slots.length]!
    const slotKey = normalizeSlotCompareKey(time.includes(' ') ? time.split(/\s+/).slice(1).join(' ') : time)
    const used = usedSlotCounts.get(slotKey) || 0
    usedSlotCounts.set(slotKey, used + 1)
    const tableNote = formatScheduleTableNote(shareTable, {
      tableSize,
      mealCount,
      tableIndex: Math.floor(used / Math.max(1, tableSize)),
      tableCount: Math.min(tableSize, used + 1),
    })
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

function resolveApplicantVisitPreference(a: Record<string, unknown>): string {
  return String(a.talentPreferredVisitAt || a.visitTimeSlot || '').trim()
}

function mapAiRowsToVisitRows(
  aiRows: { time: string; talentName: string; talentId?: string; id?: string; storeName?: string; tableNote?: string }[],
  pool: Record<string, unknown>[],
): VisitScheduleRow[] {
  const out: VisitScheduleRow[] = []
  const used = new Set<string>()
  for (const row of aiRows) {
    const talentId = String(row.talentId || row.id || '').trim()
    const name = String(row.talentName || '').trim()
    let hit: Record<string, unknown> | undefined
    if (talentId) {
      hit = pool.find((a) => String(a.id) === talentId)
    }
    if (!hit && name) {
      hit =
        pool.find((a) => applicantDisplayName(a) === name) ||
        pool.find(
          (a) =>
            applicantDisplayName(a).includes(name) || name.includes(applicantDisplayName(a)),
        )
    }
    if (!hit || used.has(String(hit.id))) continue
    used.add(String(hit.id))
    out.push({
      applicantId: String(hit.id),
      time: String(row.time || '').trim(),
      storeName: String(row.storeName || '').trim() || undefined,
      tableNote: String(row.tableNote || '').trim() || undefined,
    })
  }
  if (!out.length && aiRows.length === pool.length) {
    return pool.map((a, i) => {
      const row = aiRows[i]!
      return {
        applicantId: String(a.id || ''),
        time: String(row.time || '').trim(),
        storeName: String(row.storeName || '').trim() || undefined,
        tableNote: String(row.tableNote || '').trim() || undefined,
      }
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
          visitTimeSlot: resolveApplicantVisitPreference(a),
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

export type VisitPlanDateRow = { date: string; slots: string[] }

function readVisitScheduleMeta(mp: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!mp?.mpPublishMeta || typeof mp.mpPublishMeta !== 'object') return {}
  const sm = (mp.mpPublishMeta as Record<string, unknown>).visitScheduleMeta
  return sm && typeof sm === 'object' && !Array.isArray(sm) ? (sm as Record<string, unknown>) : {}
}

export function normalizeVisitPlanDateKey(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

export function readVisitPlanDates(mp: Record<string, unknown> | null | undefined): VisitPlanDateRow[] {
  const rows = readVisitScheduleMeta(mp).visitPlanDates
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const date = normalizeVisitPlanDateKey(String((row as Record<string, unknown>).date || '').trim())
      const slots = (Array.isArray((row as Record<string, unknown>).slots)
        ? ((row as Record<string, unknown>).slots as unknown[])
        : []
      )
        .map((s) => String(s || '').trim())
        .filter(Boolean)
      return date && slots.length ? { date, slots } : null
    })
    .filter(Boolean) as VisitPlanDateRow[]
}

export function isVisitPlanDatesConfirmed(mp: Record<string, unknown> | null | undefined): boolean {
  return Boolean(String(readVisitScheduleMeta(mp).scheduleDatesConfirmedAt || '').trim())
}

/** PR 已确认可探店日期：达人只能从 PR 设定的日期/时段中选择 */
export function hasLockedVisitPlanDates(mp: Record<string, unknown> | null | undefined): boolean {
  return readVisitPlanDates(mp).length > 0 && isVisitPlanDatesConfirmed(mp)
}

export function resolveDefaultTalentVisitPlanDate(mp: Record<string, unknown> | null | undefined): string {
  const planRows = readVisitPlanDates(mp)
  if (hasLockedVisitPlanDates(mp) && planRows[0]?.date) {
    return normalizeVisitPlanDateKey(planRows[0].date) || planRows[0].date
  }
  return defaultVisitPlanDate()
}

export async function confirmVisitPlanDates(
  mpOrderId: string,
  payload: {
    visitPlanDates: VisitPlanDateRow[]
    category?: string
    shareTable?: boolean
    mealCount?: number
    tableSize?: number
  },
) {
  return setVisitSchedule(mpOrderId, { datesOnly: true, ...payload })
}
