const { prepareMineSubPage, syncPrPageChrome } = require('../../utils/pageIdentityChrome.js')
const appRegistrySync = require('../../utils/applicationsRegistrySync.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const orderCalendar = require('../../utils/orderCalendarEvents.js')
const userProfile = require('../../utils/userProfile.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')
const auth = require('../../utils/auth.js')

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function monthTitle(year, month) {
  return `${year}年${month + 1}月`
}

function todayDateKey() {
  return orderCalendar.dateKeyFromMs(Date.now())
}

function readIdentity() {
  return userProfile.readIdentity() || 'talent'
}

function isPrIdentity(identity) {
  return identity === 'pr'
}

function syncCalendarChrome(page, identity) {
  if (isPrIdentity(identity)) syncPrPageChrome(page, { animate: false })
}

function enrichEvent(evt, isPr, todayKey, selectedDateKey) {
  const phase = orderCalendar.resolveEventPhase(evt)
  return {
    ...evt,
    kindLabel: orderCalendar.kindLabel(evt.kind),
    tone: orderCalendar.eventTone(evt.kind),
    phase,
    phaseLabel: orderCalendar.phaseStatusLabel(phase),
    dateShort: orderCalendar.formatTodoDateShort(evt.dateKey, todayKey),
    selected: evt.dateKey === selectedDateKey,
  }
}

Page({
  data: {
    loading: true,
    err: '',
    identity: 'talent',
    isPr: false,
    pageSub: '',
    viewMode: 'week',
    year: 0,
    month: 0,
    monthLabel: '',
    navLabel: '本周',
    weekLabels: WEEK_LABELS,
    grid: [],
    selectedDateKey: '',
    selectedEvents: [],
    byDate: {},
    todayKey: '',
    upcomingTodos: [],
    activeTodoCount: 0,
  },

  async onLoad() {
    const identity = readIdentity()
    syncCalendarChrome(this, identity)
    const now = new Date()
    this.setData({
      identity,
      isPr: isPrIdentity(identity),
      pageSub: orderCalendar.calendarSubtitle(identity),
      year: now.getFullYear(),
      month: now.getMonth(),
      monthLabel: monthTitle(now.getFullYear(), now.getMonth()),
      selectedDateKey: todayDateKey(),
      todayKey: todayDateKey(),
    })
    await prepareMineSubPage(this)
    syncCalendarChrome(this, identity)
    this.reload()
  },

  async onShow() {
    const identity = readIdentity()
    await prepareMineSubPage(this)
    syncCalendarChrome(this, identity)
    this.setData({
      identity,
      isPr: isPrIdentity(identity),
      pageSub: orderCalendar.calendarSubtitle(identity),
    })
    this.reload()
  },

  resolveNavLabel(viewMode, year, month) {
    return viewMode === 'week' ? '本周' : monthTitle(year, month)
  },

  async reload() {
    this.setData({ loading: true, err: '' })
    try {
      const identity = readIdentity()
      const isPr = isPrIdentity(identity)
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications(
        isPr ? { includePrOwned: true } : { includeLocalContext: true },
      )
      const orders = (reg && reg.mpRecruitmentOrders) || []
      let events
      if (isPr) {
        const account = auth.readAccount()
        const owned = orders.filter((o) => prPublishedOrders.mpOrderOwnedByCurrentPr(o, account))
        events = orderCalendar.aggregatePrOrderCalendarEvents(owned)
      } else {
        const apps = applicationsStore.readApplications()
        const ids = apps.map((a) => String(a.applicantId || '').trim()).filter(Boolean)
        events = orderCalendar.aggregateTalentOrderCalendarEvents(orders, ids)
      }

      const enriched = (events || []).map((evt) => enrichEvent(evt, isPr, this.data.todayKey, this.data.selectedDateKey))
      const byDate = orderCalendar.groupEventsByDate(enriched)
      const grid = this.buildGridCells(this.data.year, this.data.month, byDate)
      const selectedEvents = byDate[this.data.selectedDateKey] || []
      const upcomingTodos = orderCalendar.buildUpcomingTodos(enriched, { days: 7 }).map((evt) =>
        enrichEvent(evt, isPr, this.data.todayKey, this.data.selectedDateKey),
      )
      const activeTodoCount = orderCalendar.countActiveTodos(enriched)

      this.setData({
        loading: false,
        isPr,
        byDate,
        grid,
        selectedEvents,
        upcomingTodos,
        activeTodoCount,
        navLabel: this.resolveNavLabel(this.data.viewMode, this.data.year, this.data.month),
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: (e && e.message) || '加载失败',
      })
    }
  },

  buildGridCells(year, month, byDate) {
    const cells =
      this.data.viewMode === 'week'
        ? orderCalendar.buildWeekCells(this.data.selectedDateKey || todayDateKey())
        : orderCalendar.buildMonthGrid(year, month)
    const selectedDateKey = this.data.selectedDateKey
    const todayKey = this.data.todayKey
    return cells.map((cell) => {
      const dayEvents = byDate[cell.dateKey] || []
      const summary = orderCalendar.dayEventSummary(dayEvents)
      return {
        ...cell,
        count: dayEvents.length,
        dotPhase: orderCalendar.resolveDayDotPhase(dayEvents),
        summaryLabel: summary ? summary.label : '',
        summaryPhase: summary ? summary.phase : '',
        weekdayShort: orderCalendar.weekdayShortFromDateKey(cell.dateKey),
        selected: cell.dateKey === selectedDateKey,
        isToday: cell.dateKey === todayKey,
      }
    })
  },

  onToggleViewMode(e) {
    const mode = String((e.currentTarget.dataset.mode || '')).trim()
    if (!mode || mode === this.data.viewMode) return
    const grid = this.buildGridCells(this.data.year, this.data.month, this.data.byDate)
    this.setData({
      viewMode: mode,
      grid,
      navLabel: this.resolveNavLabel(mode, this.data.year, this.data.month),
    })
  },

  onBackToday() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const todayKey = todayDateKey()
    const selectedEvents = this.data.byDate[todayKey] || []
    const grid = this.buildGridCells(year, month, this.data.byDate).map((cell) => ({
      ...cell,
      selected: cell.dateKey === todayKey,
    }))
    const upcomingTodos = (this.data.upcomingTodos || []).map((item) => ({
      ...item,
      selected: item.dateKey === todayKey,
    }))
    this.setData({
      year,
      month,
      monthLabel: monthTitle(year, month),
      selectedDateKey: todayKey,
      selectedEvents,
      grid,
      upcomingTodos,
      navLabel: this.resolveNavLabel(this.data.viewMode, year, month),
    })
  },

  onPrevMonth() {
    if (this.data.viewMode === 'week') {
      const anchor = orderCalendar.parseVisitDayMs(this.data.selectedDateKey) - 7 * 86400000
      const dateKey = orderCalendar.dateKeyFromMs(anchor)
      this.syncSelectedDay(dateKey)
      return
    }
    let { year, month } = this.data
    if (month === 0) {
      year -= 1
      month = 11
    } else month -= 1
    const grid = this.buildGridCells(year, month, this.data.byDate)
    this.setData({
      year,
      month,
      monthLabel: monthTitle(year, month),
      grid,
      navLabel: this.resolveNavLabel(this.data.viewMode, year, month),
    })
  },

  onNextMonth() {
    if (this.data.viewMode === 'week') {
      const anchor = orderCalendar.parseVisitDayMs(this.data.selectedDateKey) + 7 * 86400000
      const dateKey = orderCalendar.dateKeyFromMs(anchor)
      this.syncSelectedDay(dateKey)
      return
    }
    let { year, month } = this.data
    if (month === 11) {
      year += 1
      month = 0
    } else month += 1
    const grid = this.buildGridCells(year, month, this.data.byDate)
    this.setData({
      year,
      month,
      monthLabel: monthTitle(year, month),
      grid,
      navLabel: this.resolveNavLabel(this.data.viewMode, year, month),
    })
  },

  syncSelectedDay(dateKey) {
    const selectedEvents = this.data.byDate[dateKey] || []
    const grid = this.buildGridCells(this.data.year, this.data.month, this.data.byDate).map((cell) => ({
      ...cell,
      selected: cell.dateKey === dateKey,
    }))
    const upcomingTodos = (this.data.upcomingTodos || []).map((item) => ({
      ...item,
      selected: item.dateKey === dateKey,
    }))
    this.setData({ selectedDateKey: dateKey, selectedEvents, grid, upcomingTodos })
  },

  onSelectDay(e) {
    const dateKey = String((e.currentTarget.dataset.key || '')).trim()
    if (!dateKey) return
    this.syncSelectedDay(dateKey)
  },

  onOpenTodo(e) {
    const dateKey = String((e.currentTarget.dataset.dateKey || '')).trim()
    if (dateKey) this.syncSelectedDay(dateKey)
    this.onOpenEvent(e)
  },

  onScrollToList() {
    wx.pageScrollTo({ selector: '#cal-event-list', duration: 280 })
  },

  onOpenEvent(e) {
    const mpOrderId = String((e.currentTarget.dataset.id || '')).trim()
    const kind = String((e.currentTarget.dataset.kind || '')).trim()
    if (!mpOrderId) return
    if (this.data.isPr) {
      if (kind === 'visit') {
        wx.navigateTo({ url: `/pages/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}` })
        return
      }
      if (kind === 'plan_slot') {
        wx.navigateTo({ url: `/pages/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}&step=dates` })
        return
      }
      wx.navigateTo({ url: `/pages/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(mpOrderId)}` })
      return
    }
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(mpOrderId)}` })
  },
})
