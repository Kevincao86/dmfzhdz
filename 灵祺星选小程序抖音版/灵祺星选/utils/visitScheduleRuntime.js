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

function readVisitScheduleMeta(mp) {
  if (!mp || typeof mp !== 'object') return {}
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const sm = meta.visitScheduleMeta
  return sm && typeof sm === 'object' && !Array.isArray(sm) ? sm : {}
}

function readVisitPlanDates(mp) {
  const rows = readVisitScheduleMeta(mp).visitPlanDates
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const date = String(row.date || '').trim()
      const slots = (Array.isArray(row.slots) ? row.slots : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
      return date && slots.length ? { date, slots } : null
    })
    .filter(Boolean)
}

function isVisitPlanDatesConfirmed(mp) {
  return !!String(readVisitScheduleMeta(mp).scheduleDatesConfirmedAt || '').trim()
}

/** PR 已确认可探店日期：达人只能从 PR 设定的日期/时段中选择 */
function hasLockedVisitPlanDates(mp) {
  return readVisitPlanDates(mp).length > 0 && isVisitPlanDatesConfirmed(mp)
}

function resolveDefaultTalentVisitPlanDate(mp) {
  const planRows = readVisitPlanDates(mp)
  if (hasLockedVisitPlanDates(mp) && planRows[0] && planRows[0].date) return planRows[0].date
  return defaultVisitPlanDate()
}

function confirmVisitPlanDates(mpOrderId, payload) {
  return setVisitSchedule(mpOrderId, Object.assign({ datesOnly: true }, payload || {}))
}

function updateVisitPlan(mpOrderId, applicantId, visitDate, visitTimeSlot) {
  return confirmVisitSchedule(mpOrderId, applicantId, 'update_visit_plan', '', {
    visitDate,
    visitTimeSlot,
  })
}

function confirmVisitSchedule(mpOrderId, applicantId, action, reason, opts) {
  const extra = opts && typeof opts === 'object' ? opts : {}
  return postVisit(
    ['/api/meoo-ops-mp-visit-schedule-confirm', '/api/ops-sync/mp-visit-schedule-confirm'],
    {
      mpOrderId,
      applicantId,
      action,
      reason,
      visitDate: extra.visitDate,
      visitTimeSlot: extra.visitTimeSlot,
      forceConfirm: extra.forceConfirm === true,
    },
  )
}

const SCHEDULE_CONFLICT_MODAL = {
  title: '档期提示',
  content: '该日期时段已有其它探店档期，继续提交可能存在爽约风险。是否仍要提交探店意向？',
  confirmText: '继续提交',
  cancelText: '重新选择',
}

function isScheduleConflictError(e) {
  const msg = String((e && e.message) || e || '')
  return /schedule_conflict|探店档期|爽约风险/i.test(msg)
}

function promptScheduleConflictContinue() {
  return new Promise((resolve) => {
    wx.showModal({
      ...SCHEDULE_CONFLICT_MODAL,
      success: (r) => resolve(!!r.confirm),
    })
  })
}

async function confirmVisitScheduleWithConflictPrompt(mpOrderId, applicantId, action, reason, opts) {
  const extra = opts && typeof opts === 'object' ? { ...opts } : {}
  try {
    return await confirmVisitSchedule(mpOrderId, applicantId, action, reason, extra)
  } catch (e) {
    if (extra.forceConfirm || !isScheduleConflictError(e)) throw e
    const cont = await promptScheduleConflictContinue()
    if (!cont) {
      const err = new Error('cancelled')
      err.code = 'schedule_conflict_cancelled'
      throw err
    }
    return confirmVisitSchedule(mpOrderId, applicantId, action, reason, { ...extra, forceConfirm: true })
  }
}

const DEFAULT_VISIT_SLOTS = ['09:00-12:00', '14:00-17:00', '17:00-20:00']

function resolveVisitSlotOptions(mp) {
  if (!mp || typeof mp !== 'object') return DEFAULT_VISIT_SLOTS.slice()
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const scheduleMeta =
    meta.visitScheduleMeta && typeof meta.visitScheduleMeta === 'object' ? meta.visitScheduleMeta : {}
  const fromSchedule = Array.isArray(scheduleMeta.visitSlots) ? scheduleMeta.visitSlots : []
  const fromOrder = Array.isArray(mp.visitSlots) ? mp.visitSlots : []
  const slots = []
  const seen = new Set()
  for (const raw of [...fromOrder, ...fromSchedule, ...DEFAULT_VISIT_SLOTS]) {
    const s = String(raw || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    slots.push(s)
  }
  return slots.length ? slots : DEFAULT_VISIT_SLOTS.slice()
}

function defaultVisitPlanDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function visitCheckIn(mpOrderId, applicantId, method) {
  return postVisit(
    ['/api/meoo-ops-mp-visit-checkin', '/api/ops-sync/mp-visit-checkin'],
    { mpOrderId, applicantId, method: method || 'manual' },
  )
}

function resolveApplicantVisitPreference(a) {
  return String((a && (a.talentPreferredVisitAt || a.visitTimeSlot)) || '').trim()
}

function normalizeIsoDateKey(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return ''
  const pad = (n) => String(Number(n)).padStart(2, '0')
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
}

function normalizeSlotCompareKey(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (m) {
    const pad = (t) => {
      const p = t.split(':')
      return `${String(Number(p[0])).padStart(2, '0')}:${p[1]}`
    }
    return `${pad(m[1])}-${pad(m[2])}`
  }
  return s.replace(/\s+/g, ' ')
}

function pickBestVisitSlot(preferred, visitSlots, fallbackIdx) {
  const slots = (visitSlots || []).filter(Boolean)
  if (!slots.length) return ''
  const pref = String(preferred || '').trim()
  if (!pref) return slots[fallbackIdx % slots.length]
  const prefParts = pref.match(/^(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\s+(.+)$/)
  const prefDate = prefParts ? normalizeIsoDateKey(prefParts[1]) : ''
  const prefSlot = normalizeSlotCompareKey(prefParts ? prefParts[2] : pref)
  let best = slots[fallbackIdx % slots.length]
  let bestScore = -1
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
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
  const usedSlotCounts = {}
  return pool.map((a, i) => {
    const preferred = resolveApplicantVisitPreference(a)
    let time = pickBestVisitSlot(preferred, slots, i)
    if (!time) time = slots[i % slots.length]
    const slotKey = normalizeSlotCompareKey(time.indexOf(' ') >= 0 ? time.split(/\s+/).slice(1).join(' ') : time)
    const used = usedSlotCounts[slotKey] || 0
    usedSlotCounts[slotKey] = used + 1
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

function applicantDisplayName(a) {
  return String((a && (a.platformNickname || a.name || a.platformAccount || a.id)) || '').trim()
}

function mapAiRowsToVisitRows(aiRows, pool) {
  const out = []
  const used = {}
  for (let i = 0; i < (aiRows || []).length; i++) {
    const row = aiRows[i]
    const talentId = String((row && (row.talentId || row.id)) || '').trim()
    const name = String((row && row.talentName) || '').trim()
    let hit = null
    if (talentId) {
      for (let j = 0; j < pool.length; j++) {
        if (String(pool[j].id) === talentId) {
          hit = pool[j]
          break
        }
      }
    }
    if (!hit && name) {
      for (let j = 0; j < pool.length; j++) {
        const dn = applicantDisplayName(pool[j])
        if (dn === name) {
          hit = pool[j]
          break
        }
      }
      if (!hit) {
        for (let j = 0; j < pool.length; j++) {
          const dn = applicantDisplayName(pool[j])
          if (dn.indexOf(name) >= 0 || name.indexOf(dn) >= 0) {
            hit = pool[j]
            break
          }
        }
      }
    }
    if (!hit || used[String(hit.id)]) continue
    used[String(hit.id)] = true
    out.push({
      applicantId: String(hit.id || ''),
      time: String((row && row.time) || '').trim(),
      storeName: String((row && row.storeName) || '').trim(),
      tableNote: String((row && row.tableNote) || '').trim(),
    })
  }
  if (!out.length && (aiRows || []).length === pool.length) {
    return pool.map((a, i) => ({
      applicantId: String(a.id || ''),
      time: String((aiRows[i] && aiRows[i].time) || '').trim(),
      storeName: String((aiRows[i] && aiRows[i].storeName) || '').trim(),
      tableNote: String((aiRows[i] && aiRows[i].tableNote) || '').trim(),
    }))
  }
  return out
}

function generateAiVisitSchedule(selectedApplicants, opts) {
  const options = opts || {}
  const pool = (selectedApplicants || []).filter((a) => a && a.id)
  if (!pool.length) return Promise.resolve({ rows: [], source: 'rule' })
  const visitSlots = (options.visitSlots || []).filter(Boolean)
  const body = {
    mode: 'visit_schedule',
    context: {
      title: String(options.title || '').trim(),
      storeName: options.storeName,
      category: options.category,
      visitSlots,
      shareTable: options.shareTable,
      mealCount: options.mealCount,
      tableSize: options.tableSize,
      talents: pool.map((a) => ({
        id: String(a.id),
        nickname: applicantDisplayName(a),
        followers: a.followers != null ? a.followers : '',
        visitTimeSlot: resolveApplicantVisitPreference(a),
        scheduleConfirmedAt: String(a.scheduleConfirmedAt || '').trim(),
      })),
    },
  }
  return api
    .post('/api/meoo-mp-recruitment-ai', body)
    .then((res) => {
      const mapped = mapAiRowsToVisitRows(res && Array.isArray(res.rows) ? res.rows : [], pool)
      if (mapped.length) return { rows: mapped, source: 'ai' }
      return {
        rows: generateClientRuleSchedule(pool, options),
        source: 'rule',
      }
    })
    .catch(() => ({
      rows: generateClientRuleSchedule(pool, options),
      source: 'rule',
    }))
}

function padTimeHm(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`
}

function parseVisitTimeRange(slot) {
  const s = String(slot || '').trim()
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (m) {
    return { start: padTimeHm(m[1]) || '09:00', end: padTimeHm(m[2]) || '12:00' }
  }
  return { start: '09:00', end: '12:00' }
}

function visitTimeMinutes(raw) {
  const t = padTimeHm(raw)
  if (!t) return -1
  const p = t.split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

function isValidVisitTimeRange(start, end) {
  const s = padTimeHm(start)
  const e = padTimeHm(end)
  if (!s || !e) return false
  return visitTimeMinutes(e) > visitTimeMinutes(s)
}

function formatScheduleTableNote(shareTable, opts) {
  if (shareTable) {
    const tableSize = Math.max(1, (opts && opts.tableSize) || 4)
    const mealCount = Math.max(1, (opts && opts.mealCount) || 1)
    const tIdx = ((opts && opts.tableIndex) != null ? opts.tableIndex : 0) + 1
    const count = (opts && opts.tableCount) || 1
    return `拼桌 ${tableSize} 人/桌 · 餐食 ${mealCount} 份 · 第${tIdx}桌${count > 1 ? `（${count}人）` : ''}`
  }
  return '单独探店'
}

function buildVisitTimeRange(start, end) {
  const s = padTimeHm(start)
  const e = padTimeHm(end)
  if (!s || !e) return ''
  return `${s}-${e}`
}

module.exports = {
  parseVisitDayMs,
  isVisitCheckInDay,
  readApplicantVisitFields,
  setVisitSchedule,
  confirmVisitSchedule,
  confirmVisitScheduleWithConflictPrompt,
  isScheduleConflictError,
  updateVisitPlan,
  visitCheckIn,
  generateClientRuleSchedule,
  generateAiVisitSchedule,
  resolveVisitSlotOptions,
  readVisitPlanDates,
  isVisitPlanDatesConfirmed,
  hasLockedVisitPlanDates,
  resolveDefaultTalentVisitPlanDate,
  confirmVisitPlanDates,
  defaultVisitPlanDate,
  parseVisitTimeRange,
  buildVisitTimeRange,
  padTimeHm,
  isValidVisitTimeRange,
  formatScheduleTableNote,
  DEFAULT_VISIT_SLOTS,
}
