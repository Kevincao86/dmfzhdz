import { useMemo, useState } from 'react'
import {
  buildVisitTimeRange,
  DEFAULT_VISIT_SLOTS,
  defaultVisitPlanDate,
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
): ApplicantLite {
  const parsed = parseTalentPreference(preferred)
  return {
    id,
    name,
    preferred,
    preferredDate: parsed?.dateText || '',
    preferredSlot: parsed?.slotText || '',
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
        const tableNote = opts.shareTable
          ? `拼桌 ${opts.tableSize} 人/桌 · 餐食 ${opts.mealCount} 份 · 第${tIdx + 1}桌${count > 1 ? `（${count}人）` : ''}`
          : `单独探店 · 餐食 ${opts.mealCount} 份`
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

function TalentChip({
  person,
  draggable,
  onDragStart,
  onRemove,
}: {
  person: ApplicantLite
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onRemove?: () => void
}) {
  return (
    <span
      draggable={draggable}
      onDragStart={onDragStart}
      className={`inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-lg border bg-white text-xs shadow-sm ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
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
}: Props) {
  const [dropHint, setDropHint] = useState('')
  const cap = tableCapacity(shareTable, tableSize)

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
    const id = `day-${Date.now()}`
    const last = visitDates[visitDates.length - 1]
    const date = offsetVisitDate(last?.date || defaultVisitPlanDate(), 1)
    const slots = cloneSlotsForNewDay(last?.slots?.length ? last.slots : defaultVisitSlotDefs())
    const nextDates = [...visitDates, { id, date, slots }]
    onVisitDatesChange(nextDates)
    syncColumnsFromVisitDates(nextDates)
  }

  function removeVisitDate(id: string) {
    if (visitDates.length <= 1) return
    const nextDates = visitDates.filter((d) => d.id !== id)
    onVisitDatesChange(nextDates)
    onColumnsChange(columns.filter((c) => c.dateId !== id))
  }

  function updateVisitDate(id: string, date: string) {
    onVisitDatesChange(visitDates.map((d) => (d.id === id ? { ...d, date } : d)))
  }

  function addSlotDef(dateId: string) {
    const slotId = `slot-${Date.now()}`
    const nextDates = visitDates.map((d) =>
      d.id === dateId ? { ...d, slots: [...d.slots, { id: slotId, start: '14:00', end: '17:00' }] } : d,
    )
    onVisitDatesChange(nextDates)
    syncColumnsFromVisitDates(nextDates)
  }

  function removeSlotDef(dateId: string, slotId: string) {
    const day = visitDates.find((d) => d.id === dateId)
    if (!day || day.slots.length <= 1) return
    const nextDates = visitDates.map((d) =>
      d.id === dateId ? { ...d, slots: d.slots.filter((s) => s.id !== slotId) } : d,
    )
    onVisitDatesChange(nextDates)
    onColumnsChange(columns.filter((c) => !(c.dateId === dateId && c.slotId === slotId)))
  }

  function updateSlotDef(dateId: string, slotId: string, patch: Partial<VisitSlotDef>) {
    onVisitDatesChange(
      visitDates.map((d) =>
        d.id === dateId
          ? { ...d, slots: d.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) }
          : d,
      ),
    )
  }

  function slotsForDay(dateId: string): VisitSlotDef[] {
    return visitDates.find((d) => d.id === dateId)?.slots || []
  }

  function addTable(dateId: string, slotId: string) {
    onColumnsChange(
      columns.map((col) =>
        col.dateId === dateId && col.slotId === slotId
          ? { ...col, tables: [...col.tables, { id: `t-${Date.now()}`, talentIds: [] }] }
          : col,
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
          <span className="text-sm font-medium">排期日期（可添加 3–5 天，每天可单独设置时段）</span>
          <button type="button" className="text-xs px-2 py-1 rounded border" onClick={addVisitDate}>
            + 添加日期
          </button>
        </div>
        {visitDates.map((day, idx) => (
          <div key={day.id} className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--shell-muted)]">第 {idx + 1} 天</span>
              <input
                type="date"
                className="rounded-lg border px-2 py-1.5 panel-input text-sm"
                value={day.date}
                onChange={(e) => updateVisitDate(day.id, e.target.value)}
              />
              {visitDates.length > 1 ? (
                <button type="button" className="text-xs text-red-600 ml-auto" onClick={() => removeVisitDate(day.id)}>
                  删除日期
                </button>
              ) : null}
            </div>
            <div className="space-y-2 pl-3 border-l-2 border-violet-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--shell-muted)]">可探店时段（开始/结束）</span>
                <button type="button" className="text-xs px-2 py-1 rounded border" onClick={() => addSlotDef(day.id)}>
                  + 添加时段
                </button>
              </div>
              {day.slots.map((slot) => (
                <div key={slot.id} className="flex flex-wrap items-end gap-2 rounded-lg border p-2 bg-slate-50/50">
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
                <TalentChip person={p} />
              </div>
            ))
          ) : (
            <span className="text-xs text-[var(--shell-muted)]">已全部拖入排期格</span>
          )}
        </div>
      </div>

      {dropHint ? <p className="text-xs text-amber-700">{dropHint}</p> : null}

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
                        <span className="text-sm font-medium">{label}</span>
                        {shareTable ? (
                          <button
                            type="button"
                            className="text-xs px-2 py-0.5 rounded border"
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
