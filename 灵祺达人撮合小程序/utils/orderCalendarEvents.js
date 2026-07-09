/**
 * 商单日历事件聚合（达人/拍摄/剪辑/PR + 近7天待办 + 跳转动作）
 */
const { isIceMpOrder, isEditTeamIceMpOrder } = require('./iceOrderDetect.js')
const mpTargetedRecruit = require('./mpTargetedRecruit.js')
const talentAppStatus = require('./talentApplicationStatus.js')

const KIND_LABELS = {
  visit: '探店',
  plan_slot: '可探店',
  deadline: '交片截止',
  invite_deadline: '邀约截止',
  pending_schedule: '待确认排期',
  video_due: '待交片',
  ice_deliver: '云剪交付',
  shoot_day: '外拍日',
  pr_review: '待审片',
}

const ACTION_LABELS = {
  visit_talent: '去签到',
  visit_pr: '看排期',
  deadline_talent: '去交片',
  deadline_pr: '催交片',
  plan_slot: '去排期',
  invite: '去响应',
  pending_schedule: '确认排期',
  ice_deliver: '去交付',
  pr_review: '去审片',
}

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

function recruitTargetOf(mp) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const t = String(meta.recruitTarget || mp.recruitTarget || 'talent').trim()
  return t || 'talent'
}

function visitStatusLabel(status, checkInAt) {
  if (checkInAt) return '已签到'
  if (status === 'checked_in') return '已签到'
  if (status === 'completed') return '已完成'
  if (status === 'no_show') return '未到店'
  return '待探店'
}

function videoNeedsSubmit(applicant) {
  if (!applicant) return false
  const vs = String(applicant.videoStatus || '').trim()
  if (vs === 'passed' || vs === 'approved') return false
  if (String(applicant.videoSubmittedAt || '').trim()) return vs !== 'passed'
  return true
}

function pushEvent(out, seen, evt) {
  const dayMs = parseVisitDayMs(evt.dateRaw)
  if (!dayMs) return
  const dateKey = dateKeyFromMs(dayMs)
  if (seen.has(evt.id)) return
  seen.add(evt.id)
  out.push({ ...evt, dateKey, dayMs })
}

function baseOrderFields(mp) {
  const mpOrderId = String(mp.id || '').trim()
  return {
    mpOrderId,
    orderTitle: String(mp.title || mp.storeName || mpOrderId).trim(),
    storeName: String(mp.storeName || mp.title || '').trim(),
    platform: String(mp.platform || '').trim(),
  }
}

function aggregatePrOrderCalendarEvents(mpOrders) {
  const out = []
  const seen = new Set()
  for (const mp of mpOrders || []) {
    if (!mp || isIceMpOrder(mp)) continue
    const base = baseOrderFields(mp)
    if (!base.mpOrderId) continue

    const deadline = String(mp.deadline || '').trim()
    if (deadline) {
      const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
      const pendingReview = applicants.filter(
        (a) => a && String(a.videoSubmittedAt || '').trim() && videoNeedsSubmit(a),
      ).length
      pushEvent(out, seen, {
        id: `${base.mpOrderId}:deadline`,
        kind: pendingReview > 0 ? 'pr_review' : 'deadline',
        ...base,
        statusLabel: pendingReview > 0 ? `待审片 ${pendingReview} 人` : '交片截止',
        dateRaw: deadline,
        timeLabel: '截止',
        pendingReviewCount: pendingReview,
      })
    }

    const planDates = readVisitPlanDates(mp)
    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    const visitDates = new Set()
    for (const a of applicants) {
      const assigned = String(a.assignedVisitAt || '').trim()
      if (assigned) visitDates.add(dateKeyFromMs(parseVisitDayMs(assigned)))
    }

    for (const row of planDates) {
      const slots = row.slots && row.slots.length ? row.slots.join('、') : '全天'
      const dk = dateKeyFromMs(parseVisitDayMs(row.date))
      const noVisit = dk && !visitDates.has(dk)
      pushEvent(out, seen, {
        id: `${base.mpOrderId}:plan:${row.date}`,
        kind: 'plan_slot',
        ...base,
        statusLabel: noVisit ? '可探店日·待排期' : '可探店日',
        dateRaw: row.date,
        timeLabel: slots,
        needsSchedule: noVisit,
      })
    }

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
        id: `${base.mpOrderId}:${applicantId}:visit`,
        kind: 'visit',
        ...base,
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

function aggregateTalentLikeEvents(mpOrders, myApplicantIds, opts) {
  const out = []
  const seen = new Set()
  const idSet = myApplicantIds instanceof Set ? myApplicantIds : new Set(myApplicantIds || [])
  const identity = String((opts && opts.identity) || 'talent').trim()
  const talentMemberId = String((opts && opts.talentMemberId) || '').trim()
  const includeIce = identity === 'edit'

  for (const mp of mpOrders || []) {
    if (!mp) continue
    const isIce = isIceMpOrder(mp)
    if (isIce && !includeIce) continue
    const target = recruitTargetOf(mp)
    if (identity === 'shoot' && target !== 'shoot' && !isIce) continue
    if (identity === 'edit' && target !== 'edit' && !isIce && !isEditTeamIceMpOrder(mp)) continue
    if (identity === 'talent' && (target === 'shoot' || target === 'edit') && !isIce) continue

    const base = baseOrderFields(mp)
    if (!base.mpOrderId) continue

    if (identity === 'talent' && talentMemberId && mpTargetedRecruit.isTargetedOrder(mp)) {
      const inv = mpTargetedRecruit.findInviteForMember(mp, talentMemberId)
      if (inv && inv.status === 'pending') {
        const meta = mp.mpPublishMeta || {}
        const dl = String(meta.inviteDeadline || '').trim()
        if (dl) {
          pushEvent(out, seen, {
            id: `${base.mpOrderId}:invite:${talentMemberId}`,
            kind: 'invite_deadline',
            ...base,
            statusLabel: '待响应邀约',
            dateRaw: dl,
            timeLabel: '截止',
          })
        }
      }
    }

    const applicants = Array.isArray(mp.applicants) ? mp.applicants : []
    for (const a of applicants) {
      if (!a || typeof a !== 'object') continue
      const applicantId = String(a.id || '').trim()
      if (!applicantId || !idSet.has(applicantId)) continue

      const assignStatus = String(a.visitAssignmentStatus || '').trim()
      const assignedVisitAt = String(a.assignedVisitAt || '').trim()
      const visitSlot = String(a.visitTimeSlot || assignedVisitAt || '').trim()

      if (assignStatus === 'pending_talent_confirm' && assignedVisitAt) {
        pushEvent(out, seen, {
          id: `${base.mpOrderId}:${applicantId}:pending_schedule`,
          kind: 'pending_schedule',
          ...base,
          applicantId,
          statusLabel: '待你确认排期',
          dateRaw: assignedVisitAt,
          timeLabel: assignedVisitAt,
        })
      }

      const visitRaw = identity === 'shoot' ? visitSlot : assignedVisitAt
      if (visitRaw && !isIce) {
        const checkInAt = String(a.visitCheckInAt || '').trim()
        const visitStatus = String(a.visitStatus || '').trim()
        pushEvent(out, seen, {
          id: `${base.mpOrderId}:${applicantId}:visit`,
          kind: identity === 'shoot' ? 'shoot_day' : 'visit',
          ...base,
          applicantId,
          applicantName: '我',
          timeLabel: visitRaw,
          statusLabel: visitStatusLabel(visitStatus, checkInAt),
          visitStatus,
          dateRaw: visitRaw,
        })
      }

      const deadline = String(mp.deadline || '').trim()
      if (deadline) {
        const checkedIn = talentAppStatus.isTalentVisitCheckedIn(mp, a)
        const needsVideo = videoNeedsSubmit(a)
        const kind = isIce ? 'ice_deliver' : needsVideo && (checkedIn || identity === 'edit') ? 'video_due' : 'deadline'
        pushEvent(out, seen, {
          id: `${base.mpOrderId}:${applicantId}:${kind}`,
          kind,
          ...base,
          applicantId,
          statusLabel: kind === 'ice_deliver' ? '云剪交付' : kind === 'video_due' ? '待提交成片' : '交片截止',
          dateRaw: deadline,
          timeLabel: '截止',
        })
      }
    }
  }
  return out.sort((a, b) => a.dayMs - b.dayMs)
}

function aggregateOrderCalendarEvents(mpOrders, opts) {
  const identity = String((opts && opts.identity) || '').trim()
  if (identity === 'pr') return aggregatePrOrderCalendarEvents(mpOrders)
  return aggregateTalentLikeEvents(mpOrders, opts && opts.applicantIds, opts)
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

function groupEventsByDate(events) {
  const map = {}
  for (const e of events || []) {
    if (!map[e.dateKey]) map[e.dateKey] = []
    map[e.dateKey].push(e)
  }
  return map
}

function kindLabel(kind) {
  return KIND_LABELS[kind] || '商单'
}

function eventTone(kind) {
  if (kind === 'visit' || kind === 'shoot_day') return 'green'
  if (kind === 'deadline' || kind === 'video_due' || kind === 'ice_deliver' || kind === 'invite_deadline') return 'orange'
  if (kind === 'pending_schedule' || kind === 'pr_review') return 'red'
  return 'blue'
}

function eventPriority(evt) {
  const kind = String(evt.kind || '')
  const phase = resolveEventPhase(evt)
  if (phase === 'ended') return 90
  if (kind === 'visit' || kind === 'shoot_day') return phase === 'active' ? 1 : 10
  if (kind === 'video_due' || kind === 'ice_deliver' || kind === 'deadline') return 5
  if (kind === 'pending_schedule' || kind === 'invite_deadline') return 3
  if (kind === 'pr_review') return 4
  return 20
}

function buildUpcomingTodos(events, opts) {
  const days = Math.max(1, Math.min(14, Number((opts && opts.days) || 7)))
  const now = Date.now()
  const endMs = now + days * 86400000
  const list = (events || [])
    .filter((e) => e.dayMs >= now - 86400000 && e.dayMs <= endMs)
    .filter((e) => resolveEventPhase(e, now) !== 'ended')
    .sort((a, b) => eventPriority(a) - eventPriority(b) || a.dayMs - b.dayMs)
  return list.slice(0, 12)
}

function countActiveTodos(events) {
  const now = Date.now()
  const endMs = now + 7 * 86400000
  return (events || []).filter(
    (e) => e.dayMs >= now - 86400000 && e.dayMs <= endMs && resolveEventPhase(e, now) !== 'ended',
  ).length
}

function resolveEventPhase(evt, nowMs) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const dayStart = evt.dayMs
  const dayEnd = dayStart + 86400000 - 1

  if (evt.kind === 'deadline' || evt.kind === 'video_due' || evt.kind === 'ice_deliver' || evt.kind === 'invite_deadline') {
    if (now > dayEnd) return 'ended'
    if (now >= dayStart) return 'active'
    return 'pending'
  }

  if (evt.kind === 'visit' || evt.kind === 'shoot_day') {
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

function calendarSubtitle(identity) {
  if (identity === 'pr') return '排期总览 · 到店跟进 · 交片催办'
  if (identity === 'shoot') return '外拍档期 · 素材交付提醒'
  if (identity === 'edit') return '剪辑交付 · 云剪任务提醒'
  return '探店签到 · 交片提醒 · 邀约截止'
}

function resolveEventNav(evt, opts) {
  const isPr = !!(opts && opts.isPr)
  const mpOrderId = String(evt.mpOrderId || '').trim()
  const applicantId = String(evt.applicantId || '').trim()
  const kind = String(evt.kind || '')
  if (!mpOrderId) return { url: '', actionLabel: '查看' }

  if (isPr) {
    if (kind === 'visit') {
      return {
        url: `/pages/subpack-pr/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}`,
        actionLabel: ACTION_LABELS.visit_pr,
      }
    }
    if (kind === 'plan_slot') {
      return {
        url: `/pages/subpack-pr/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}&step=dates`,
        actionLabel: ACTION_LABELS.plan_slot,
      }
    }
    if (kind === 'pr_review') {
      return {
        url: `/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(mpOrderId)}&tab=pending_video`,
        actionLabel: ACTION_LABELS.pr_review,
      }
    }
    return {
      url: `/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(mpOrderId)}`,
      actionLabel: ACTION_LABELS.deadline_pr,
    }
  }

  if (kind === 'invite_deadline') {
    return {
      url: '/pages/subpack-mine/mine-targeted-invites/mine-targeted-invites',
      actionLabel: ACTION_LABELS.invite,
    }
  }
  if (kind === 'pending_schedule') {
    return {
      url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(mpOrderId)}&focus=schedule`,
      actionLabel: ACTION_LABELS.pending_schedule,
    }
  }
  if (kind === 'video_due' || kind === 'ice_deliver' || kind === 'deadline') {
    const q = applicantId ? `&applicantId=${encodeURIComponent(applicantId)}` : ''
    return {
      url: `/pages/subpack-mine/mine-applications/mine-applications?focus=${encodeURIComponent(mpOrderId)}${q}`,
      actionLabel: kind === 'ice_deliver' ? ACTION_LABELS.ice_deliver : ACTION_LABELS.deadline_talent,
    }
  }
  return {
    url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(mpOrderId)}&focus=visit`,
    actionLabel: kind === 'shoot_day' ? '去外拍' : ACTION_LABELS.visit_talent,
  }
}

function computeRemindAtMs(eventDateKey, preset) {
  const dayMs = parseVisitDayMs(eventDateKey)
  if (!dayMs) return 0
  const d = new Date(dayMs)
  const y = d.getFullYear()
  const m = d.getMonth()
  const day = d.getDate()
  if (preset === 'day8') return new Date(y, m, day, 8, 0, 0).getTime()
  if (preset === 'day_before_20') return new Date(y, m, day - 1, 20, 0, 0).getTime()
  if (preset === 'days2_before') return new Date(y, m, day - 2, 20, 0, 0).getTime()
  return 0
}

module.exports = {
  parseVisitDayMs,
  dateKeyFromMs,
  aggregatePrOrderCalendarEvents,
  aggregateTalentOrderCalendarEvents: aggregateTalentLikeEvents,
  aggregateOrderCalendarEvents,
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
  resolveEventNav,
  computeRemindAtMs,
  KIND_LABELS,
}
