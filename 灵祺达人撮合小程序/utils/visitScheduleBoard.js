/**
 * 探店排期看板逻辑（与星选 Web VisitScheduleDragBoard.tsx 对齐）
 */
const visitRuntime = require('./visitScheduleRuntime.js')

const {
  DEFAULT_VISIT_SLOTS,
  defaultVisitPlanDate,
  buildVisitTimeRange,
  parseVisitTimeRange,
  isValidVisitTimeRange,
  formatScheduleTableNote,
} = visitRuntime

function slotDefLabel(slot) {
  return buildVisitTimeRange(slot.start, slot.end)
}

function slotDefsFromStrings(slots) {
  return (slots || []).map((raw, i) => {
    const parsed = parseVisitTimeRange(raw)
    return { id: `slot-${i}-${parsed.start}`, start: parsed.start, end: parsed.end }
  })
}

function defaultVisitSlotDefs() {
  return slotDefsFromStrings(DEFAULT_VISIT_SLOTS)
}

function slotStringsFromDefs(defs) {
  return (defs || []).map(slotDefLabel).filter(Boolean)
}

function formatVisitRowTime(visitDate, visitSlot) {
  const m = String(visitDate || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const slot = String(visitSlot || '').trim()
  if (!m || !slot) return ''
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])} ${slot}`
}

function slotStringsFromVisitDates(dates) {
  const out = []
  for (const day of dates || []) {
    for (const slot of day.slots || []) {
      const label = slotDefLabel(slot)
      if (!label) continue
      const time = formatVisitRowTime(day.date, label)
      if (time) out.push(time)
    }
  }
  return out
}

function offsetVisitDate(base, days) {
  const m = String(base || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return defaultVisitPlanDate()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + days)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function cloneSlotsForNewDay(slots) {
  const ts = Date.now()
  return (slots || []).map((s, i) => ({ ...s, id: `slot-${ts}-${i}` }))
}

function initVisitDates() {
  return [{ id: 'day-0', date: defaultVisitPlanDate(), slots: defaultVisitSlotDefs() }]
}

function initColumns(visitDates) {
  const cols = []
  for (const day of visitDates || []) {
    for (const slot of day.slots || []) {
      cols.push({ dateId: day.id, slotId: slot.id, tables: [{ id: 't1', talentIds: [] }] })
    }
  }
  return cols
}

function parseTalentPreference(pref) {
  const s = String(pref || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(.+)$/)
  if (m) {
    return {
      dateText: `${m[1]}/${Number(m[2])}/${Number(m[3])}`,
      slotText: String(m[4] || '').trim(),
    }
  }
  return { dateText: '', slotText: s }
}

function enrichApplicantPreference(id, name, preferred, extra) {
  const parsed = parseTalentPreference(preferred)
  return {
    id,
    name,
    preferred,
    preferredDate: (parsed && parsed.dateText) || '',
    preferredSlot: (parsed && parsed.slotText) || '',
    talentMemberId: extra && extra.talentMemberId,
    avatar: extra && extra.avatar,
  }
}

function boardToScheduleRows(columns, visitDates, opts) {
  const slotLabelByKey = new Map()
  const dateById = new Map((visitDates || []).map((d) => [d.id, d.date]))
  for (const day of visitDates || []) {
    for (const slot of day.slots || []) {
      slotLabelByKey.set(`${day.id}:${slot.id}`, slotDefLabel(slot))
    }
  }
  const rows = []
  for (const col of columns || []) {
    const slotLabel = slotLabelByKey.get(`${col.dateId}:${col.slotId}`) || ''
    const visitDate = dateById.get(col.dateId) || ''
    if (!slotLabel || !visitDate) continue
    const time = formatVisitRowTime(visitDate, slotLabel)
    if (!time) continue
    ;(col.tables || []).forEach((table, tIdx) => {
      const count = (table.talentIds || []).length
      ;(table.talentIds || []).forEach((applicantId) => {
        const tableNote = formatScheduleTableNote(opts.shareTable, {
          tableSize: opts.tableSize,
          mealCount: opts.mealCount,
          tableIndex: tIdx,
          tableCount: count,
        })
        rows.push({
          applicantId,
          time,
          storeName: opts.storeName,
          tableNote,
          tableGroupId: opts.shareTable
            ? `table-${col.dateId}-${col.slotId}-${table.id}`
            : `solo-${applicantId}`,
        })
      })
    })
  }
  return rows
}

function assignedToIsoDate(raw) {
  const parsed = parseTalentPreference(raw)
  if (!parsed || !parsed.dateText) return null
  const m = parsed.dateText.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

function scheduleRowsFromApplicants(applicants, storeName) {
  return (applicants || [])
    .filter((a) => a && String(a.assignedVisitAt || '').trim())
    .map((a) => ({
      applicantId: String(a.id),
      time: String(a.assignedVisitAt),
      storeName: String(a.assignedVisitStore || storeName || '').trim() || storeName,
      tableNote: String(a.tableNote || '').trim() || undefined,
    }))
}

function hydrateBoardFromApplicants(applicants) {
  const assigned = (applicants || []).filter((a) => a && String(a.assignedVisitAt || '').trim())
  if (!assigned.length) {
    const visitDates = initVisitDates()
    return { visitDates, columns: initColumns(visitDates), shareTable: true, mealCount: 1, tableSize: 4 }
  }

  const groups = new Map()
  const dateSet = new Set()
  const slotByKey = new Map()

  for (const a of assigned) {
    const raw = String(a.assignedVisitAt || '').trim()
    const parsed = parseTalentPreference(raw)
    const iso = assignedToIsoDate(raw)
    const slotText = (parsed && parsed.slotText) || ''
    if (!iso || !slotText) continue
    const key = `${iso}|${slotText}`
    dateSet.add(iso)
    slotByKey.set(key, slotText)
    const list = groups.get(key) || []
    list.push(String(a.id))
    groups.set(key, list)
  }

  const sortedDates = [...dateSet].sort()
  const visitDates = sortedDates.map((date, di) => {
    const slotLabels = new Set()
    for (const [key, slotText] of slotByKey.entries()) {
      if (key.startsWith(`${date}|`)) slotLabels.add(slotText)
    }
    const slots = [...slotLabels].map((slotText, si) => {
      const parsed = parseVisitTimeRange(slotText)
      return { id: `slot-${di}-${si}`, start: parsed.start, end: parsed.end }
    })
    return { id: `day-${di}`, date, slots: slots.length ? slots : defaultVisitSlotDefs() }
  })

  if (!visitDates.length) {
    const vd = initVisitDates()
    return { visitDates: vd, columns: initColumns(vd), shareTable: true, mealCount: 1, tableSize: 4 }
  }

  const columns = []
  for (const day of visitDates) {
    for (const slot of day.slots) {
      const label = slotDefLabel(slot)
      const key = `${day.date}|${label}`
      const talentIds = groups.get(key) || []
      columns.push({
        dateId: day.id,
        slotId: slot.id,
        tables: talentIds.length ? [{ id: 't1', talentIds }] : [{ id: 't1', talentIds: [] }],
      })
    }
  }

  const shareTable =
    assigned.some((a) => String(a.tableNote || '').includes('拼桌')) ||
    [...groups.values()].some((ids) => ids.length > 1)
  const mealMatch = assigned
    .map((a) => String(a.tableNote || '').match(/餐食\s*(\d+)/))
    .find(Boolean)
  const mealCount = mealMatch ? Math.max(1, Number(mealMatch[1]) || 1) : Math.max(1, assigned.length)
  const tableSizeMatch = assigned
    .map((a) => String(a.tableNote || '').match(/(\d+)\s*人\/桌/))
    .find(Boolean)
  const tableSize = tableSizeMatch ? Math.max(1, Number(tableSizeMatch[1]) || 4) : 4

  return { visitDates, columns, shareTable, mealCount, tableSize }
}

function countTotalTables(columns) {
  return (columns || []).reduce((n, c) => n + (c.tables || []).length, 0)
}

function trimTablesToGlobalMax(columns, maxTotal) {
  const cols = (columns || []).map((c) => ({
    ...c,
    tables: (c.tables || []).map((t) => ({ ...t, talentIds: [...(t.talentIds || [])] })),
  }))
  let total = countTotalTables(cols)
  if (total <= maxTotal) return cols

  for (let ci = cols.length - 1; ci >= 0 && total > maxTotal; ci--) {
    for (let ti = cols[ci].tables.length - 1; ti >= 0 && total > maxTotal; ti--) {
      if (cols[ci].tables.length <= 1) break
      if (!(cols[ci].tables[ti].talentIds || []).length) {
        cols[ci].tables.splice(ti, 1)
        total--
      }
    }
  }
  for (let ci = cols.length - 1; ci >= 0 && total > maxTotal; ci--) {
    for (let ti = cols[ci].tables.length - 1; ti >= 0 && total > maxTotal; ti--) {
      if (cols[ci].tables.length <= 1) break
      cols[ci].tables.splice(ti, 1)
      total--
    }
  }
  return cols
}

function assignedIds(columns) {
  const out = new Set()
  for (const col of columns || []) {
    for (const table of col.tables || []) {
      for (const id of table.talentIds || []) out.add(id)
    }
  }
  return out
}

function syncColumnsFromVisitDates(visitDates, columns) {
  const prev = new Map((columns || []).map((c) => [`${c.dateId}:${c.slotId}`, c]))
  const next = []
  for (const day of visitDates || []) {
    for (const slot of day.slots || []) {
      const key = `${day.id}:${slot.id}`
      next.push(prev.get(key) || { dateId: day.id, slotId: slot.id, tables: [{ id: 't1', talentIds: [] }] })
    }
  }
  return next
}

function visitDatesToPlanRows(visitDates) {
  return (visitDates || [])
    .map((day) => ({
      date: day.date,
      slots: slotStringsFromDefs(day.slots),
    }))
    .filter((row) => row.date && row.slots.length)
}

function initVisitDatesFromPlanMeta(mp) {
  if (!mp || typeof mp !== 'object') return null
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
  const sm = meta.visitScheduleMeta
  if (!sm || typeof sm !== 'object') return null
  const rows = sm.visitPlanDates
  if (!Array.isArray(rows) || !rows.length) return null
  const visitDates = []
  rows.forEach((row, di) => {
    if (!row || typeof row !== 'object') return
    const date = String(row.date || '').trim()
    const slotLabels = (Array.isArray(row.slots) ? row.slots : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
    if (!date || !slotLabels.length) return
    visitDates.push({
      id: `day-${di}`,
      date,
      slots: slotDefsFromStrings(slotLabels),
    })
  })
  return visitDates.length ? visitDates : null
}

function initBoardState(applicants, isReview, mp) {
  if (isReview && (applicants || []).some((a) => a && String(a.assignedVisitAt || '').trim())) {
    return hydrateBoardFromApplicants(applicants)
  }
  const fromPlan = initVisitDatesFromPlanMeta(mp)
  if (fromPlan) {
    const sm =
      mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
        ? mp.mpPublishMeta.visitScheduleMeta
        : null
    return {
      visitDates: fromPlan,
      columns: initColumns(fromPlan),
      shareTable: !(sm && sm.shareTable === false),
      mealCount: Math.max(1, Number((sm && sm.mealCount) || 1)),
      tableSize: Math.max(2, Number((sm && sm.tableSize) || 4)),
    }
  }
  const visitDates = initVisitDates()
  return {
    visitDates,
    columns: initColumns(visitDates),
    shareTable: true,
    mealCount: 1,
    tableSize: 4,
  }
}

function applicantName(a) {
  return String((a && (a.platformNickname || a.name || a.platformAccount || a.id)) || '').trim()
}

function preferredTime(a) {
  return String((a && (a.talentPreferredVisitAt || a.visitTimeSlot)) || '').trim()
}

function buildPool(selectedApplicants) {
  return (selectedApplicants || [])
    .filter((a) => a && a.id)
    .map((a) =>
      enrichApplicantPreference(String(a.id), applicantName(a), preferredTime(a), {
        talentMemberId: String(a.talentMemberId || '').trim() || undefined,
        avatar: String(a.wxAvatarUrl || a.avatarUrl || '').trim() || undefined,
      }),
    )
}

function checkInStatusLabel(a) {
  const checkedIn = String((a && a.visitCheckInAt) || '').trim()
  const assigned = String((a && a.assignedVisitAt) || '').trim()
  if (checkedIn) return { text: `已签到 ${checkedIn}`, tone: 'ok' }
  if (assigned) return { text: '待签到', tone: 'pending' }
  return { text: '未排期', tone: 'none' }
}

function scheduleSnapshotKey(applicantId, time, storeName, tableNote) {
  return `${applicantId}|${String(time || '').trim()}|${String(storeName || '').trim()}|${String(tableNote || '').trim()}`
}

function baselineFromApplicants(applicants) {
  const m = {}
  for (const a of applicants || []) {
    if (!a || !a.id) continue
    const id = String(a.id)
    const assigned = String(a.assignedVisitAt || '').trim()
    if (!assigned) continue
    m[id] = scheduleSnapshotKey(
      id,
      assigned,
      String(a.assignedVisitStore || '').trim(),
      String(a.tableNote || '').trim(),
    )
  }
  return m
}

function rowsToNotify(rows, baseline, reviewOnly) {
  if (!reviewOnly) return rows || []
  return (rows || []).filter((r) => {
    const cur = scheduleSnapshotKey(r.applicantId, r.time, r.storeName, r.tableNote)
    const prev = baseline[String(r.applicantId)]
    return !prev || prev !== cur
  })
}

function rebuildColumnsForSettings(columns, visitDates, shareTable, mealCount) {
  let next = syncColumnsFromVisitDates(visitDates, columns)
  if (shareTable) {
    next = trimTablesToGlobalMax(next, Math.max(1, mealCount))
  } else {
    next = next.map((col) => ({
      ...col,
      tables: col.tables.length > 1 ? [col.tables[0]] : col.tables,
    }))
  }
  return next
}

function capTableSize(shareTable, tableSize) {
  return shareTable ? Math.max(1, tableSize) : 1
}

function buildBoardView(visitDates, columns, pool, shareTable, tableSize, mealCount) {
  const used = assignedIds(columns)
  const unassigned = (pool || []).filter((p) => !used.has(p.id))
  const cap = capTableSize(shareTable, tableSize)
  const maxTotal = shareTable ? Math.max(1, mealCount) : 1
  const totalTables = countTotalTables(columns)
  const days = (visitDates || []).map((day, di) => {
    const dayCols = (columns || []).filter((c) => c.dateId === day.id)
    const slots = (day.slots || []).map((slot) => {
      const col = dayCols.find((c) => c.slotId === slot.id)
      const tables = (col && col.tables) || [{ id: 't1', talentIds: [] }]
      return {
        slotId: slot.id,
        start: slot.start,
        end: slot.end,
        label: slotDefLabel(slot),
        tables: tables.map((t, ti) => ({
          tableId: t.id,
          tableLabel: shareTable ? `第${ti + 1}桌` : '单独探店',
          cap,
          count: (t.talentIds || []).length,
          talents: (t.talentIds || []).map((tid) => {
            const p = (pool || []).find((x) => x.id === tid)
            return p || { id: tid, name: tid }
          }),
        })),
        colKey: `${day.id}:${slot.id}`,
      }
    })
    return {
      dayId: day.id,
      dayIndex: di + 1,
      date: day.date,
      canRemoveDay: (visitDates || []).length > 1,
      slots,
    }
  })
  return { days, unassigned, cap, maxTotal, totalTables, atGlobalTableLimit: shareTable && totalTables >= maxTotal }
}

module.exports = {
  slotDefLabel,
  slotStringsFromVisitDates,
  visitDatesToPlanRows,
  initVisitDates,
  initVisitDatesFromPlanMeta,
  initColumns,
  initBoardState,
  hydrateBoardFromApplicants,
  boardToScheduleRows,
  scheduleRowsFromApplicants,
  syncColumnsFromVisitDates,
  trimTablesToGlobalMax,
  countTotalTables,
  assignedIds,
  buildPool,
  applicantName,
  checkInStatusLabel,
  baselineFromApplicants,
  rowsToNotify,
  scheduleSnapshotKey,
  rebuildColumnsForSettings,
  capTableSize,
  buildBoardView,
  defaultVisitSlotDefs,
  cloneSlotsForNewDay,
  offsetVisitDate,
  isValidVisitTimeRange,
}
