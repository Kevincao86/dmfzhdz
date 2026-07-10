import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Tag,
} from 'lucide-react'
import { fetchMpRegistry } from '../lib/mpApi'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { getWorkIdentity } from '../lib/mpWorkIdentity'
import { mpOrderOwnedByCurrentPr } from '../lib/mpRecruitment/prPublishedOrders'
import { readApplications } from '../lib/mpSync/applicationsStore'
import {
  aggregatePrOrderCalendarEvents,
  aggregateTalentOrderCalendarEvents,
  buildMonthGrid,
  buildUpcomingTodos,
  buildWeekCells,
  calendarPageSubtitleForWork,
  countActiveTodos,
  dayEventSummary,
  eventTone,
  formatTodoDateShort,
  groupEventsByDate,
  kindLabel,
  phaseStatusLabel,
  resolveDayDotPhase,
  resolveEventPhase,
  weekdayLabelFromDateKey,
  type OrderCalendarDayPhase,
  type OrderCalendarEvent,
  type OrderCalendarEventTone,
} from '../lib/mpRecruitment/orderCalendarCore'

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const FEATURE_ITEMS = [
  {
    icon: CheckSquare,
    tone: 'emerald' as const,
    title: '近7天待办',
    desc: '重要事项一目了然',
  },
  {
    icon: Tag,
    tone: 'orange' as const,
    title: '事项标签',
    desc: '快速识别任务类型',
  },
  {
    icon: CalendarDays,
    tone: 'violet' as const,
    title: '日历视图',
    desc: '整体进度清晰掌握',
  },
]

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

function dotClass(phase: OrderCalendarDayPhase | null, selected: boolean): string {
  if (selected) return 'bg-white'
  if (phase === 'active') return 'bg-emerald-500'
  if (phase === 'ended') return 'bg-red-500'
  return 'bg-violet-400'
}

function toneBadgeClass(tone: OrderCalendarEventTone): string {
  if (tone === 'green') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (tone === 'orange') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (tone === 'red') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-violet-50 text-violet-700 border-violet-200'
}

function toneCardClass(tone: OrderCalendarEventTone, selected: boolean): string {
  const base =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50/60'
      : tone === 'orange'
        ? 'border-orange-200 bg-orange-50/60'
        : tone === 'red'
          ? 'border-red-200 bg-red-50/60'
          : 'border-violet-200 bg-violet-50/60'
  return selected ? `${base} ring-2 ring-violet-500 shadow-md` : base
}

function featureIconClass(tone: 'emerald' | 'orange' | 'violet'): string {
  if (tone === 'emerald') return 'bg-emerald-100 text-emerald-600'
  if (tone === 'orange') return 'bg-orange-100 text-orange-600'
  return 'bg-violet-100 text-violet-600'
}

export default function OrderCalendarPage() {
  const role = getActiveRole()
  const isPr = role === 'pr'
  const workId = isPr ? 'pr' : getWorkIdentity()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [selectedDateKey, setSelectedDateKey] = useState('')
  const [events, setEvents] = useState<OrderCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const eventListRef = useRef<HTMLElement>(null)
  const todoScrollRef = useRef<HTMLDivElement>(null)

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
          const account = getAccount()
          const owned = orders.filter((o) => mpOrderOwnedByCurrentPr(o, account))
          list = aggregatePrOrderCalendarEvents(owned)
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
  const upcomingTodos = useMemo(() => buildUpcomingTodos(events), [events])
  const activeTodoCount = useMemo(() => countActiveTodos(events), [events])

  const grid = useMemo(() => {
    if (viewMode === 'week') {
      const anchor = selectedDateKey || todayKeyFromNow(now)
      return buildWeekCells(anchor).map((cell) => ({ ...cell, inMonth: true }))
    }
    return buildMonthGrid(year, month)
  }, [viewMode, year, month, selectedDateKey])

  const todayKey = useMemo(() => todayKeyFromNow(now), [])

  useEffect(() => {
    setSelectedDateKey(todayKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedEvents = selectedDateKey ? byDate[selectedDateKey] ?? [] : []

  const scrollTodos = useCallback((dir: 1 | -1) => {
    const el = todoScrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * 280, behavior: 'smooth' })
  }, [])

  function todayKeyFromNow(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function onBackToday() {
    const key = todayKeyFromNow(new Date())
    const d = new Date()
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setSelectedDateKey(key)
  }

  function prevPeriod() {
    if (viewMode === 'week') {
      const ms = parseDateKeyMs(selectedDateKey) - 7 * 86400000
      const d = new Date(ms)
      setSelectedDateKey(todayKeyFromNow(d))
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      return
    }
    if (month === 0) {
      setYear((y) => y - 1)
      setMonth(11)
    } else setMonth((m) => m - 1)
  }

  function nextPeriod() {
    if (viewMode === 'week') {
      const ms = parseDateKeyMs(selectedDateKey) + 7 * 86400000
      const d = new Date(ms)
      setSelectedDateKey(todayKeyFromNow(d))
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      return
    }
    if (month === 11) {
      setYear((y) => y + 1)
      setMonth(0)
    } else setMonth((m) => m + 1)
  }

  function parseDateKeyMs(key: string): number {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, (m || 1) - 1, d || 1).getTime()
  }

  function onSelectDay(dateKey: string) {
    setSelectedDateKey(dateKey)
    const [y, m] = dateKey.split('-').map(Number)
    if (y && m) {
      setYear(y)
      setMonth(m - 1)
    }
  }

  function scrollToEventList() {
    eventListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const navLabel = viewMode === 'week' ? '本周' : monthTitle(year, month)

  return (
    <div className="min-h-full bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/40 px-4 py-5 pb-10 lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
        {/* 左侧功能说明 */}
        <aside className="flex shrink-0 flex-col rounded-[20px] border border-violet-100/80 bg-white/90 p-5 shadow-[0_4px_24px_rgba(124,77,255,0.08)] lg:w-[30%] lg:max-w-sm lg:p-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">近7天待办</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {calendarPageSubtitleForWork(workId)}。横向滑动查看近期事项，在日历中掌握整体进度。
          </p>

          <ul className="mt-6 space-y-4">
            {FEATURE_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.title} className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${featureIconClass(item.tone)}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="mt-auto hidden pt-8 lg:block">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-50 px-5 py-6">
              <div className="relative z-10">
                <p className="text-sm font-semibold text-violet-800">商单日历</p>
                <p className="mt-1 text-xs text-violet-600/80">探店 · 交片 · 排期一站掌握</p>
              </div>
              <svg
                className="absolute -bottom-2 -right-2 h-28 w-28 text-violet-300/50"
                viewBox="0 0 120 120"
                fill="none"
                aria-hidden
              >
                <rect x="20" y="24" width="72" height="64" rx="10" fill="currentColor" opacity="0.35" />
                <rect x="28" y="16" width="8" height="16" rx="4" fill="currentColor" opacity="0.5" />
                <rect x="84" y="16" width="8" height="16" rx="4" fill="currentColor" opacity="0.5" />
                <circle cx="56" cy="58" r="18" fill="#22c55e" opacity="0.85" />
                <path
                  d="M48 58l6 6 12-14"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </aside>

        {/* 右侧主内容 */}
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-violet-100 bg-white py-20 text-sm text-slate-500 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              加载商单进度…
            </div>
          ) : err ? (
            <p className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </p>
          ) : (
            <>
              {/* 近7天待办横滑 */}
              <section className="rounded-[20px] border border-violet-100/80 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)] sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900">近7天待办</h2>
                  <button
                    type="button"
                    onClick={scrollToEventList}
                    className="text-xs font-medium text-violet-600 transition hover:text-violet-700"
                  >
                    全部待办 ›
                  </button>
                </div>

                {upcomingTodos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">近 7 天暂无待办事项</p>
                ) : (
                  <div className="relative">
                    <div
                      ref={todoScrollRef}
                      className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {upcomingTodos.map((evt) => {
                        const tone = eventTone(evt.kind)
                        const phase = resolveEventPhase(evt)
                        const selected = evt.dateKey === selectedDateKey
                        return (
                          <Link
                            key={evt.id}
                            to={eventLink(role, evt)}
                            onClick={() => onSelectDay(evt.dateKey)}
                            className={`flex w-[220px] shrink-0 flex-col rounded-2xl border p-3.5 transition hover:shadow-md sm:w-[240px] ${toneCardClass(tone, selected)}`}
                          >
                            <span
                              className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                                selected
                                  ? 'border-violet-400 bg-violet-50 text-violet-700'
                                  : 'border-violet-200 text-violet-600'
                              }`}
                            >
                              {formatTodoDateShort(evt.dateKey, todayKey)}
                            </span>
                            <span
                              className={`mt-2 inline-flex w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${toneBadgeClass(tone)}`}
                            >
                              {kindLabel(evt.kind)}
                            </span>
                            <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                              {evt.orderTitle}
                            </p>
                            {evt.storeName && evt.storeName !== evt.orderTitle ? (
                              <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {evt.storeName}
                              </p>
                            ) : null}
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  phase === 'active'
                                    ? 'bg-emerald-500'
                                    : phase === 'pending'
                                      ? 'bg-violet-400'
                                      : 'bg-red-400'
                                }`}
                              />
                              {phaseStatusLabel(phase)}
                            </p>
                          </Link>
                        )
                      })}
                    </div>
                    {upcomingTodos.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => scrollTodos(1)}
                        className="absolute -right-1 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-violet-100 bg-white text-violet-600 shadow-md transition hover:bg-violet-50 sm:flex"
                        aria-label="向右滑动"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                )}
                {activeTodoCount > 0 ? (
                  <p className="mt-2 text-right text-xs text-slate-400">{activeTodoCount} 项待办</p>
                ) : null}
              </section>

              {/* 日历区 */}
              <section className="rounded-[20px] border border-violet-100/80 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)] sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setViewMode('week')}
                        className={`rounded-lg px-3 py-1.5 transition ${
                          viewMode === 'week'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        周视图
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('month')}
                        className={`rounded-lg px-3 py-1.5 transition ${
                          viewMode === 'month'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        月视图
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onBackToday}
                      className="rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-50"
                    >
                      今天
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={prevPeriod}
                      className="rounded-lg p-2 text-violet-600 transition hover:bg-violet-50"
                      aria-label="上一段"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-[7rem] text-center text-sm font-semibold text-slate-800">
                      {navLabel}
                    </span>
                    <button
                      type="button"
                      onClick={nextPeriod}
                      className="rounded-lg p-2 text-violet-600 transition hover:bg-violet-50"
                      aria-label="下一段"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      进行中
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-violet-400" />
                      待开始
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      已结束
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-100 bg-slate-100 text-center text-xs">
                  {WEEK_LABELS.map((w, i) => (
                    <div
                      key={w}
                      className={`bg-slate-50 py-2 font-medium ${i === 6 ? 'text-red-500' : 'text-slate-500'}`}
                    >
                      {w}
                    </div>
                  ))}
                </div>

                <div
                  className={`mt-1 grid grid-cols-7 gap-1 ${viewMode === 'week' ? 'min-h-[5.5rem]' : ''}`}
                >
                  {grid.map((cell) => {
                    const dayEvents = byDate[cell.dateKey] ?? []
                    const dotPhase = resolveDayDotPhase(dayEvents)
                    const summary = dayEventSummary(dayEvents)
                    const selected = cell.dateKey === selectedDateKey
                    const isToday = cell.dateKey === todayKey
                    const weekday = weekdayLabelFromDateKey(cell.dateKey)
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        onClick={() => onSelectDay(cell.dateKey)}
                        className={`relative flex min-h-[4.5rem] flex-col items-center rounded-xl px-1 py-2 text-left transition sm:min-h-[5.25rem] ${
                          !cell.inMonth && viewMode === 'month'
                            ? 'text-slate-300'
                            : 'text-slate-700'
                        } ${
                          selected
                            ? 'bg-violet-600 text-white shadow-md'
                            : 'hover:bg-violet-50/80'
                        } ${isToday && !selected ? 'ring-2 ring-emerald-400/70 ring-offset-1' : ''}`}
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                            isToday && !selected ? 'bg-emerald-500 text-white' : ''
                          } ${selected ? 'text-white' : ''}`}
                        >
                          {cell.day}
                        </span>
                        {viewMode === 'week' ? (
                          <span
                            className={`mt-0.5 text-[10px] ${selected ? 'text-violet-100' : 'text-slate-400'}`}
                          >
                            {weekday.replace('周', '')}
                          </span>
                        ) : null}
                        {summary ? (
                          <span
                            className={`mt-1 flex max-w-full items-center justify-center gap-0.5 truncate text-[9px] leading-tight sm:text-[10px] ${
                              selected ? 'text-violet-100' : 'text-slate-500'
                            }`}
                          >
                            <span
                              className={`h-1 w-1 shrink-0 rounded-full ${dotClass(summary.phase, selected)}`}
                            />
                            <span className="truncate">{summary.label}</span>
                          </span>
                        ) : dotPhase ? (
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 rounded-full ${dotClass(dotPhase, selected)}`}
                          />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* 选中日事件列表 */}
              <section
                ref={eventListRef}
                className="rounded-[20px] border border-violet-100/80 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.05)] sm:p-5"
              >
                <h2 className="mb-3 text-sm font-semibold text-slate-900">
                  {selectedDateKey ? `${selectedDateKey.replace(/-/g, '/')} 的商单` : '选择日期'}
                </h2>
                {selectedEvents.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">该日暂无商单安排</p>
                ) : (
                  <ul className="space-y-2.5">
                    {selectedEvents.map((evt) => {
                      const tone = eventTone(evt.kind)
                      const phase = resolveEventPhase(evt)
                      return (
                        <li key={evt.id}>
                          <Link
                            to={eventLink(role, evt)}
                            className="block rounded-xl border border-slate-100 px-3.5 py-3 transition hover:border-violet-200 hover:bg-violet-50/40"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span
                                  className={`mr-2 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${toneBadgeClass(tone)}`}
                                >
                                  {kindLabel(evt.kind)}
                                </span>
                                <span className="font-medium text-slate-900">{evt.orderTitle}</span>
                                {evt.storeName && evt.storeName !== evt.orderTitle ? (
                                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {evt.storeName}
                                  </p>
                                ) : null}
                              </div>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    phase === 'active'
                                      ? 'bg-emerald-500'
                                      : phase === 'pending'
                                        ? 'bg-violet-400'
                                        : 'bg-red-400'
                                  }`}
                                />
                                {evt.statusLabel}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                              {evt.timeLabel ? <span>{evt.timeLabel}</span> : null}
                              {evt.applicantName && isPr ? <span>达人：{evt.applicantName}</span> : null}
                              {evt.platform ? <span>{evt.platform}</span> : null}
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
