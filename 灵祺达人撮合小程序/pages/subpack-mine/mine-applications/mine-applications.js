const applicationsStore = require('../../../utils/applicationsStore.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')
const appRegistrySync = require('../../../utils/applicationsRegistrySync.js')
const ops = require('../../../utils/opsRegistryTalentMp.js')
const api = require('../../../utils/api.js')
const appDisplay = require('../../../utils/applicationDisplay.js')
const appFilters = require('../../../utils/applicationFilters.js')
const talentAppStatus = require('../../../utils/talentApplicationStatus.js')
const videoUpload = require('../../../utils/recruitmentVideoUpload.js')
const videoAiCompliance = require('../../../utils/recruitmentVideoAiCompliance.js')
const scriptUpload = require('../../../utils/recruitmentScriptUpload.js')
const scriptAiCompliance = require('../../../utils/recruitmentScriptAiCompliance.js')
const deliveryReview = require('../../../utils/deliveryReviewPlatform.js')
const visitScheduleRuntime = require('../../../utils/visitScheduleRuntime.js')
const hallFilters = require('../../../utils/recruitmentHallFilters.js')
const talentFlowSteps = require('../../../utils/talentApplicationFlowSteps.js')

const mpPrivacyPageMixin = require('../../../utils/mpPrivacyPageMixin.js')

Page(mpPrivacyPageMixin.mergeIntoPage({
  data: {
    rows: [],
    filteredRows: [],
    loading: true,
    filterTab: 'registered',
    tabOptions: talentAppStatus.talentApplicationTabsForGroup('video'),
    timeFilter: 'all',
    timeFilterLabel: '时间',
    category: '全部',
    categoryLabel: '类目',
    province: '全部',
    city: '全部',
    regionLabel: '城市',
    timeOptions: appFilters.APPLICATION_TIME_FILTERS,
    categoryOptions: appFilters.CATEGORY_FILTERS,
    cityOptions: ['全部'],
    progressFilter: 'all',
    progressFilterLabel: '状态',
    progressOptions: appFilters.TALENT_APP_PROGRESS_FILTERS,
    orderTypeFilter: 'all',
    orderTypeFilterLabel: '类型',
    orderTypeOptions: appFilters.TALENT_ORDER_TYPE_FILTERS,
    keyword: '',
    uploadingKey: '',
    submittingKey: '',
    visitConfirmKey: '',
    cancelApplyKey: '',
    aiDetectBusyKey: '',
    aiCheckStatusMap: {},
    displayStatusFilter: 'all',
    focusMpOrderId: '',
    mineGuestMode: false,
    platformGroup: 'video',
    platformGroupOptions: deliveryReview.PR_PLATFORM_GROUP_OPTIONS,
  },
  onLoad(options) {
    const tab = String((options && options.tab) || '').trim()
    const displayStatus = String((options && options.displayStatus) || '').trim()
    const mpOrderId = String((options && options.mpOrderId) || '').trim()
    let platformGroup =
      String((options && options.platformGroup) || '').trim() === 'script' ? 'script' : 'video'
    if (displayStatus === 'script_rejected') platformGroup = 'script'
    const patch = {
      platformGroup,
      tabOptions: talentAppStatus.talentApplicationTabsForGroup(platformGroup),
    }
    if (tab) patch.filterTab = tab
    if (displayStatus) patch.displayStatusFilter = displayStatus
    if (mpOrderId) patch.focusMpOrderId = mpOrderId
    this.setData(patch)
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) {
      this.setData({ rows: [], filteredRows: [], loading: false })
      return
    }
    this.load({ silent: (this.data.rows || []).length > 0 })
  },
  applyFilters(rows, tabOverride, groupOverride) {
    const tab = tabOverride || this.data.filterTab || 'registered'
    const group = groupOverride || this.data.platformGroup || 'video'
    const platformScoped = (rows || []).filter((r) =>
      deliveryReview.matchPrPlatformGroup(deliveryReview.resolveOrderPlatformForRow(r), group),
    )
    const byTab = platformScoped.filter((r) =>
      talentAppStatus.matchTalentApplicationTab(
        tab,
        r.progressMp || null,
        r.progressMe || null,
        r.mpOrderId,
        { selectionNotified: r.selectionNotified, isIce: r.isIce, withdrawnAt: !!String(r.withdrawnAt || '').trim(), localApplicantId: r.applicantId || undefined },
      ),
    )
    return appFilters.filterApplicationRows(byTab, {
      filterTab: tab,
      timeFilter: this.data.timeFilter,
      category: this.data.category,
      province: this.data.province,
      city: this.data.city,
      keyword: this.data.keyword,
      progressFilter: this.data.progressFilter,
      orderTypeFilter: this.data.orderTypeFilter,
      displayStatusFilter: this.data.displayStatusFilter,
      focusMpOrderId: this.data.focusMpOrderId,
    })
  },
  _maybeSwitchToPendingVideoTab(rows) {
    if (this.data.filterTab !== 'pending_visit') return null
    const shouldSwitch = (rows || []).some((r) => {
      const st = talentAppStatus.resolveApplicationDisplayStatus(
        r.progressMp,
        r.progressMe,
        r.mpOrderId,
        { selectionNotified: r.selectionNotified, isIce: r.isIce, withdrawnAt: !!String(r.withdrawnAt || '').trim(), localApplicantId: r.applicantId || undefined },
      )
      return (
        st.tabId === 'pending_video' &&
        talentAppStatus.isTalentVisitCheckedIn(r.progressMp, r.progressMe)
      )
    })
    if (!shouldSwitch) return null
    return {
      filterTab: 'pending_video',
      filteredRows: this.applyFilters(rows, 'pending_video'),
    }
  },
  _rowAiKey(row) {
    return `${String(row?.mpOrderId || '')}-${String(row?.applicantId || 'x')}`
  },
  _resolveActionRow(ds) {
    const mpOrderId = String((ds && (ds.id || ds.mpOrderId)) || '').trim()
    const row = (this.data.filteredRows || this.data.rows || []).find(
      (r) => r && r.mpOrderId === mpOrderId,
    )
    let applicantId = String((ds && (ds.applicantId || ds.applicant)) || row?.applicantId || '').trim()
    if (!applicantId && mpOrderId) {
      const local = applicationsStore.readApplications().find(
        (a) => a && String(a.mpOrderId || '') === mpOrderId,
      )
      if (local && local.applicantId) applicantId = String(local.applicantId).trim()
    }
    return {
      mpOrderId,
      applicantId,
      row: row || null,
      key: this._rowAiKey({ mpOrderId, applicantId }),
    }
  },
  _aiStatusForKey(key) {
    return this.data.aiCheckStatusMap[key] || {}
  },
  mergeAiStatusToRows(rows) {
    const map = this.data.aiCheckStatusMap || {}
    return (rows || []).map((r) => {
      let row = talentFlowSteps.enrichRowWithFlowSteps(r)
      const st = map[this._rowAiKey(r)]
      if (st) row = { ...row, aiCheckStatusText: st.text, aiCheckStatusTone: st.tone }
      return row
    })
  },
  updateRowAiStatus(key, status) {
    const map = { ...(this.data.aiCheckStatusMap || {}), [key]: status }
    const apply = (list) =>
      (list || []).map((r) => {
        if (this._rowAiKey(r) !== key) return r
        return { ...r, aiCheckStatusText: status.text, aiCheckStatusTone: status.tone }
      })
    this.setData({
      aiCheckStatusMap: map,
      rows: apply(this.data.rows),
      filteredRows: apply(this.data.filteredRows),
    })
  },
  enrichLocalFallbackRow(a) {
    const mpOrderId = String((a && a.mpOrderId) || '')
    const applicantId = String((a && a.applicantId) || '').trim()
    const isIce = /^MP-ICE-/i.test(mpOrderId)
    const withdrawnAt = !!String(a.withdrawnAt || '').trim()
    const displayStatus = talentAppStatus.resolveApplicationDisplayStatus(null, null, mpOrderId, {
      isIce,
      withdrawnAt,
      localApplicantId: applicantId || undefined,
    })
    const progress = talentAppStatus.resolveTalentApplicationProgress(null, null, mpOrderId)
    return talentFlowSteps.enrichRowWithFlowSteps({
      ...a,
      title: a.title || mpOrderId,
      statusLabel: '—',
      platformIcon: hallFilters.platformIcon(a.platform || '抖音'),
      category: '其他',
      canUploadVideo: false,
      isIce,
      progressId: progress.id,
      progressLabel: progress.label,
      progressMp: null,
      progressMe: null,
      selectionNotified: false,
      displayTabId: displayStatus.tabId,
      displayStatusLabel: displayStatus.label,
      displayStatusTone: displayStatus.tone,
      showConfirmBtn: displayStatus.showConfirmBtn,
      showCancelBtn: displayStatus.showCancelBtn,
      iceActionLabel: isIce ? '查看云剪任务' : '',
      hallLabel: isIce ? '云剪任务' : '招募大厅',
    })
  },
  onTabChange(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id || id === this.data.filterTab) return
    this.setData({
      filterTab: id,
      progressFilter: 'all',
      progressFilterLabel: '状态',
      filteredRows: this.applyFilters(this.data.rows, id),
    })
  },
  onPlatformGroupTap(e) {
    const group = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.group) || 'video')
    if (group === this.data.platformGroup) return
    this.setData({
      platformGroup: group,
      tabOptions: talentAppStatus.talentApplicationTabsForGroup(group),
      filteredRows: this.applyFilters(this.data.rows, undefined, group),
    })
  },
  async load(opts) {
    const silent = !!(opts && opts.silent)
    const local = applicationsStore.readApplications()
    if (!api.hasApi()) {
      const rows = this.mergeAiStatusToRows(local.map((a) => this.enrichLocalFallbackRow(a)))
      const cityOptions = hallFilters.buildCityFilterOptions(rows)
      this.setData({
        rows,
        filteredRows: this.applyFilters(rows),
        cityOptions,
        loading: false,
      })
      return
    }
    if (!silent && !this.data.rows.length) {
      this.setData({ loading: true })
    }
    try {
      const reg = await appRegistrySync.fetchRegistryAndReconcileApplications({ includeLocalContext: true })
      const local = applicationsStore.readApplications()
      const mpList = reg.mpRecruitmentOrders || []
      const enriched = this.mergeAiStatusToRows(
        local.map((a) => {
          const mp = mpList.find((o) => o && o.id === a.mpOrderId)
          const row = appDisplay.enrichTalentApplicationRow(a, mp, reg)
          if (!String(a.withdrawnAt || '').trim() && row.applicantId && row.applicantId !== a.applicantId) {
            applicationsStore.updateApplicationApplicantId(a.mpOrderId, row.applicantId)
          }
          return row
        }),
      )
      const cityOptions = hallFilters.buildCityFilterOptions(enriched)
      const tabPatch = this._maybeSwitchToPendingVideoTab(enriched)
      this.setData({
        rows: enriched,
        filteredRows: tabPatch ? tabPatch.filteredRows : this.applyFilters(enriched),
        filterTab: tabPatch ? tabPatch.filterTab : this.data.filterTab,
        cityOptions,
        loading: false,
      })
    } catch {
      const rows = this.mergeAiStatusToRows(local.map((a) => this.enrichLocalFallbackRow(a)))
      this.setData({
        rows,
        filteredRows: this.applyFilters(rows),
        loading: false,
      })
    }
  },
  onProgressFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.progressOptions[idx] || this.data.progressOptions[0]
    const progressFilter = opt && opt.id ? opt.id : 'all'
    const progressFilterLabel =
      progressFilter === 'all' ? '状态' : opt && opt.label ? opt.label : '状态'
    this.setData({
      progressFilter,
      progressFilterLabel,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onOrderTypeFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.orderTypeOptions[idx] || this.data.orderTypeOptions[0]
    this.setData({
      orderTypeFilter: opt.id,
      orderTypeFilterLabel: opt.id === 'all' ? '类型' : opt.label,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onTimeFilterChange(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.timeOptions[idx] || this.data.timeOptions[0]
    this.setData({
      timeFilter: opt.id,
      timeFilterLabel: opt.id === 'all' ? '时间' : opt.label,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onCategoryChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.categoryOptions[idx] || '全部'
    this.setData({
      category: val,
      categoryLabel: val === '全部' ? '类目' : val,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onCityChange(e) {
    const idx = Number(e.detail.value) || 0
    const val = this.data.cityOptions[idx] || '全部'
    this.setData({
      city: val,
      province: '全部',
      regionLabel: val === '全部' ? '城市' : val,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  onKeywordInput(e) {
    const keyword = String((e.detail && e.detail.value) || '')
    this.setData({
      keyword,
      filteredRows: this.applyFilters(this.data.rows),
    })
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}` })
  },
  onViewVideo(e) {
    const ds = e.currentTarget.dataset || {}
    let url = String(ds.url || '').trim()
    if (!url) {
      const { row } = this._resolveActionRow(ds)
      url = String(row?.visitVideoUrl || (row?.progressMe && row.progressMe.videoUrl) || '').trim()
    }
    videoUpload.previewUploadedVideo(url)
  },
  async onAiDetect(e) {
    const ds = e.currentTarget.dataset || {}
    const { mpOrderId, applicantId, row, key } = this._resolveActionRow(ds)
    if (!mpOrderId || this.data.aiDetectBusyKey === key) return
    const isScript = deliveryReview.isScriptReviewPlatform(row && row.platform)
    this.setData({ aiDetectBusyKey: key })
    this.updateRowAiStatus(key, isScript ? scriptAiCompliance.getCheckingInlineStatus() : videoAiCompliance.getCheckingInlineStatus())
    try {
      const me = row?.progressMe || null
      const mpFromRow = row?.progressMp || null
      let payload = {
        mpOrderId,
        applicantId: applicantId || undefined,
        orderTitle: row?.title,
        platform: row?.platform || '抖音',
      }
      if (api.hasApi()) {
        let mp = mpFromRow
        let app = me
        if (!mp || (!app && applicantId)) {
          const reg = await ops.fetchRegistry({
            includeMpOrderIds: [mpOrderId],
            includeLocalContext: true,
          })
          mp = (reg.mpRecruitmentOrders || []).find((o) => o && String(o.id) === mpOrderId) || mp
          if (mp && !app) {
            const talentContactPrGate = require('../../../utils/talentContactPrGate.js')
            app =
              (Array.isArray(mp.applicants) ? mp.applicants : []).find(
                (a) => a && String(a.id) === String(applicantId || ''),
              ) || talentContactPrGate.findMyApplicant(mp, mpOrderId)
          }
        }
        if (mp) {
          payload = {
            ...payload,
            applicantId: String(app?.id || applicantId || payload.applicantId || '').trim() || undefined,
            recruitmentInfo: String(mp.recruitmentInfo || mp.taskDetail || ''),
            merchantRequirements: String(mp.merchantRequirements || ''),
            taskDetail: String(mp.taskDetail || ''),
            category: String(mp.category || ''),
            region: String(mp.region || ''),
            applicantName: String(app?.platformNickname || app?.nickname || row?.title || ''),
          }
        }
        if (isScript) {
          payload.scriptUrl = String(app?.scriptUrl || row?.scriptUrl || '')
          payload.scriptLinkUrl = String(app?.scriptLinkUrl || row?.scriptLinkUrl || '')
          if (!payload.scriptUrl && !payload.scriptLinkUrl) {
            this.updateRowAiStatus(key, { text: '', tone: '' })
            wx.showToast({ title: '请先上传文稿或粘贴链接', icon: 'none' })
            return
          }
          payload.scriptText = await scriptUpload.readScriptTextForAi(payload.scriptUrl, payload.scriptLinkUrl)
        } else {
          payload.videoUrl = String(app?.videoUrl || row?.visitVideoUrl || '')
          payload.douyinPublishUrl = String(app?.douyinPublishUrl || '')
          if (!payload.videoUrl) {
            this.updateRowAiStatus(key, { text: '', tone: '' })
            wx.showToast({ title: '请先上传探店视频', icon: 'none' })
            return
          }
        }
      } else if (isScript) {
        payload.scriptUrl = row?.scriptUrl || ''
        payload.scriptLinkUrl = row?.scriptLinkUrl || ''
        if (!payload.scriptUrl && !payload.scriptLinkUrl) {
          this.updateRowAiStatus(key, { text: '', tone: '' })
          wx.showToast({ title: '请先上传文稿或粘贴链接', icon: 'none' })
          return
        }
        payload.scriptText = await scriptUpload.readScriptTextForAi(payload.scriptUrl, payload.scriptLinkUrl)
      } else {
        payload.videoUrl = String(row?.visitVideoUrl || '')
        if (!payload.videoUrl) {
          this.updateRowAiStatus(key, { text: '', tone: '' })
          wx.showToast({ title: '请先上传探店视频', icon: 'none' })
          return
        }
      }
      const res = isScript
        ? await scriptAiCompliance.checkScriptCompliance(payload)
        : await videoAiCompliance.checkVideoCompliance(payload)
      const format = isScript ? scriptAiCompliance.formatInlineStatus : videoAiCompliance.formatInlineStatus
      const status = format(res)
      this.updateRowAiStatus(key, status)
      if (status.text) {
        wx.showToast({
          title: String(status.text).slice(0, 24),
          icon: status.tone === 'pass' ? 'success' : 'none',
          duration: 2800,
        })
      }
    } catch (err) {
      this.updateRowAiStatus(key, { text: '', tone: '' })
      wx.showToast({
        title: String((err && err.message) || 'AI 检测失败').slice(0, 28),
        icon: 'none',
      })
    } finally {
      this.setData({ aiDetectBusyKey: '' })
    }
  },
  _runUploadVideoOnce(runner) {
    if (this._uploadVideoPicking) {
      wx.showToast({ title: '正在打开相册…', icon: 'none' })
      return
    }
    this._uploadVideoPicking = true
    const reset = () => {
      this._uploadVideoPicking = false
    }
    const timer = setTimeout(reset, 45000)
    Promise.resolve()
      .then(runner)
      .finally(() => {
        clearTimeout(timer)
        reset()
      })
  },
  onUploadVideo(e) {
    this._pendingUploadKind = 'video'
    this._pendingUploadEvent = e
    this._runUploadVideoOnce(() => this._doUploadVideo(e))
  },
  onConfirmVisit(e) {
    const { mpOrderId: id, applicantId, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id || !applicantId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    if (this.data.visitConfirmKey === key) return
    this.setData({ visitConfirmKey: key })
    visitScheduleRuntime
      .visitCheckIn(id, applicantId, 'manual')
      .then(() => {
        this.setData({ visitConfirmKey: '', filterTab: 'pending_video' })
        const registryCache = require('../../../utils/registryCache.js')
        registryCache.bust()
        wx.showToast({ title: '已确认探店', icon: 'success' })
        void this.load({ silent: true })
      })
      .catch((err) => {
        this.setData({ visitConfirmKey: '' })
        wx.showToast({ title: (err && err.message) || '确认失败', icon: 'none' })
      })
  },
  onCancelApply(e) {
    const { mpOrderId: id, applicantId, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id || !applicantId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    if (this.data.cancelApplyKey === key) return
    wx.showModal({
      title: '取消报名',
      content: '确定取消该商单的报名吗？取消后可重新报名。',
      confirmText: '确定取消',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ cancelApplyKey: key })
        ops
          .cancelMpRecruitmentApply(id, applicantId)
          .then(() => {
            applicationsStore.markApplicationWithdrawn(id)
            try {
              const iceOrderStats = require('../../../utils/iceOrderStats.js')
              wx.removeStorageSync(iceOrderStats.iceApplicantStorageKey(id))
            } catch (_) {}
            const registryCache = require('../../../utils/registryCache.js')
            registryCache.bust()
            void require('../../../utils/mpAccountClientSync.js').flushClientStateSync()
            const withdrawnAt = new Date().toLocaleString('zh-CN', { hour12: false })
            const rows = (this.data.rows || []).map((r) => {
              if (!r || r.mpOrderId !== id) return r
              return {
                ...r,
                withdrawnAt,
                displayTabId: 'cancelled',
                displayStatusLabel: '已取消报名',
                displayStatusTone: 'cancelled',
                showCancelBtn: false,
                progressMe: null,
              }
            })
            this.setData({
              cancelApplyKey: '',
              rows,
              filteredRows: this.applyFilters(rows),
            })
            wx.showToast({ title: '已取消报名', icon: 'success' })
            void this.load({ silent: true })
          })
          .catch((err) => {
            this.setData({ cancelApplyKey: '' })
            wx.showToast({ title: (err && err.message) || '取消失败', icon: 'none' })
          })
      },
    })
  },
  onSubmitVideo(e) {
    const { mpOrderId: id, applicantId, row, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id || !applicantId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    if (this.data.submittingKey === key) return
    const videoUrl = String(
      row?.visitVideoUrl || (row?.progressMe && row.progressMe.videoUrl) || '',
    ).trim()
    if (!videoUrl) {
      wx.showToast({ title: '请先上传探店视频', icon: 'none' })
      return
    }
    const aiStatus = this._aiStatusForKey(key)
    const proceed = () => this._submitVideoAfterChecklist(id, applicantId, videoUrl)
    if (aiStatus.text && aiStatus.tone === 'warn') {
      wx.showModal({
        title: 'AI 检测未通过',
        content: `${String(aiStatus.text).slice(0, 100)}\n\n建议修改后重新检测，仍要提交？`,
        confirmText: '仍要提交',
        cancelText: '先修改',
        success: (res) => {
          if (res.confirm) proceed()
        },
      })
      return
    }
    if (!aiStatus.text) {
      wx.showModal({
        title: '提交前提示',
        content: '建议先完成 AI 检测再提交审核，是否继续？',
        confirmText: '继续提交',
        cancelText: '先去检测',
        success: (res) => {
          if (res.confirm) proceed()
        },
      })
      return
    }
    proceed()
  },
  _submitVideoAfterChecklist(id, applicantId, videoUrl) {
    const key = `${id}-${applicantId}`
    if (this.data.submittingKey === key) return
    this.setData({ submittingKey: key })
    videoUpload
      .submitVideoForReview(id, applicantId, videoUrl)
      .then(() => {
        this.setData({ submittingKey: '' })
        try {
          const mpSubscribeMessages = require('../../../utils/mpSubscribeMessages.js')
          mpSubscribeMessages.requestForVideoReview()
        } catch (_) {}
        wx.showToast({ title: '已提交审核', icon: 'success' })
        const registryCache = require('../../../utils/registryCache.js')
        registryCache.bust()
        void this.load({ silent: true })
      })
      .catch((err) => {
        this.setData({ submittingKey: '' })
        wx.showToast({
          title: String((err && err.message) || '提交失败').slice(0, 24),
          icon: 'none',
        })
      })
  },
  _doUploadVideo(e) {
    const { mpOrderId: id, applicantId, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    if (!applicantId) {
      wx.showModal({
        title: '无法上传',
        content: '未找到您的报名记录，请返回商单详情确认已报名成功后再试。',
        showCancel: false,
      })
      return
    }
    if (this.data.uploadingKey === key) return
    videoUpload
      .chooseAndUploadVideo(id, applicantId, {
        onUploadStart: () => this.setData({ uploadingKey: key }),
      })
      .then((uploaded) => {
        this.setData({ uploadingKey: '' })
        if (!uploaded) return
        this.updateRowAiStatus(key, { text: '', tone: '' })
        const registryCache = require('../../../utils/registryCache.js')
        registryCache.bust()
        void this.load({ silent: true })
      })
      .catch((err) => {
        this.setData({ uploadingKey: '' })
        if (err && err._uploadErrorShown) return
        const msg = videoUpload.formatErrorMessage(err, '上传失败')
        if (!/cancel|未选择/.test(msg)) {
          wx.showToast({ title: msg.slice(0, 24), icon: 'none' })
        }
      })
  },
  onViewScript(e) {
    const ds = e.currentTarget.dataset || {}
    scriptUpload.openScriptUrl(String(ds.url || ''), String(ds.link || ''))
  },
  onPasteScriptLink(e) {
    const { mpOrderId: id, applicantId, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id || !applicantId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    wx.showModal({
      title: '粘贴文档链接',
      editable: true,
      placeholderText: '腾讯文档 / 飞书链接',
      success: (res) => {
        if (!res.confirm) return
        const link = String(res.content || '').trim()
        if (!link) {
          wx.showToast({ title: '请填写链接', icon: 'none' })
          return
        }
        if (this.data.uploadingKey === key) return
        this.setData({ uploadingKey: key })
        scriptUpload
          .saveScriptLinkDraft(id, applicantId, link)
          .then(() => {
            this.setData({ uploadingKey: '' })
            this.updateRowAiStatus(key, { text: '', tone: '' })
            const registryCache = require('../../../utils/registryCache.js')
            registryCache.bust()
            wx.showToast({ title: '链接已保存', icon: 'success' })
            void this.load({ silent: true })
          })
          .catch((err) => {
            this.setData({ uploadingKey: '' })
            wx.showToast({
              title: scriptUpload.formatErrorMessage(err, '保存失败').slice(0, 24),
              icon: 'none',
            })
          })
      },
    })
  },
  onSubmitScript(e) {
    const { mpOrderId: id, applicantId, row, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id || !applicantId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    const scriptUrl = String(row?.scriptUrl || (row?.progressMe && row.progressMe.scriptUrl) || '').trim()
    const scriptLinkUrl = String(
      row?.scriptLinkUrl || (row?.progressMe && row.progressMe.scriptLinkUrl) || '',
    ).trim()
    if (!scriptUrl && !scriptLinkUrl) {
      wx.showToast({ title: '请先上传文稿或粘贴链接', icon: 'none' })
      return
    }
    if (this.data.submittingKey === key) return
    const aiStatus = this._aiStatusForKey(key)
    const proceed = () => {
      this.setData({ submittingKey: key })
      scriptUpload
        .submitScriptForReview(id, applicantId, {})
        .then(() => {
          this.setData({ submittingKey: '' })
          wx.showToast({ title: '已提交审核', icon: 'success' })
          const registryCache = require('../../../utils/registryCache.js')
          registryCache.bust()
          void this.load({ silent: true })
        })
        .catch((err) => {
          this.setData({ submittingKey: '' })
          wx.showToast({
            title: String((err && err.message) || '提交失败').slice(0, 24),
            icon: 'none',
          })
        })
    }
    if (aiStatus.text && aiStatus.tone === 'warn') {
      wx.showModal({
        title: 'AI 检测未通过',
        content: `${String(aiStatus.text).slice(0, 100)}\n\n建议修改后重新检测，仍要提交？`,
        confirmText: '仍要提交',
        cancelText: '先修改',
        success: (res) => {
          if (res.confirm) proceed()
        },
      })
      return
    }
    if (!aiStatus.text) {
      wx.showModal({
        title: '提交前提示',
        content: '建议先完成 AI 检测再提交审核，是否继续？',
        confirmText: '继续提交',
        cancelText: '先去检测',
        success: (res) => {
          if (res.confirm) proceed()
        },
      })
      return
    }
    proceed()
  },
  onUploadScript(e) {
    this._pendingUploadKind = 'script'
    this._pendingUploadEvent = e
    this._runUploadVideoOnce(() => this._doUploadScript(e))
  },
  _retryAfterPrivacyAgreed() {
    const kind = this._pendingUploadKind
    const evt = this._pendingUploadEvent
    if (kind === 'script' && evt) {
      this._runUploadVideoOnce(() => this._doUploadScript(evt))
    } else if (kind === 'video' && evt) {
      this._runUploadVideoOnce(() => this._doUploadVideo(evt))
    }
  },
  _doUploadScript(e) {
    const { mpOrderId: id, applicantId, key } = this._resolveActionRow(
      (e.currentTarget && e.currentTarget.dataset) || {},
    )
    if (!id || !applicantId) {
      wx.showToast({ title: '订单信息缺失', icon: 'none' })
      return
    }
    if (this.data.uploadingKey === key) return
    scriptUpload
      .chooseAndUploadScript(id, applicantId, {
        onUploadStart: () => this.setData({ uploadingKey: key }),
      })
      .then((uploaded) => {
        this.setData({ uploadingKey: '' })
        if (!uploaded) return
        this.updateRowAiStatus(key, { text: '', tone: '' })
        const registryCache = require('../../../utils/registryCache.js')
        registryCache.bust()
        void this.load({ silent: true })
      })
      .catch((err) => {
        this.setData({ uploadingKey: '' })
        if (err && err._uploadErrorShown) return
        const msg = scriptUpload.formatErrorMessage(err, '上传失败')
        if (!/cancel|未选择/.test(msg)) {
          wx.showToast({ title: msg.slice(0, 24), icon: 'none' })
        }
      })
  },
}))
