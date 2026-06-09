import { useEffect, useMemo, useRef, useState } from 'react'
import PublishSheet from './PublishSheet'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function parseYmd(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatDisplay(date: string, time: string) {
  if (!date) return '请选择日期与时间'
  const d = parseYmd(date)
  if (!d) return `${date} ${time || '23:59'}`
  const t = time || '23:59'
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${t}`
}

function normalizeTime(time: string) {
  const [h = '23', m = '59'] = time.split(':')
  const hour = Math.min(23, Math.max(0, Number(h)))
  const minute = Math.min(59, Math.max(0, Number(m)))
  if (Number.isNaN(hour) || Number.isNaN(minute)) return '23:59'
  return `${pad2(hour)}:${pad2(minute)}`
}

type TimeWheelProps = {
  value: string
  onChange: (time: string) => void
}

function scrollActiveIntoView(container: HTMLDivElement | null, active: HTMLElement | null) {
  if (!container || !active) return
  const top = active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2
  container.scrollTop = Math.max(0, top)
}

function DeadlineTimeWheel({ value, onChange }: TimeWheelProps) {
  const [hh, mm] = normalizeTime(value).split(':')
  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)
  const hourActiveRef = useRef<HTMLButtonElement>(null)
  const minuteActiveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    scrollActiveIntoView(hourRef.current, hourActiveRef.current)
    scrollActiveIntoView(minuteRef.current, minuteActiveRef.current)
  }, [hh, mm])

  function setHour(h: string) {
    onChange(`${h}:${mm}`)
  }

  function setMinute(m: string) {
    onChange(`${hh}:${m}`)
  }

  return (
    <div className="px-4 py-3">
      <p className="text-xs text-slate-500 mb-2">选择时间</p>
      <div className="flex gap-2 items-stretch h-[132px]">
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-center text-[11px] text-slate-400 mb-1 shrink-0">时</span>
          <div
            ref={hourRef}
            className="flex-1 overflow-y-auto rounded-xl panel-input border overscroll-contain"
          >
            {HOURS.map((h) => {
              const on = hh === h
              return (
                <button
                  key={h}
                  ref={on ? hourActiveRef : undefined}
                  type="button"
                  className={`w-full py-2.5 text-sm tabular-nums transition-colors ${
                    on ? 'bg-violet-600 text-white font-medium' : 'text-slate-300 hover:bg-white/10'
                  }`}
                  onClick={() => setHour(h)}
                >
                  {h}
                </button>
              )
            })}
          </div>
        </div>
        <span className="self-center text-slate-500 font-medium pb-6">:</span>
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-center text-[11px] text-slate-400 mb-1 shrink-0">分</span>
          <div
            ref={minuteRef}
            className="flex-1 overflow-y-auto rounded-xl panel-input border overscroll-contain"
          >
            {MINUTES.map((m) => {
              const on = mm === m
              return (
                <button
                  key={m}
                  ref={on ? minuteActiveRef : undefined}
                  type="button"
                  className={`w-full py-2.5 text-sm tabular-nums transition-colors ${
                    on ? 'bg-violet-600 text-white font-medium' : 'text-slate-300 hover:bg-white/10'
                  }`}
                  onClick={() => setMinute(m)}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

type Props = {
  open: boolean
  minDate: string
  date: string
  time: string
  title?: string
  onClose: () => void
  onConfirm: (date: string, time: string) => void
}

export function formatSignupDeadlineDisplay(date: string, time: string) {
  return formatDisplay(date, time)
}

export default function SignupDeadlineSheet({ open, minDate, date, time, title, onClose, onConfirm }: Props) {
  const min = useMemo(() => parseYmd(minDate) || startOfDay(new Date()), [minDate])
  const initial = parseYmd(date) || min
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [selDate, setSelDate] = useState(date || toYmd(min))
  const [selTime, setSelTime] = useState(() => normalizeTime(time || '23:59'))

  useEffect(() => {
    if (!open) return
    const d = parseYmd(date) || min
    setSelDate(date || toYmd(min))
    setSelTime(normalizeTime(time || '23:59'))
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }, [open, date, time, minDate, min])

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const startPad = (first.getDay() + 6) % 7
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const rows: { key: string; day: number | null; ymd: string; disabled: boolean }[] = []
    for (let i = 0; i < startPad; i++) rows.push({ key: `e-${i}`, day: null, ymd: '', disabled: true })
    for (let d = 1; d <= daysInMonth; d++) {
      const cur = new Date(viewYear, viewMonth, d)
      const ymd = toYmd(cur)
      rows.push({
        key: ymd,
        day: d,
        ymd,
        disabled: startOfDay(cur) < startOfDay(min),
      })
    }
    return rows
  }, [viewYear, viewMonth, min])

  function prevMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  function nextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  function resolveConfirmDate() {
    if (selDate) return selDate
    const fallback = toYmd(min)
    if (parseYmd(fallback)) return fallback
    const first = cells.find((c) => c.day != null && !c.disabled)
    return first?.ymd || ''
  }

  return (
    <PublishSheet
      open={open}
      tall
      title={title || '招募报名截止时间'}
      onClose={onClose}
      pinnedBottom={<DeadlineTimeWheel value={selTime} onChange={setSelTime} />}
      onConfirm={() => {
        const picked = resolveConfirmDate()
        if (!picked) return
        onConfirm(picked, normalizeTime(selTime))
      }}
      confirmLabel="确定"
    >
      <p className="text-center text-violet-300 font-medium text-sm mb-3">{formatDisplay(selDate, selTime)}</p>

      <div className="flex items-center justify-between mb-2">
        <button type="button" className="px-3 py-1 rounded-lg bg-white/10 text-sm" onClick={prevMonth}>
          ‹
        </button>
        <span className="font-medium text-sm">
          {viewYear}年{viewMonth + 1}月
        </span>
        <button type="button" className="px-3 py-1 rounded-lg bg-white/10 text-sm" onClick={nextMonth}>
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {cells.map((c) =>
          c.day == null ? (
            <span key={c.key} className="aspect-square" />
          ) : (
            <button
              key={c.key}
              type="button"
              disabled={c.disabled}
              className={`aspect-square rounded-lg text-sm flex items-center justify-center ${
                c.disabled
                  ? 'text-slate-600 cursor-not-allowed'
                  : selDate === c.ymd
                    ? 'bg-violet-600 text-white font-medium'
                    : 'hover:bg-white/10'
              }`}
              onClick={() => setSelDate(c.ymd)}
            >
              {c.day}
            </button>
          ),
        )}
      </div>
      <p className="text-[10px] text-slate-600">不可选择今天之前的日期</p>
    </PublishSheet>
  )
}
