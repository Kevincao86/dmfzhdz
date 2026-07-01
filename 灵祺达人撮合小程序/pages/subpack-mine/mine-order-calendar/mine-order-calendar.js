const { prepareMineSubPage, syncPrPageChrome } = require('../../../utils/pageIdentityChrome.js')
const appRegistrySync = require('../../../utils/applicationsRegistrySync.js')
const applicationsStore = require('../../../utils/applicationsStore.js')
const orderCalendar = require('../../../utils/orderCalendarEvents.js')
const userProfile = require('../../../utils/userProfile.js')

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function monthTitle(year, month) {
  return `${year}年${month + 1}月`
}

function todayDateKey() {
  return orderCalendar.dateKeyFromMs(Date.now())
}

function isPrIdentity() {
  return userProfile.readIdentity() === 'pr'
}

function syncCalendarChrome(page) {
  if (isPrIdentity()) syncPrPageChrome(page, { animate: false })
}

Page({
  data: {
    loading: true,
    err: '',
    isPr: false,
    year: 0,
    month: 0,
    monthLabel: '',
    weekLabels: WEEK_LABELS,
    grid: [],
    selectedDateKey: '',
    selectedEvents: [],
    byDate: {},
    todayKey: '',
  },

  async onLoad() {
    syncCalendarChrome(this)
    const now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth(),
      monthLabel: monthTitle(now.getFullYear(), now.getMonth()),
      selectedDateKey: todayDateKey(),
      todayKey: todayDateKey(),
    })
    await prepareMineSubPage(this)
    syncCalendarChrome(this)
    this.reload()
  },

  async onShow() {
    await prepareMineSubPage(this)
    syncCalendarChrome(this)
    this.reload()
  },

  async reload() {
    this.setData({ loading: true, err: '' })
    try {
      const isPr = isPrIdentity()
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications(
        isPr ? { includePrOwned: true } : { includeLocalContext: true },
      )
      const orders = (reg && reg.mpRecruitmentOrders) || []
      let events
      if (isPr) {
        events = orderCalendar.aggregatePrOrderCalendarEvents(orders)
      } else {
        const apps = applicationsStore.readApplications()
        const ids = apps.map((a) => String(a.applicantId || '').trim()).filter(Boolean)
        events = orderCalendar.aggregateTalentOrderCalendarEvents(orders, ids)
      }
      const byDate = orderCalendar.groupEventsByDate(events)
      const grid = this.buildGridCells(this.data.year, this.data.month, byDate)
      const selectedEvents = byDate[this.data.selectedDateKey] || []
      this.setData({
        loading: false,
        isPr,
        byDate,
        grid,
        selectedEvents,
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: (e && e.message) || '加载失败',
      })
    }
  },

  buildGridCells(year, month, byDate) {
    const cells = orderCalendar.buildMonthGrid(year, month)
    const selectedDateKey = this.data.selectedDateKey
    const todayKey = this.data.todayKey
    return cells.map((cell) => ({
      ...cell,
      count: (byDate[cell.dateKey] || []).length,
      dotPhase: orderCalendar.resolveDayDotPhase(byDate[cell.dateKey] || []),
      selected: cell.dateKey === selectedDateKey,
      isToday: cell.dateKey === todayKey,
    }))
  },

  onPrevMonth() {
    let { year, month } = this.data
    if (month === 0) {
      year -= 1
      month = 11
    } else month -= 1
    const grid = this.buildGridCells(year, month, this.data.byDate)
    this.setData({ year, month, monthLabel: monthTitle(year, month), grid })
  },

  onNextMonth() {
    let { year, month } = this.data
    if (month === 11) {
      year += 1
      month = 0
    } else month += 1
    const grid = this.buildGridCells(year, month, this.data.byDate)
    this.setData({ year, month, monthLabel: monthTitle(year, month), grid })
  },

  onSelectDay(e) {
    const dateKey = String((e.currentTarget.dataset.key || '')).trim()
    if (!dateKey) return
    const selectedEvents = this.data.byDate[dateKey] || []
    const grid = (this.data.grid || []).map((cell) => ({
      ...cell,
      selected: cell.dateKey === dateKey,
    }))
    this.setData({ selectedDateKey: dateKey, selectedEvents, grid })
  },

  onOpenEvent(e) {
    const mpOrderId = String((e.currentTarget.dataset.id || '')).trim()
    const kind = String((e.currentTarget.dataset.kind || '')).trim()
    if (!mpOrderId) return
    if (this.data.isPr) {
      if (kind === 'visit') {
        wx.navigateTo({ url: `/pages/subpack-pr/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}` })
        return
      }
      if (kind === 'plan_slot') {
        wx.navigateTo({ url: `/pages/subpack-pr/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}&step=dates` })
        return
      }
      wx.navigateTo({ url: `/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(mpOrderId)}` })
      return
    }
    wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(mpOrderId)}` })
  },
})
