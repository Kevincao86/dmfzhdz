import { isIceMpOrder } from '../mpSync/iceOrderDetect'

export type OrderCalendarEventKind = 'visit' | 'plan_slot' | 'deadline'

export type OrderCalendarEvent = {
  id: string
  dateKey: string
  dayMs: number
  kind: OrderCalendarEventKind
  mpOrderId: string
  orderTitle: string
  storeName: string
  platform?: string
  applicantId?: string
  applicantName?: string
  timeLabel?: string
  statusLabel: string
  visitStatus?: string
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

export function dateKeyFromMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateKeyFromIsoOrSlash(raw: string): string | null {
  const ms = parseVisitDayMs(raw)
  if (!ms) return null
  return dateKeyFromMs(ms)
}

function readVisitPlanDates(mp: Record<string, unknown>): Array<{ date: string; slots?: string[] }> {
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  const vs = (meta.visitScheduleMeta && typeof meta.visitScheduleMeta === 'object'
    ? meta.visitScheduleMeta
    : {}) as Record<string, unknown>
  const rows = vs.visitPlanDates
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const date = String(r.date || '').trim()
      if (!date) return null
      const slots = Array.isArray(r.slots)
        ? r.slots.map((s) => String(s || '').trim()).filter(Boolean)
        : []
      return { date, slots }
    })
    .filter(Boolean) as Array<{ date: string; slots?: string[] }>
}

function visitStatusLabel(status: string, checkInAt: string): string {
  if (checkInAt) return '已签到'
  if (status === 'checked_in') return '已签到'
  if (status === 'completed') return '已完成'
  if (status === 'no_show') return '未到店'
  if (status === 'scheduled') return '待探店'
  return '待探店'
}

function pushEvent(
  out: OrderCalendarEvent[],
  seen: Set<string>,
  evt: Omit<OrderCalendarEvent, 'dateKey' | 'dayMs'> & { dateRaw: string },
) {
  const dayMs = parseVisitDayMs(evt.dateRaw)
  if (!dayMs) return
  const dateKey = dateKeyFromMs(dayMs)
  const id = evt.id
  if (seen.has(id)) return
  seen.add(id)
  out.push({
    ...evt,
    dateKey,
    dayMs,
  })
}

export function aggregatePrOrderCalendarEvents(
  mpOrders: Array<Record<string, unknown>>,
): OrderCalendarEvent[] {
  const out: OrderCalendarEvent[] = []
  const seen = new Set<string>()

  for (const mp of mpOrders || []) {
    if (!mp || isIceMpOrder(mp)) continue
    const mpOrderId = String(mp.id || '').trim()
    if (!mpOrderId) continue
    const orderTitle = String(mp.title || mp.storeName || mpOrderId).trim()
    const storeName = String(mp.storeName || mp.title || '').trim()
    const platform = String(mp.platform || '').trim()

    const deadline = String(mp.deadline || '').trim()
    if (deadline) {
      pushEvent(out, seen, {
        id: `${mpOrderId}:deadline`,
        kind: 'deadline',
        mpOrderId,
        orderTitle,
        storeName,
        platform,
        statusLabel: '交片截止',
        dateRaw: deadline,
        timeLabel: '截止',
      })
    }

    for (const row of readVisitPlanDates(mp)) {
      const slots = row.slots?.length ? row.slots.join('、') : '全天'
      pushEvent(out, seen, {
        id: `${mpOrderId}:plan:${row.date}`,
        kind: 'plan_slot',
        mpOrderId,
        orderTitle,
        storeName,
        platform,
        statusLabel: '可探店日',
        dateRaw: row.date,
        timeLabel: slots,
      })
    }

    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    for (const raw of applicants) {
      if (!raw || typeof raw !== 'object') continue
      const a = raw as Record<string, unknown>
      const applicantId = String(a.id || '').trim()
      const assignedVisitAt = String(a.assignedVisitAt || '').trim()
      if (!assignedVisitAt) continue
      const status = String(a.visitAssignmentStatus || '').trim()
      if (status && status !== 'confirmed' && status !== 'pending_talent_confirm' && status !== 'pr_draft') {
        continue
      }
      const checkInAt = String(a.visitCheckInAt || '').trim()
      const visitStatus = String(a.visitStatus || '').trim()
      pushEvent(out, seen, {
        id: `${mpOrderId}:${applicantId}:visit`,
        kind: 'visit',
        mpOrderId,
        orderTitle,
        storeName,
        platform,
        applicantId,
        applicantName: String(a.displayName || a.nickname || a.name || '').trim(),
        timeLabel: assignedVisitAt,
        statusLabel: visitStatusLabel(visitStatus, checkInAt),
        visitStatus,
        dateRaw: assignedVisitAt,
      })
    }
  }

  return out.sort((a, b) => a.dayMs - b.dayMs || a.mpOrderId.localeCompare(b.mpOrderId))
}

export function aggregateTalentOrderCalendarEvents(
  mpOrders: Array<Record<string, unknown>>,
  myApplicantIds: Set<string>,
): OrderCalendarEvent[] {
  const out: OrderCalendarEvent[] = []
  const seen = new Set<string>()

  for (const mp of mpOrders || []) {
    if (!mp || isIceMpOrder(mp)) continue
    const mpOrderId = String(mp.id || '').trim()
    if (!mpOrderId) continue
    const orderTitle = String(mp.title || mp.storeName || mpOrderId).trim()
    const storeName = String(mp.storeName || mp.title || '').trim()
    const platform = String(mp.platform || '').trim()

    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    for (const raw of applicants) {
      if (!raw || typeof raw !== 'object') continue
      const a = raw as Record<string, unknown>
      const applicantId = String(a.id || '').trim()
      if (!applicantId || !myApplicantIds.has(applicantId)) continue

      const assignedVisitAt = String(a.assignedVisitAt || '').trim()
      if (assignedVisitAt) {
        const checkInAt = String(a.visitCheckInAt || '').trim()
        const visitStatus = String(a.visitStatus || '').trim()
        pushEvent(out, seen, {
          id: `${mpOrderId}:${applicantId}:visit`,
          kind: 'visit',
          mpOrderId,
          orderTitle,
          storeName,
          platform,
          applicantId,
          applicantName: String(a.displayName || a.nickname || a.name || '我').trim(),
          timeLabel: assignedVisitAt,
          statusLabel: visitStatusLabel(visitStatus, checkInAt),
          visitStatus,
          dateRaw: assignedVisitAt,
        })
      }

      const deadline = String(mp.deadline || '').trim()
      if (deadline) {
        pushEvent(out, seen, {
          id: `${mpOrderId}:${applicantId}:deadline`,
          kind: 'deadline',
          mpOrderId,
          orderTitle,
          storeName,
          platform,
          applicantId,
          statusLabel: '交片截止',
          dateRaw: deadline,
          timeLabel: '截止',
        })
      }
    }
  }

  return out.sort((a, b) => a.dayMs - b.dayMs || a.mpOrderId.localeCompare(b.mpOrderId))
}

export function buildMonthGrid(year: number, month: number): Array<{ dateKey: string; day: number; inMonth: boolean }> {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ dateKey: string; day: number; inMonth: boolean }> = []

  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(year, month, -startWeekday + i + 1)
    cells.push({ dateKey: dateKeyFromMs(d.getTime()), day: d.getDate(), inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    cells.push({ dateKey: dateKeyFromMs(d.getTime()), day, inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]
    const ms = parseVisitDayMs(last!.dateKey) + 86400000
    const d = new Date(ms)
    cells.push({ dateKey: dateKeyFromMs(d.getTime()), day: d.getDate(), inMonth: false })
  }
  return cells
}

export function groupEventsByDate(events: OrderCalendarEvent[]): Record<string, OrderCalendarEvent[]> {
  const map: Record<string, OrderCalendarEvent[]> = {}
  for (const e of events) {
    if (!map[e.dateKey]) map[e.dateKey] = []
    map[e.dateKey]!.push(e)
  }
  return map
}

export function kindLabel(kind: OrderCalendarEventKind): string {
  if (kind === 'visit') return '探店'
  if (kind === 'plan_slot') return '可探店'
  return '截止'
}

/** 单日事件进度：蓝=待开始，绿=进行中，红=已截止 */
export type OrderCalendarDayPhase = 'pending' | 'active' | 'ended'

export function resolveEventPhase(evt: OrderCalendarEvent, nowMs = Date.now()): OrderCalendarDayPhase {
  const dayStart = evt.dayMs
  const dayEnd = dayStart + 86400000 - 1

  if (evt.kind === 'deadline') {
    if (nowMs > dayEnd) return 'ended'
    if (nowMs >= dayStart) return 'active'
    return 'pending'
  }

  if (evt.kind === 'visit') {
    const visitStatus = String(evt.visitStatus || '').trim()
    const statusLabel = String(evt.statusLabel || '').trim()
    if (visitStatus === 'completed' || statusLabel === '已完成') return 'ended'
    if (visitStatus === 'no_show' || statusLabel === '未到店') return 'ended'
    if (statusLabel === '已签到' || visitStatus === 'checked_in') return 'active'
    if (nowMs > dayEnd) return 'ended'
    if (nowMs >= dayStart) return 'active'
    return 'pending'
  }

  if (nowMs > dayEnd) return 'ended'
  if (nowMs >= dayStart) return 'active'
  return 'pending'
}

export function resolveDayDotPhase(
  events: OrderCalendarEvent[],
  nowMs = Date.now(),
): OrderCalendarDayPhase | null {
  if (!events.length) return null
  const phases = events.map((e) => resolveEventPhase(e, nowMs))
  if (phases.includes('active')) return 'active'
  if (phases.includes('pending')) return 'pending'
  return 'ended'
}

export type OrderCalendarEventTone = 'green' | 'orange' | 'blue' | 'red'

export function eventTone(kind: OrderCalendarEventKind): OrderCalendarEventTone {
  if (kind === 'visit') return 'green'
  if (kind === 'deadline') return 'orange'
  return 'blue'
}

export function eventPriority(evt: OrderCalendarEvent, nowMs = Date.now()): number {
  const phase = resolveEventPhase(evt, nowMs)
  if (phase === 'ended') return 90
  if (evt.kind === 'visit') return phase === 'active' ? 1 : 10
  if (evt.kind === 'deadline') return 5
  return 20
}

export function buildUpcomingTodos(
  events: OrderCalendarEvent[],
  opts?: { days?: number; nowMs?: number },
): OrderCalendarEvent[] {
  const days = Math.max(1, Math.min(14, Number(opts?.days) || 7))
  const now = opts?.nowMs ?? Date.now()
  const endMs = now + days * 86400000
  return (events || [])
    .filter((e) => e.dayMs >= now - 86400000 && e.dayMs <= endMs)
    .filter((e) => resolveEventPhase(e, now) !== 'ended')
    .sort((a, b) => eventPriority(a, now) - eventPriority(b, now) || a.dayMs - b.dayMs)
    .slice(0, 12)
}

export function countActiveTodos(events: OrderCalendarEvent[], nowMs = Date.now()): number {
  const endMs = nowMs + 7 * 86400000
  return (events || []).filter(
    (e) => e.dayMs >= nowMs - 86400000 && e.dayMs <= endMs && resolveEventPhase(e, nowMs) !== 'ended',
  ).length
}

export function buildWeekCells(anchorDateKey: string): Array<{
  dateKey: string
  day: number
  inMonth: boolean
  weekday: number
}> {
  const ms = parseVisitDayMs(anchorDateKey || dateKeyFromMs(Date.now()))
  const d = new Date(ms || Date.now())
  const weekday = d.getDay()
  const cells: Array<{ dateKey: string; day: number; inMonth: boolean; weekday: number }> = []
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekday + i)
    cells.push({
      dateKey: dateKeyFromMs(cur.getTime()),
      day: cur.getDate(),
      inMonth: true,
      weekday: i,
    })
  }
  return cells
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayLabelFromDateKey(dateKey: string): string {
  const ms = parseVisitDayMs(dateKey)
  if (!ms) return ''
  return WEEKDAY_CN[new Date(ms).getDay()] ?? ''
}

export function formatTodoDateShort(dateKey: string, todayKey: string): string {
  const parts = String(dateKey || '').split('-')
  if (parts.length < 3) return dateKey
  const short = `${parts[1]}-${parts[2]}`
  return dateKey === todayKey ? `${short} 今天` : short
}

export function phaseStatusLabel(phase: OrderCalendarDayPhase): string {
  if (phase === 'active') return '进行中'
  if (phase === 'pending') return '待开始'
  return '已结束'
}

export function dayEventSummary(
  events: OrderCalendarEvent[],
  nowMs = Date.now(),
): { phase: OrderCalendarDayPhase; count: number; label: string } | null {
  if (!events.length) return null
  const phase = resolveDayDotPhase(events, nowMs)
  if (!phase) return null
  const count = events.filter((e) => resolveEventPhase(e, nowMs) === phase).length || events.length
  return {
    phase,
    count,
    label: `${count}项${phaseStatusLabel(phase)}`,
  }
}

export function calendarPageSubtitle(isPr: boolean): string {
  return isPr ? '排期总览 · 到店跟进 · 交片催办' : '探店签到 · 交片提醒 · 邀约截止'
}

export function calendarPageSubtitleForWork(workId: string): string {
  if (workId === 'pr') return '排期总览 · 到店跟进 · 交片催办'
  if (workId === 'shoot') return '外拍档期 · 素材交付提醒'
  if (workId === 'edit') return '剪辑交付 · 云剪任务提醒'
  return '探店签到 · 交片提醒 · 邀约截止'
}
