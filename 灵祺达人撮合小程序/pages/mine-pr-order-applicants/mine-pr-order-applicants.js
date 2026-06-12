const ops = require('../../utils/opsRegistryTalentMp.js')
const api = require('../../utils/api.js')
const userProfile = require('../../utils/userProfile.js')
const chat = require('../../utils/talentChat.js')
const appDisplay = require('../../utils/applicationDisplay.js')
const heroMeta = require('../../utils/mpOrderHeroMeta.js')
const selection = require('../../utils/mpApplicantSelection.js')
const talentInboxMatch = require('../../utils/talentInboxMatch.js')
const { exportApplicantsExcel, formatExportError } = require('../../utils/mpApplicantsExport.js')
const mpGroupQr = require('../../utils/mpGroupQr.js')
const iceOrderStats = require('../../utils/iceOrderStats.js')
const videoUpload = require('../../utils/recruitmentVideoUpload.js')
const mpOrderRegistryOps = require('../../utils/mpOrderRegistryOps.js')
const mpOrderIce = require('../../utils/mpOrderIceStatus.js')
const applicantExtras = require('../../utils/applicantListExtras.js')

const EMPTY_LIST_FILTERS = {
  searchQuery: '',
  filterSalesLevel: '',
  filterTag: '',
  filterNotified: '',
}

function findApplicantById(applicants, id) {
  const aid = String(id || '').trim()
  if (!aid) return null
  return (applicants || []).find((a) => a && String(a.id) === aid) || null
}

Page({
  data: {
    mpOrderId: '',
    loading: true,
    err: '',
    title: '',
    orderNo: '',
    publishedAt: '',
    deadlineText: '',
    status: '',
    statusLabel: '',
    hallLabel: '',
    isIce: false,
    iceVerifyMode: 'ai',
    iceClaimed: 0,
    iceCompleted: 0,
    icePendingReview: 0,
    applicants: [],
    selectedIds: [],
    selectedCount: 0,
    notifiedCount: 0,
    selectedApplicants: [],
    checkedIds: [],
    checkedCount: 0,
    batchConfirming: false,
    showSelectedPanel: false,
    filterSelectedOnly: false,
    displayApplicants: [],
    exportingAll: false,
    groupQrImage: '',
    groupQrExpired: false,
    groupQrUploading: false,
    showGroupQrPreview: false,
    notifying: false,
    savingSelect: false,
    chatEnabled: false,
    chattingId: '',
    mpOrder: null,
    iceReviewBusyId: '',
    iceRejectModal: false,
    iceRejectTargetId: '',
    iceRejectTargetName: '',
    iceRejectReason: '',
    canCompleteIce: false,
    completingIce: false,
    listFilters: EMPTY_LIST_FILTERS,
    tagFilterOptions: [],
    salesLevelOptions: [],
    filterNotifiedOptions: [
      { id: '', label: '通知状态 · 全部' },
      { id: 'yes', label: '已发通知' },
      { id: 'no', label: '未发通知' },
    ],
    filterNotifiedIndex: 0,
    filterSalesLevelIndex: 0,
    filterTagIndex: 0,
    displayCount: 0,
    hasActiveListFilters: false,
  },
  onShow() {
    this.setData({ chatEnabled: chat.canChat() && userProfile.readIdentity() === 'pr' })
    if (this.data.mpOrderId) this.loadOrder()
  },
  onLoad(options) {
    const mpOrderId = options && options.id ? decodeURIComponent(options.id) : ''
    this.setData({ mpOrderId })
    if (!mpOrderId) {
      this.setData({ loading: false, err: '缺少招募单号' })
      return
    }
    this.loadOrder()
  },
  onPullDownRefresh() {
    this.loadOrder().finally(() => wx.stopPullDownRefresh())
  },
  applyApplicantsState(applicants, selectedIds, opts) {
    const ids = selection.normalizeSelectedIds(selectedIds)
    const stamped = selection.stampApplicantsSelected(applicants, ids)
    const selectedApplicants = selection.filterSelectedApplicants(stamped, ids)
    const filterSelectedOnly =
      opts && opts.filterSelectedOnly != null ? opts.filterSelectedOnly : this.data.filterSelectedOnly
    const listFilters = (opts && opts.listFilters) || this.data.listFilters || EMPTY_LIST_FILTERS
    let displayApplicants = applicantExtras.filterApplicantRows(stamped, listFilters)
    if (filterSelectedOnly) displayApplicants = displayApplicants.filter((a) => a && a.selected)
    const hasActiveListFilters = !!(
      listFilters.searchQuery ||
      listFilters.filterSalesLevel ||
      listFilters.filterTag ||
      listFilters.filterNotified
    )
    const notifiedCount = (stamped || []).filter((a) => a && a.selectionNotified).length
    this.setData({
      applicants: stamped,
      displayApplicants,
      filterSelectedOnly,
      selectedIds: ids,
      selectedCount: ids.length,
      notifiedCount,
      selectedApplicants,
      listFilters,
      displayCount: displayApplicants.length,
      hasActiveListFilters,
    })
  },
  recomputeDisplayApplicants(listFilters) {
    const filters = listFilters || this.data.listFilters || EMPTY_LIST_FILTERS
    let rows = applicantExtras.filterApplicantRows(this.data.applicants || [], filters)
    if (this.data.filterSelectedOnly) rows = rows.filter((a) => a && a.selected)
    const hasActiveListFilters = !!(
      filters.searchQuery ||
      filters.filterSalesLevel ||
      filters.filterTag ||
      filters.filterNotified
    )
    this.setData({
      listFilters: filters,
      displayApplicants: rows,
      displayCount: rows.length,
      hasActiveListFilters,
    })
  },
  onFilterSearchInput(e) {
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), searchQuery: e.detail.value }
    this.recomputeDisplayApplicants(filters)
  },
  onFilterSalesLevelChange(e) {
    const idx = Number(e.detail.value) || 0
    const lv = idx > 0 ? String((this.data.salesLevelOptions || [])[idx - 1] || '') : ''
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), filterSalesLevel: lv }
    this.setData({ filterSalesLevelIndex: idx })
    this.recomputeDisplayApplicants(filters)
  },
  onFilterTagChange(e) {
    const idx = Number(e.detail.value) || 0
    const tag = idx > 0 ? String((this.data.tagFilterOptions || [])[idx - 1] || '') : ''
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), filterTag: tag }
    this.setData({ filterTagIndex: idx })
    this.recomputeDisplayApplicants(filters)
  },
  onFilterNotifiedChange(e) {
    const idx = Number(e.detail.value) || 0
    const opts = this.data.filterNotifiedOptions || []
    const pick = opts[idx] || opts[0]
    const filters = { ...(this.data.listFilters || EMPTY_LIST_FILTERS), filterNotified: pick.id }
    this.setData({ filterNotifiedIndex: idx })
    this.recomputeDisplayApplicants(filters)
  },
  onClearListFilters() {
    this.setData({ filterSalesLevelIndex: 0, filterTagIndex: 0, filterNotifiedIndex: 0 })
    this.recomputeDisplayApplicants(EMPTY_LIST_FILTERS)
  },
  async loadOrder() {
    const { mpOrderId } = this.data
    if (!mpOrderId) return
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址，无法拉取报名' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [this.data.mpOrderId] })
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
      if (!mp) {
        this.setData({
          loading: false,
          err: '未找到该招募单，请下拉刷新',
          applicants: [],
          mpOrder: null,
        })
        return
      }
      const meta = heroMeta.buildMpOrderHeroMeta(mp)
      const isIce = iceOrderStats.isIceMpOrder(mp)
      const iceVerifyMode = iceOrderStats.getIceVerifyMode(mp)
      const iceStats = iceOrderStats.countIceOrderStats(mp)
      const prStatus = mpOrderIce.resolveIcePrStatus(mp)
      const prStatusLabel = mpOrderIce.displayStatusLabel(prStatus, mp, 'pr')
      let icePendingReview = 0
      let selectedIds = selection.selectedIdsFromMp(mp)
      if (!selectedIds.length) selectedIds = selection.readLocalSelectedIds(mpOrderId)
      const baseApplicants = (mp.applicants || []).map((a, i) => {
        const row = appDisplay.enrichApplicantRow(a, i, reg)
        if (!isIce) return row
        const canReview = iceOrderStats.canReviewIceLink(a, mp)
        if (canReview) icePendingReview += 1
        return {
          ...row,
          iceTaskStatus: iceOrderStats.applicantTaskStatusLabel(a),
          iceDouyinUrl: String(a.douyinPublishUrl || a.videoUrl || '').trim(),
          iceRejectReason: String(a.videoRejectReason || a.aiVerifyNote || '').trim(),
          canReviewIceLink: canReview,
        }
      })
      const applicants = applicantExtras.enrichAndSortApplicants(baseApplicants, reg, mp, mpOrderId)
      const tagFilterOptions = applicantExtras.collectApplicantTagOptions(applicants)
      const salesLevelOptions = applicantExtras.collectSalesLevelOptions(applicants)
      this.setData({
        loading: false,
        title: mp.title || mp.customerName || mpOrderId,
        orderNo: meta.orderNo,
        publishedAt: meta.publishedAt,
        deadlineText: meta.deadlineText,
        status: mp.status || 'open',
        statusLabel: isIce ? prStatusLabel : appDisplay.statusLabel(mp.status),
        hallLabel: appDisplay.hallLabelFromMp(mp),
        isIce,
        iceVerifyMode,
        iceClaimed: iceStats.claimed,
        iceCompleted: iceStats.completed,
        icePendingReview,
        canCompleteIce: mpOrderIce.canPrCompleteIceOrder(mp),
        mpOrder: mp,
        groupQrImage: mpGroupQr.groupQrFromRegistry(reg, mpOrderId) || mpGroupQr.groupQrFromMp(mp),
        groupQrExpired: mpGroupQr.isGroupQrExpired(mp),
        showGroupQrPreview: false,
        err: '',
        tagFilterOptions,
        salesLevelOptions,
      })
      this.applyApplicantsState(applicants, selectedIds, { listFilters: this.data.listFilters })
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 80),
      })
    }
  },
  onToggleCheck(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    if (!id) return
    const set = new Set(this.data.checkedIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const checkedIds = [...set]
    this.setData({ checkedIds, checkedCount: checkedIds.length })
  },
  async onBatchConfirm() {
    if (this.data.batchConfirming || this.data.savingSelect) return
    const checked = this.data.checkedIds.filter((id) => !this.data.selectedIds.includes(id))
    if (!checked.length) {
      wx.showToast({
        title: this.data.checkedCount ? '勾选的已在已选名单' : '请先勾选达人',
        icon: 'none',
      })
      return
    }
    const next = [...new Set([...this.data.selectedIds, ...checked])]
    this.applyApplicantsState(this.data.applicants, next)
    this.setData({ checkedIds: [], checkedCount: 0, batchConfirming: true })
    try {
      await selection.persistSelectedIds(this.data.mpOrderId, next)
      const mp = { ...this.data.mpOrder, selectedApplicantIds: next }
      this.setData({ mpOrder: mp })
      wx.showToast({ title: `已确认 ${checked.length} 人`, icon: 'success' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '批量确认失败').slice(0, 28), icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ batchConfirming: false })
    }
  },
  async onToggleSelect(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    const a = findApplicantById(this.data.applicants, id)
    if (!a || !a.id || this.data.savingSelect) return
    const set = new Set(this.data.selectedIds)
    if (set.has(a.id)) set.delete(a.id)
    else set.add(a.id)
    const selectedIds = [...set]
    const filterSelectedOnly = selectedIds.length ? this.data.filterSelectedOnly : false
    this.applyApplicantsState(this.data.applicants, selectedIds, { filterSelectedOnly })
    this.setData({ savingSelect: true })
    try {
      await selection.persistSelectedIds(this.data.mpOrderId, selectedIds)
      const mp = { ...this.data.mpOrder, selectedApplicantIds: selectedIds }
      this.setData({ mpOrder: mp })
    } catch (err) {
      wx.showToast({ title: String(err.message || '保存失败').slice(0, 28), icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ savingSelect: false })
    }
  },
  onViewSelected() {
    if (!this.data.filterSelectedOnly && !this.data.selectedCount) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    const filterSelectedOnly = !this.data.filterSelectedOnly
    this.applyApplicantsState(this.data.applicants, this.data.selectedIds, { filterSelectedOnly })
  },
  onCloseSelectedPanel() {
    this.setData({ showSelectedPanel: false })
  },
  async onDeselectFromPanel(e) {
    const id = String(e.currentTarget.dataset.id || '').trim()
    if (!id || this.data.savingSelect) return
    const selectedIds = this.data.selectedIds.filter((x) => x !== id)
    this.applyApplicantsState(this.data.applicants, selectedIds)
    if (!selectedIds.length) this.setData({ showSelectedPanel: false })
    this.setData({ savingSelect: true })
    try {
      await selection.persistSelectedIds(this.data.mpOrderId, selectedIds)
      const mp = { ...this.data.mpOrder, selectedApplicantIds: selectedIds }
      this.setData({ mpOrder: mp })
      wx.showToast({ title: '已取消选择', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: String(err.message || '保存失败').slice(0, 28), icon: 'none' })
      await this.loadOrder()
    } finally {
      this.setData({ savingSelect: false })
    }
  },
  async runExport(list, flagKey) {
    if (!list.length) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' })
      return
    }
    if (this.data[flagKey]) return
    this.setData({ [flagKey]: true })
    wx.showLoading({ title: '生成 Excel…', mask: true })
    try {
      const res = await exportApplicantsExcel(list, this.data.mpOrderId)
      if (res.mode === 'disk') {
        wx.showToast({ title: 'Excel 已保存到手机', icon: 'success', duration: 2500 })
      } else if (res.mode === 'clipboard') {
        wx.showToast({ title: '已复制，可粘贴到 Excel', icon: 'none', duration: 2500 })
      }
    } catch (e) {
      wx.showToast({
        title: formatExportError(e).slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ [flagKey]: false })
    }
  },
  onExportAll() {
    this.runExport(this.data.applicants, 'exportingAll')
  },
  onPreviewGroupQr() {
    const url = this.data.groupQrImage
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onToggleGroupQrPreview() {
    if (!this.data.groupQrImage) return
    this.setData({ showGroupQrPreview: !this.data.showGroupQrPreview })
  },
  async onUploadGroupQr() {
    if (this.data.groupQrUploading) return
    if (this.data.groupQrExpired) {
      wx.showToast({ title: '报名截止已满7天，群码已自动清理', icon: 'none' })
      return
    }
    this.setData({ groupQrUploading: true })
    try {
      const dataUrl = await mpGroupQr.chooseAndReadImageDataUrl()
      wx.showLoading({ title: '上传中…', mask: true })
      this.setData({ groupQrImage: dataUrl })
      const patchResult = await mpGroupQr.patchGroupQrImage(this.data.mpOrderId, dataUrl)
      const mp = { ...this.data.mpOrder, groupQrImage: dataUrl }
      this.setData({ groupQrImage: dataUrl, mpOrder: mp, showGroupQrPreview: true })
      if (patchResult && patchResult.localOnly) {
        wx.showToast({ title: '已存本机，云端待同步', icon: 'none' })
      } else {
        wx.showToast({ title: '群二维码已保存', icon: 'success' })
      }
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      if (msg !== 'cancel') {
        if (e && e.localSaved) {
          const mp = { ...this.data.mpOrder, groupQrImage: this.data.groupQrImage }
          this.setData({ mpOrder: mp })
        }
        wx.showToast({ title: msg.slice(0, 28), icon: 'none', duration: 2800 })
      }
    } finally {
      wx.hideLoading()
      this.setData({ groupQrUploading: false })
    }
  },
  async onNotifySelected() {
    if (this.data.notifying) return
    const selected = this.data.selectedApplicants
    if (!selected.length) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    const qr = String(this.data.groupQrImage || '').trim()
    if (!qr) {
      wx.showToast({ title: '请先上传群二维码', icon: 'none' })
      return
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '通知已选达人',
        content: `将向 ${selected.length} 位达人发送站内信（含群二维码图片）。是否继续？`,
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!confirmed) return
    this.setData({ notifying: true })
    wx.showLoading({ title: '发送中…', mask: true })
    try {
      const reg = await ops.fetchRegistry()
      const title = this.data.title || this.data.mpOrderId
      const entries = []
      const skipped = []
      for (const a of selected) {
        const target = talentInboxMatch.resolveTalentInboxTarget(a, reg)
        if (!target.talentMemberId) {
          skipped.push(a.displayName || a.id)
          continue
        }
        entries.push({
          talentMemberId: target.talentMemberId,
          contact: target.contact,
          platformAccount: target.platformAccount,
          applicantId: target.applicantId,
          mpOrderId: this.data.mpOrderId,
          category: 'business',
          title: '恭喜入选招募',
          body: `您已被 PR 选入「${title}」（单号 ${this.data.orderNo}）。请扫码加入项目群，二维码见下图。`,
          noticeType: 'selection',
          pinned: true,
        })
      }
      if (!entries.length) {
        wx.showToast({ title: '所选达人缺少手机号或平台账号', icon: 'none' })
        return
      }
      await ops.appendTalentInbox(entries)
      const notifiedIds = entries.map((e) => String(e.applicantId || '').trim()).filter(Boolean)
      if (notifiedIds.length) {
        const stamped = (this.data.applicants || []).map((a) =>
          a && notifiedIds.includes(String(a.id || '')) ? { ...a, selectionNotified: true } : a,
        )
        const mpOrder = this.data.mpOrder
        const prevNotified =
          mpOrder && Array.isArray(mpOrder.notifiedApplicantIds) ? mpOrder.notifiedApplicantIds : []
        const mergedOrder = mpOrder
          ? {
              ...mpOrder,
              notifiedApplicantIds: [...new Set([...prevNotified.map(String), ...notifiedIds])],
            }
          : mpOrder
        this.applyApplicantsState(stamped, this.data.selectedIds, { listFilters: this.data.listFilters })
        if (mergedOrder) this.setData({ mpOrder: mergedOrder })
      }
      wx.showToast({
        title: skipped.length ? `已通知 ${entries.length} 人` : '通知已发送',
        icon: 'success',
      })
      wx.showModal({
        title: '已写入站内信',
        content:
          '达人请在「我的 → 消息通知」中查看（非底部「消息」私信页）。请让对方下拉刷新该页。',
        showCancel: false,
      })
      if (skipped.length) {
        setTimeout(() => {
          wx.showModal({
            title: '部分未通知',
            content: `${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? ' 等' : ''} 未匹配到达人会员，请引导其完善「我的信息」后重试。`,
            showCancel: false,
          })
        }, 400)
      }
      await this.loadOrder()
    } catch (e) {
      wx.showToast({
        title: String(e && e.message ? e.message : e).slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ notifying: false })
    }
  },
  async onChatApplicant(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a || !a.id) return
    if (!this.data.chatEnabled) {
      wx.showToast({ title: '请先配置后台地址', icon: 'none' })
      return
    }
    this.setData({ chattingId: a.id })
    wx.showLoading({ title: '连接中' })
    try {
      await chat.syncProfile()
      const reg = await ops.fetchRegistry()
      const sessionId = await chat.ensureSessionWithTalent(
        {
          id: a.id,
          talentMemberId: a.talentMemberId || a.id,
          name: a.displayName || a.platformNickname || '达人',
          avatar: a.avatar || '',
        },
        reg,
      )
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/chat/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(a.displayName || '达人')}` +
          `&peerAvatar=${encodeURIComponent(a.avatar || '')}`,
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: String(err.message || '无法发起会话').slice(0, 36), icon: 'none' })
    } finally {
      this.setData({ chattingId: '' })
    }
  },
  onOpenProfile(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a) return
    appDisplay.copyTalentProfileLink(a.profileLink)
  },
  noop() {},
  onCopyApplicant(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a) return
    const tagLine =
      Array.isArray(a.accountTags) && a.accountTags.length ? a.accountTags.join('、') : ''
    const lines = [
      `昵称：${a.displayName}`,
      `平台：${a.platform || ''}`,
      `账号：${a.platformAccount || ''}`,
      `粉丝：${a.displayFollowers}`,
      tagLine ? `达人标签：${tagLine}` : '',
      `带货等级：${a.displaySalesLevel || a.douyinSalesLevel || '—'}`,
      `报价：${a.quotePrice || ''}`,
      a.visitTimeSlot ? `探店：${a.visitTimeSlot}` : '',
      `联系：${a.contact || ''}`,
      `微信：${a.wechatId || ''}`,
      `主页：${a.profileLink || ''}`,
      a.iceDouyinUrl ? `抖音链接：${a.iceDouyinUrl}` : '',
      a.iceTaskStatus ? `任务状态：${a.iceTaskStatus}` : '',
      a.selected ? '状态：已入选' : '',
    ].filter(Boolean)
    wx.setClipboardData({ data: lines.join('\n') })
  },
  onCopyIceLink(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    const url = a && a.iceDouyinUrl ? String(a.iceDouyinUrl) : ''
    if (!url) return
    wx.setClipboardData({ data: url })
  },
  async onIcePass(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a || !a.id || this.data.iceReviewBusyId) return
    this.setData({ iceReviewBusyId: a.id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(this.data.mpOrderId, a.id, 'pass')
      wx.showToast({ title: '已通过', icon: 'success' })
      await this.loadOrder()
    } catch (err) {
      wx.showToast({ title: String(err.message || '审核失败').slice(0, 28), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ iceReviewBusyId: '' })
    }
  },
  onIceOpenReject(e) {
    const a = findApplicantById(this.data.applicants, e.currentTarget.dataset.id)
    if (!a || !a.id) return
    this.setData({
      iceRejectModal: true,
      iceRejectTargetId: a.id,
      iceRejectTargetName: a.displayName || '达人',
      iceRejectReason: '',
    })
  },
  onIceRejectReasonInput(e) {
    this.setData({ iceRejectReason: String((e.detail && e.detail.value) || '') })
  },
  onIceCloseReject() {
    this.setData({
      iceRejectModal: false,
      iceRejectTargetId: '',
      iceRejectTargetName: '',
      iceRejectReason: '',
    })
  },
  async onIceConfirmReject() {
    const id = this.data.iceRejectTargetId
    const reason = String(this.data.iceRejectReason || '').trim()
    if (!id || !reason || this.data.iceReviewBusyId) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' })
      return
    }
    this.setData({ iceReviewBusyId: id })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await videoUpload.reviewVideo(this.data.mpOrderId, id, 'reject', reason)
      wx.showToast({ title: '已驳回', icon: 'success' })
      this.onIceCloseReject()
      await this.loadOrder()
    } catch (err) {
      wx.showToast({ title: String(err.message || '驳回失败').slice(0, 28), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ iceReviewBusyId: '' })
    }
  },
  onCompleteIceOrder() {
    if (this.data.completingIce || !this.data.canCompleteIce) return
    wx.showModal({
      title: '完成云剪订单',
      content: '确认所有达人视频链接均已审核通过后，将订单标记为已完成。',
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ completingIce: true })
        wx.showLoading({ title: '提交中…', mask: true })
        try {
          await mpOrderRegistryOps.patchMpRecruitmentOrderStatus(this.data.mpOrderId, 'done')
          wx.showToast({ title: '订单已完成', icon: 'success' })
          await this.loadOrder()
        } catch (err) {
          wx.showToast({
            title: String(err && err.message ? err.message : err).slice(0, 28),
            icon: 'none',
          })
        } finally {
          wx.hideLoading()
          this.setData({ completingIce: false })
        }
      },
    })
  },
})
