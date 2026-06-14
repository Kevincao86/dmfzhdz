const api = require('./api.js')

async function postVisit(paths, body) {
  let lastErr
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    try {
      const data = await api.post(path, body)
      if (data && data.ok === false) {
        const msg = String(data.message || data.detail || data.error || 'request_failed')
        if (!/404|not_found/i.test(msg)) throw new Error(msg)
        lastErr = new Error(msg)
        continue
      }
      return data
    } catch (e) {
      lastErr = e
      const msg = String(e && e.message ? e.message : e)
      if (!/404|not_found/i.test(msg)) throw e
    }
  }
  throw lastErr || new Error('探店排期接口不可用')
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

function isVisitCheckInDay(assignedVisitAt, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs
  const dayMs = parseVisitDayMs(assignedVisitAt)
  if (!dayMs) return false
  const start = new Date(dayMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(dayMs)
  end.setHours(23, 59, 59, 999)
  return now >= start.getTime() && now <= end.getTime()
}

function readApplicantVisitFields(applicant) {
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

function setVisitSchedule(mpOrderId, payload) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-set', '/api/ops-sync/mp-visit-schedule-set'],
    Object.assign({ mpOrderId }, payload || {}),
  )
}

function confirmVisitSchedule(mpOrderId, applicantId, action, reason) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-confirm', '/api/ops-sync/mp-visit-schedule-confirm'],
    { mpOrderId, applicantId, action, reason },
  )
}

function visitCheckIn(mpOrderId, applicantId, method) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-checkin', '/api/ops-sync/mp-visit-checkin'],
    { mpOrderId, applicantId, method: method || 'manual' },
  )
}

function generateClientRuleSchedule(selectedApplicants, opts) {
  const options = opts || {}
  const slots = (options.visitSlots || []).filter(Boolean)
  if (!slots.length) {
    slots.push('09:00-12:00', '14:00-17:00')
  }
  const pool = (selectedApplicants || []).slice().sort((a, b) => {
    const fa = Number(a.followers) || 0
    const fb = Number(b.followers) || 0
    return fb - fa
  })
  const storeName = String(options.storeName || '门店').trim()
  const mealCount = Math.max(1, Number(options.mealCount) || 1)
  const tableSize = Math.max(2, Number(options.tableSize) || 4)
  const shareTable = options.shareTable !== false
  const base = new Date()
  base.setDate(base.getDate() + 1)
  return pool.map((a, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + Math.floor(i / slots.length))
    const slot = slots[i % slots.length]
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

module.exports = {
  parseVisitDayMs,
  isVisitCheckInDay,
  readApplicantVisitFields,
  setVisitSchedule,
  confirmVisitSchedule,
  visitCheckIn,
  generateClientRuleSchedule,
}
