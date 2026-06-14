import { useMemo } from 'react'
import {
  buildVisitTimeRange,
  defaultVisitPlanDate,
  isValidVisitTimeRange,
  parseVisitTimeRange,
  type VisitScheduleRow,
} from '../../lib/mpSync/visitScheduleRuntime'

export type VisitSlotDef = { id: string; start: string; end: string }

export type ScheduleTable = { id: string; talentIds: string[] }
export type ScheduleColumn = { slotId: string; tables: ScheduleTable[] }

type ApplicantLite = { id: string; name: string; preferred?: string }

type Props = {
  visitDate: string
  onVisitDateChange: (v: string) => void
  slotDefs: VisitSlotDef[]
  onSlotDefsChange: (next: VisitSlotDef[]) => void
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

function formatVisitRowTime(visitDate: string, visitSlot: string): string {
  const m = String(visitDate || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const slot = String(visitSlot || '').trim()
  if (!m || !slot) return ''
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])} ${slot}`
}

export function boardToScheduleRows(
  columns: ScheduleColumn[],
  slotDefs: VisitSlotDef[],
  opts: {
    visitDate: string
    storeName: string
    shareTable: boolean
    tableSize: number
    mealCount: number
  },
): VisitScheduleRow[] {
  const labelById = new Map(slotDefs.map((s) => [s.id, slotDefLabel(s)]))
  const rows: VisitScheduleRow[] = []
  for (const col of columns) {
    const slotLabel = labelById.get(col.slotId) || ''
    if (!slotLabel) continue
    const time = formatVisitRowTime(opts.visitDate, slotLabel)
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
          tableGroupId: opts.shareTable ? `table-${col.slotId}-${table.id}` : `solo-${applicantId}`,
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

export default function VisitScheduleDragBoard({
  visitDate,
  onVisitDateChange,
  slotDefs,
  onSlotDefsChange,
  columns,
  onColumnsChange,
  pool,
  shareTable,
  tableSize,
}: Props) {
  const unassigned = useMemo(() => {
    const used = assignedIds(columns)
    return pool.filter((p) => !used.has(p.id))
  }, [columns, pool])

  function addSlotDef() {
    const id = `slot-${Date.now()}`
    onSlotDefsChange([...slotDefs, { id, start: '14:00', end: '17:00' }])
    onColumnsChange([...columns, { slotId: id, tables: [{ id: 't1', talentIds: [] }] }])
  }

  function removeSlotDef(id: string) {
    if (slotDefs.length <= 1) return
    onSlotDefsChange(slotDefs.filter((s) => s.id !== id))
    onColumnsChange(columns.filter((c) => c.slotId !== id))
  }

  function updateSlotDef(id: string, patch: Partial<VisitSlotDef>) {
    onSlotDefsChange(slotDefs.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  function addTable(slotId: string) {
    onColumnsChange(
      columns.map((col) =>
        col.slotId === slotId
          ? { ...col, tables: [...col.tables, { id: `t-${Date.now()}`, talentIds: [] }] }
          : col,
      ),
    )
  }

  function dropTalent(slotId: string, tableId: string, talentId: string) {
    if (!talentId) return
    const next = columns.map((col) => ({
      ...col,
      tables: col.tables.map((t) => ({
        ...t,
        talentIds: t.talentIds.filter((id) => id !== talentId),
      })),
    }))
    const updated = next.map((col) => {
      if (col.slotId !== slotId) return col
      return {
        ...col,
        tables: col.tables.map((t) =>
          t.id === tableId ? { ...t, talentIds: [...t.talentIds, talentId] } : t,
        ),
      }
    })
    onColumnsChange(updated)
  }

  function onDragStart(e: React.DragEvent, talentId: string) {
    e.dataTransfer.setData('text/applicant-id', talentId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDropZone(e: React.DragEvent, slotId: string, tableId: string) {
    e.preventDefault()
    const talentId = e.dataTransfer.getData('text/applicant-id')
    dropTalent(slotId, tableId, talentId)
  }

  function removeFromBoard(talentId: string) {
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-[var(--shell-muted)]">排期日期</span>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border px-2 py-1.5 panel-input"
            value={visitDate || defaultVisitPlanDate()}
            onChange={(e) => onVisitDateChange(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">可探店时段（开始/结束，可添加多个）</span>
          <button type="button" className="text-xs px-2 py-1 rounded border" onClick={addSlotDef}>
            + 添加时段
          </button>
        </div>
        {slotDefs.map((slot) => (
          <div key={slot.id} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
            <label className="text-xs">
              开始
              <input
                type="time"
                className="block mt-1 rounded border px-2 py-1 panel-input"
                value={slot.start}
                onChange={(e) => updateSlotDef(slot.id, { start: e.target.value })}
              />
            </label>
            <label className="text-xs">
              结束
              <input
                type="time"
                className="block mt-1 rounded border px-2 py-1 panel-input"
                value={slot.end}
                onChange={(e) => updateSlotDef(slot.id, { end: e.target.value })}
              />
            </label>
            <span className="text-xs text-[var(--shell-muted)] pb-1">
              {isValidVisitTimeRange(slot.start, slot.end) ? slotDefLabel(slot) : '时段无效'}
            </span>
            {slotDefs.length > 1 ? (
              <button type="button" className="text-xs text-red-600 ml-auto" onClick={() => removeSlotDef(slot.id)}>
                删除
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">待排期达人（拖到下方时段{shareTable ? ' / 桌位' : ''}）</p>
        <div className="flex flex-wrap gap-2 min-h-[44px] p-2 rounded-lg border border-dashed bg-slate-50/80">
          {unassigned.length ? (
            unassigned.map((p) => (
              <button
                key={p.id}
                type="button"
                draggable
                onDragStart={(e) => onDragStart(e, p.id)}
                className="px-3 py-1.5 rounded-full border bg-white text-sm shadow-sm cursor-grab active:cursor-grabbing"
                title={p.preferred ? `意向：${p.preferred}` : undefined}
              >
                {p.name}
              </button>
            ))
          ) : (
            <span className="text-xs text-[var(--shell-muted)]">已全部拖入时段</span>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {columns.map((col) => {
          const slot = slotDefs.find((s) => s.id === col.slotId)
          const label = slot ? slotDefLabel(slot) : col.slotId
          return (
            <div key={col.slotId} className="rounded-xl border p-3 bg-violet-50/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {shareTable ? (
                  <button type="button" className="text-xs px-2 py-0.5 rounded border" onClick={() => addTable(col.slotId)}>
                    + 加一桌
                  </button>
                ) : null}
              </div>
              {col.tables.map((table, tIdx) => (
                <div
                  key={table.id}
                  className="min-h-[72px] rounded-lg border-2 border-dashed border-violet-200 bg-white p-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropZone(e, col.slotId, table.id)}
                >
                  <p className="text-xs text-[var(--shell-muted)] mb-1">
                    {shareTable ? `第 ${tIdx + 1} 桌（最多 ${tableSize} 人）` : '单独探店'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {table.talentIds.map((tid) => {
                      const p = pool.find((x) => x.id === tid)
                      return (
                        <span
                          key={tid}
                          draggable
                          onDragStart={(e) => onDragStart(e, tid)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-100 text-xs cursor-grab"
                        >
                          {p?.name || tid}
                          <button
                            type="button"
                            className="text-violet-500 hover:text-red-600"
                            onClick={() => removeFromBoard(tid)}
                          >
                            ×
                          </button>
                        </span>
                      )
                    })}
                    {!table.talentIds.length ? (
                      <span className="text-xs text-[var(--shell-muted)]">拖入达人</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
