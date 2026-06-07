const api = require('../../utils/api.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')
const userProfile = require('../../utils/userProfile.js')
const chat = require('../../utils/talentChat.js')
const contactGate = require('../../utils/talentContactPrGate.js')
const ICE_APPLICANT_KEY = 'meoo_ice_applicant_v1'

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
    iceConfirming: false,
    applyTemplateId: '',
    chatEnabled: false,
    prChatMeta: null,
    contacting: false,
    isPr: false,
    canContactPr: false,
    contactPrPending: false,
    mpOrder: null,
  },
  onLoad(options) {
    const id = options && options.id ? decodeURIComponent(options.id) : ''
    const applied = options && options.applied === '1'
    this.setData({ id, applied })
    if (id) this.loadOrder(id)
    else this.setData({ loading: false, err: '缺少招募单号' })
  },
  onShow() {
    this.setData({ isPr: userProfile.readIdentity() === 'pr' })
    if (this.data.id) this.syncIceApplicantFromStorage()
  },
  syncIceApplicantFromStorage() {
    try {
      const raw = wx.getStorageSync(`${ICE_APPLICANT_KEY}_${this.data.id}`)
      if (raw) this.setData({ iceApplicantId: String(raw) })
    } catch {
      /* ignore */
    }
  },
  onShareAppMessage() {
    const v = this.data.view
    return {
      title: v ? v.title : '灵祺星选平台',
      path: `/pages/detail/detail?id=${encodeURIComponent(this.data.id)}`,
    }
  },
  async loadOrder(id) {
    if (!api.hasApi()) {
      this.setData({ loading: false, err: '未配置后台地址' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const list = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const mp = list.find((o) => o && o.id === id)
      if (!mp) {
        this.setData({ loading: false, err: '招募单不存在或已结束' })
        return
      }
      if (mp.status === 'closed' || mp.status === 'done') {
        this.setData({ loading: false, err: '该招募已结束' })
        return
      }
      const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
      const view = display.enrichMpOrder(mp, merchantOrder)
      const isIce = !!view.isIce
      let iceApplicantId = this.data.iceApplicantId
      try {
        const stored = wx.getStorageSync(`${ICE_APPLICANT_KEY}_${id}`)
        if (stored) iceApplicantId = String(stored)
      } catch {
        /* ignore */
      }
      let assignedVideoUrl = ''
      let assignedVideoLabel = ''
      let iceVerified = false
      let icePendingConfirm = false
      let iceRejected = false
      if (isIce && iceApplicantId) {
        const app = (mp.applicants || []).find((a) => a && a.id === iceApplicantId)
        if (app) {
          assignedVideoUrl = app.assignedVideoDownloadUrl || ''
          assignedVideoLabel = app.assignedVideoLabel || ''
          iceVerified = app.aiVerifyStatus === 'passed'
          icePendingConfirm = app.taskStatus === 'pending_confirm' || (!app.taskStatus && !assignedVideoUrl)
          iceRejected = app.taskStatus === 'rejected'
          if (app.douyinPublishUrl) {
            this.setData({ douyinUrl: app.douyinPublishUrl })
          }
        }
      }
      const iceApplied = Boolean(iceApplicantId)
      const applyTemplateId =
        (mp.mpPublishMeta && mp.mpPublishMeta.applyFormTemplateId) || ''
      const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : {}
      const prChatMeta = meta.prParticipantKey
        ? {
            prParticipantKey: meta.prParticipantKey,
            prDisplayName: meta.prDisplayName || view.merchantName || '招募方',
            prWxNickName: meta.prWxNickName || '',
            prWxAvatarUrl: meta.prWxAvatarUrl || '',
          }
        : null
      const gate = contactGate.evaluate(mp, id)
      const hasApplied = this.data.applied || iceApplied || gate.hasApplication
      this.setData({
        view,
        loading: false,
        mpOrder: mp,
        isPr: userProfile.readIdentity() === 'pr',
        applyTemplateId,
        chatEnabled: chat.canChat() && userProfile.readIdentity() === 'talent',
        prChatMeta,
        canContactPr: gate.canContact,
        contactPrPending: hasApplied && prChatMeta && !gate.canContact,
        isIce,
        iceApplicantId,
        assignedVideoUrl,
        assignedVideoLabel,
        iceVerified,
        icePendingConfirm,
        iceRejected,
        applied: hasApplied,
      })
    } catch (e) {
      const msg = String(e.message || e)
      const hint = msg.includes('fail')
        ? '无法加载订单，请确认 dev 服务已启动且已勾选「不校验合法域名」'
        : msg
      this.setData({ loading: false, err: hint })
    }
  },
  onDouyinField(e) {
    this.setData({ douyinUrl: e.detail.value })
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
      wx.showToast({ title: '已确认接收', icon: 'success' })
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
            wx.showToast({ title: '已拒绝', icon: 'none' })
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
      await ops.submitIceDouyin(this.data.id, this.data.iceApplicantId, url)
      wx.showToast({ title: 'AI 核查通过', icon: 'success' })
      this.setData({ iceVerified: true })
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
    const v = this.data.view
    if (!v || !this.data.id) return
    const q = [
      `mpId=${encodeURIComponent(this.data.id)}`,
      `merchantOrderNo=${encodeURIComponent(v.merchantOrderNo || '')}`,
      `platform=${encodeURIComponent(v.platform || '抖音')}`,
    ]
    if (this.data.isIce) q.push('ice=1')
    if (this.data.applyTemplateId) {
      q.push(`templateId=${encodeURIComponent(this.data.applyTemplateId)}`)
    }
    wx.navigateTo({ url: `/pages/apply/apply?${q.join('&')}` })
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
