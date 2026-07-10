/**
 * 商单日历事件聚合（与履约 Web orderCalendarCore 对齐）
 */
const { isIceMpOrder } = require('./iceOrderDetect.js')

function parseVisitDayMs(timeStr) {
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

function dateKeyFromMs(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readVisitPlanDates(mp) {
  const meta = (mp && mp.mpPublishMeta) || {}
  const vs = meta.visitScheduleMeta || {}
  const rows = vs.visitPlanDates
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const date = String(row.date || '').trim()
      if (!date) return null
      const slots = Array.isArray(row.slots)
        ? row.slots.map((s) => String(s || '').trim()).filter(Boolean)
        : []
      return { date, slots }
    })
    .filter(Boolean)
}

function visitStatusLabel(status, checkInAt) {
  if (checkInAt) return '已签到'
  if (status === 'checked_in') return '已签到'
  if (status === 'completed') return '已完成'
  if (status === 'no_show') return '未到店'
  return '待探店'
}

function pushEvent(out, seen, evt) {
  const dayMs = parseVisitDayMs(evt.dateRaw)
  if (!dayMs) return
  const dateKey = dateKeyFromMs(dayMs)
  if (seen.has(evt.id)) return
  seen.add(evt.id)
  out.push({ ...evt, dateKey, dayMs })
}

function aggregatePrOrderCalendarEvents(mpOrders) {
  const out = []
  const seen = new Set()
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
      const slots = row.slots && row.slots.length ? row.slots.join('、') : '全天'
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
    for (const a of applicants) {
      if (!a || typeof a !== 'object') continue
      const applicantId = String(a.id || '').trim()
      const assignedVisitAt = String(a.assignedVisitAt || '').trim()
      if (!assignedVisitAt) continue
      const status = String(a.visitAssignmentStatus || '').trim()
      if (status && status !== 'confirmed' && status !== 'pending_talent_confirm' && status !== 'pr_draft') continue
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
  return out.sort((a, b) => a.dayMs - b.dayMs)
}

function aggregateTalentOrderCalendarEvents(mpOrders, myApplicantIds) {
  const out = []
  const seen = new Set()
  const idSet = myApplicantIds instanceof Set ? myApplicantIds : new Set(myApplicantIds || [])

  for (const mp of mpOrders || []) {
    if (!mp || isIceMpOrder(mp)) continue
    const mpOrderId = String(mp.id || '').trim()
    if (!mpOrderId) continue
    const orderTitle = String(mp.title || mp.storeName || mpOrderId).trim()
    const storeName = String(mp.storeName || mp.title || '').trim()
    const platform = String(mp.platform || '').trim()

    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    for (const a of applicants) {
      if (!a || typeof a !== 'object') continue
      const applicantId = String(a.id || '').trim()
      if (!applicantId || !idSet.has(applicantId)) continue

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
          applicantName: '我',
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
  return out.sort((a, b) => a.dayMs - b.dayMs)
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
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
    const ms = parseVisitDayMs(last.dateKey) + 86400000
    const d = new Date(ms)
    cells.push({ dateKey: dateKeyFromMs(d.getTime()), day: d.getDate(), inMonth: false })
  }
  return cells
}

function groupEventsByDate(events) {
  const map = {}
  for (const e of events || []) {
    if (!map[e.dateKey]) map[e.dateKey] = []
    map[e.dateKey].push(e)
  }
  return map
}

function kindLabel(kind) {
  if (kind === 'visit') return '探店'
  if (kind === 'plan_slot') return '可探店'
  return '截止'
}

function resolveEventPhase(evt, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const dayStart = evt.dayMs
  const dayEnd = dayStart + 86400000 - 1

  if (evt.kind === 'deadline') {
    if (now > dayEnd) return 'ended'
    if (now >= dayStart) return 'active'
    return 'pending'
  }

  if (evt.kind === 'visit') {
    const visitStatus = String(evt.visitStatus || '').trim()
    const statusLabel = String(evt.statusLabel || '').trim()
    if (visitStatus === 'completed' || statusLabel === '已完成') return 'ended'
    if (visitStatus === 'no_show' || statusLabel === '未到店') return 'ended'
    if (statusLabel === '已签到' || visitStatus === 'checked_in') return 'active'
    if (now > dayEnd) return 'ended'
    if (now >= dayStart) return 'active'
    return 'pending'
  }

  if (now > dayEnd) return 'ended'
  if (now >= dayStart) return 'active'
  return 'pending'
}

function resolveDayDotPhase(events, nowMs) {
  const list = events || []
  if (!list.length) return null
  const phases = list.map((e) => resolveEventPhase(e, nowMs))
  if (phases.includes('active')) return 'active'
  if (phases.includes('pending')) return 'pending'
  return 'ended'
}

function eventTone(kind) {
  if (kind === 'visit') return 'green'
  if (kind === 'deadline') return 'orange'
  return 'blue'
}

function eventPriority(evt, nowMs) {
  const phase = resolveEventPhase(evt, nowMs)
  if (phase === 'ended') return 90
  if (evt.kind === 'visit') return phase === 'active' ? 1 : 10
  if (evt.kind === 'deadline') return 5
  return 20
}

function buildUpcomingTodos(events, opts) {
  const days = Math.max(1, Math.min(14, Number((opts && opts.days) || 7)))
  const now = Date.now()
  const endMs = now + days * 86400000
  return (events || [])
    .filter((e) => e.dayMs >= now - 86400000 && e.dayMs <= endMs)
    .filter((e) => resolveEventPhase(e, now) !== 'ended')
    .sort((a, b) => eventPriority(a, now) - eventPriority(b, now) || a.dayMs - b.dayMs)
    .slice(0, 12)
}

function countActiveTodos(events) {
  const now = Date.now()
  const endMs = now + 7 * 86400000
  return (events || []).filter(
    (e) => e.dayMs >= now - 86400000 && e.dayMs <= endMs && resolveEventPhase(e, now) !== 'ended',
  ).length
}

function buildWeekCells(anchorDateKey) {
  const ms = parseVisitDayMs(anchorDateKey || dateKeyFromMs(Date.now()))
  const d = new Date(ms || Date.now())
  const weekday = d.getDay()
  const cells = []
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

function calendarSubtitle(identity) {
  if (identity === 'pr') return '排期总览 · 到店跟进 · 交片催办'
  return '探店签到 · 交片提醒 · 邀约截止'
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatTodoDateShort(dateKey, todayKey) {
  const parts = String(dateKey || '').split('-')
  if (parts.length < 3) return dateKey
  const short = `${parts[1]}-${parts[2]}`
  return dateKey === todayKey ? `${short} 今天` : short
}

function phaseStatusLabel(phase) {
  if (phase === 'active') return '进行中'
  if (phase === 'pending') return '待开始'
  return '已结束'
}

function dayEventSummary(events, nowMs) {
  const list = events || []
  if (!list.length) return null
  const phase = resolveDayDotPhase(list, nowMs)
  if (!phase) return null
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const count = list.filter((e) => resolveEventPhase(e, now) === phase).length || list.length
  return {
    phase,
    count,
    label: `${count}项${phaseStatusLabel(phase)}`,
  }
}

function weekdayShortFromDateKey(dateKey) {
  const ms = parseVisitDayMs(dateKey)
  if (!ms) return ''
  return (WEEKDAY_CN[new Date(ms).getDay()] || '').replace('周', '')
}

module.exports = {
  parseVisitDayMs,
  dateKeyFromMs,
  aggregatePrOrderCalendarEvents,
  aggregateTalentOrderCalendarEvents,
  buildMonthGrid,
  buildWeekCells,
  groupEventsByDate,
  kindLabel,
  eventTone,
  buildUpcomingTodos,
  countActiveTodos,
  resolveEventPhase,
  resolveDayDotPhase,
  calendarSubtitle,
  formatTodoDateShort,
  phaseStatusLabel,
  dayEventSummary,
  weekdayShortFromDateKey,
}
