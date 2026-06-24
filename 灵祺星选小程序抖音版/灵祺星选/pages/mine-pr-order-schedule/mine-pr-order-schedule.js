const ops = require('../../utils/opsRegistryTalentMp.js')
const { syncPrPageChrome } = require('../../utils/pageIdentityChrome.js')
const api = require('../../utils/api.js')
const iceOrderStats = require('../../utils/iceOrderStats.js')
const visitRuntime = require('../../utils/visitScheduleRuntime.js')
const visitBoard = require('../../utils/visitScheduleBoard.js')
const mpOrderRegistryOps = require('../../utils/mpOrderRegistryOps.js')
const prWorkflow = require('../../utils/prOrderWorkflowStage.js')
const chat = require('../../utils/talentChat.js')
const userProfile = require('../../utils/userProfile.js')
const { exportApplicantsExcel } = require('../../utils/mpApplicantsExport.js')

function selectedFromMp(mp) {
  const ids = new Set((Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []).map(String))
  return (Array.isArray(mp.applicants) ? mp.applicants : []).filter(
    (a) =>
      a &&
      (a.prSelected || a.merchantSelected || ids.has(String(a.id))) &&
      a.taskStatus !== 'rejected',
  )
}

Page({
  data: {
    mpOrderId: '',
    isReview: false,
    pageTitle: '探店排期',
    backLabel: '返回待排期',
    phase: 'board',
    datesLocked: false,
    loading: true,
    err: '',
    title: '',
    storeName: '',
    category: '',
    mode: 'manual',
    busy: false,
    okMsg: '',
    errMsg: '',
    shareTable: true,
    mealCount: 1,
    tableSize: 4,
    visitDates: [],
    columns: [],
    pool: [],
    boardView: { days: [], unassigned: [], cap: 1, maxTotal: 1, totalTables: 0, atGlobalTableLimit: false },
    checkInRows: [],
    dropHint: '',
    assignPickerSlots: [],
    assignPickerTalentId: '',
    chatLoadingId: '',
    lqThemeClass: 'lq-theme-pr',
  },
  _baseline: {},
  onLoad(options) {
    syncPrPageChrome(this, { animate: false })
    const mpOrderId = String((options && options.id) || '').trim()
    const isReview = String((options && options.view) || '') === 'review'
    this.setData({
      mpOrderId,
      isReview,
      pageTitle: isReview ? '查看排期' : '探店排期',
      backLabel: isReview ? '返回待视频审核' : '返回待排期',
    })
    if (!mpOrderId) {
      this.setData({ loading: false, err: '缺少招募单号' })
      return
    }
    this.loadOrder()
  },
  onShow() {
    syncPrPageChrome(this, { animate: false })
    wx.setNavigationBarTitle({ title: this.data.pageTitle })
  },
  onPullDownRefresh() {
    this.loadOrder().finally(() => wx.stopPullDownRefresh())
  },
  refreshBoardView() {
    const boardView = visitBoard.buildBoardView(
      this.data.visitDates,
      this.data.columns,
      this.data.pool,
      this.data.shareTable,
      this.data.tableSize,
      this.data.mealCount,
    )
    this.setData({ boardView })
  },
  applyBoardState(patch) {
    const visitDates = patch.visitDates != null ? patch.visitDates : this.data.visitDates
    let columns = patch.columns != null ? patch.columns : this.data.columns
    const shareTable = patch.shareTable != null ? patch.shareTable : this.data.shareTable
    const mealCount = patch.mealCount != null ? patch.mealCount : this.data.mealCount
    const tableSize = patch.tableSize != null ? patch.tableSize : this.data.tableSize
    columns = visitBoard.rebuildColumnsForSettings(columns, visitDates, shareTable, mealCount)
    if (!shareTable) {
      const cap = visitBoard.capTableSize(false, tableSize)
      columns = columns.map((col) => ({
        ...col,
        tables: col.tables.map((t) => ({
          ...t,
          talentIds: (t.talentIds || []).slice(0, cap),
        })),
      }))
    }
    this.setData({ visitDates, columns, shareTable, mealCount, tableSize })
    this.refreshBoardView()
  },
  async loadOrder() {
    const { mpOrderId, isReview } = this.data
    if (!mpOrderId || !api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [mpOrderId] })
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && String(o.id) === mpOrderId)
      if (!mp) {
        this.setData({ loading: false, err: '招募单不存在或已删除' })
        return
      }
      if (iceOrderStats.isIceMpOrder(mp)) {
        this.setData({ loading: false, err: '云剪任务无需探店排期' })
        return
      }
      const selected = selectedFromMp(mp)
      if (!selected.length) {
        this.setData({ loading: false, err: '请先在报名管理中确认选择并通知达人' })
        return
      }
      const init = visitBoard.initBoardState(selected, isReview, mp)
      const pool = visitBoard.buildPool(selected)
      const datesLocked = visitRuntime.isVisitPlanDatesConfirmed(mp)
      const phase =
        isReview || datesLocked ? 'board' : 'dates'
      this._baseline = visitBoard.baselineFromApplicants(selected)
      const checkInRows = selected.map((a) => ({
        id: String(a.id),
        name: visitBoard.applicantName(a),
        assignedVisitAt: String(a.assignedVisitAt || '—'),
        checkIn: visitBoard.checkInStatusLabel(a),
      }))
      this._mp = mp
      this._selected = selected
      this.setData({
        loading: false,
        err: '',
        phase,
        datesLocked,
        pageTitle: phase === 'dates' ? '可探店日期' : isReview ? '查看排期' : '探店排期',
        title: String(mp.title || mp.customerName || mpOrderId),
        storeName: String(mp.storeName || mp.title || '门店'),
        category: String(mp.category || '餐饮美食'),
        visitDates: init.visitDates,
        columns: init.columns,
        shareTable: init.shareTable,
        mealCount: init.mealCount,
        tableSize: init.tableSize,
        pool,
        checkInRows,
      })
      this.refreshBoardView()
    } catch (e) {
      this.setData({ loading: false, err: String(e && e.message ? e.message : e).slice(0, 80) })
    }
  },
  onBackList() {
    const tab = this.data.isReview ? 'pending_video_review' : 'pending_schedule'
    wx.navigateTo({ url: `/pages/mine-pr-orders/mine-pr-orders?tab=${tab}` })
  },
  goApplicants() {
    wx.navigateTo({
      url: `/pages/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(this.data.mpOrderId)}`,
    })
  },
  onGoModifyDates() {
    const mp = this._mp
    const patch = { phase: 'dates', pageTitle: '可探店日期', okMsg: '', errMsg: '' }
    if (mp && visitRuntime.isVisitPlanDatesConfirmed(mp)) {
      const fromPlan = visitBoard.initVisitDatesFromPlanMeta(mp)
      if (fromPlan) {
        patch.visitDates = fromPlan
        patch.columns = visitBoard.initColumns(fromPlan)
      }
    }
    this.setData(patch)
    this.refreshBoardView()
    wx.setNavigationBarTitle({ title: '可探店日期' })
  },
  onBackToBoard() {
    this.setData({ phase: 'board', pageTitle: '探店排期', okMsg: '', errMsg: '' })
    wx.setNavigationBarTitle({ title: '探店排期' })
  },
  async onConfirmPlanDates() {
    if (this.data.busy || this.data.phase !== 'dates') return
    const rows = visitBoard.visitDatesToPlanRows(this.data.visitDates)
    if (!rows.length) {
      this.setData({ errMsg: '请至少设置一天可探店时段' })
      return
    }
    this.setData({ busy: true, errMsg: '', okMsg: '' })
    try {
      await visitRuntime.confirmVisitPlanDates(this.data.mpOrderId, {
        visitPlanDates: rows,
        category: this.data.category,
      })
      await this.loadOrder()
      this.setData({ phase: 'board', okMsg: '可探店日期已保存，请安排达人排期' })
      wx.setNavigationBarTitle({ title: '探店排期' })
    } catch (e) {
      this.setData({ errMsg: String(e && e.message ? e.message : e).slice(0, 80) })
    } finally {
      this.setData({ busy: false })
    }
  },
  onModeManual() {
    this.setData({ mode: 'manual', okMsg: '', errMsg: '' })
  },
  onModeAi() {
    this.setData({ mode: 'ai', okMsg: '', errMsg: '' })
    void this.runAiSchedule(false)
  },
  onAddVisitDate() {
    if (this.data.phase !== 'dates') return
    const visitDates = this.data.visitDates || []
    const id = `day-${Date.now()}`
    const last = visitDates[visitDates.length - 1]
    const date = visitBoard.offsetVisitDate((last && last.date) || visitRuntime.defaultVisitPlanDate(), 1)
    const slots = visitBoard.cloneSlotsForNewDay(
      last && last.slots && last.slots.length ? last.slots : visitBoard.defaultVisitSlotDefs(),
    )
    const nextDates = [...visitDates, { id, date, slots }]
    this.applyBoardState({ visitDates: nextDates })
  },
  onRemoveVisitDate(e) {
    if (this.data.phase !== 'dates') return
    const dayId = e.currentTarget.dataset.dayId
    if ((this.data.visitDates || []).length <= 1) return
    const nextDates = (this.data.visitDates || []).filter((d) => d.id !== dayId)
    const nextCols = (this.data.columns || []).filter((c) => c.dateId !== dayId)
    this.applyBoardState({ visitDates: nextDates, columns: nextCols })
  },
  onVisitDateChange(e) {
    if (this.data.phase !== 'dates') return
    const dayId = e.currentTarget.dataset.dayId
    const date = String((e.detail && e.detail.value) || '')
    const nextDates = (this.data.visitDates || []).map((d) => (d.id === dayId ? { ...d, date } : d))
    this.applyBoardState({ visitDates: nextDates })
  },
  onAddSlot(e) {
    if (this.data.phase !== 'dates') return
    const dayId = e.currentTarget.dataset.dayId
    const slotId = `slot-${Date.now()}`
    const nextDates = (this.data.visitDates || []).map((d) =>
      d.id === dayId ? { ...d, slots: [...(d.slots || []), { id: slotId, start: '14:00', end: '17:00' }] } : d,
    )
    this.applyBoardState({ visitDates: nextDates })
  },
  onRemoveSlot(e) {
    if (this.data.phase !== 'dates') return
    const { dayId, slotId } = e.currentTarget.dataset
    const day = (this.data.visitDates || []).find((d) => d.id === dayId)
    if (!day || (day.slots || []).length <= 1) return
    const nextDates = (this.data.visitDates || []).map((d) =>
      d.id === dayId ? { ...d, slots: (d.slots || []).filter((s) => s.id !== slotId) } : d,
    )
    const nextCols = (this.data.columns || []).filter((c) => !(c.dateId === dayId && c.slotId === slotId))
    this.applyBoardState({ visitDates: nextDates, columns: nextCols })
  },
  onSlotTimeChange(e) {
    if (this.data.phase !== 'dates') return
    const { dayId, slotId, field } = e.currentTarget.dataset
    const value = String((e.detail && e.detail.value) || '')
    const visitDates = (this.data.visitDates || []).map((d) => {
      if (d.id !== dayId) return d
      return {
        ...d,
        slots: (d.slots || []).map((s) => {
          if (s.id !== slotId) return s
          const next = { ...s, [field]: value }
          const start = field === 'start' ? value : s.start
          const end = field === 'end' ? value : s.end
          if (!visitRuntime.isValidVisitTimeRange(start, end)) {
            this.setData({ dropHint: '结束时间须晚于开始时间' })
            return s
          }
          this.setData({ dropHint: '' })
          return next
        }),
      }
    })
    this.applyBoardState({ visitDates })
  },
  onShareTableToggle() {
    this.applyBoardState({ shareTable: !this.data.shareTable })
  },
  onMealCountInput(e) {
    const mealCount = Math.max(1, Number((e.detail && e.detail.value) || 1) || 1)
    this.applyBoardState({ mealCount })
  },
  onTableSizeInput(e) {
    const tableSize = Math.max(1, Number((e.detail && e.detail.value) || 4) || 4)
    this.applyBoardState({ tableSize })
  },
  onAddTable(e) {
    const { dayId, slotId } = e.currentTarget.dataset
    const columns = this.data.columns || []
    const shareTable = this.data.shareTable
    const mealCount = this.data.mealCount
    const maxTotal = shareTable ? Math.max(1, mealCount) : 1
    if (visitBoard.countTotalTables(columns) >= maxTotal) {
      const relocated = visitBoard.relocateEmptyTableToSlot(columns, dayId, slotId)
      if (relocated) {
        this.setData({ dropHint: '' })
        this.applyBoardState({ columns: relocated })
        return
      }
      this.setData({ dropHint: `全排期桌数已达上限，共最多 ${maxTotal} 桌（餐食 ${mealCount} 份）` })
      return
    }
    this.setData({ dropHint: '' })
    const next = columns.map((c) =>
      c.dateId === dayId && c.slotId === slotId
        ? { ...c, tables: [...(c.tables || []), { id: `t-${Date.now()}`, talentIds: [] }] }
        : c,
    )
    this.applyBoardState({ columns: next })
  },
  onRemoveTable(e) {
    const { dayId, slotId, tableId } = e.currentTarget.dataset
    const columns = this.data.columns || []
    const col = columns.find((c) => c.dateId === dayId && c.slotId === slotId)
    const table = col && (col.tables || []).find((t) => t.id === tableId)
    if (!table || (table.talentIds || []).length) {
      this.setData({ dropHint: '该桌已有达人，请先移出后再删除桌位' })
      return
    }
    this.setData({ dropHint: '' })
    const next = columns.map((c) =>
      c.dateId === dayId && c.slotId === slotId
        ? { ...c, tables: (c.tables || []).filter((t) => t.id !== tableId) }
        : c,
    )
    this.applyBoardState({ columns: next })
  },
  dropTalent(dayId, slotId, tableId, talentId) {
    if (!talentId) return
    const shareTable = this.data.shareTable
    const cap = visitBoard.capTableSize(shareTable, this.data.tableSize)
    const columns = this.data.columns || []
    const target = columns.find((c) => c.dateId === dayId && c.slotId === slotId)
    const table = target && (target.tables || []).find((t) => t.id === tableId)
    if (!table) return
    if (!(table.talentIds || []).includes(talentId) && (table.talentIds || []).length >= cap) {
      this.setData({ dropHint: shareTable ? `该桌已满，最多 ${cap} 人` : '单独探店每格仅可 1 人' })
      return
    }
    this.setData({ dropHint: '' })
    const cleared = columns.map((col) => ({
      ...col,
      tables: (col.tables || []).map((t) => ({
        ...t,
        talentIds: (t.talentIds || []).filter((id) => id !== talentId),
      })),
    }))
    const updated = cleared.map((col) => {
      if (col.dateId !== dayId || col.slotId !== slotId) return col
      return {
        ...col,
        tables: (col.tables || []).map((t) =>
          t.id === tableId && !(t.talentIds || []).includes(talentId)
            ? { ...t, talentIds: [...(t.talentIds || []), talentId] }
            : t,
        ),
      }
    })
    this.applyBoardState({ columns: updated })
  },
  onAssignToTable(e) {
    const { dayId, slotId, tableId } = e.currentTarget.dataset
    const unassigned = (this.data.boardView.unassigned || []).map((p) => p.name)
    if (!unassigned.length) {
      wx.showToast({ title: '待排期达人已空', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: unassigned,
      success: (res) => {
        const person = (this.data.boardView.unassigned || [])[res.tapIndex]
        if (!person) return
        this.dropTalent(dayId, slotId, tableId, person.id)
      },
    })
  },
  onAssignTalentTap(e) {
    const talentId = e.currentTarget.dataset.talentId
    const slots = []
    for (const day of this.data.boardView.days || []) {
      for (const slot of day.slots || []) {
        for (const table of slot.tables || []) {
          if ((table.talents || []).length < table.cap) {
            slots.push({
              label: `第${day.dayIndex}天 ${day.date} ${slot.label} · ${table.tableLabel}`,
              dayId: day.dayId,
              slotId: slot.slotId,
              tableId: table.tableId,
            })
          }
        }
      }
    }
    if (!slots.length) {
      wx.showToast({ title: '时段已满', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: slots.map((s) => s.label),
      success: (res) => {
        const pick = slots[res.tapIndex]
        if (!pick) return
        this.dropTalent(pick.dayId, pick.slotId, pick.tableId, talentId)
      },
    })
  },
  onRemoveTalent(e) {
    const talentId = e.currentTarget.dataset.talentId
    const columns = (this.data.columns || []).map((col) => ({
      ...col,
      tables: (col.tables || []).map((t) => ({
        ...t,
        talentIds: (t.talentIds || []).filter((id) => id !== talentId),
      })),
    }))
    this.applyBoardState({ columns })
  },
  manualRows() {
    return visitBoard.boardToScheduleRows(this.data.columns, this.data.visitDates, {
      storeName: this.data.storeName,
      shareTable: this.data.shareTable,
      tableSize: this.data.tableSize,
      mealCount: this.data.mealCount,
    })
  },
  selectedSlots() {
    return visitBoard.slotStringsFromVisitDates(this.data.visitDates)
  },
  async ensureWorkflowAdvanced(confirmEffective) {
    if (!confirmEffective) return
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
      const mpList = reg.mpRecruitmentOrders || []
      const mp = mpList.find((o) => o && String(o.id) === String(this.data.mpOrderId))
      if (!mp) return
      if (prWorkflow.resolvePrWorkflowStage(mp) === 'pending_video_review') return
      if (!prWorkflow.isVisitScheduleDone(mp)) return
      await mpOrderRegistryOps.patchPrWorkflow(mp, prWorkflow.buildScheduleCompletedPatch())
    } catch {
      /* API 已写入时忽略 */
    }
  },
  async saveSchedule(rows, assignMode, confirmEffective) {
    if (!rows.length) {
      this.setData({ errMsg: '请先拖动达人到时段完成排期' })
      return
    }
    this.setData({ busy: true, errMsg: '', okMsg: '' })
    const { mpOrderId, isReview, storeName, category, shareTable, mealCount, tableSize } = this.data
    const pool = this.data.pool || []
    try {
      const notifyRows = visitBoard.rowsToNotify(rows, this._baseline, isReview)
      const notifyIds = notifyRows.map((r) => String(r.applicantId)).filter(Boolean)
      const res = await visitRuntime.setVisitSchedule(mpOrderId, {
        mode: assignMode,
        rows: assignMode === 'manual' ? rows : undefined,
        aiRows:
          assignMode === 'ai'
            ? rows.map((r) => {
                const hit = pool.find((a) => a.id === r.applicantId)
                return {
                  time: r.time,
                  talentName: hit ? hit.name : r.applicantId,
                  talentId: r.applicantId,
                  storeName: r.storeName,
                  tableNote: r.tableNote,
                }
              })
            : undefined,
        visitSlots: this.selectedSlots(),
        category,
        shareTable,
        mealCount,
        tableSize,
        storeName,
        notify: confirmEffective && notifyRows.length > 0,
        notifyApplicantIds: isReview ? notifyIds : undefined,
        confirmEffective,
      })
      await this.ensureWorkflowAdvanced(confirmEffective)
      if (confirmEffective) {
        for (const row of notifyRows) {
          this._baseline[String(row.applicantId)] = visitBoard.scheduleSnapshotKey(
            row.applicantId,
            row.time,
            row.storeName,
            row.tableNote,
          )
        }
      }
      await this.loadOrder()
      if (confirmEffective) {
        if (isReview) {
          this.setData({
            okMsg: notifyRows.length
              ? `排期已更新并通知 ${notifyRows.length} 位达人`
              : '排期已保存（无变更，未发送通知）',
          })
        } else {
          wx.redirectTo({
            url:
              `/pages/mine-pr-order-schedule-success/mine-pr-order-schedule-success?id=${encodeURIComponent(mpOrderId)}` +
              `&count=${rows.length}&title=${encodeURIComponent(this.data.title)}`,
          })
        }
        return
      }
      this.setData({ okMsg: '排期草案已保存，可继续调整后确认生效' })
      void res
    } catch (e) {
      this.setData({ errMsg: String(e && e.message ? e.message : e).slice(0, 60) })
    } finally {
      this.setData({ busy: false })
    }
  },
  onSaveDraft() {
    void this.saveSchedule(this.manualRows(), 'manual', false)
  },
  onConfirmManual() {
    void this.saveSchedule(this.manualRows(), 'manual', true)
  },
  async onAiDraft() {
    void this.runAiSchedule(false)
  },
  async onAiConfirm() {
    void this.runAiSchedule(true)
  },
  async runAiSchedule(confirmEffective) {
    const slots = this.selectedSlots()
    if (!slots.length) {
      this.setData({ errMsg: '请至少添加一个有效时段' })
      return
    }
    this.setData({ busy: true, errMsg: '', okMsg: '' })
    const { mpOrderId, isReview, storeName, category, shareTable, mealCount, tableSize, title, visitDates, columns } =
      this.data
    const selected = this._selected || []
    try {
      let rows = []
      let source = 'rule'
      try {
        const res = await visitRuntime.setVisitSchedule(mpOrderId, {
          mode: 'ai',
          visitSlots: slots,
          category,
          shareTable,
          mealCount,
          tableSize,
          storeName,
          notify: false,
          confirmEffective: false,
        })
        if (Array.isArray(res && res.rows) && res.rows.length) {
          rows = res.rows.map((r) => ({
            applicantId: String(r.applicantId || ''),
            time: String(r.time || '').trim(),
            storeName: String(r.storeName || '').trim() || undefined,
            tableNote: String(r.tableNote || '').trim() || undefined,
          }))
          source = res.scheduleSource === 'ai' ? 'ai' : 'rule'
        }
      } catch (_) {
        /* 走客户端 AI/规则 */
      }
      if (!rows.length) {
        const gen = await visitRuntime.generateAiVisitSchedule(selected, {
          visitSlots: slots,
          storeName,
          shareTable,
          mealCount,
          tableSize,
          category,
          title,
        })
        rows = gen.rows || []
        source = gen.source || 'rule'
      }
      if (!rows.length) {
        this.setData({ errMsg: '无已选达人可排期' })
        return
      }
      rows = visitBoard.normalizeScheduleRowsToPlan(rows, visitDates, slots)
      const nextColumns = visitBoard.applyScheduleRowsToBoard(columns, visitDates, rows, {
        shareTable,
        tableSize,
        mealCount,
      })
      this.applyBoardState({ columns: nextColumns })
      if (confirmEffective) {
        const boardRows = visitBoard.boardToScheduleRows(nextColumns, visitDates, {
          storeName,
          shareTable,
          tableSize,
          mealCount,
        })
        await this.saveSchedule(boardRows.length ? boardRows : rows, 'ai', true)
        return
      }
      this.setData({
        okMsg:
          source === 'ai'
            ? 'AI 已根据达人意向与桌位设置自动排入下方，可微调后确认生效'
            : '已按达人意向与可用时段自动排入下方，可微调后确认生效',
      })
    } catch (e) {
      this.setData({ errMsg: String(e && e.message ? e.message : e).slice(0, 60) })
    } finally {
      this.setData({ busy: false })
    }
  },
  async onExportSchedule() {
    const rows = this.manualRows()
    const fromBoard = rows.length ? rows : visitBoard.scheduleRowsFromApplicants(this._selected || [], this.data.storeName)
    if (!fromBoard.length) {
      wx.showToast({ title: '请先填写排期时间', icon: 'none' })
      return
    }
    try {
      const applicants = this._selected || []
      const lines = ['达人', '探店时间', '门店', '桌位备注']
      for (const r of fromBoard) {
        const a = applicants.find((x) => String(x.id) === String(r.applicantId))
        lines.push(
          [
            visitBoard.applicantName(a || { id: r.applicantId }),
            r.time,
            r.storeName || this.data.storeName,
            r.tableNote || '',
          ].join('\t'),
        )
      }
      wx.setClipboardData({
        data: lines.join('\n'),
        success: () => wx.showToast({ title: '排期明细已复制', icon: 'success' }),
      })
    } catch (e) {
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  },
  async onChatTalent(e) {
    const talentId = e.currentTarget.dataset.talentId
    const person = (this.data.pool || []).find((p) => p.id === talentId)
    if (!person || this.data.chatLoadingId) return
    if (!chat.canChat() || userProfile.readIdentity() !== 'pr') {
      wx.showToast({ title: '无法发起私信', icon: 'none' })
      return
    }
    this.setData({ chatLoadingId: talentId })
    wx.showLoading({ title: '连接中' })
    try {
      await chat.syncProfile()
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
      const sessionId = await chat.ensureSessionWithTalent(
        {
          id: person.id,
          talentMemberId: person.talentMemberId || person.id,
          name: person.name,
          avatar: person.avatar || '',
        },
        reg,
      )
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/chat/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(person.name)}` +
          `&peerAvatar=${encodeURIComponent(person.avatar || '')}`,
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: String(err.message || '无法发起会话').slice(0, 28), icon: 'none' })
    } finally {
      this.setData({ chatLoadingId: '' })
    }
  },
})
