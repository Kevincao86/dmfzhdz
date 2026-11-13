const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')
const coverLib = require('../../utils/recruitCoverLibrary.js')
const userProfile = require('../../utils/userProfile.js')
const auth = require('../../utils/auth.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const memberStore = require('../../utils/talentMember.js')
const memberProfileApplyGate = require('../../utils/memberProfileApplyGate.js')
const recruitApplyGate = require('../../utils/recruitApplyGate.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const orderFavorites = require('../../utils/orderFavorites.js')
const sharePoster = require('../../utils/recruitmentSharePoster.js')
const recruitShareCover = require('../../utils/recruitShareCover.js')
const recruitShareCard = require('../../utils/recruitShareCard.js')
const shareHub = require('../../utils/recruitShareHub.js')
const mpShare = require('../../utils/mpShare.js')

function openBox() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  let menuBottom = 88
  try {
    const menu = wx.getMenuButtonBoundingClientRect()
    if (menu && menu.bottom) menuBottom = menu.bottom
  } catch (_) {}
  const margin = 12
  const top = Math.max(menuBottom + 12, 96)
  const tab = 96
  const safe = win.safeAreaInsets && win.safeAreaInsets.bottom ? win.safeAreaInsets.bottom : 0
  return {
    top,
    left: margin,
    width: Math.max(200, win.windowWidth - margin * 2),
    height: Math.max(280, win.windowHeight - top - tab - safe),
  }
}

function boxStyle(box) {
  return `top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px;`
}

Component({
  properties: {
    orderId: { type: String, value: '' },
    origin: { type: Object, value: null },
    opened: { type: Boolean, value: false },
  },
  data: {
    cardStyle: '',
    loading: true,
    err: '',
    title: '',
    price: '',
    platform: '',
    region: '',
    category: '',
    fans: '不限',
    signup: '',
    location: '',
    cover: '',
    infoLines: [],
    taskLines: [],
    applyLabel: '立即报名',
    isPr: false,
    isIce: false,
    isFormRelay: false,
    merchantOrderNo: '',
    favorited: false,
    shareCover: '',
    showShareMenu: false,
    shareCoverPick: false,
    showSharePosterSheet: false,
    sharePosterPath: '',
    sharePosterErr: '',
    sharePosterLoading: false,
    sharePosterStyleIndex: 0,
    sharePosterStyleLabel: '',
  },
  observers: {
    'opened, origin': function () {
      this.syncBox()
    },
    orderId: function (id) {
      if (id) this.load(id)
    },
  },
  lifetimes: {
    attached() {
      this.syncBox()
      if (this.data.orderId) this.load(this.data.orderId)
    },
  },
  methods: {
    noop() {},
    syncBox() {
      const origin = this.data.origin || {}
      const box = this.data.opened && this.data.origin ? openBox() : origin.width ? origin : openBox()
      this.setData({ cardStyle: boxStyle(box) })
    },
    onMask() {
      this.triggerEvent('close')
    },
    onToggleFavorite() {
      const id = String(this.data.orderId || '')
      if (!id) return
      if (!auth.isLoggedIn()) {
        guestRoutes.redirectToLogin('/pages/index/index')
        return
      }
      const favorited = orderFavorites.toggleFavorite(id)
      this.setData({ favorited })
      this.triggerEvent('favorite', { id, favorited })
      wx.showToast({ title: favorited ? '已收藏' : '已取消收藏', icon: 'none' })
    },
    onShareTap() {
      if (!this._mp) {
        wx.showToast({ title: '订单加载中', icon: 'none' })
        return
      }
      const next = !this.data.showShareMenu
      this.setData({ showShareMenu: next, shareCoverPick: next ? this.data.shareCoverPick : false })
    },
    onShareMenuClose() {
      if (this.data.showShareMenu || this.data.shareCoverPick) {
        this.setData({ showShareMenu: false, shareCoverPick: false })
      }
    },
    onShareWechat() {
      this.setData({ shareCoverPick: true })
    },
    onShareCoverBack() {
      this.setData({ shareCoverPick: false })
    },
    onShareMenuPick(e) {
      const order = this.posterOrder()
      if (!order) {
        wx.showToast({ title: '订单加载中', icon: 'none' })
        return
      }
      const ds = (e && e.currentTarget && e.currentTarget.dataset) || {}
      this.setData({ showShareMenu: false, shareCoverPick: false })
      shareHub.openStudio(order, ds.tab || 'poster', ds.mode || 'link')
    },
    buildShareMessage(res) {
      const mp = this._mp
      const id = String(this.data.orderId || '')
      if (!id) return null
      const share = {
        title: this.data.title || mpShare.DEFAULT_TITLE,
        path: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}`,
      }
      if (mp && recruitShareCard.readShareCoverKind(res) === 'recruit') {
        return {
          title: share.title,
          path: share.path,
          promise: recruitShareCard.buildShareCardPath(mp, this._reg).then((imageUrl) => {
            if (imageUrl) return Object.assign({}, share, { imageUrl })
            const coverUrl = coverLib.resolveOrderCoverUrl(mp)
            const wrapped = recruitShareCover.attachShareCoverPromise(share, coverUrl)
            if (wrapped && typeof wrapped.promise === 'object' && wrapped.promise) return wrapped.promise
            return wrapped || share
          }),
        }
      }
      if (mp) {
        const coverUrl = coverLib.resolveOrderCoverUrl(mp)
        return recruitShareCover.attachShareCoverPromise(share, coverUrl)
      }
      return share
    },
    posterOrder() {
      const order = this._mp
      if (!order) return null
      const orderId = String(this.data.orderId || order.id || '').trim()
      return orderId ? Object.assign({}, order, { id: orderId }) : order
    },
    posterFailMessage(err) {
      const raw = String((err && err.message) || err || '海报生成失败')
      if (raw === 'publisher_name_unavailable') return '未读取到发单方名称，请稍后重试'
      if (raw === 'wxacode_unavailable') return '小程序码生成失败，请稍后重试'
      return raw.slice(0, 40)
    },
    paintPoster(styleIndex) {
      const order = this.posterOrder()
      if (!order) return
      this.setData({
        sharePosterStyleIndex: styleIndex,
        sharePosterLoading: true,
        sharePosterErr: '',
        sharePosterPath: '',
        sharePosterStyleLabel: '',
      })
      sharePoster
        .buildRecruitmentSharePosterPath(order, styleIndex, { reg: this._reg })
        .then((path) => {
          const design = sharePoster.resolvePosterDesign(order, styleIndex)
          this.setData({
            sharePosterPath: path,
            sharePosterLoading: false,
            sharePosterStyleLabel: design.styleLabel || '',
          })
        })
        .catch((err) => {
          this.setData({
            sharePosterLoading: false,
            sharePosterErr: this.posterFailMessage(err),
          })
        })
    },
    onSharePickPoster() {
      if (!this._mp) {
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
      const reg = this._reg
      const id = String(this.data.orderId || '')
      const needsPublisher = !reg || !Array.isArray(reg.mpPrUsers) || !reg.mpPrUsers.length
      if (!needsPublisher) {
        this.paintPoster(0)
        return
      }
      ops
        .fetchRegistryForPoster(id)
        .then((extra) => {
          if (extra && Array.isArray(extra.mpPrUsers) && extra.mpPrUsers.length) {
            this._reg = Object.assign({}, reg || {}, { mpPrUsers: extra.mpPrUsers })
          }
        })
        .catch(() => {})
        .then(() => this.paintPoster(0))
    },
    onCloseSharePosterSheet() {
      this.setData({
        showSharePosterSheet: false,
        sharePosterPath: '',
        sharePosterLoading: false,
        sharePosterErr: '',
      })
    },
    onSwitchSharePosterStyle() {
      if (!this._mp || this.data.sharePosterLoading) return
      const nextIndex = sharePoster.normalizePosterStyleIndex((this.data.sharePosterStyleIndex || 0) + 1)
      this.paintPoster(nextIndex)
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
    load(id) {
      const token = (this._loadToken || 0) + 1
      this._loadToken = token
      this._mp = null
      this._reg = null
      this.setData({ loading: true, err: '', showShareMenu: false, showSharePosterSheet: false })
      ops
        .fetchRegistry({ includeMpOrderIds: [id], includeOnly: true })
        .then((reg) => {
          if (this._loadToken !== token) return
          const mp = ops.findMpOrderInRegistry(reg, id)
          if (!mp) {
            this.setData({ loading: false, err: '招募单不存在或已结束' })
            return
          }
          const merchant = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
          const view = display.enrichMpOrder(mp, merchant)
          this._mp = mp
          this._reg = reg
          let cover = ''
          try {
            cover = coverLib.resolveOrderCoverUrl(mp) || ''
          } catch (_) {}
          const infoLines = (view.recruitmentInfoLines || []).filter(Boolean).slice(0, 24)
          const taskLines = (view.taskDetailLines || [])
            .filter((line) => line && infoLines.indexOf(line) < 0)
            .slice(0, 24)
          this.setData({
            loading: false,
            title: view.title || '',
            price: view.budgetText || '',
            platform: view.platform || '',
            region: view.region && view.region !== '—' ? view.region : '',
            category: view.category || '',
            fans: view.fansRequirement || '不限',
            signup: `报名 ${view.applicantCount || 0}/${view.recruitCount || '不限'}`,
            location: view.merchantLocationDisplay || '',
            cover,
            infoLines,
            taskLines,
            applyLabel: view.isFormRelay ? '查看报名方式' : view.isIce ? '查看任务' : '立即报名',
            isPr: userProfile.readIdentity() === 'pr',
            isIce: !!view.isIce,
            isFormRelay: !!view.isFormRelay,
            merchantOrderNo: view.merchantOrderNo || '',
            favorited: orderFavorites.isFavorite(id),
            shareCover: cover,
          })
          this.triggerEvent('meta', { id, title: view.title || '', cover })
        })
        .catch((e) => {
          if (this._loadToken !== token) return
          this.setData({ loading: false, err: (e && e.message) || '加载失败' })
        })
    },
    onApply() {
      const id = String(this.data.orderId || '')
      if (!id || !this._mp) return
      if (this.data.isPr) return
      if (this.data.isFormRelay || this.data.isIce) {
        wx.navigateTo({ url: `/pages/subpack-core/detail/detail?id=${encodeURIComponent(id)}` })
        return
      }
      const q = [
        `mpId=${encodeURIComponent(id)}`,
        `merchantOrderNo=${encodeURIComponent(this.data.merchantOrderNo || '')}`,
        `platform=${encodeURIComponent(this.data.platform || '抖音')}`,
      ]
      const applyUrl = `/pages/apply/apply?${q.join('&')}`
      if (!auth.isLoggedIn()) {
        guestRoutes.redirectToLogin(applyUrl)
        return
      }
      const workId = userProfile.readIdentity()
      const member = memberStore.readMember()
      if (!memberProfileApplyGate.ensureMemberProfileForApplyOrRedirect(member, workId)) return
      const verdict = recruitApplyGate.validateRecruitmentClaim(this._mp, workId)
      if (!verdict.ok) {
        wx.showToast({ title: verdict.message || '当前不能报名', icon: 'none' })
        return
      }
      try {
        applyTemplates.cacheApplyFormFromMpOrder(this._mp)
      } catch (_) {}
      wx.navigateTo({ url: applyUrl })
    },
  },
})
