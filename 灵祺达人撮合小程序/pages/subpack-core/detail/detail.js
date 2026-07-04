const api = require('../../../utils/api.js')
const ops = require('../../../utils/opsRegistryTalentMp.js')
const display = require('../../../utils/recruitmentDisplay.js')
const userProfile = require('../../../utils/userProfile.js')
const auth = require('../../../utils/auth.js')
const applicationsStore = require('../../../utils/applicationsStore.js')
const chat = require('../../../utils/talentChat.js')
const contactGate = require('../../../utils/talentContactPrGate.js')
const iceOrderStats = require('../../../utils/iceOrderStats.js')
const iceOrderDetect = require('../../../utils/iceOrderDetect.js')
const iceGroupQr = require('../../../utils/iceGroupQr.js')
const editDeliverLinks = require('../../../utils/editDeliverLinks.js')
const talentAppStatus = require('../../../utils/talentApplicationStatus.js')
const applicantListExtras = require('../../../utils/applicantListExtras.js')
const visitScheduleRuntime = require('../../../utils/visitScheduleRuntime.js')
const { parseIceSlotTotalFromMp, resolveApplicantCountFromMp } = require('../../../utils/mpRecruitCount.js')
const recruitApplyGate = require('../../../utils/recruitApplyGate.js')
const memberProfileApplyGate = require('../../../utils/memberProfileApplyGate.js')
const memberStore = require('../../../utils/talentMember.js')
const prPublishedOrders = require('../../../utils/prPublishedOrders.js')
const applyTemplates = require('../../../utils/applyFormTemplates.js')
const appRegistrySync = require('../../../utils/applicationsRegistrySync.js')
const guestRoutes = require('../../../utils/mpGuestRoutes.js')
const sharePoster = require('../../../utils/recruitmentSharePoster.js')
const prRecruitQr = require('../../../utils/prRecruitQr.js')
const orderFavorites = require('../../../utils/orderFavorites.js')
const publishLinkUtil = require('../../../utils/recruitmentPublishLink.js')
const videoUpload = require('../../../utils/recruitmentVideoUpload.js')
const subpageNav = require('../../../utils/subpageNav.js')

function padTimeHm(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`
}

function parseVisitTimeRange(slot) {
  const s = String(slot || '').trim()
  const m = s.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/)
  if (m) {
    return { start: padTimeHm(m[1]) || '09:00', end: padTimeHm(m[2]) || '12:00' }
  }
  return { start: '09:00', end: '12:00' }
}

function buildVisitTimeRange(start, end) {
  const s = padTimeHm(start)
  const e = padTimeHm(end)
  if (!s || !e) return ''
  return `${s}-${e}`
}

function visitTimeMinutes(raw) {
  const t = padTimeHm(raw)
  if (!t) return -1
  const p = t.split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

function normalizeVisitDateKey(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (!m) return ''
  const pad = (n) => String(Number(n)).padStart(2, '0')
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
}

function normalizeSlotCompareKey(raw) {
  const parsed = parseVisitTimeRange(raw)
  const ranged = buildVisitTimeRange(parsed.start, parsed.end)
  return ranged || String(raw || '').trim().replace(/\s+/g, ' ')
}

function formatDetailTime(ms) {
  const n = Number(ms) || 0
  if (!n) return ''
  const d = new Date(n)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDetailDate(ms) {
  const n = Number(ms) || 0
  if (!n) return ''
  const d = new Date(n)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function buildDetailDisplayFields(view, mp, opts) {
  const mpOrderStatus = require('../../../utils/mpOrderStatus.js')
  const publishedMs = Number(opts.publishedMs) || 0
  const deadlineMs = Number(opts.deadlineMs) || 0
  const isIce = !!opts.isIce
  const start = formatDetailTime(publishedMs)
  const end = formatDetailTime(deadlineMs)
  let signupTimeRange = '长期招募'
  if (start && end) signupTimeRange = `${start} – ${end}`
  else if (end) signupTimeRange = `截止 ${end}`
  const recruitCap = parseIceSlotTotalFromMp(mp)
  let applicantCount = resolveApplicantCountFromMp(mp)
  if (isIce) {
    const progress = iceOrderStats.countIceClaimedSlots(mp, recruitCap)
    applicantCount = progress.claimed
  }
  const recruitCountText = isIce ? `${recruitCap} 位` : `${recruitCap} 人`
  const applicantCountText = isIce
    ? `${Math.min(applicantCount, recruitCap > 0 ? recruitCap : applicantCount)} 位`
    : `${applicantCount} 人`
  const signupProgressText = iceOrderStats.buildHallSignupCountText(mp, applicantCount, recruitCap)
  let locationText = view && view.region && view.region !== '—' ? view.region : '不限地点'
  if (view && view.isFormRelay) locationText += ' · 线上报名'
  else if (isIce) locationText += ' · 云剪任务'
  else locationText += ' · 线下探店'
  const benefitsText =
    (view && view.budgetText && view.budgetText !== '面议' ? view.budgetText : '') ||
    '高额提成 · 流量扶持 · 专业培训'
  const tags = []
  if (view && view.category && view.category !== '—') tags.push(view.category)
  const titleText = String((view && view.title) || '')
  if (/探店|实探|门店/.test(titleText) && !tags.includes('探店')) tags.push('探店')
  if (view && view.region && view.region !== '—') {
    if (display.isUnlimitedRecruitmentRegion(view.region)) {
      if (!tags.includes('全国')) tags.push('全国')
    } else {
      const city = String(view.region).split(/[·\s/]/)[0].trim()
      if (city && !tags.includes(city)) tags.push(city)
    }
  }
  let detailCityText = '全国'
  if (view && view.region && view.region !== '—') {
    detailCityText = display.isUnlimitedRecruitmentRegion(view.region)
      ? '全国'
      : String(view.region).split(/[·\s/]/)[0].trim() || view.region
  }
  const detailPlatformText =
    view && view.platform && view.platform !== '—' ? view.platform : '不限'
  const detailPriceText = view && view.budgetText ? view.budgetText : '面议'
  const detailDeadlineText = formatDetailDate(deadlineMs) || '长期有效'
  const detailRecruitQuotaText =
    recruitCap > 0 ? `${Math.min(applicantCount, recruitCap)}/${recruitCap}` : `${applicantCount}`
  const effectiveStatus = mpOrderStatus.resolveEffectiveMpStatus(
    mp && mp.status,
    deadlineMs,
    Date.now(),
  )
  const detailStatusLabel = mpOrderStatus.statusLabel(effectiveStatus) || '招募中'
  const taskDetailLines =
    view && Array.isArray(view.taskDetailLines) && view.taskDetailLines.length
      ? view.taskDetailLines
      : view && Array.isArray(view.recruitmentInfoLines)
        ? view.recruitmentInfoLines
        : []
  let coverImage = ''
  try {
    const recruitCoverLib = require('../../../utils/recruitCoverLibrary.js')
    coverImage = mp ? recruitCoverLib.resolveOrderCoverUrl(mp) || '' : ''
  } catch (_) {}
  return {
    signupTimeRange,
    recruitCountText,
    applicantCountText,
    signupProgressText,
    locationText,
    benefitsText,
    detailCategoryTags: tags.slice(0, 4),
    detailPriceText,
    detailDeadlineText,
    detailRecruitQuotaText,
    detailCityText,
    detailPlatformText,
    detailStatusLabel,
    taskDetailLines,
    coverImage,
  }
}

Page({
  data: {
    subNavTitle: '招募详情',
    subNavBandStyle: '',
    subNavInnerStyle: '',
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
    iceSlotsFull: false,
    visitApplicantId: '',
    visitDisplayLabel: '',
    visitHint: '',
    showVisitConfirmBtn: false,
    showAssignConfirmBtn: false,
    showCheckInBtn: false,
    checkInReady: false,
    visitBusy: false,
    visitPlanDate: '',
    visitPlanStart: '',
    hasLockedPlanDates: false,
    visitPlanDateLabels: [],
    visitPlanDateIdx: 0,
    visitPlanSlotOptions: [],
    visitPlanSlotIdx: 0,
    visitStartTime: '09:00',
    visitEndTime: '12:00',
    visitScheduleSubmitted: false,
    visitSubmittedText: '',
    visitApplicantId: '',
    canSubmitVisitPublishLink: false,
    canViewVideo: false,
    visitVideoUrl: '',
    visitPublishPhase: '',
    visitPublishUrl: '',
    visitPublishPlaceholder: '粘贴平台作品分享链接',
    visitPublishSubmitting: false,
    visitPublishHint: '',
    showEditVisitBtn: false,
    visitScheduleRevised: false,
    editVisitMode: '',
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
    deadlineMs: 0,
    publishedMs: 0,
    signupCountdownText: '—',
    signupCountdownTone: 'unknown',
    signupClosed: false,
    prQrImage: '',
    prQrScanUrl: '',
    prCertVisible: false,
    prCertLines: [],
    prCertScanUrl: '',
    showShareMenu: false,
    showSharePosterSheet: false,
    sharePosterPath: '',
    sharePosterLoading: false,
    sharePosterErr: '',
    sharePosterStyleIndex: 0,
    sharePosterStyleLabel: '',
    sharePosterAccentColor: '#7c3aed',
    isFavorited: false,
    coverImage: '',
    signupTimeRange: '',
    recruitCountText: '',
    applicantCountText: '',
    signupProgressText: '',
    locationText: '',
    benefitsText: '',
    detailCategoryTags: [],
    detailPriceText: '',
    detailDeadlineText: '',
    detailRecruitQuotaText: '',
    detailCityText: '',
    detailPlatformText: '',
    detailStatusLabel: '',
    taskDetailLines: [],
    coverImage: '',
  },
  onSubNavBack: subpageNav.onSubNavBack,
  onToggleFavorite() {
    const id = this.data.id
    if (!id) return
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin(`/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}`)
      return
    }
    const on = orderFavorites.toggleFavorite(id)
    this.setData({ isFavorited: on })
    wx.showToast({ title: on ? '已收藏' : '已取消收藏', icon: 'none' })
  },
  syncFavoriteState() {
    const id = this.data.id
    if (id) this.setData({ isFavorited: orderFavorites.isFavorite(id) })
  },
  onLoad(options) {
    subpageNav.setupSubpageNav(this, '招募详情')
    let id = options && options.id ? decodeURIComponent(options.id) : ''
    if (!id && options && options.scene) {
      const scene = decodeURIComponent(String(options.scene))
      const m = scene.match(/^id=(.+)$/)
      id = m ? decodeURIComponent(m[1]) : scene
    }
    const applied = options && options.applied === '1'
    this._pendingOpenFormRelay = options && String(options.openFormRelay || '') === '1'
    this.setData({ id, applied })
    if (id) this.loadOrder(id)
    else this.setData({ loading: false, err: '缺少招募单号' })
  },
  onShow() {
    require('../../../utils/pageIdentityChrome.js').syncPageIdentity(this)
    const id = this.data.id
    if (id) this.setData({ isFavorited: orderFavorites.isFavorite(id) })
    const mpShare = require('../../../utils/mpShare.js')
    mpShare.enableShareMenu()
    this.setData({ isPr: userProfile.readIdentity() === 'pr' })
    if (this.data.mpOrder && !this.data.isPr) {
      this.syncIceApplicantFromStorage()
    }
    if (this.data.id && wx.onCopyUrl) {
      const id = this.data.id
      wx.onCopyUrl(() => ({ query: `id=${encodeURIComponent(id)}` }))
    }
    this.startSignupCountdownTimer()
  },
  onHide() {
    this.stopSignupCountdownTimer()
  },
  onUnload() {
    this.stopSignupCountdownTimer()
    if (wx.offCopyUrl) wx.offCopyUrl()
  },
  startSignupCountdownTimer() {
    this.stopSignupCountdownTimer()
    this.refreshSignupCountdown()
    if (!this.data.deadlineMs) return
    this._signupCountdownTimer = setInterval(() => {
      this.refreshSignupCountdown()
    }, 1000)
  },
  stopSignupCountdownTimer() {
    if (this._signupCountdownTimer) {
      clearInterval(this._signupCountdownTimer)
      this._signupCountdownTimer = null
    }
  },
  refreshSignupCountdown() {
    this.syncSignupState()
  },
  syncSignupState() {
    const mp = this.data.mpOrder
    const deadlineMs = Number(this.data.deadlineMs) || 0
    const publishedMs = Number(this.data.publishedMs) || 0
    const listFilters = require('../../../utils/recruitmentListFilters.js')
    const mpOrderStatus = require('../../../utils/mpOrderStatus.js')
    const now = Date.now()
    const text = deadlineMs
      ? listFilters.formatSignupCountdownText(deadlineMs, now)
      : '截止日期待定'
    const tone = listFilters.resolveSignupCountdownTone(deadlineMs, publishedMs, now)
    const effectiveStatus = mp
      ? mpOrderStatus.resolveEffectiveMpStatus(mp.status, deadlineMs, now)
      : 'closed'
    const recruiting = mpOrderStatus.isMpOrderRecruiting(effectiveStatus)
    const deadlineEnded = deadlineMs > 0 && now >= deadlineMs
    const signupClosed = Boolean(this.data.readOnlyEnded || !recruiting || deadlineEnded)
    const patch = {
      signupCountdownText: text,
      signupCountdownTone: tone,
      signupClosed,
    }
    if (deadlineEnded) this.stopSignupCountdownTimer()
    this.setData(patch)
  },
  renderPrQrImage() {
    const mp = this.data.mpOrder
    if (!mp) return
    const prRecruitQr = require('../../../utils/prRecruitQr.js')
    const scanUrl = prRecruitQr.buildPrQrScanUrl(mp)
    if (!scanUrl) return
    this.setData({ prQrScanUrl: scanUrl })
    setTimeout(() => {
      prRecruitQr.renderPrQrImage(this, scanUrl).then((path) => {
        if (path) this.setData({ prQrImage: path })
      })
    }, 120)
  },
  onLongPressPrQr() {
    this._prQrLongPressAt = Date.now()
    void this.showPrCertModal()
  },
  async showPrCertModal() {
    const mp = this.data.mpOrder
    const prRecruitQr = require('../../../utils/prRecruitQr.js')
    const ops = require('../../../utils/opsRegistryTalentMp.js')
    let reg = ops.mergeRegWithPrUsers(this._orderReg || {})
    if (mp && (!Array.isArray(reg.mpPrUsers) || !reg.mpPrUsers.length)) {
      try {
        const extra = await ops.fetchRegistryForPoster(this.data.id)
        if (extra && Array.isArray(extra.mpPrUsers) && extra.mpPrUsers.length) {
          reg = ops.mergeRegWithPrUsers({ ...(reg || {}), mpPrUsers: extra.mpPrUsers })
          this._orderReg = reg
        }
      } catch (_) {}
    }
    let publisherDisplay = this._publisherDisplay
    if (mp) {
      publisherDisplay = prRecruitQr.resolvePublisherDisplaySync(mp, reg, publisherDisplay)
      const syncName = String((publisherDisplay && publisherDisplay.displayName) || '').trim()
      const syncNameBad =
        !syncName || /^1\d{10}$/.test(syncName) || syncName === '招募方' || syncName === '灵祺星选'
      if (syncNameBad) {
        try {
          const hit = await ops.fetchPublisherDisplayForOrder(this.data.id, mp, reg)
          if (hit && (hit.displayName || hit.prUser)) publisherDisplay = hit
        } catch (_) {}
      }
      if (publisherDisplay && (publisherDisplay.displayName || publisherDisplay.prUser)) {
        this._publisherDisplay = publisherDisplay
      }
    }
    const certLines = mp
      ? prRecruitQr.buildPrInfoLines(mp, {
          publisherDisplay,
          reg,
        })
      : []
    const scanUrl = String(this.data.prQrScanUrl || '').trim()
    if (certLines.length) {
      this.setData({
        prCertVisible: true,
        prCertLines: certLines,
        prCertScanUrl: scanUrl,
      })
      return
    }
    if (scanUrl) {
      wx.navigateTo({
        url: `/pages/web-link/web-link?url=${encodeURIComponent(scanUrl)}&embed=1&title=${encodeURIComponent('招募方认证')}`,
      })
      return
    }
    wx.showToast({ title: '认证信息暂不可用', icon: 'none' })
  },
  onClosePrCert() {
    this.setData({ prCertVisible: false, prCertLines: [], prCertScanUrl: '' })
  },
  onCopyPrCertLink() {
    const scanUrl = String(this.data.prCertScanUrl || '').trim()
    if (!scanUrl) return
    wx.setClipboardData({
      data: scanUrl,
      success: () => wx.showToast({ title: '认证链接已复制', icon: 'success' }),
    })
  },
  onPreviewPrQr() {
    if (this._prQrLongPressAt && Date.now() - this._prQrLongPressAt < 600) return
    const url = String(this.data.prQrImage || '').trim()
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
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
    const mpShare = require('../../../utils/mpShare.js')
    const recruitCoverLib = require('../../../utils/recruitCoverLibrary.js')
    const recruitShareCover = require('../../../utils/recruitShareCover.js')
    mpShare.enableShareMenu()
    const v = this.data.view
    const mp = this.data.mpOrder
    const share = {
      title: v && v.title ? v.title : mpShare.DEFAULT_TITLE,
      path: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(this.data.id)}`,
    }
    if (mp) {
      const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
      return recruitShareCover.attachShareCoverPromise(share, coverUrl)
    }
    const ready = String(this.data.shareCoverPath || '').trim()
    if (recruitShareCover.isLocalSharePath(ready) && !recruitShareCover.isUserDataSharePath(ready)) {
      share.imageUrl = ready
    } else {
      return mpShare.defaultShare(share.path, { title: share.title })
    }
    return share
  },
  onShareTap() {
    this.setData({ showShareMenu: !this.data.showShareMenu })
  },
  onShareMenuClose() {
    if (this.data.showShareMenu) this.setData({ showShareMenu: false })
  },
  onSharePickPoster() {
    if (!this.data.mpOrder) {
      wx.showToast({ title: '订单加载中', icon: 'none' })
      return
    }
    this.setData({
      showShareMenu: false,
      showSharePosterSheet: true,
      sharePosterPath: '',
      sharePosterErr: '',
      sharePosterLoading: false,
      sharePosterStyleIndex: 0,
    })
    this.ensureSharePoster()
  },
  onCloseSharePosterSheet() {
    this.setData({
      showSharePosterSheet: false,
      sharePosterPath: '',
      sharePosterLoading: false,
      sharePosterErr: '',
    })
  },
  async ensureSharePoster() {
    const order = this.data.mpOrder
    if (!order || this.data.sharePosterPath || this.data.sharePosterLoading) return
    const styleIndex = this.data.sharePosterStyleIndex || 0
    const orderId = String(this.data.id || order.id || '').trim()
    const fullOrder = orderId ? { ...order, id: orderId } : order
    this.setData({
      sharePosterLoading: true,
      sharePosterErr: '',
      sharePosterPath: '',
      sharePosterStyleLabel: '',
      sharePosterAccentColor: '#7c3aed',
    })
    sharePoster
      .buildRecruitmentSharePosterPath(fullOrder, styleIndex, { reg: this._orderReg })
      .then((path) => {
        const design = sharePoster.resolvePosterDesign(order, styleIndex)
        this.setData({
          sharePosterPath: path,
          sharePosterLoading: false,
          sharePosterStyleLabel: design.styleLabel || '',
          sharePosterAccentColor: sharePoster.resolvePosterThemeColor(design),
        })
      })
      .catch((err) => {
        const raw = String((err && err.message) || err || '海报生成失败')
        const msg =
          raw === 'publisher_name_unavailable'
            ? '未读取到发单方名称，请稍后重试'
            : raw === 'wxacode_unavailable'
              ? '小程序码生成失败，请稍后重试'
              : raw.slice(0, 40)
        this.setData({
          sharePosterLoading: false,
          sharePosterErr: msg,
        })
      })
  },
  async onSwitchSharePosterStyle() {
    const order = this.data.mpOrder
    if (!order || this.data.sharePosterLoading) return
    const nextIndex = sharePoster.normalizePosterStyleIndex((this.data.sharePosterStyleIndex || 0) + 1)
    const orderId = String(this.data.id || order.id || '').trim()
    const fullOrder = orderId ? { ...order, id: orderId } : order
    this.setData({
      sharePosterStyleIndex: nextIndex,
      sharePosterStyleLabel: '',
      sharePosterAccentColor: '#7c3aed',
      sharePosterPath: '',
      sharePosterLoading: true,
      sharePosterErr: '',
    })
    sharePoster
      .buildRecruitmentSharePosterPath(fullOrder, nextIndex, { reg: this._orderReg })
      .then((path) => {
        const design = sharePoster.resolvePosterDesign(order, nextIndex)
        this.setData({
          sharePosterPath: path,
          sharePosterLoading: false,
          sharePosterStyleLabel: design.styleLabel || '',
          sharePosterAccentColor: sharePoster.resolvePosterThemeColor(design),
        })
      })
      .catch((err) => {
        const raw = String((err && err.message) || err || '海报生成失败')
        const msg =
          raw === 'publisher_name_unavailable'
            ? '未读取到发单方名称，请稍后重试'
            : raw === 'wxacode_unavailable'
              ? '小程序码生成失败，请稍后重试'
              : raw.slice(0, 40)
        this.setData({
          sharePosterLoading: false,
          sharePosterErr: msg,
        })
      })
  },
  onSaveSharePoster() {
    const path = this.data.sharePosterPath
    if (!path) return
    wx.showLoading({ title: '保存中', mask: true })
    sharePoster
      .savePosterToAlbum(path)
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      })
      .catch((err) => {
        wx.hideLoading()
        wx.showToast({
          title: String((err && err.message) || err || '保存失败').slice(0, 24),
          icon: 'none',
        })
      })
  },
  noopShareSheetTap() {},
  onShareTimeline() {
    const mpShare = require('../../../utils/mpShare.js')
    const recruitCoverLib = require('../../../utils/recruitCoverLibrary.js')
    const recruitShareCover = require('../../../utils/recruitShareCover.js')
    const v = this.data.view
    const mp = this.data.mpOrder
    const id = this.data.id
    if (!id) return mpShare.defaultTimelineShare()
    const base = {
      title: v && v.title ? v.title : mpShare.DEFAULT_TITLE,
      query: `id=${encodeURIComponent(id)}`,
    }
    if (!mp) return base
    const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
    return recruitShareCover.attachShareCoverPromise(base, coverUrl)
  },
  async loadOrder(id) {
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址' })
      return
    }
    this.setData({ loading: true, err: '' })
    const listFilters = require('../../../utils/recruitmentListFilters.js')
    try {
      const reg = await ops.fetchRegistry({ includeMpOrderIds: [id], includeLocalContext: true })
      this._orderReg = reg
      if (!Array.isArray(reg.mpPrUsers) || !reg.mpPrUsers.length) {
        try {
          const extra = await ops.fetchRegistryForPoster(id)
          if (extra && Array.isArray(extra.mpPrUsers) && extra.mpPrUsers.length) {
            this._orderReg = { ...reg, mpPrUsers: extra.mpPrUsers }
          }
        } catch (_) {
          /* poster slice optional */
        }
      }
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
      this._publisherDisplay = prRecruitQr.resolvePublisherDisplaySync(mp, this._orderReg, null)
      if (!this._publisherDisplay || !this._publisherDisplay.displayName) {
        ops
          .fetchPublisherDisplayForOrder(id, mp, this._orderReg)
          .then((hit) => {
            if (hit && hit.displayName) this._publisherDisplay = hit
          })
          .catch(() => {})
      }
      applyTemplates.cacheApplyFormFromMpOrder(mp)
      const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
      const view = display.enrichMpOrder(mp, merchantOrder)
      const isIce = !!view.isIce
      const isEditIce = isIce && iceOrderDetect.isEditTeamIceMpOrder(mp)
      const isPackIce = isIce && iceOrderDetect.isPackSlotIceOrder(mp)
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
      let visitApplicantId = ''
      let visitDisplayLabel = ''
      let visitHint = ''
      let showVisitConfirmBtn = false
      let showAssignConfirmBtn = false
      let showCheckInBtn = false
      let checkInReady = false
      let showEditVisitBtn = false
      let editVisitMode = ''
      let visitScheduleRevised = false
      let visitPlanDate = visitScheduleRuntime.resolveDefaultTalentVisitPlanDate(mp)
      const visitPlanStart = visitScheduleRuntime.defaultVisitPlanDate()
      let visitStartTime = '09:00'
      let visitEndTime = '12:00'
      let hasLockedPlanDates = false
      let visitPlanDateLabels = []
      let visitPlanDateIdx = 0
      let visitPlanSlotOptions = []
      let visitPlanSlotIdx = 0
      let visitScheduleSubmitted = false
      let visitSubmittedText = ''
      let canSubmitVisitPublishLink = false
      let visitPublishPhase = ''
      let visitPublishUrl = ''
      let visitPublishPlaceholder = '粘贴平台作品分享链接'
      let visitPublishHint = ''
      let visitVideoUrl = ''
      let canViewVideo = false
      if (!isIce && hasApplied && gate.applicant) {
        visitApplicantId = String(gate.applicant.id || '').trim()
        const notifiedIds = applicantListExtras.buildNotifiedApplicantIdSet(reg, id, mp)
        const visitDisplay = talentAppStatus.resolveApplicationDisplayStatus(mp, gate.applicant, id, {
          selectionNotified: notifiedIds.has(visitApplicantId),
          isIce: false,
        })
        visitDisplayLabel = visitDisplay.label || ''
        visitHint = visitDisplay.visitHint || ''
        showVisitConfirmBtn = !!visitDisplay.showConfirmBtn
        showAssignConfirmBtn = !!visitDisplay.showAssignConfirmBtn
        showCheckInBtn = !!visitDisplay.showCheckInBtn
        checkInReady = !!visitDisplay.checkInReady
        showEditVisitBtn = !!visitDisplay.showEditVisitBtn
        editVisitMode = visitDisplay.editVisitMode || ''
        visitScheduleRevised = !!visitDisplay.visitScheduleRevised
        if (showVisitConfirmBtn || showEditVisitBtn) {
          const assigned = String(gate.applicant.assignedVisitAt || gate.applicant.talentPreferredVisitAt || '').trim()
          const parts = assigned.split(/\s+/)
          let slotRaw = ''
          if (parts.length >= 2) {
            const d = parts[0].replace(/\//g, '-')
            visitPlanDate = /^\d{4}-\d{1,2}-\d{1,2}$/.test(d) ? d : visitPlanDate
            slotRaw = parts.slice(1).join(' ')
          } else if (gate.applicant.visitTimeSlot) {
            slotRaw = String(gate.applicant.visitTimeSlot)
          }
          const parsed = parseVisitTimeRange(slotRaw)
          visitStartTime = parsed.start
          visitEndTime = parsed.end
        }
        const planRows = visitScheduleRuntime.readVisitPlanDates(mp)
        hasLockedPlanDates = visitScheduleRuntime.hasLockedVisitPlanDates(mp)
        if (hasLockedPlanDates) {
          visitPlanDateLabels = planRows.map((row) => row.date)
          const prefDateKey = normalizeVisitDateKey(visitPlanDate)
          const prefSlotKey = normalizeSlotCompareKey(
            String(gate.applicant.visitTimeSlot || '').trim() ||
              buildVisitTimeRange(visitStartTime, visitEndTime),
          )
          if (prefDateKey) {
            const dIdx = planRows.findIndex((row) => normalizeVisitDateKey(row.date) === prefDateKey)
            if (dIdx >= 0) visitPlanDateIdx = dIdx
          }
          visitPlanSlotOptions = planRows[visitPlanDateIdx]?.slots || []
          if (prefSlotKey && visitPlanSlotOptions.length) {
            const sIdx = visitPlanSlotOptions.findIndex(
              (slot) => normalizeSlotCompareKey(slot) === prefSlotKey,
            )
            if (sIdx >= 0) visitPlanSlotIdx = sIdx
          }
          if (showVisitConfirmBtn || showEditVisitBtn) {
            visitPlanDate = planRows[visitPlanDateIdx]?.date || visitPlanDate
            const lockedSlot = visitPlanSlotOptions[visitPlanSlotIdx] || ''
            const lockedParsed = parseVisitTimeRange(lockedSlot)
            visitStartTime = lockedParsed.start
            visitEndTime = lockedParsed.end
          }
        }
        if (editVisitMode === 'preference') {
          visitScheduleSubmitted = true
          const dateText = String(visitPlanDate || '').replace(/-/g, '/')
          const range = buildVisitTimeRange(visitStartTime, visitEndTime)
          visitSubmittedText = dateText && range ? `${dateText} ${range}` : visitHint.replace(/^已提交[：:]\s*/, '')
        }
        canSubmitVisitPublishLink = talentAppStatus.canTalentSubmitVisitPublishLink(mp, gate.applicant, false)
        visitPublishPhase = talentAppStatus.resolveVisitPublishPhase(gate.applicant) || ''
        visitPublishUrl = String(gate.applicant.douyinPublishUrl || '').trim()
        visitVideoUrl = String(gate.applicant.videoUrl || '').trim()
        canViewVideo = !!visitVideoUrl
        visitPublishPlaceholder = publishLinkUtil.publishLinkPlaceholder(view.platform || mp.platform)
        if (visitPublishPhase === 'awaiting_link') {
          visitPublishHint = '视频已通过 PR 审核，请发布作品并回传平台链接，AI 核查通过后订单完结'
        } else if (visitPublishPhase === 'link_failed') {
          visitPublishHint = String(gate.applicant.videoRejectReason || gate.applicant.aiVerifyNote || '链接未通过，请重新提交')
        }
      }
      const contactPrPending = hasApplied && prChatMeta && !gate.canContact && !isIce
      const publishedMs = listFilters.resolvePublishedMs(mp)
      const detailFields = buildDetailDisplayFields(view, mp, {
        publishedMs,
        deadlineMs: Number(view.deadlineMs) || 0,
        isIce,
      })
      this.setData({
        view,
        loading: false,
        mpOrder: mp,
        deadlineMs: Number(view.deadlineMs) || 0,
        publishedMs,
        ...detailFields,
        isFavorited: orderFavorites.isFavorite(id),
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
        iceSlotsFull,
        visitApplicantId,
        visitDisplayLabel,
        visitHint,
        showVisitConfirmBtn,
        showAssignConfirmBtn,
        showCheckInBtn,
        checkInReady,
        showEditVisitBtn,
        editVisitMode,
        visitScheduleRevised,
        visitPlanDate,
        visitPlanStart,
        hasLockedPlanDates,
        visitPlanDateLabels,
        visitPlanDateIdx,
        visitPlanSlotOptions,
        visitPlanSlotIdx,
        visitStartTime,
        visitEndTime,
        visitScheduleSubmitted,
        visitSubmittedText,
        canSubmitVisitPublishLink,
        visitPublishPhase,
        visitPublishUrl,
        visitVideoUrl,
        canViewVideo,
        visitPublishPlaceholder,
        visitPublishHint,
      })
      this.syncSignupState()
      this.startSignupCountdownTimer()
      this.renderPrQrImage()
      if (this._detailViewBumpId !== id) {
        this._detailViewBumpId = id
        ops.bumpMpRecruitmentEngagement(id, 'detail_view').catch(() => {})
      }
      try {
        const recruitCoverLib = require('../../../utils/recruitCoverLibrary.js')
        const recruitShareCover = require('../../../utils/recruitShareCover.js')
        const coverUrl = recruitCoverLib.resolveOrderCoverUrl(mp)
        recruitShareCover.preloadShareImageUrl(coverUrl).then((path) => {
          if (path) this.setData({ shareCoverPath: path })
        })
      } catch (_) {
        /* ignore preload */
      }
      this.maybeOpenPendingFormRelay()
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
  onVisitPublishField(e) {
    this.setData({ visitPublishUrl: e.detail.value })
  },
  onViewUploadedVideo() {
    videoUpload.previewUploadedVideo(this.data.visitVideoUrl)
  },
  async submitVisitPublishLink() {
    const url = String(this.data.visitPublishUrl || '').trim()
    if (!url) {
      wx.showToast({ title: '请填写发布链接', icon: 'none' })
      return
    }
    const applicantId = String(this.data.visitApplicantId || '').trim()
    if (!applicantId) {
      wx.showToast({ title: '未找到报名记录', icon: 'none' })
      return
    }
    this.setData({ visitPublishSubmitting: true })
    try {
      await publishLinkUtil.submitVisitPublishLink(this.data.id, applicantId, url)
      wx.showToast({ title: 'AI 核查通过，订单已完结', icon: 'success' })
      const registryCache = require('../../../utils/registryCache.js')
      registryCache.bust()
      await this.loadOrder(this.data.id)
    } catch (e) {
      const msg = publishLinkUtil.formatErrorMessage(e, '提交失败')
      wx.showModal({ title: '提交失败', content: msg.slice(0, 240), showCancel: false })
    } finally {
      this.setData({ visitPublishSubmitting: false })
    }
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
  async openFormRelaySource() {
    const view = this.data.view || {}
    if (view.formRelayGroupQr) {
      const formRelayGroupQrFeature = require('../../../utils/formRelayGroupQrFeature.js')
      if (!formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled()) {
        formRelayGroupQrFeature.showFormRelayGroupQrComingSoon()
        return
      }
      const id = String(this.data.id || view.mpOrderId || '').trim()
      if (!id) {
        wx.showToast({ title: '招募单无效', icon: 'none' })
        return
      }
      const title = encodeURIComponent(String(view.title || ''))
      wx.navigateTo({
        url: `/pages/subpack-pr/form-relay-group-qr/form-relay-group-qr?id=${encodeURIComponent(id)}&title=${title}`,
      })
      return
    }
    const url = String(view.formRelaySourceUrl || '').trim()
    if (!url) {
      wx.showToast({ title: '原表链接缺失', icon: 'none' })
      return
    }
    const orderId = String(this.data.id || '').trim()
    if (orderId && userProfile.readIdentity() !== 'pr') {
      try {
        const res = await ops.bumpMpRecruitmentEngagement(orderId, 'form_relay_click')
        const nextCount = Number(res && res.applicantCount)
        if (Number.isFinite(nextCount) && nextCount >= 0) {
          const mpOrder = { ...(this.data.mpOrder || {}), applicantCount: nextCount }
          const nextView = { ...view, applicantCount: nextCount }
          const detailFields = buildDetailDisplayFields(nextView, mpOrder, {
            publishedMs: Number(this.data.publishedMs) || 0,
            deadlineMs: Number(this.data.deadlineMs) || 0,
            isIce: !!this.data.isIce,
          })
          this.setData({ mpOrder, view: nextView, ...detailFields })
        }
      } catch (_) {
        /* 跳转原表不阻断 */
      }
    }
    const formRelaySourceMpLink = require('../../../utils/formRelaySourceMpLink.js')
    const open = view.formRelaySourceOpen
    if (open && open.openKind === 'miniProgram' && open.appId && open.path) {
      formRelaySourceMpLink.openFormRelaySourceLink(open, url)
      return
    }
    if (formRelaySourceMpLink.isQunbaoshuUrl(url)) {
      this._openQunbaoshuFormRelay(url, open)
      return
    }
    formRelaySourceMpLink.openFormRelaySourceLink(open, url)
  },
  _openQunbaoshuFormRelay(url, open) {
    const formRelaySourceMpLink = require('../../../utils/formRelaySourceMpLink.js')
    const sync = formRelaySourceMpLink.resolveQunbaoshuMiniProgramSync(url)
    if (sync && sync.appId && sync.path) {
      formRelaySourceMpLink.openFormRelaySourceLink(sync, url)
      return
    }
    const formRelaySourceParse = require('../../../utils/formRelaySourceParse.js')
    wx.showLoading({ title: '打开群报数…', mask: true })
    formRelaySourceParse
      .parseFormRelaySource(url, 'qunbaoshu')
      .then((res) => {
        wx.hideLoading()
        if (res && res.sourceMpAppId && res.sourceMpPath) {
          formRelaySourceMpLink.openFormRelaySourceLink(
            {
              openKind: 'miniProgram',
              appId: res.sourceMpAppId,
              path: res.sourceMpPath,
              displayLink: res.sourceMpDisplayLink || '',
              webUrl: url,
              rawUrl: url,
            },
            url,
          )
          return
        }
        wx.showModal({
          title: '打开原表报名',
          content: '未能跳转群报数小程序，请确认链接有效或联系招募方。',
          showCancel: false,
        })
      })
      .catch(() => {
        wx.hideLoading()
        wx.showModal({
          title: '打开原表报名',
          content: '未能跳转群报数小程序，请检查网络后重试。',
          showCancel: false,
        })
      })
  },
  maybeOpenPendingFormRelay() {
    if (!this._pendingOpenFormRelay) return
    this._pendingOpenFormRelay = false
    const view = this.data.view
    if (!view || !view.isFormRelay) return
    if (!auth.isLoggedIn()) return
    if (this.data.isPr) return
    const workId = userProfile.readIdentity()
    const member = memberStore.readMember()
    if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workId)) return
    setTimeout(() => this.openFormRelaySource(), 320)
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
  onVisitPlanDateChange(e) {
    const value = String((e.detail && e.detail.value) || '').trim()
    if (value) this.setData({ visitPlanDate: value })
  },
  onVisitPlanDateIdxChange(e) {
    const idx = Number((e.detail && e.detail.value) || 0)
    const planRows = visitScheduleRuntime.readVisitPlanDates(this.data.mpOrder)
    const row = planRows[idx]
    if (!row) return
    this.setData({
      visitPlanDateIdx: idx,
      visitPlanDate: row.date,
      visitPlanSlotOptions: row.slots || [],
      visitPlanSlotIdx: 0,
    })
    const lockedSlot = (row.slots && row.slots[0]) || ''
    const parsed = parseVisitTimeRange(lockedSlot)
    this.setData({ visitStartTime: parsed.start, visitEndTime: parsed.end })
  },
  onVisitPlanSlotIdxChange(e) {
    const idx = Number((e.detail && e.detail.value) || 0)
    const slot = String((this.data.visitPlanSlotOptions || [])[idx] || '').trim()
    if (!slot) return
    const parsed = parseVisitTimeRange(slot)
    this.setData({
      visitPlanSlotIdx: idx,
      visitStartTime: parsed.start,
      visitEndTime: parsed.end,
    })
  },
  onVisitStartTimeChange(e) {
    const value = padTimeHm((e.detail && e.detail.value) || '')
    if (!value) return
    const end = padTimeHm(this.data.visitEndTime)
    if (end && visitTimeMinutes(end) <= visitTimeMinutes(value)) {
      wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' })
      return
    }
    this.setData({ visitStartTime: value })
  },
  onVisitEndTimeChange(e) {
    const value = padTimeHm((e.detail && e.detail.value) || '')
    if (!value) return
    const start = padTimeHm(this.data.visitStartTime)
    if (start && visitTimeMinutes(value) <= visitTimeMinutes(start)) {
      wx.showToast({ title: '结束时间须晚于开始时间', icon: 'none' })
      return
    }
    this.setData({ visitEndTime: value })
  },
  buildVisitTimeSlotFromForm() {
    if (this.data.hasLockedPlanDates) {
      const slots = this.data.visitPlanSlotOptions || []
      const idx = Number(this.data.visitPlanSlotIdx) || 0
      return String(slots[idx] || '').trim()
    }
    const start = padTimeHm(this.data.visitStartTime)
    const end = padTimeHm(this.data.visitEndTime)
    if (!start || !end) return ''
    if (visitTimeMinutes(end) <= visitTimeMinutes(start)) return ''
    return buildVisitTimeRange(start, end)
  },
  resolveVisitDateForSubmit() {
    if (this.data.hasLockedPlanDates) {
      const labels = this.data.visitPlanDateLabels || []
      const idx = Number(this.data.visitPlanDateIdx) || 0
      return String(labels[idx] || this.data.visitPlanDate || '').trim()
    }
    return String(this.data.visitPlanDate || '').trim()
  },
  async confirmVisitSelection() {
    if (!this.data.visitApplicantId || !this.data.id) return
    const visitDate = this.resolveVisitDateForSubmit()
    if (!visitDate) {
      wx.showToast({ title: '请选择探店日期', icon: 'none' })
      return
    }
    const visitTimeSlot = this.buildVisitTimeSlotFromForm()
    if (!visitTimeSlot) {
      wx.showToast({
        title: this.data.hasLockedPlanDates ? '请选择探店时段' : '请选择有效的开始与结束时间',
        icon: 'none',
      })
      return
    }
    this.setData({ visitBusy: true })
    try {
      await visitScheduleRuntime.confirmVisitScheduleWithConflictPrompt(
        this.data.id,
        this.data.visitApplicantId,
        'accept_selection',
        '',
        { visitDate, visitTimeSlot },
      )
      wx.showToast({ title: '档期已提交', icon: 'success' })
      await this.loadOrder(this.data.id)
    } catch (e) {
      if (e && e.code === 'schedule_conflict_cancelled') return
      wx.showToast({ title: String((e && e.message) || e || '失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ visitBusy: false })
    }
  },
  async updateVisitPlanTap() {
    if (!this.data.visitApplicantId || !this.data.id) return
    const visitDate = this.resolveVisitDateForSubmit()
    if (!visitDate) {
      wx.showToast({ title: '请选择探店日期', icon: 'none' })
      return
    }
    const visitTimeSlot = this.buildVisitTimeSlotFromForm()
    if (!visitTimeSlot) {
      wx.showToast({
        title: this.data.hasLockedPlanDates ? '请选择探店时段' : '请选择有效的开始与结束时间',
        icon: 'none',
      })
      return
    }
    const isPreferenceEdit = this.data.editVisitMode === 'preference'
    this.setData({ visitBusy: true })
    try {
      if (isPreferenceEdit) {
        await visitScheduleRuntime.confirmVisitScheduleWithConflictPrompt(
          this.data.id,
          this.data.visitApplicantId,
          'accept_selection',
          '',
          { visitDate, visitTimeSlot },
        )
        wx.showToast({ title: isPreferenceEdit ? '档期已更新' : '排期已更新', icon: 'success' })
      } else {
        await visitScheduleRuntime.confirmVisitScheduleWithConflictPrompt(
          this.data.id,
          this.data.visitApplicantId,
          'update_visit_plan',
          '',
          { visitDate, visitTimeSlot },
        )
        wx.showToast({ title: '排期已更新', icon: 'success' })
      }
      await this.loadOrder(this.data.id)
    } catch (e) {
      if (e && e.code === 'schedule_conflict_cancelled') return
      wx.showToast({ title: String((e && e.message) || e || '失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ visitBusy: false })
    }
  },
  async confirmVisitAssignment() {
    if (!this.data.visitApplicantId || !this.data.id) return
    this.setData({ visitBusy: true })
    try {
      await visitScheduleRuntime.confirmVisitScheduleWithConflictPrompt(
        this.data.id,
        this.data.visitApplicantId,
        'confirm_assignment',
      )
      wx.showToast({ title: '已确认排期', icon: 'success' })
      await this.loadOrder(this.data.id)
    } catch (e) {
      if (e && e.code === 'schedule_conflict_cancelled') return
      wx.showToast({ title: String((e && e.message) || e || '失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ visitBusy: false })
    }
  },
  declineVisitAssignment() {
    const that = this
    wx.showModal({
      title: '反馈档期冲突',
      editable: true,
      placeholderText: '选填原因',
      success(res) {
        if (!res.confirm) return
        that.setData({ visitBusy: true })
        visitScheduleRuntime
          .confirmVisitSchedule(that.data.id, that.data.visitApplicantId, 'decline_assignment', res.content || '')
          .then(() => {
            wx.showToast({ title: '已反馈', icon: 'none' })
            return that.loadOrder(that.data.id)
          })
          .catch((e) => wx.showToast({ title: String((e && e.message) || e).slice(0, 24), icon: 'none' }))
          .finally(() => that.setData({ visitBusy: false }))
      },
    })
  },
  async visitCheckInTap() {
    if (!this.data.visitApplicantId || !this.data.id) return
    if (!this.data.checkInReady) {
      wx.showToast({ title: '探店日当天可签到', icon: 'none' })
      return
    }
    this.setData({ visitBusy: true })
    try {
      await visitScheduleRuntime.visitCheckIn(this.data.id, this.data.visitApplicantId, 'manual')
      wx.showToast({ title: '签到成功', icon: 'success' })
      await this.loadOrder(this.data.id)
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/subpack-mine/mine-applications/mine-applications?tab=pending_video' })
      }, 400)
    } catch (e) {
      wx.showToast({ title: String((e && e.message) || e || '签到失败').slice(0, 24), icon: 'none' })
    } finally {
      this.setData({ visitBusy: false })
    }
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
          `/pages/subpack-pr/chat/chat?sessionId=${encodeURIComponent(sessionId)}` +
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
    const v = this.data.view
    if (v && v.isFormRelay) {
      if (this.data.isPr) {
        wx.showToast({ title: '请切换达人身份再报名', icon: 'none' })
        return
      }
      if (!auth.isLoggedIn()) {
        const back = `/pages/subpack-core/detail/detail?id=${encodeURIComponent(this.data.id)}&openFormRelay=1`
        guestRoutes.redirectToLogin(back)
        return
      }
      const workId = userProfile.readIdentity()
      const member = memberStore.readMember()
      if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workId)) return
      this.openFormRelaySource()
      return
    }
    if (this.data.signupClosed) {
      wx.showToast({ title: '报名已截止', icon: 'none' })
      return
    }
    if (this.data.isPr) {
      wx.showToast({ title: '请切换达人身份再报名', icon: 'none' })
      return
    }
    if (!auth.isLoggedIn()) {
      const v0 = this.data.view
      if (!v0 || !this.data.id) return
      const q0 = [
        `mpId=${encodeURIComponent(this.data.id)}`,
        `merchantOrderNo=${encodeURIComponent(v0.merchantOrderNo || '')}`,
        `platform=${encodeURIComponent(v0.platform || '抖音')}`,
      ]
      if (this.data.isIce) q0.push('ice=1')
      if (this.data.applyTemplateId) {
        q0.push(`templateId=${encodeURIComponent(this.data.applyTemplateId)}`)
      }
      guestRoutes.redirectToLogin(`/pages/apply/apply?${q0.join('&')}`)
      return
    }
    const workId = userProfile.readIdentity()
    const member = memberStore.readMember()
    if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workId)) return
    const recruitHint = recruitApplyGate.claimBlockHint(this.data.mpOrder, workId)
    if (recruitHint) {
      wx.showToast({ title: recruitHint, icon: 'none' })
      return
    }
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
