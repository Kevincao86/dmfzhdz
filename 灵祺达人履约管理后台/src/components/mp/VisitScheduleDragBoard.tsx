import { useMemo, useState } from 'react'
import {
  buildVisitTimeRange,
  DEFAULT_VISIT_SLOTS,
  defaultVisitPlanDate,
  formatScheduleTableNote,
  isValidVisitTimeRange,
  parseVisitTimeRange,
  type VisitScheduleRow,
} from '../../lib/mpSync/visitScheduleRuntime'

export type VisitSlotDef = { id: string; start: string; end: string }
export type VisitDateDef = { id: string; date: string; slots: VisitSlotDef[] }

export type ScheduleTable = { id: string; talentIds: string[] }
export type ScheduleColumn = { dateId: string; slotId: string; tables: ScheduleTable[] }

export type ApplicantLite = {
  id: string
  name: string
  preferred?: string
  preferredDate?: string
  preferredSlot?: string
  talentMemberId?: string
  avatar?: string
}

type Props = {
  visitDates: VisitDateDef[]
  onVisitDatesChange: (next: VisitDateDef[]) => void
  columns: ScheduleColumn[]
  onColumnsChange: (next: ScheduleColumn[]) => void
  pool: ApplicantLite[]
  shareTable: boolean
  tableSize: number
  storeName: string
  mealCount: number
  onCommunicate?: (person: ApplicantLite) => void
  chatLoadingId?: string
  /** PR 已确认可探店日期后，禁止再改日期/时段 */
  datesLocked?: boolean
}

export function slotDefLabel(slot: VisitSlotDef): string {
  return buildVisitTimeRange(slot.start, slot.end)
}

export function slotDefsFromStrings(slots: string[]): VisitSlotDef[] {
  return slots.map((raw, i) => {
    const { start, end } = parseVisitTimeRange(raw)
    return { id: `slot-${i}-${start}`, start, end }
  })
}

export function slotStringsFromDefs(defs: VisitSlotDef[]): string[] {
  return defs.map(slotDefLabel).filter(Boolean)
}

export function defaultVisitSlotDefs(): VisitSlotDef[] {
  return slotDefsFromStrings([...DEFAULT_VISIT_SLOTS])
}

export function slotStringsFromVisitDates(dates: VisitDateDef[]): string[] {
  const out: string[] = []
  for (const day of dates) {
    for (const slot of day.slots) {
      const label = slotDefLabel(slot)
      if (!label) continue
      const time = formatVisitRowTime(day.date, label)
      if (time) out.push(time)
    }
  }
  return out
}

function cloneSlotsForNewDay(slots: VisitSlotDef[]): VisitSlotDef[] {
  const ts = Date.now()
  return slots.map((s, i) => ({ ...s, id: `slot-${ts}-${i}` }))
}

export function parseTalentPreference(pref?: string): { dateText: string; slotText: string } | null {
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

export function enrichApplicantPreference(
  id: string,
  name: string,
  preferred?: string,
  extra?: { talentMemberId?: string; avatar?: string },
): ApplicantLite {
  const parsed = parseTalentPreference(preferred)
  return {
    id,
    name,
    preferred,
    preferredDate: parsed?.dateText || '',
    preferredSlot: parsed?.slotText || '',
    talentMemberId: extra?.talentMemberId,
    avatar: extra?.avatar,
  }
}

function formatVisitRowTime(visitDate: string, visitSlot: string): string {
  const m = String(visitDate || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const slot = String(visitSlot || '').trim()
  if (!m || !slot) return ''
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])} ${slot}`
}

function offsetVisitDate(base: string, days: number): string {
  const m = String(base || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return defaultVisitPlanDate()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function initVisitDates(): VisitDateDef[] {
  return [{ id: 'day-0', date: defaultVisitPlanDate(), slots: defaultVisitSlotDefs() }]
}

export function initVisitDatesFromPlanMeta(mp: Record<string, unknown> | null | undefined): VisitDateDef[] | null {
  const meta = mp?.mpPublishMeta
  if (!meta || typeof meta !== 'object') return null
  const sm = (meta as Record<string, unknown>).visitScheduleMeta
  if (!sm || typeof sm !== 'object' || Array.isArray(sm)) return null
  const rows = (sm as Record<string, unknown>).visitPlanDates
  if (!Array.isArray(rows) || !rows.length) return null
  const visitDates: VisitDateDef[] = []
  rows.forEach((row, di) => {
    if (!row || typeof row !== 'object') return
    const date = String((row as Record<string, unknown>).date || '').trim()
    const slotLabels = (Array.isArray((row as Record<string, unknown>).slots)
      ? ((row as Record<string, unknown>).slots as unknown[])
      : []
    )
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

export function initColumns(visitDates: VisitDateDef[]): ScheduleColumn[] {
  const cols: ScheduleColumn[] = []
  for (const day of visitDates) {
    for (const slot of day.slots) {
      cols.push({ dateId: day.id, slotId: slot.id, tables: [{ id: 't1', talentIds: [] }] })
    }
  }
  return cols
}

export function boardToScheduleRows(
  columns: ScheduleColumn[],
  visitDates: VisitDateDef[],
  opts: {
    storeName: string
    shareTable: boolean
    tableSize: number
    mealCount: number
  },
): VisitScheduleRow[] {
  const slotLabelByKey = new Map<string, string>()
  const dateById = new Map(visitDates.map((d) => [d.id, d.date]))
  for (const day of visitDates) {
    for (const slot of day.slots) {
      slotLabelByKey.set(`${day.id}:${slot.id}`, slotDefLabel(slot))
    }
  }
  const rows: VisitScheduleRow[] = []
  for (const col of columns) {
    const slotLabel = slotLabelByKey.get(`${col.dateId}:${col.slotId}`) || ''
    const visitDate = dateById.get(col.dateId) || ''
    if (!slotLabel || !visitDate) continue
    const time = formatVisitRowTime(visitDate, slotLabel)
    if (!time) continue
    col.tables.forEach((table, tIdx) => {
      const count = table.talentIds.length
      table.talentIds.forEach((applicantId) => {
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

function assignedToIsoDate(raw: string): string | null {
  const parsed = parseTalentPreference(raw)
  if (!parsed?.dateText) return null
  const m = parsed.dateText.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

export function scheduleRowsFromApplicants(
  applicants: Record<string, unknown>[],
  storeName: string,
): VisitScheduleRow[] {
  return (applicants || [])
    .filter((a) => a && String(a.assignedVisitAt || '').trim())
    .map((a) => ({
      applicantId: String(a.id),
      time: String(a.assignedVisitAt),
      storeName: String(a.assignedVisitStore || storeName || '').trim() || storeName,
      tableNote: String(a.tableNote || '').trim() || undefined,
    }))
}

export function hydrateBoardFromApplicants(applicants: Record<string, unknown>[]): {
  visitDates: VisitDateDef[]
  columns: ScheduleColumn[]
  shareTable: boolean
  mealCount: number
  tableSize: number
} {
  const assigned = (applicants || []).filter((a) => a && String(a.assignedVisitAt || '').trim())
  if (!assigned.length) {
    const visitDates = initVisitDates()
    return { visitDates, columns: initColumns(visitDates), shareTable: true, mealCount: 1, tableSize: 4 }
  }

  const groups = new Map<string, string[]>()
  const dateSet = new Set<string>()
  const slotByKey = new Map<string, string>()

  for (const a of assigned) {
    const raw = String(a.assignedVisitAt || '').trim()
    const parsed = parseTalentPreference(raw)
    const iso = assignedToIsoDate(raw)
    const slotText = parsed?.slotText || ''
    if (!iso || !slotText) continue
    const key = `${iso}|${slotText}`
    dateSet.add(iso)
    slotByKey.set(key, slotText)
    const list = groups.get(key) || []
    list.push(String(a.id))
    groups.set(key, list)
  }

  const sortedDates = [...dateSet].sort()
  const visitDates: VisitDateDef[] = sortedDates.map((date, di) => {
    const slotLabels = new Set<string>()
    for (const [key, slotText] of slotByKey.entries()) {
      if (key.startsWith(`${date}|`)) slotLabels.add(slotText)
    }
    const slots = [...slotLabels].map((slotText, si) => {
      const { start, end } = parseVisitTimeRange(slotText)
      return { id: `slot-${di}-${si}`, start, end }
    })
    return { id: `day-${di}`, date, slots: slots.length ? slots : defaultVisitSlotDefs() }
  })

  if (!visitDates.length) {
    const vd = initVisitDates()
    return { visitDates: vd, columns: initColumns(vd), shareTable: true, mealCount: 1, tableSize: 4 }
  }

  const columns: ScheduleColumn[] = []
  for (const day of visitDates) {
    for (const slot of day.slots) {
      const label = slotDefLabel(slot)
      const key = `${day.date}|${label}`
      const talentIds = groups.get(key) || []
      columns.push({
        dateId: day.id,
        slotId: slot.id,
        tables: talentIds.length
          ? [{ id: 't1', talentIds }]
          : [{ id: 't1', talentIds: [] }],
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

function assignedIds(columns: ScheduleColumn[]): Set<string> {
  const out = new Set<string>()
  for (const col of columns) {
    for (const table of col.tables) {
      for (const id of table.talentIds) out.add(id)
    }
  }
  return out
}

function tableCapacity(shareTable: boolean, tableSize: number): number {
  return shareTable ? Math.max(1, tableSize) : 1
}

export function countTotalTables(columns: ScheduleColumn[]): number {
  return columns.reduce((n, c) => n + c.tables.length, 0)
}

export function trimTablesToGlobalMax(columns: ScheduleColumn[], maxTotal: number): ScheduleColumn[] {
  const cols = columns.map((c) => ({
    ...c,
    tables: c.tables.map((t) => ({ ...t, talentIds: [...t.talentIds] })),
  }))
  let total = countTotalTables(cols)
  if (total <= maxTotal) return cols

  for (let ci = cols.length - 1; ci >= 0 && total > maxTotal; ci--) {
    for (let ti = cols[ci].tables.length - 1; ti >= 0 && total > maxTotal; ti--) {
      if (cols[ci].tables.length <= 1) break
      if (!cols[ci].tables[ti].talentIds.length) {
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

  for (let ci = cols.length - 1; ci >= 0 && total > maxTotal; ci--) {
    const hasTalent = cols[ci].tables.some((t) => t.talentIds.length > 0)
    if (!hasTalent && cols[ci].tables.length > 0) {
      cols[ci].tables.pop()
      total--
    }
  }

  return cols
}

function normalizeIsoDateKey(raw: string): string {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`
}

function normalizeSlotCompareKey(raw: string): string {
  const parsed = parseVisitTimeRange(String(raw || '').trim())
  const ranged = buildVisitTimeRange(parsed.start, parsed.end)
  return ranged || String(raw || '').trim().replace(/\s+/g, ' ')
}

export function resolveColumnForScheduleTime(
  visitDates: VisitDateDef[],
  time: string,
): { dateId: string; slotId: string } | null {
  const parsed = parseTalentPreference(time)
  if (!parsed) return null
  const targetDate = parsed.dateText ? normalizeIsoDateKey(parsed.dateText) : ''
  const targetSlot = parsed.slotText ? normalizeSlotCompareKey(parsed.slotText) : ''

  let dateSlotFallback: { dateId: string; slotId: string } | null = null
  let slotFallback: { dateId: string; slotId: string } | null = null

  for (const day of visitDates) {
    const dayKey = normalizeIsoDateKey(day.date.replace(/-/g, '/'))
    for (const slot of day.slots) {
      const label = slotDefLabel(slot)
      const slotKey = normalizeSlotCompareKey(label)
      const loc = { dateId: day.id, slotId: slot.id }
      if (targetDate && targetSlot && dayKey === targetDate && slotKey === targetSlot) return loc
      if (targetDate && dayKey === targetDate && !dateSlotFallback) dateSlotFallback = loc
      if (targetSlot && slotKey === targetSlot && !slotFallback) slotFallback = loc
    }
  }
  return dateSlotFallback || slotFallback
}

export function normalizeScheduleRowsToPlan(
  rows: VisitScheduleRow[],
  visitDates: VisitDateDef[],
  visitSlots: string[],
): VisitScheduleRow[] {
  const slotOptions = (visitSlots || []).filter(Boolean)
  return (rows || []).map((row) => {
    const loc = resolveColumnForScheduleTime(visitDates, row.time)
    if (loc) {
      const day = visitDates.find((d) => d.id === loc.dateId)
      const slot = day?.slots.find((s) => s.id === loc.slotId)
      if (day && slot) {
        const time = formatVisitRowTime(day.date, slotDefLabel(slot))
        if (time) return { ...row, time }
      }
    }
    if (!slotOptions.length) return row
    const preferred = String(row.time || '').trim()
    let best = slotOptions[0]!
    let bestScore = -1
    const prefDate = preferred.match(/\d{4}/) ? normalizeIsoDateKey(preferred.split(/\s+/)[0] || '') : ''
    const prefSlot = normalizeSlotCompareKey(preferred.includes(' ') ? preferred.split(/\s+/).slice(1).join(' ') : preferred)
    for (const opt of slotOptions) {
      const parsed = parseTalentPreference(opt)
      if (!parsed) continue
      let score = 0
      const optDate = parsed.dateText ? normalizeIsoDateKey(parsed.dateText) : ''
      const optSlot = normalizeSlotCompareKey(parsed.slotText)
      if (prefDate && optDate === prefDate) score += 10
      if (prefSlot && optSlot === prefSlot) score += 10
      if (prefDate && prefSlot && optDate === prefDate && optSlot === prefSlot) score += 20
      if (score > bestScore) {
        bestScore = score
        best = opt
      }
    }
    return { ...row, time: best }
  })
}

export function applyScheduleRowsToBoard(
  columns: ScheduleColumn[],
  visitDates: VisitDateDef[],
  rows: VisitScheduleRow[],
  opts: { shareTable: boolean; tableSize: number; mealCount: number },
): ScheduleColumn[] {
  const cap = tableCapacity(opts.shareTable, opts.tableSize)
  const maxTotal = opts.shareTable ? Math.max(1, opts.mealCount) : 1
  let next = columns.map((col) => ({
    ...col,
    tables: col.tables.map((t) => ({ ...t, talentIds: [] as string[] })),
  }))

  for (const row of rows || []) {
    const applicantId = String(row.applicantId || '').trim()
    if (!applicantId) continue
    const loc = resolveColumnForScheduleTime(visitDates, row.time)
    if (!loc) continue

    next = next.map((col) => ({
      ...col,
      tables: col.tables.map((t) => ({
        ...t,
        talentIds: t.talentIds.filter((id) => id !== applicantId),
      })),
    }))

    const colIdx = next.findIndex((c) => c.dateId === loc.dateId && c.slotId === loc.slotId)
    if (colIdx < 0) continue
    const col = next[colIdx]!

    let placed = false
    for (const table of col.tables) {
      if (!table.talentIds.includes(applicantId) && table.talentIds.length < cap) {
        table.talentIds = [...table.talentIds, applicantId]
        placed = true
        break
      }
    }
    if (placed) continue

    if (opts.shareTable && countTotalTables(next) < maxTotal) {
      col.tables = [...col.tables, { id: `t-${Date.now()}-${applicantId}`, talentIds: [applicantId] }]
      continue
    }

    const fallback = col.tables.find((t) => t.talentIds.length < cap)
    if (fallback) {
      fallback.talentIds = [...fallback.talentIds, applicantId]
    }
  }

  return trimTablesToGlobalMax(next, maxTotal)
}

function TalentChip({
  person,
  draggable,
  onDragStart,
  onRemove,
  onCommunicate,
  chatting,
}: {
  person: ApplicantLite
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onRemove?: () => void
  onCommunicate?: (person: ApplicantLite) => void
  chatting?: boolean
}) {
  return (
    <div className="inline-flex flex-col items-stretch gap-1 px-2 py-1.5 rounded-lg border bg-white text-xs shadow-sm min-w-[120px]">
      <span
        draggable={draggable}
        onDragStart={onDragStart}
        className={`inline-flex flex-col items-start gap-0.5 ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <span className="inline-flex items-center gap-1 font-medium text-sm text-slate-800">
          {person.name}
          {onRemove ? (
            <button type="button" className="text-violet-500 hover:text-red-600" onClick={onRemove}>
              ×
            </button>
          ) : null}
        </span>
        {person.preferredDate || person.preferredSlot ? (
          <span className="text-[10px] leading-tight text-amber-700">
            {person.preferredDate ? `意向 ${person.preferredDate}` : '意向'}
            {person.preferredSlot ? ` ${person.preferredSlot}` : ''}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--shell-muted)]">未填探店意向</span>
        )}
      </span>
      {onCommunicate ? (
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 rounded border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          disabled={chatting}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onCommunicate(person)
          }}
        >
          {chatting ? '连接中…' : '沟通'}
        </button>
      ) : null}
    </div>
  )
}

export default function VisitScheduleDragBoard({
  visitDates,
  onVisitDatesChange,
  columns,
  onColumnsChange,
  pool,
  shareTable,
  tableSize,
  mealCount,
  onCommunicate,
  chatLoadingId,
  datesLocked = false,
}: Props) {
  const [dropHint, setDropHint] = useState('')
  const cap = tableCapacity(shareTable, tableSize)
  const maxTotalTables = shareTable ? Math.max(1, mealCount) : 1
  const totalTables = useMemo(() => countTotalTables(columns), [columns])
  const atGlobalTableLimit = shareTable && totalTables >= maxTotalTables

  const unassigned = useMemo(() => {
    const used = assignedIds(columns)
    return pool.filter((p) => !used.has(p.id))
  }, [columns, pool])

  const columnsByDate = useMemo(() => {
    const map = new Map<string, ScheduleColumn[]>()
    for (const col of columns) {
      const list = map.get(col.dateId) || []
      list.push(col)
      map.set(col.dateId, list)
    }
    return map
  }, [columns])

  function syncColumnsFromVisitDates(dates: VisitDateDef[]) {
    const prev = new Map(columns.map((c) => [`${c.dateId}:${c.slotId}`, c]))
    const next: ScheduleColumn[] = []
    for (const day of dates) {
      for (const slot of day.slots) {
        const key = `${day.id}:${slot.id}`
        next.push(prev.get(key) || { dateId: day.id, slotId: slot.id, tables: [{ id: 't1', talentIds: [] }] })
      }
    }
    onColumnsChange(next)
  }

  function addVisitDate() {
    if (datesLocked) return
    const id = `day-${Date.now()}`
    const last = visitDates[visitDates.length - 1]
    const date = offsetVisitDate(last?.date || defaultVisitPlanDate(), 1)
    const slots = cloneSlotsForNewDay(last?.slots?.length ? last.slots : defaultVisitSlotDefs())
    const nextDates = [...visitDates, { id, date, slots }]
    onVisitDatesChange(nextDates)
    syncColumnsFromVisitDates(nextDates)
  }

  function removeVisitDate(id: string) {
    if (datesLocked) return
    if (visitDates.length <= 1) return
    const nextDates = visitDates.filter((d) => d.id !== id)
    onVisitDatesChange(nextDates)
    onColumnsChange(columns.filter((c) => c.dateId !== id))
  }

  function updateVisitDate(id: string, date: string) {
    if (datesLocked) return
    onVisitDatesChange(visitDates.map((d) => (d.id === id ? { ...d, date } : d)))
  }

  function addSlotDef(dateId: string) {
    if (datesLocked) return
    const slotId = `slot-${Date.now()}`
    const nextDates = visitDates.map((d) =>
      d.id === dateId ? { ...d, slots: [...d.slots, { id: slotId, start: '14:00', end: '17:00' }] } : d,
    )
    onVisitDatesChange(nextDates)
    syncColumnsFromVisitDates(nextDates)
  }

  function removeSlotDef(dateId: string, slotId: string) {
    if (datesLocked) return
    const day = visitDates.find((d) => d.id === dateId)
    if (!day || day.slots.length <= 1) return
    const nextDates = visitDates.map((d) =>
      d.id === dateId ? { ...d, slots: d.slots.filter((s) => s.id !== slotId) } : d,
    )
    onVisitDatesChange(nextDates)
    onColumnsChange(columns.filter((c) => !(c.dateId === dateId && c.slotId === slotId)))
  }

  function updateSlotDef(dateId: string, slotId: string, patch: Partial<VisitSlotDef>) {
    if (datesLocked) return
    const day = visitDates.find((d) => d.id === dateId)
    const slot = day?.slots.find((s) => s.id === slotId)
    if (!slot) return
    const next = { ...slot, ...patch }
    if (patch.start != null || patch.end != null) {
      const start = patch.start != null ? patch.start : slot.start
      let end = patch.end != null ? patch.end : slot.end
      if (!isValidVisitTimeRange(start, end)) {
        if (patch.start != null && isValidVisitTimeRange(start, slot.end)) end = slot.end
        else if (patch.end != null && isValidVisitTimeRange(slot.start, end)) {
          /* keep */
        } else {
          setDropHint('结束时间须晚于开始时间')
          return
        }
        if (!isValidVisitTimeRange(start, end)) {
          setDropHint('结束时间须晚于开始时间')
          return
        }
      }
      next.start = start
      next.end = end
    }
    setDropHint('')
    onVisitDatesChange(
      visitDates.map((d) =>
        d.id === dateId
          ? { ...d, slots: d.slots.map((s) => (s.id === slotId ? next : s)) }
          : d,
      ),
    )
  }

  function slotsForDay(dateId: string): VisitSlotDef[] {
    return visitDates.find((d) => d.id === dateId)?.slots || []
  }

  function addTable(dateId: string, slotId: string) {
    const col = columns.find((c) => c.dateId === dateId && c.slotId === slotId)
    if (!col) return
    if (totalTables >= maxTotalTables) {
      setDropHint(`全排期桌数已达上限，共最多 ${maxTotalTables} 桌（餐食 ${mealCount} 份）`)
      return
    }
    setDropHint('')
    onColumnsChange(
      columns.map((c) =>
        c.dateId === dateId && c.slotId === slotId
          ? { ...c, tables: [...c.tables, { id: `t-${Date.now()}`, talentIds: [] }] }
          : c,
      ),
    )
  }

  function dropTalent(dateId: string, slotId: string, tableId: string, talentId: string) {
    if (!talentId) return
    const target = columns.find((c) => c.dateId === dateId && c.slotId === slotId)
    const table = target?.tables.find((t) => t.id === tableId)
    if (!table) return
    if (!table.talentIds.includes(talentId) && table.talentIds.length >= cap) {
      setDropHint(shareTable ? `该桌已满，最多 ${cap} 人` : '单独探店每格仅可 1 人')
      return
    }
    setDropHint('')
    const cleared = columns.map((col) => ({
      ...col,
      tables: col.tables.map((t) => ({
        ...t,
        talentIds: t.talentIds.filter((id) => id !== talentId),
      })),
    }))
    const updated = cleared.map((col) => {
      if (col.dateId !== dateId || col.slotId !== slotId) return col
      return {
        ...col,
        tables: col.tables.map((t) =>
          t.id === tableId && !t.talentIds.includes(talentId)
            ? { ...t, talentIds: [...t.talentIds, talentId] }
            : t,
        ),
      }
    })
    onColumnsChange(updated)
  }

  function onDragStart(e: React.DragEvent, talentId: string) {
    e.dataTransfer.setData('text/applicant-id', talentId)
    e.dataTransfer.effectAllowed = 'move'
    setDropHint('')
  }

  function onDropZone(e: React.DragEvent, dateId: string, slotId: string, tableId: string) {
    e.preventDefault()
    dropTalent(dateId, slotId, tableId, e.dataTransfer.getData('text/applicant-id'))
  }

  function removeFromBoard(talentId: string) {
    setDropHint('')
    onColumnsChange(
      columns.map((col) => ({
        ...col,
        tables: col.tables.map((t) => ({
          ...t,
          talentIds: t.talentIds.filter((id) => id !== talentId),
        })),
      })),
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {datesLocked ? '已设置的可探店日期与时段' : '排期日期（可添加 3–5 天，每天可单独设置时段）'}
          </span>
          {!datesLocked ? (
            <button type="button" className="text-xs px-2 py-1 rounded border" onClick={addVisitDate}>
              + 添加日期
            </button>
          ) : null}
        </div>
        {visitDates.map((day, idx) => (
          <div key={day.id} className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--shell-muted)]">第 {idx + 1} 天</span>
              {datesLocked ? (
                <span className="text-sm font-medium">{day.date.replace(/-/g, '/')}</span>
              ) : (
                <input
                  type="date"
                  className="rounded-lg border px-2 py-1.5 panel-input text-sm"
                  value={day.date}
                  onChange={(e) => updateVisitDate(day.id, e.target.value)}
                />
              )}
              {!datesLocked && visitDates.length > 1 ? (
                <button type="button" className="text-xs text-red-600 ml-auto" onClick={() => removeVisitDate(day.id)}>
                  删除日期
                </button>
              ) : null}
            </div>
            <div className="space-y-2 pl-3 border-l-2 border-violet-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--shell-muted)]">可探店时段（开始/结束）</span>
                {!datesLocked ? (
                  <button type="button" className="text-xs px-2 py-1 rounded border" onClick={() => addSlotDef(day.id)}>
                    + 添加时段
                  </button>
                ) : null}
              </div>
              {day.slots.map((slot) => (
                <div key={slot.id} className="flex flex-wrap items-end gap-2 rounded-lg border p-2 bg-slate-50/50">
                  {datesLocked ? (
                    <span className="text-sm font-medium text-slate-800">{slotDefLabel(slot)}</span>
                  ) : (
                    <>
                      <label className="text-xs">
                        开始
                        <input
                          type="time"
                          className="block mt-1 rounded border px-2 py-1 panel-input"
                          value={slot.start}
                          onChange={(e) => updateSlotDef(day.id, slot.id, { start: e.target.value })}
                        />
                      </label>
                      <label className="text-xs">
                        结束
                        <input
                          type="time"
                          className="block mt-1 rounded border px-2 py-1 panel-input"
                          value={slot.end}
                          onChange={(e) => updateSlotDef(day.id, slot.id, { end: e.target.value })}
                        />
                      </label>
                      <span className="text-xs text-[var(--shell-muted)] pb-1">
                        {isValidVisitTimeRange(slot.start, slot.end) ? slotDefLabel(slot) : '时段无效'}
                      </span>
                      {day.slots.length > 1 ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 ml-auto"
                          onClick={() => removeSlotDef(day.id, slot.id)}
                        >
                          删除
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">待排期达人（拖到下方日期×时段{shareTable ? ' / 桌位' : ''}）</p>
        <div className="flex flex-wrap gap-2 min-h-[52px] p-2 rounded-lg border border-dashed bg-slate-50/80">
          {unassigned.length ? (
            unassigned.map((p) => (
              <div key={p.id} draggable onDragStart={(e) => onDragStart(e, p.id)} className="cursor-grab">
                <TalentChip
                  person={p}
                  onCommunicate={onCommunicate}
                  chatting={chatLoadingId === p.id}
                />
              </div>
            ))
          ) : (
            <span className="text-xs text-[var(--shell-muted)]">已全部拖入排期格</span>
          )}
        </div>
      </div>

      {dropHint ? <p className="text-xs text-amber-700">{dropHint}</p> : null}

      {shareTable ? (
        <p className="text-xs text-[var(--shell-muted)]">
          全排期桌位：<span className="font-medium text-slate-700">{totalTables}</span> / {maxTotalTables} 桌（餐食份数）
        </p>
      ) : null}

      <div className="space-y-6">
        {visitDates.map((day, dayIdx) => {
          const dayCols = columnsByDate.get(day.id) || []
          const dateLabel = day.date.replace(/-/g, '/')
          return (
            <div key={day.id} className="space-y-3">
              <h4 className="text-sm font-semibold text-violet-800 border-b border-violet-100 pb-1">
                {dateLabel || `第 ${dayIdx + 1} 天`}
              </h4>
              <div className="grid gap-3 lg:grid-cols-3">
                {dayCols.map((col) => {
                  const slot = slotsForDay(day.id).find((s) => s.id === col.slotId)
                  const label = slot ? slotDefLabel(slot) : col.slotId
                  const full = col.tables.some((t) => t.talentIds.length >= cap)
                  return (
                    <div
                      key={`${col.dateId}-${col.slotId}`}
                      className={`rounded-xl border p-3 space-y-2 ${full ? 'bg-amber-50/40' : 'bg-violet-50/30'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {label}
                          {shareTable && col.tables.length ? (
                            <span className="text-xs text-[var(--shell-muted)] font-normal ml-1">
                              （{col.tables.length} 桌）
                            </span>
                          ) : null}
                        </span>
                        {shareTable ? (
                          <button
                            type="button"
                            className="text-xs px-2 py-0.5 rounded border disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={atGlobalTableLimit}
                            onClick={() => addTable(col.dateId, col.slotId)}
                          >
                            + 加一桌
                          </button>
                        ) : null}
                      </div>
                      {col.tables.map((table, tIdx) => {
                        const isFull = table.talentIds.length >= cap
                        return (
                          <div
                            key={table.id}
                            className={`min-h-[80px] rounded-lg border-2 border-dashed p-2 ${
                              isFull ? 'border-amber-300 bg-amber-50/50' : 'border-violet-200 bg-white'
                            }`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => onDropZone(e, col.dateId, col.slotId, table.id)}
                          >
                            <p className="text-xs text-[var(--shell-muted)] mb-1">
                              {shareTable
                                ? `第 ${tIdx + 1} 桌（${table.talentIds.length}/${cap} 人）`
                                : `单独探店（${table.talentIds.length}/${cap}）`}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {table.talentIds.map((tid) => {
                                const p = pool.find((x) => x.id === tid)
                                if (!p) return null
                                return (
                                  <TalentChip
                                    key={tid}
                                    person={p}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, tid)}
                                    onRemove={() => removeFromBoard(tid)}
                                    onCommunicate={onCommunicate}
                                    chatting={chatLoadingId === tid}
                                  />
                                )
                              })}
                              {!table.talentIds.length ? (
                                <span className="text-xs text-[var(--shell-muted)]">拖入达人</span>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
