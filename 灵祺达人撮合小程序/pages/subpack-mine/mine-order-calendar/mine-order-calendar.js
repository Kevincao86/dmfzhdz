const { prepareMineSubPage, syncPrPageChrome } = require('../../../utils/pageIdentityChrome.js')
const appRegistrySync = require('../../../utils/applicationsRegistrySync.js')
const applicationsStore = require('../../../utils/applicationsStore.js')
const orderCalendar = require('../../../utils/orderCalendarEvents.js')
const userProfile = require('../../../utils/userProfile.js')
const prPublishedOrders = require('../../../utils/prPublishedOrders.js')
const auth = require('../../../utils/auth.js')
const participant = require('../../../utils/participant.js')
const mpSubscribe = require('../../../utils/mpSubscribeMessages.js')
const calReminder = require('../../../utils/mpCalendarReminderApi.js')
const orderLabelApi = require('../../../utils/mpOrderCustomLabelApi.js')
const customEventApi = require('../../../utils/mpCalendarCustomEventApi.js')

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const REMIND_OPTIONS = [
  { id: 'day8', label: '当天早上 8:00' },
  { id: 'day_before_20', label: '前一日晚上 8:00' },
  { id: 'days2_before', label: '前两日晚上 8:00' },
]

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
    weekLabels: WEEK_LABELS,
    grid: [],
    selectedDateKey: '',
    selectedEvents: [],
    byDate: {},
    todayKey: '',
    upcomingTodos: [],
    activeTodoCount: 0,
    remindOptions: REMIND_OPTIONS,
    myReminders: [],
    orderLabels: [],
    navLabel: '',
    labelSheetOpen: false,
    labelSheetTitle: '',
    labelSheetMpOrderId: '',
    labelSheetHasExisting: false,
    labelPresets: orderLabelApi.LABEL_PRESETS,
    labelCustomText: '',
    labelBusy: false,
    eventSheetOpen: false,
    eventSheetId: '',
    eventTitle: '',
    eventDateKey: '',
    eventTimeLabel: '',
    eventNote: '',
    eventBusy: false,
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
      navLabel: '本周',
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
        const acct = auth.readAccount()
        const talentMemberId = String(
          (acct && acct.registryMemberId) || participant.resolveTalentMemberId() || '',
        ).trim()
        events = orderCalendar.aggregateOrderCalendarEvents(orders, {
          identity,
          applicantIds: ids,
          talentMemberId,
        })
      }

      let customRows = []
      try {
        customRows = await customEventApi.listEvents()
      } catch (_) {}
      const manualEvents = (customRows || [])
        .map((row) => {
          const dateKey = String((row && row.eventDateKey) || '').trim()
          const dayMs = orderCalendar.parseVisitDayMs(dateKey)
          if (!dateKey || !dayMs) return null
          const phase = orderCalendar.resolveEventPhase({
            kind: 'manual',
            dayMs,
            statusLabel: '自己的行程',
          })
          return {
            id: String(row.id || '').trim(),
            dateKey,
            dayMs,
            kind: 'manual',
            mpOrderId: '',
            orderTitle: String(row.title || '').trim(),
            storeName: '',
            note: String(row.note || '').trim(),
            timeLabel: String(row.timeLabel || '').trim(),
            statusLabel: '自己的行程',
            phase,
            phaseLabel: orderCalendar.phaseStatusLabel(phase),
            kindLabel: '行程',
            tone: 'blue',
            actionLabel: '',
            navUrl: '',
          }
        })
        .filter(Boolean)

      const enriched = (events || []).concat(manualEvents).map((evt) => {
        const nav = evt.kind === 'manual' ? { url: '', actionLabel: '' } : orderCalendar.resolveEventNav(evt, { isPr })
        const phase = orderCalendar.resolveEventPhase(evt)
        return {
          ...evt,
          kindLabel: orderCalendar.kindLabel(evt.kind),
          tone: orderCalendar.eventTone(evt.kind),
          phase,
          phaseLabel: orderCalendar.phaseStatusLabel(phase),
          actionLabel: nav.actionLabel,
          navUrl: nav.url,
        }
      })

      const byDate = orderCalendar.groupEventsByDate(enriched)
      const grid = this.buildGridCells(this.data.year, this.data.month, byDate)
      const selectedEvents = (byDate[this.data.selectedDateKey] || []).map((e) => e)
      const upcomingTodos = orderCalendar.buildUpcomingTodos(enriched, { days: 7 }).map((evt) => {
        const nav = evt.kind === 'manual' ? { url: '', actionLabel: '' } : orderCalendar.resolveEventNav(evt, { isPr })
        const phase = orderCalendar.resolveEventPhase(evt)
        return {
          ...evt,
          kindLabel: orderCalendar.kindLabel(evt.kind),
          tone: orderCalendar.eventTone(evt.kind),
          phase,
          phaseLabel: orderCalendar.phaseStatusLabel(phase),
          actionLabel: nav.actionLabel,
          navUrl: nav.url,
          dateShort: orderCalendar.formatTodoDateShort(evt.dateKey, this.data.todayKey),
          selected: evt.dateKey === this.data.selectedDateKey,
        }
      })
      const activeTodoCount = orderCalendar.countActiveTodos(enriched)

      let myReminders = []
      try {
        myReminders = await calReminder.listReminders()
      } catch (_) {}

      let orderLabels = []
      try {
        orderLabels = await orderLabelApi.listLabels()
      } catch (_) {}

      const labelByOrder = {}
      ;(orderLabels || []).forEach((row) => {
        const id = String((row && row.mpOrderId) || '').trim()
        if (id) labelByOrder[id] = row
      })

      const remindPending = new Set(
        (myReminders || [])
          .filter((r) => r && r.status === 'pending')
          .map((r) => String(r.eventId || '').trim())
          .filter(Boolean),
      )
      const attachFlags = (evt) => {
        const orderId = String(evt.mpOrderId || '').trim()
        const label = orderId ? labelByOrder[orderId] : null
        return {
          ...evt,
          remindSet: remindPending.has(String(evt.id || '').trim()),
          customLabelText: label ? String(label.labelText || '') : '',
          customLabelColor: label ? String(label.color || 'violet') : '',
        }
      }

      const app = getApp()
      if (app && app.globalData) app.globalData.calendarTodoCount = activeTodoCount

      this.setData({
        loading: false,
        isPr,
        byDate,
        grid,
        selectedEvents: selectedEvents.map(attachFlags),
        upcomingTodos: upcomingTodos.map(attachFlags),
        activeTodoCount,
        myReminders,
        orderLabels,
        navLabel: this.resolveNavLabel(this.data.viewMode, this.data.year, this.data.month),
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: (e && e.message) || '加载失败',
      })
    }
  },

  resolveNavLabel(viewMode, year, month) {
    return viewMode === 'week' ? '本周' : monthTitle(year, month)
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
    this.setData({
      year,
      month,
      monthLabel: monthTitle(year, month),
      selectedDateKey: todayKey,
      selectedEvents,
      grid,
      navLabel: this.resolveNavLabel(this.data.viewMode, year, month),
    })
  },

  onPrevMonth() {
    if (this.data.viewMode === 'week') {
      const anchor = orderCalendar.parseVisitDayMs(this.data.selectedDateKey) - 7 * 86400000
      const dateKey = orderCalendar.dateKeyFromMs(anchor)
      const selectedEvents = this.data.byDate[dateKey] || []
      const grid = this.buildGridCells(this.data.year, this.data.month, this.data.byDate).map((cell) => ({
        ...cell,
        selected: cell.dateKey === dateKey,
      }))
      this.setData({ selectedDateKey: dateKey, selectedEvents, grid })
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
      const selectedEvents = this.data.byDate[dateKey] || []
      const grid = this.buildGridCells(this.data.year, this.data.month, this.data.byDate).map((cell) => ({
        ...cell,
        selected: cell.dateKey === dateKey,
      }))
      this.setData({ selectedDateKey: dateKey, selectedEvents, grid })
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

  onSelectDay(e) {
    const dateKey = String((e.currentTarget.dataset.key || '')).trim()
    if (!dateKey) return
    const selectedEvents = this.data.byDate[dateKey] || []
    const grid = (this.data.grid || []).map((cell) => ({
      ...cell,
      selected: cell.dateKey === dateKey,
    }))
    const upcomingTodos = (this.data.upcomingTodos || []).map((item) => ({
      ...item,
      selected: item.dateKey === dateKey,
    }))
    this.setData({ selectedDateKey: dateKey, selectedEvents, grid, upcomingTodos })
  },

  onOpenTodo(e) {
    const dateKey = String((e.currentTarget.dataset.dateKey || '')).trim()
    if (dateKey) {
      const selectedEvents = this.data.byDate[dateKey] || []
      const grid = (this.data.grid || []).map((cell) => ({
        ...cell,
        selected: cell.dateKey === dateKey,
      }))
      const upcomingTodos = (this.data.upcomingTodos || []).map((item) => ({
        ...item,
        selected: item.dateKey === dateKey,
      }))
      this.setData({ selectedDateKey: dateKey, selectedEvents, grid, upcomingTodos })
    }
    if (String((e.currentTarget.dataset.kind || '')).trim() === 'manual') return
    this.onOpenEvent(e)
  },

  onEventSheetNoop() {},

  openManualSheet(row) {
    const selected = String(this.data.selectedDateKey || this.data.todayKey || '').trim()
    this.setData({
      eventSheetOpen: true,
      eventSheetId: String((row && row.id) || '').trim(),
      eventTitle: String((row && row.title) || '').trim(),
      eventDateKey: String((row && row.dateKey) || selected).trim(),
      eventTimeLabel: String((row && row.timeLabel) || '').trim(),
      eventNote: String((row && row.note) || '').trim(),
      eventBusy: false,
    })
  },

  onOpenEventSheet() {
    if (this.data.eventBusy) return
    this.openManualSheet(null)
  },

  onCloseEventSheet() {
    if (this.data.eventBusy) return
    this.setData({
      eventSheetOpen: false,
      eventSheetId: '',
      eventTitle: '',
      eventNote: '',
      eventTimeLabel: '',
    })
  },

  onEventTitleInput(e) {
    this.setData({ eventTitle: String((e && e.detail && e.detail.value) || '') })
  },

  onEventNoteInput(e) {
    this.setData({ eventNote: String((e && e.detail && e.detail.value) || '') })
  },

  onEventDateChange(e) {
    this.setData({ eventDateKey: String((e && e.detail && e.detail.value) || '') })
  },

  onEventTimeChange(e) {
    this.setData({ eventTimeLabel: String((e && e.detail && e.detail.value) || '') })
  },

  onClearEventTime() {
    this.setData({ eventTimeLabel: '' })
  },

  async onSaveManualEvent() {
    const title = String(this.data.eventTitle || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40)
    const eventDateKey = String(this.data.eventDateKey || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写行程标题', icon: 'none' })
      return
    }
    if (!eventDateKey) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }
    if (this.data.eventBusy) return
    this.setData({ eventBusy: true })
    try {
      await customEventApi.saveEvent({
        id: this.data.eventSheetId,
        title,
        eventDateKey,
        timeLabel: this.data.eventTimeLabel,
        note: this.data.eventNote,
      })
      wx.showToast({ title: '行程已保存', icon: 'success' })
      await new Promise((resolve) => {
        this.setData({ eventSheetOpen: false, eventBusy: false, selectedDateKey: eventDateKey }, resolve)
      })
      await this.reload()
    } catch (err) {
      this.setData({ eventBusy: false })
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    }
  },

  onDeleteManualEvent(e) {
    const id = String((e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || this.data.eventSheetId || '').trim()
    if (!id || this.data.eventBusy) return
    wx.showModal({
      title: '删除行程',
      content: '删除后电脑端和小程序都不再显示这条行程。',
      confirmText: '删除',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ eventBusy: true })
        try {
          await customEventApi.deleteEvent(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.setData({ eventSheetOpen: false, eventBusy: false })
          await this.reload()
        } catch (err) {
          this.setData({ eventBusy: false })
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
        }
      },
    })
  },

  onScrollToList() {
    wx.pageScrollTo({ selector: '#cal-event-list', duration: 280 })
  },

  onOpenEvent(e) {
    const kind = String((e.currentTarget.dataset.kind || '')).trim()
    if (kind === 'manual') {
      this.openManualSheet({
        id: e.currentTarget.dataset.id,
        title: e.currentTarget.dataset.title,
        dateKey: e.currentTarget.dataset.dateKey,
        timeLabel: e.currentTarget.dataset.time,
        note: e.currentTarget.dataset.note,
      })
      return
    }
    const url = String((e.currentTarget.dataset.url || '')).trim()
    if (url) {
      wx.navigateTo({ url })
      return
    }
    const mpOrderId = String((e.currentTarget.dataset.id || '')).trim()
    const eventKind = String((e.currentTarget.dataset.kind || '')).trim()
    if (!mpOrderId) return
    const nav = orderCalendar.resolveEventNav({ mpOrderId, kind: eventKind }, { isPr: this.data.isPr })
    if (nav.url) wx.navigateTo({ url: nav.url })
  },

  async onSetReminder(e) {
    const dataset = e.currentTarget.dataset || {}
    const eventId = String(dataset.eventId || '').trim()
    const mpOrderId = String(dataset.mpOrderId || '').trim()
    const eventKind = String(dataset.kind || '').trim()
    const dateKey = String(dataset.dateKey || '').trim()
    const title = String(dataset.title || '').trim()
    const store = String(dataset.store || '').trim()
    if (!eventId || !mpOrderId || !dateKey) return

    const presets = REMIND_OPTIONS.map((o) => o.label)
    let presetIdx = 0
    try {
      const pick = await new Promise((resolve, reject) => {
        wx.showActionSheet({
          itemList: presets,
          success: (res) => resolve(res.tapIndex),
          fail: reject,
        })
      })
      presetIdx = Number(pick)
      if (!Number.isFinite(presetIdx) || presetIdx < 0) return
    } catch (_) {
      return
    }

    const preset = REMIND_OPTIONS[presetIdx].id
    const remindAtMs = orderCalendar.computeRemindAtMs(dateKey, preset)
    if (!remindAtMs || remindAtMs <= Date.now()) {
      wx.showToast({ title: '提醒时间已过，请选更早的提醒', icon: 'none' })
      return
    }

    await mpSubscribe.requestForCalendarReminder()
    try {
      await calReminder.createReminder({
        eventId,
        mpOrderId,
        eventKind,
        eventDateKey: dateKey,
        eventTitle: title,
        storeName: store,
        leadPreset: preset,
        remindAt: new Date(remindAtMs).toISOString(),
        identity: this.data.identity,
        channels: ['subscribe', 'oa'],
      })
      wx.showToast({ title: '提醒已设置', icon: 'success' })
      await this.reload()
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '设置失败', icon: 'none' })
    }
  },

  onSetLabel(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const mpOrderId = String(dataset.mpOrderId || '').trim()
    const title = String(dataset.title || '').trim()
    if (!mpOrderId) {
      wx.showToast({ title: '商单信息缺失，请下拉刷新', icon: 'none' })
      return
    }
    const existing = (this.data.orderLabels || []).find(
      (row) => String((row && row.mpOrderId) || '').trim() === mpOrderId,
    )
    this.setData({
      labelSheetOpen: true,
      labelSheetTitle: title || mpOrderId,
      labelSheetMpOrderId: mpOrderId,
      labelSheetHasExisting: !!existing,
      labelCustomText: existing ? String(existing.labelText || '') : '',
      labelBusy: false,
    })
  },

  onCloseLabelSheet() {
    if (this.data.labelBusy) return
    this.setData({
      labelSheetOpen: false,
      labelSheetMpOrderId: '',
      labelSheetTitle: '',
      labelSheetHasExisting: false,
      labelCustomText: '',
    })
  },

  onLabelSheetNoop() {},

  onLabelCustomInput(e) {
    this.setData({
      labelCustomText: String((e && e.detail && e.detail.value) || '')
        .replace(/\s+/g, ' ')
        .slice(0, 16),
    })
  },

  async onPickLabelPreset(e) {
    const dataset = (e && e.currentTarget && e.currentTarget.dataset) || {}
    const text = String(dataset.text || '').trim()
    const color = String(dataset.color || 'violet').trim() || 'violet'
    const mpOrderId = String(this.data.labelSheetMpOrderId || '').trim()
    if (!mpOrderId || !text || this.data.labelBusy) return
    this.setData({ labelBusy: true })
    try {
      await orderLabelApi.upsertLabel({ mpOrderId, labelText: text, color })
      wx.showToast({ title: '标签已保存', icon: 'success' })
      this.setData({ labelSheetOpen: false, labelBusy: false })
      await this.reload()
    } catch (err) {
      this.setData({ labelBusy: false })
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    }
  },

  async onSaveCustomLabel() {
    const mpOrderId = String(this.data.labelSheetMpOrderId || '').trim()
    const text = String(this.data.labelCustomText || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 16)
    if (!mpOrderId || this.data.labelBusy) return
    if (!text) {
      wx.showToast({ title: '请输入标签', icon: 'none' })
      return
    }
    this.setData({ labelBusy: true })
    try {
      await orderLabelApi.upsertLabel({ mpOrderId, labelText: text, color: 'violet' })
      wx.showToast({ title: '标签已保存', icon: 'success' })
      this.setData({ labelSheetOpen: false, labelBusy: false })
      await this.reload()
    } catch (err) {
      this.setData({ labelBusy: false })
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    }
  },

  async onClearLabel() {
    const mpOrderId = String(this.data.labelSheetMpOrderId || '').trim()
    if (!mpOrderId || this.data.labelBusy) return
    this.setData({ labelBusy: true })
    try {
      await orderLabelApi.deleteLabel(mpOrderId)
      wx.showToast({ title: '标签已清除', icon: 'success' })
      this.setData({ labelSheetOpen: false, labelBusy: false })
      await this.reload()
    } catch (err) {
      this.setData({ labelBusy: false })
      wx.showToast({ title: (err && err.message) || '清除失败', icon: 'none' })
    }
  },
})
