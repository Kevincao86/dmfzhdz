const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')
const userProfile = require('../../utils/userProfile.js')
const auth = require('../../utils/auth.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const chat = require('../../utils/talentChat.js')
const contactGate = require('../../utils/talentContactPrGate.js')
const iceOrderStats = require('../../utils/iceOrderStats.js')
const iceOrderDetect = require('../../utils/iceOrderDetect.js')
const iceGroupQr = require('../../utils/iceGroupQr.js')
const editDeliverLinks = require('../../utils/editDeliverLinks.js')
const { parseIceSlotTotalFromMp } = require('../../utils/mpRecruitCount.js')
const recruitApplyGate = require('../../utils/recruitApplyGate.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const appRegistrySync = require('../../utils/applicationsRegistrySync.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

Page({
  data: {
    id: '',
    loading: true,
    err: '',
    view: null,
    applied: false,
    isIce: false,
    iceApplicantId: '',
    assignedVideoUrl: '',
    assignedVideoLabel: '',
    douyinUrl: '',
    iceSubmitting: false,
    iceVerified: false,
    icePendingConfirm: false,
    iceRejected: false,
    canReclaimIce: false,
    iceConfirming: false,
    iceVerifyMode: 'ai',
    icePendingPrReview: false,
    iceLinkRejected: false,
    iceAiFailedNote: '',
    iceSubmitLabel: '提交链接 · AI 核查',
    iceStatusHint: '',
    iceStep3Hint: '发布抖音并回传链接，AI 核查通过后自动完成',
    isEditIce: false,
    isPackIce: false,
    iceSlotTotal: 0,
    orderClaimedSlots: 0,
    claimedSlotCount: 1,
    editDeliverSubmittedCount: 0,
    iceConfirmed: false,
    editGroupQrImage: '',
    deliverText: '',
    deliverParsedCount: 0,
    editDeliverSubmitting: false,
    applyGateHint: '',
    iceSlotsFull: false,
    applyTemplateId: '',
    chatEnabled: false,
    prChatMeta: null,
    contacting: false,
    isPr: false,
    canContactPr: false,
    contactPrPending: false,
    readOnlyEnded: false,
    mpOrder: null,
    shareCoverPath: '',
    showShareSheet: false,
    shareTitle: '',
  },
  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : ''
    const applied = options && options.applied === '1'
    this.setData({ id, applied })
    if (id) this.loadOrder(id)
    else this.setData({ loading: false, err: '缺少招募单号' })
  },
  onShow() {
    const mpShare = require('../../utils/mpShare.js')
    mpShare.enableShareMenu()
    this.setData({ isPr: userProfile.readIdentity() === 'pr' })
    if (this.data.id) this.syncIceApplicantFromStorage()
    if (this.data.id && wx.onCopyUrl) {
      const id = this.data.id
      wx.onCopyUrl(() => ({ query: `id=${encodeURIComponent(id)}` }))
    }
  },
  onUnload() {
    if (wx.offCopyUrl) wx.offCopyUrl()
  },
  syncIceApplicantFromStorage() {
    try {
      const raw = wx.getStorageSync(iceOrderStats.iceApplicantStorageKey(this.data.id))
      if (raw) this.setData({ iceApplicantId: String(raw) })
    } catch {
      /* ignore */
    }
  },
  onShareAppMessage() {
    const mpShare = require('../../utils/mpShare.js')
    const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
    const recruitShareCover = require('../../utils/recruitShareCover.js')
    mpShare.enableShareMenu()
    const v = this.data.view
    const mp = this.data.mpOrder
    const share = {
      title: v && v.title ? v.title : mpShare.DEFAULT_TITLE,
      path: `/pages/detail/detail?id=${encodeURIComponent(this.data.id)}`,
    }
    const ready = String(this.data.shareCoverPath || '').trim()
    if (recruitShareCover.isLocalSharePath(ready)) {
      share.imageUrl = ready
      return share
    }
    if (mp) {
      const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
      const cached = recruitShareCover.readCached(coverUrl)
      if (cached) {
        share.imageUrl = cached
        return share
      }
      return recruitShareCover.attachShareCoverPromise(share, coverUrl)
    }
    return share
  },
  onShareTimeline() {
    const mpShare = require('../../utils/mpShare.js')
    const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
    const recruitShareCover = require('../../utils/recruitShareCover.js')
    const v = this.data.view
    const mp = this.data.mpOrder
    const id = this.data.id
    if (!id) return mpShare.defaultTimelineShare()
    const base = {
      title: v && v.title ? v.title : mpShare.DEFAULT_TITLE,
      query: `id=${encodeURIComponent(id)}`,
    }
    const ready = String(this.data.shareCoverPath || '').trim()
    if (recruitShareCover.isLocalSharePath(ready)) {
      return { ...base, imageUrl: ready }
    }
    if (!mp) return base
    const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
    const cached = recruitShareCover.readCached(coverUrl)
    if (cached) return { ...base, imageUrl: cached }
    return recruitShareCover.attachShareCoverPromise(base, coverUrl)
  },
  async loadOrder(id) {
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [id], includeLocalContext: true })
      appRegistrySync.reconcileApplicationsFromRegistry(reg)
      const mp = ops.findMpOrderInRegistry(reg, id)
      if (!mp) {
        this.setData({ loading: false, err: '招募单不存在或已结束' })
        return
      }
      const rawStatus = String(mp.status || '')
      const isEnded =
        rawStatus === 'closed' || rawStatus === 'done' || rawStatus === 'pending_settlement'
      const gate = contactGate.evaluate(mp, id)
      if (gate.hasApplication && gate.applicant) {
        const entry = appRegistrySync.applicationFromMpOrder(mp, gate.applicant)
        if (entry) applicationsStore.upsertApplication(entry)
      }
      const account = auth.readAccount()
      const isPrViewer = userProfile.readIdentity() === 'pr'
      const isPrOwner = isPrViewer && prPublishedOrders.mpOrderOwnedByCurrentPr(mp, account)
      const hasLocalApplication = applicationsStore.readApplications().some(
        (a) => a && String(a.mpOrderId || '') === id,
      )
      const canViewEnded = gate.hasApplication || isPrOwner || hasLocalApplication
      if (isEnded && !canViewEnded) {
        this.setData({ loading: false, err: '该招募已结束' })
        return
      }
      applyTemplates.cacheApplyFormFromMpOrder(mp)
      const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
      const view = display.enrichMpOrder(mp, merchantOrder)
      const isIce = !!view.isIce
      const isEditIce = isIce && iceOrderDetect.isEditTeamIceMpOrder(mp)
      const isPackIce = isIce && iceOrderDetect.isPackSlotIceOrder(mp)
      const workId = userProfile.readIdentity()
      const applyGateHint = recruitApplyGate.claimBlockHint(mp, workId)
      const iceSlotsFull = isIce && iceOrderStats.isIceSlotsFull(mp, parseIceSlotTotalFromMp(mp))
      let iceApplicantId = this.data.iceApplicantId
      try {
        const stored = wx.getStorageSync(iceOrderStats.iceApplicantStorageKey(id))
        if (stored) iceApplicantId = String(stored)
      } catch {
        /* ignore */
      }
      if (isIce && !iceApplicantId) {
        const localId = contactGate.localApplicantIdForOrder(id)
        if (localId) iceApplicantId = localId
      }
      if (isIce && !iceApplicantId && gate.applicant && gate.applicant.id) {
        iceApplicantId = String(gate.applicant.id)
      }
      if (isIce && iceApplicantId) {
        try {
          wx.setStorageSync(iceOrderStats.iceApplicantStorageKey(id), iceApplicantId)
        } catch {
          /* ignore */
        }
      }
      let assignedVideoUrl = ''
      let assignedVideoLabel = ''
      let iceVerified = false
      let icePendingConfirm = false
      let iceRejected = false
      let icePendingPrReview = false
      let iceLinkRejected = false
      let iceAiFailedNote = ''
      let iceRejectReason = ''
      const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
      let iceVerifyMode = iceOrderStats.getIceVerifyMode(mp)
      let app = null
      if (isIce) {
        app =
          iceApplicantId && (mp.applicants || []).find((a) => a && a.id === iceApplicantId)
        if (!app && gate.applicant) app = gate.applicant
        if (app) {
          assignedVideoUrl = app.assignedVideoDownloadUrl || ''
          assignedVideoLabel = app.assignedVideoLabel || ''
          iceVerified =
            app.aiVerifyStatus === 'passed' ||
            app.videoStatus === 'passed' ||
            !!String(app.completedAt || '').trim()
          icePendingConfirm =
            app.taskStatus !== 'confirmed' &&
            (app.taskStatus === 'pending_confirm' ||
              app.taskStatus === 'applied' ||
              (!app.taskStatus && !assignedVideoUrl && !isEditIce))
          iceRejected = app.taskStatus === 'rejected'
          icePendingPrReview =
            iceVerifyMode === 'pr' && app.videoStatus === 'pending' && !iceVerified
          iceLinkRejected = app.videoStatus === 'rejected'
          iceRejectReason = String(app.videoRejectReason || '').trim()
          iceAiFailedNote = app.aiVerifyStatus === 'failed' ? String(app.aiVerifyNote || 'AI核查不通过，视频与订单无关') : ''
          if (app.douyinPublishUrl) {
            this.setData({ douyinUrl: app.douyinPublishUrl })
          }
          if (!iceApplicantId && app.id) iceApplicantId = String(app.id)
        }
      }
      const iceSubmitLabel = iceVerifyMode === 'pr' ? '提交链接 · PR 审核' : '提交链接 · AI 核查'
      const iceStep3Hint =
        iceVerifyMode === 'pr'
          ? '发布抖音并回传链接，PR 审核通过后完成'
          : '发布抖音并回传链接，AI 核查通过后自动完成'
      let claimedSlotCount = 1
      let editDeliverSubmittedCount = 0
      let iceSlotTotal = 0
      let orderClaimedSlots = 0
      let iceConfirmed = false
      let editGroupQrImage = ''
      let deliverText = ''
      if (isPackIce) {
        iceSlotTotal = parseIceSlotTotalFromMp(mp)
        const orderProgress = iceOrderStats.countIceClaimedSlots(mp, iceSlotTotal)
        orderClaimedSlots = orderProgress.claimed
      }
      if (isIce && app) {
        claimedSlotCount = Math.max(
          1,
          Number.parseInt(String(app.claimedSlotCount || app.assignedIceSlotIds?.length || 1), 10) || 1,
        )
        iceConfirmed = app.taskStatus === 'confirmed'
        if (isEditIce && iceConfirmed) {
          editGroupQrImage = iceGroupQr.resolveClaimGroupQr(reg, id, mp)
        }
        if (Array.isArray(app.editDeliverLinks) && app.editDeliverLinks.length) {
          deliverText = app.editDeliverLinks.join('\n')
          editDeliverSubmittedCount = app.editDeliverLinks.filter((u) => String(u || '').trim()).length
        }
      }
      let iceStatusHint = ''
      if (iceVerified) iceStatusHint = '已完成'
      else if (isEditIce && iceConfirmed && !iceVerified) {
        const submitted = Array.isArray(app && app.editDeliverLinks) ? app.editDeliverLinks.length : 0
        iceStatusHint = `请回传 ${claimedSlotCount} 条成片链接（已提交 ${submitted} 条）`
      } else if (icePendingPrReview) iceStatusHint = '链接已提交，待 PR 审核'
      else if (iceLinkRejected) iceStatusHint = iceRejectReason || '链接已驳回，请重新提交'
      else if (iceAiFailedNote) iceStatusHint = iceAiFailedNote
      const iceApplied = Boolean(iceApplicantId) || (isIce && gate.hasApplication)
      const applyTemplateId = meta.applyFormTemplateId || ''
      const prChatMeta = meta.prParticipantKey
        ? {
            prParticipantKey: meta.prParticipantKey,
            prDisplayName: meta.prDisplayName || view.merchantName || '招募方',
            prWxNickName: meta.prWxNickName || '',
            prWxAvatarUrl: meta.prWxAvatarUrl || '',
          }
        : null
      const canReclaimIce = isIce && iceRejected
      const hasApplied = (this.data.applied || iceApplied || gate.hasApplication) && !canReclaimIce
      const contactPrPending = hasApplied && prChatMeta && !gate.canContact && !isIce
      this.setData({
        view,
        loading: false,
        mpOrder: mp,
        isPr: userProfile.readIdentity() === 'pr',
        applyTemplateId,
        chatEnabled: chat.canChat() && userProfile.readIdentity() === 'talent',
        prChatMeta,
        canContactPr: gate.canContact,
        contactPrPending,
        isIce,
        iceApplicantId,
        assignedVideoUrl,
        assignedVideoLabel,
        iceVerified,
        icePendingConfirm,
        iceRejected,
        canReclaimIce,
        iceVerifyMode,
        icePendingPrReview,
        iceLinkRejected,
        iceAiFailedNote,
        iceSubmitLabel,
        iceStatusHint,
        iceStep3Hint,
        applied: hasApplied,
        readOnlyEnded: isEnded && canViewEnded,
        isEditIce,
        isPackIce,
        iceSlotTotal,
        orderClaimedSlots,
        claimedSlotCount,
        editDeliverSubmittedCount,
        iceConfirmed,
        editGroupQrImage,
        deliverText,
        deliverParsedCount: deliverText
          ? editDeliverLinks.parseBatchDeliverUrls(deliverText).length
          : 0,
        applyGateHint,
        iceSlotsFull,
      })
      try {
        const recruitCoverLib = require('../../utils/recruitCoverLibrary.js')
        const recruitShareCover = require('../../utils/recruitShareCover.js')
        const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
        recruitShareCover.preloadShareImageUrl(coverUrl).then((path) => {
          if (recruitShareCover.isLocalSharePath(path)) {
            this.setData({ shareCoverPath: path })
          }
        })
      } catch (_) {
        /* ignore preload */
      }
    } catch (e) {
      const msg = String(e.message || e)
      let hint = msg
      if (/fail|reset|cronet|超时|timeout/i.test(msg)) {
        hint = '无法连接后台服务，请稍后重试或检查网络'
      } else if (msg === '已使用本地缓存') {
        hint = '无法连接后台服务，且本地无该任务缓存，请打开招募大厅刷新后重试'
      }
      this.setData({ loading: false, err: hint })
    }
  },
  onDouyinField(e) {
    this.setData({ douyinUrl: e.detail.value })
  },
  onDeliverField(e) {
    const max = Math.max(1, Number(this.data.claimedSlotCount) || 1)
    let text = String(e.detail.value || '')
    const clamped = editDeliverLinks.clampDeliverText(text, max)
    if (clamped !== text) {
      wx.showToast({ title: `最多 ${max} 条链接`, icon: 'none' })
      text = clamped
    }
    const deliverParsedCount = editDeliverLinks.parseBatchDeliverUrls(text).length
    this.setData({ deliverText: text, deliverParsedCount })
  },
  previewEditGroupQr() {
    const url = String(this.data.editGroupQrImage || '').trim()
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  async submitEditDeliver() {
    const text = String(this.data.deliverText || '').trim()
    const links = editDeliverLinks.parseBatchDeliverUrls(text)
    const need = this.data.claimedSlotCount || 1
    if (!links.length) {
      wx.showToast({ title: '请粘贴 https 成片链接', icon: 'none' })
      return
    }
    if (links.length > need) {
      wx.showToast({ title: `不能超过认领 ${need} 条`, icon: 'none' })
      return
    }
    if (links.length !== need) {
      wx.showToast({ title: `需 ${need} 条，识别到 ${links.length} 条`, icon: 'none' })
      return
    }
    if (!this.data.iceApplicantId) {
      wx.showToast({ title: '请先认领任务', icon: 'none' })
      return
    }
    this.setData({ editDeliverSubmitting: true })
    try {
      await ops.submitEditDeliverLinks(this.data.id, this.data.iceApplicantId, text)
      wx.showToast({
        title: this.data.iceVerifyMode === 'pr' ? '已提交，待 PR 审核' : '成片已提交',
        icon: 'success',
      })
      await this.loadOrder(this.data.id)
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 36), icon: 'none' })
    } finally {
      this.setData({ editDeliverSubmitting: false })
    }
  },
  copyDownloadUrl() {
    const url = this.data.assignedVideoUrl
    if (!url) return
    const full = url.startsWith('http') ? url : `${api.base()}${url}`
    wx.setClipboardData({
      data: full,
      success: () => wx.showToast({ title: '下载链接已复制', icon: 'success' }),
    })
  },
  openDownload() {
    const url = this.data.assignedVideoUrl
    if (!url) {
      wx.showToast({ title: '请先认领任务', icon: 'none' })
      return
    }
    const full = url.startsWith('http') ? url : `${api.base()}${url}`
    wx.setClipboardData({
      data: full,
      success: () =>
        wx.showModal({
          title: '下载成片',
          content: '链接已复制，请在浏览器中打开下载后发布至抖音。',
          showCancel: false,
        }),
    })
  },
  async confirmIceReceipt() {
    if (!this.data.iceApplicantId) {
      wx.showToast({ title: '请先认领任务', icon: 'none' })
      return
    }
    this.setData({ iceConfirming: true })
    try {
      await ops.confirmIceTask(this.data.id, this.data.iceApplicantId, 'confirm')
      const tip = this.data.isEditIce
        ? '剪辑认领成功，请尽快加入微信群'
        : '认领成功，请尽快完成后续步骤'
      wx.showToast({ title: tip, icon: 'none', duration: 2800 })
      await this.loadOrder(this.data.id)
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 36), icon: 'none' })
    } finally {
      this.setData({ iceConfirming: false })
    }
  },
  async rejectIceTask() {
    if (!this.data.iceApplicantId) return
    const that = this
    wx.showModal({
      title: '拒绝任务',
      content: '拒绝后名额将释放，是否继续？',
      success(res) {
        if (!res.confirm) return
        that.setData({ iceConfirming: true })
        ops
          .confirmIceTask(that.data.id, that.data.iceApplicantId, 'reject')
          .then(() => {
            try {
              applicationsStore.removeApplication(that.data.id)
              wx.removeStorageSync(iceOrderStats.iceApplicantStorageKey(that.data.id))
            } catch {
              /* ignore */
            }
            wx.showToast({ title: '已拒绝，可重新认领', icon: 'none' })
            return that.loadOrder(that.data.id)
          })
          .catch((e) => wx.showToast({ title: String(e.message || e).slice(0, 36), icon: 'none' }))
          .finally(() => that.setData({ iceConfirming: false }))
      },
    })
  },
  async submitIceDouyin() {
    const url = String(this.data.douyinUrl || '').trim()
    if (!url) {
      wx.showToast({ title: '请填写抖音作品链接', icon: 'none' })
      return
    }
    if (!this.data.iceApplicantId) {
      wx.showToast({ title: '请先报名认领', icon: 'none' })
      return
    }
    this.setData({ iceSubmitting: true })
    try {
      const res = await ops.submitIceDouyin(this.data.id, this.data.iceApplicantId, url)
      const pending = this.data.iceVerifyMode === 'pr' && res && (res.aiVerifyStatus === 'pending' || res.status === 'pending')
      wx.showToast({
        title: pending ? '已提交，待 PR 审核' : this.data.iceVerifyMode === 'pr' ? '已提交' : 'AI 核查通过',
        icon: 'success',
      })
      if (!pending) this.setData({ iceVerified: true })
      await this.loadOrder(this.data.id)
    } catch (e) {
      wx.showToast({ title: String(e.message || e).slice(0, 36), icon: 'none' })
    } finally {
      this.setData({ iceSubmitting: false })
    }
  },
  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },
  onOpenShareSheet() {
    const mpShare = require('../../utils/mpShare.js')
    mpShare.enableShareMenu()
    const v = this.data.view
    this.setData({
      showShareSheet: true,
      shareTitle: (v && v.title) || '',
    })
  },
  onCloseShareSheet() {
    this.setData({ showShareSheet: false })
  },
  onShareSheetActionTap() {
    this.setData({ showShareSheet: false })
  },
  onContactPrPending() {
    const gate = contactGate.evaluate(this.data.mpOrder, this.data.id)
    wx.showModal({
      title: '暂无法联系招募方',
      content: gate.message || '请先报名并等待招募方 PR 审核通过',
      showCancel: false,
    })
  },
  async contactPr() {
    const meta = this.data.prChatMeta
    if (!meta || !meta.prParticipantKey) {
      wx.showToast({ title: '该单暂不支持私信', icon: 'none' })
      return
    }
    const gate = contactGate.evaluate(this.data.mpOrder, this.data.id)
    if (!gate.canContact) {
      wx.showModal({
        title: '暂无法联系招募方',
        content: gate.message || '请先报名并等待招募方 PR 审核通过',
        showCancel: false,
      })
      return
    }
    if (!chat.canChat()) {
      wx.showModal({
        title: '未连接后台',
        content: '请配置 MERCHANT_API_BASE_URL 后使用私信。',
        showCancel: false,
      })
      return
    }
    if (userProfile.readIdentity() !== 'talent') {
      wx.showModal({
        title: '请切换达人身份',
        content: '达人身份可在商单详情联系招募方。',
        showCancel: false,
      })
      return
    }
    this.setData({ contacting: true })
    wx.showLoading({ title: '连接中' })
    try {
      await chat.syncProfile()
      const sessionId = await chat.ensureSessionWithPr(meta)
      wx.hideLoading()
      wx.navigateTo({
        url:
          `/pages/chat/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(meta.prDisplayName || '招募方')}` +
          `&peerAvatar=`,
      })
    } catch (e) {
      wx.hideLoading()
      const tip = chat.formatChatError(e)
      wx.showModal({
        title: '无法联系招募方',
        content: tip,
        showCancel: false,
      })
    } finally {
      this.setData({ contacting: false })
    }
  },
  goApply() {
    if (this.data.isPr) {
      wx.showToast({ title: '请切换达人身份再报名', icon: 'none' })
      return
    }
    if (this.data.applyGateHint) {
      wx.showToast({ title: this.data.applyGateHint, icon: 'none' })
      return
    }
    const v = this.data.view
    if (!v || !this.data.id) return
    if (
      !this.data.canReclaimIce &&
      (this.data.applied ||
        applicationsStore.hasAppliedToOrder(this.data.id) ||
        (this.data.mpOrder && contactGate.evaluate(this.data.mpOrder, this.data.id).hasApplication))
    ) {
      wx.showToast({ title: '您已报名该招募', icon: 'none' })
      return
    }
    if (this.data.mpOrder) applyTemplates.cacheApplyFormFromMpOrder(this.data.mpOrder)
    const q = [
      `mpId=${encodeURIComponent(this.data.id)}`,
      `merchantOrderNo=${encodeURIComponent(v.merchantOrderNo || '')}`,
      `platform=${encodeURIComponent(v.platform || '抖音')}`,
    ]
    if (this.data.isIce) q.push('ice=1')
    if (this.data.applyTemplateId) {
      q.push(`templateId=${encodeURIComponent(this.data.applyTemplateId)}`)
    }
    const applyUrl = `/pages/apply/apply?${q.join('&')}`
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(applyUrl)
      return
    }
    wx.navigateTo({ url: applyUrl })
  },
  copyOrderNo() {
    const v = this.data.view
    if (!v) return
    wx.setClipboardData({
      data: v.merchantOrderNo || '',
      success: () => wx.showToast({ title: '已复制订单号', icon: 'success' }),
    })
  },
})
