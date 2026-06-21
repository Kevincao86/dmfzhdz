import { useEffect, useMemo, useState } from 'react'
import {
  defaultVisitPlanDate,
  isValidVisitTimeRange,
  isVisitPlanDatesConfirmed,
  type VisitPlanDateRow,
} from '../../lib/mpSync/visitScheduleRuntime'
import {
  defaultVisitSlotDefs,
  initVisitDates,
  initVisitDatesFromPlanMeta,
  slotDefLabel,
  slotStringsFromDefs,
  type VisitDateDef,
  type VisitSlotDef,
} from './VisitScheduleDragBoard'

type Props = {
  mp?: Record<string, unknown> | null
  category?: string
}

function cloneSlotsForNewDay(slots: VisitSlotDef[]): VisitSlotDef[] {
  const ts = Date.now()
  return slots.map((s, i) => ({ ...s, id: `slot-${ts}-${i}` }))
}

function offsetVisitDate(base: string, days: number): string {
  const m = String(base || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return defaultVisitPlanDate()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function visitDatesToPlanRows(dates: VisitDateDef[]): VisitPlanDateRow[] {
  return dates
    .map((day) => ({
      date: day.date,
      slots: slotStringsFromDefs(day.slots),
    }))
    .filter((row) => row.date && row.slots.length)
}

export function initVisitDatesForSetup(mp?: Record<string, unknown> | null): VisitDateDef[] {
  return initVisitDatesFromPlanMeta(mp) || initVisitDates()
}

export function useVisitScheduleDatesEditor(props: Props) {
  const [visitDates, setVisitDates] = useState<VisitDateDef[]>(() => initVisitDatesForSetup(props.mp))
  const [hint, setHint] = useState('')
  const datesLocked = isVisitPlanDatesConfirmed(props.mp)

  useEffect(() => {
    if (!props.mp || !isVisitPlanDatesConfirmed(props.mp)) return
    const fromMeta = initVisitDatesForSetup(props.mp)
    if (fromMeta.length) setVisitDates(fromMeta)
  }, [props.mp])

  const visitPlanRows = useMemo(() => visitDatesToPlanRows(visitDates), [visitDates])

  function guardLocked(): boolean {
    if (!datesLocked) return false
    setHint('可探店日期与时段已锁定，如需调整请联系运营')
    return true
  }

  function addVisitDate() {
    if (guardLocked()) return
    const id = `day-${Date.now()}`
    const last = visitDates[visitDates.length - 1]
    const date = offsetVisitDate(last?.date || defaultVisitPlanDate(), 1)
    const slots = cloneSlotsForNewDay(last?.slots?.length ? last.slots : defaultVisitSlotDefs())
    setVisitDates([...visitDates, { id, date, slots }])
  }

  function removeVisitDate(id: string) {
    if (guardLocked()) return
    if (visitDates.length <= 1) return
    setVisitDates(visitDates.filter((d) => d.id !== id))
  }

  function updateVisitDate(id: string, date: string) {
    if (guardLocked()) return
    setVisitDates(visitDates.map((d) => (d.id === id ? { ...d, date } : d)))
  }

  function addSlotDef(dateId: string) {
    if (guardLocked()) return
    const slotId = `slot-${Date.now()}`
    setVisitDates(
      visitDates.map((d) =>
        d.id === dateId ? { ...d, slots: [...d.slots, { id: slotId, start: '14:00', end: '17:00' }] } : d,
      ),
    )
  }

  function removeSlotDef(dateId: string, slotId: string) {
    if (guardLocked()) return
    const day = visitDates.find((d) => d.id === dateId)
    if (!day || day.slots.length <= 1) return
    setVisitDates(
      visitDates.map((d) =>
        d.id === dateId ? { ...d, slots: d.slots.filter((s) => s.id !== slotId) } : d,
      ),
    )
  }

  function updateSlotDef(dateId: string, slotId: string, patch: Partial<VisitSlotDef>) {
    if (guardLocked()) return
    const day = visitDates.find((d) => d.id === dateId)
    const slot = day?.slots.find((s) => s.id === slotId)
    if (!slot) return
    const next = { ...slot, ...patch }
    if (patch.start != null || patch.end != null) {
      const start = patch.start != null ? patch.start : slot.start
      let end = patch.end != null ? patch.end : slot.end
      if (!isValidVisitTimeRange(start, end)) {
        setHint('结束时间须晚于开始时间')
        return
      }
      next.start = start
      next.end = end
    }
    setHint('')
    setVisitDates(
      visitDates.map((d) =>
        d.id === dateId
          ? { ...d, slots: d.slots.map((s) => (s.id === slotId ? next : s)) }
          : d,
      ),
    )
  }

  return {
    visitDates,
    hint,
    setHint,
    visitPlanRows,
    datesLocked,
    addVisitDate,
    removeVisitDate,
    updateVisitDate,
    addSlotDef,
    removeSlotDef,
    updateSlotDef,
  }
}

export default function VisitScheduleDatesEditor({
  category = '探店',
  editor,
  datesLocked: datesLockedProp,
}: {
  category?: string
  editor: ReturnType<typeof useVisitScheduleDatesEditor>
  datesLocked?: boolean
}) {
  const {
    visitDates,
    hint,
    datesLocked: datesLockedFromEditor,
    addVisitDate,
    removeVisitDate,
    updateVisitDate,
    addSlotDef,
    removeSlotDef,
    updateSlotDef,
  } = editor
  const datesLocked = datesLockedProp ?? datesLockedFromEditor

  return (
    <div className="space-y-4">
      <div className="rounded-xl border px-4 py-3 bg-white/60 text-sm">
        <span className="text-[var(--shell-muted)]">类目</span>
        <span className="ml-3 font-medium">{category}</span>
      </div>

      {datesLocked ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          可探店日期与时段已锁定；达人仅可从下列日期与时段提交探店意向。
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {datesLocked ? '已锁定的可探店日期与时段' : '排期日期（可添加 3–5 天，每天可单独设置时段）'}
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
                      <span className="text-xs text-[var(--shell-muted)] pb-1">{slotDefLabel(slot)}</span>
                      {day.slots.length > 1 ? (
                        <button
                          type="button"
                          className="text-xs text-red-600 ml-auto pb-1"
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
      {hint ? <p className="text-xs text-red-600">{hint}</p> : null}
    </div>
  )
}
