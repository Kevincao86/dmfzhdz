import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { readApplications } from '../lib/mpSync/applicationsStore'
import {
  aggregatePrOrderCalendarEvents,
  aggregateTalentOrderCalendarEvents,
  buildMonthGrid,
  groupEventsByDate,
  kindLabel,
  resolveDayDotPhase,
  type OrderCalendarEvent,
} from '../lib/mpRecruitment/orderCalendarCore'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function monthTitle(year: number, month: number): string {
  return `${year}年${month + 1}月`
}

function eventLink(role: string, evt: OrderCalendarEvent): string {
  if (role === 'pr') {
    if (evt.kind === 'visit') return `/orders/${encodeURIComponent(evt.mpOrderId)}/schedule`
    if (evt.kind === 'plan_slot') return `/orders/${encodeURIComponent(evt.mpOrderId)}/schedule/dates`
    return `/orders/${encodeURIComponent(evt.mpOrderId)}/applicants`
  }
  return `/recruitment/${encodeURIComponent(evt.mpOrderId)}`
}

export default function OrderCalendarPage() {
  const role = getActiveRole()
  const isPr = role === 'pr'
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDateKey, setSelectedDateKey] = useState('')
  const [events, setEvents] = useState<OrderCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry(
          isPr ? { includePrOwned: true } : { includeLocalContext: true },
        )
        const orders = (reg?.mpRecruitmentOrders ?? []) as Array<Record<string, unknown>>
        let list: OrderCalendarEvent[]
        if (isPr) {
          list = aggregatePrOrderCalendarEvents(orders)
        } else {
          const apps = readApplications()
          const ids = new Set(
            apps.map((a) => String(a.applicantId || '').trim()).filter(Boolean),
          )
          list = aggregateTalentOrderCalendarEvents(orders, ids)
        }
        if (!cancelled) setEvents(list)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isPr])

  const byDate = useMemo(() => groupEventsByDate(events), [events])
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])

  useEffect(() => {
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setSelectedDateKey(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedEvents = selectedDateKey ? byDate[selectedDateKey] ?? [] : []

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else setMonth((m) => m + 1)
  }

  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-10">
      <div>
        <h1 className="text-xl font-bold text-[var(--app-text)]">商单日历</h1>
        <p className="mt-1 text-sm text-[var(--app-muted)]">
          {isPr ? '查看发单探店排期、可探店日与交片截止' : '查看我的探店日程与交片截止'}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-[var(--app-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载商单进度…
        </div>
      ) : err ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>
      ) : (
        <>
          <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={prevMonth} className="rounded-lg p-2 hover:bg-[var(--app-hover)]" aria-label="上个月">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-base font-semibold">{monthTitle(year, month)}</span>
              <button type="button" onClick={nextMonth} className="rounded-lg p-2 hover:bg-[var(--app-hover)]" aria-label="下个月">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--app-muted)]">
              {WEEK_LABELS.map((w) => (
                <div key={w} className="py-1 font-medium">
                  {w}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {grid.map((cell) => {
                const dayEvents = byDate[cell.dateKey] ?? []
                const dotPhase = resolveDayDotPhase(dayEvents)
                const selected = cell.dateKey === selectedDateKey
                const isToday = cell.dateKey === todayKey
                const dotClass =
                  dotPhase === 'ended'
                    ? 'bg-red-500'
                    : dotPhase === 'active'
                      ? 'bg-emerald-500'
                      : 'bg-sky-500'
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(cell.dateKey)}
                    className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-lg text-sm transition ${
                      !cell.inMonth ? 'text-[var(--app-muted)]/40' : 'text-[var(--app-text)]'
                    } ${selected ? 'bg-sky-600 text-white' : 'hover:bg-[var(--app-hover)]'} ${isToday && !selected ? 'ring-1 ring-sky-500/60' : ''}`}
                  >
                    <span>{cell.day}</span>
                    {dotPhase ? (
                      <span
                        className={`mt-0.5 h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : dotClass}`}
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-[var(--app-text)]">
              {selectedDateKey ? `${selectedDateKey.replace(/-/g, '/')} 的商单` : '选择日期'}
            </h2>
            {selectedEvents.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--app-muted)]">该日暂无商单安排</p>
            ) : (
              <ul className="space-y-2">
                {selectedEvents.map((evt) => (
                  <li key={evt.id}>
                    <Link
                      to={eventLink(role, evt)}
                      className="block rounded-lg border border-[var(--app-border)] px-3 py-3 transition hover:border-sky-500/40 hover:bg-[var(--app-hover)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="mr-2 inline-block rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">
                            {kindLabel(evt.kind)}
                          </span>
                          <span className="font-medium text-[var(--app-text)]">{evt.orderTitle}</span>
                          {evt.storeName && evt.storeName !== evt.orderTitle ? (
                            <p className="mt-0.5 truncate text-xs text-[var(--app-muted)]">{evt.storeName}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-xs text-[var(--app-muted)]">{evt.statusLabel}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--app-muted)]">
                        {evt.timeLabel ? <span>{evt.timeLabel}</span> : null}
                        {evt.applicantName && isPr ? <span>达人：{evt.applicantName}</span> : null}
                        {evt.platform ? <span>{evt.platform}</span> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
