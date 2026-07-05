const mpTargetedRecruitApi = require('../../../utils/mpTargetedRecruitApi.js')
const mpTargetedRecruit = require('../../../utils/mpTargetedRecruit.js')
const mpOrderGroupChatApi = require('../../../utils/mpOrderGroupChatApi.js')
const mpGroupQr = require('../../../utils/mpGroupQr.js')
const ops = require('../../../utils/opsRegistryTalentMp.js')
const prWorkflow = require('../../../utils/prOrderWorkflowStage.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')

function splitInvites(invites) {
  const list = invites || []
  return {
    acceptedRows: list.filter((i) => i.status === 'accepted'),
    pendingRows: list.filter((i) => i.status === 'pending'),
    rejectedRows: list.filter((i) => i.status === 'rejected'),
    expiredRows: list.filter((i) => i.status === 'expired'),
  }
}

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    mpOrderId: '',
    orderTitle: '',
    inviteDeadline: '',
    inviteResponseHours: 72,
    stats: { invited: 0, accepted: 0, rejected: 0, pending: 0 },
    acceptedRows: [],
    pendingRows: [],
    rejectedRows: [],
    loading: true,
    invitePhaseFinalized: false,
    groupContactMode: '',
    groupContactOptions: [
      { id: 'mp_group', label: '一键拉群', sub: '小程序商单群，支持文字/图片/视频' },
      { id: 'wechat_qr', label: '上传群二维码', sub: '微信群码，确认进待排期后可通知达人' },
    ],
    groupQrImage: '',
    groupQrExpired: false,
    groupQrUploading: false,
    showGroupQrPreview: false,
    orderGroupChatActive: false,
    orderGroupChatClosed: false,
    orderGroupChatTitle: '',
    orderGroupChatCreating: false,
    confirmingPhase: false,
  },
  onLoad(query) {
    prepareMineSubPage('pr')
    this.setData({ mpOrderId: String((query && query.id) || '').trim() })
  },
  onShow() {
    this.load()
  },
  async load() {
    const { mpOrderId } = this.data
    if (!mpOrderId) return
    this.setData({ loading: true })
    try {
      const [summary, reg] = await Promise.all([
        mpTargetedRecruitApi.orderSummary(mpOrderId),
        ops.fetchRegistry({ includeMpOrderIds: [mpOrderId] }),
      ])
      const mp = ops.findMpOrderInRegistry(reg, mpOrderId)
      const meta = summary.meta || (mp && mp.mpPublishMeta) || {}
      const invites = summary.invites || mpTargetedRecruit.readInvites(mp)
      const parts = splitInvites(invites)
      const invitePhaseFinalized =
        mpTargetedRecruit.isTargetedInvitePhaseFinalized(mp) ||
        prWorkflow.resolvePrWorkflowStage(mp) === 'pending_schedule'
      this.setData({
        orderTitle: (mp && mp.title) || '定向招募',
        inviteDeadline: meta.inviteDeadline || '',
        inviteResponseHours: meta.inviteResponseHours || 72,
        stats: summary.stats || mpTargetedRecruit.inviteStats(mp),
        ...parts,
        invitePhaseFinalized,
        groupQrImage: mpGroupQr.groupQrFromRegistry(reg, mpOrderId) || mpGroupQr.groupQrFromMp(mp),
        groupQrExpired: mpGroupQr.isGroupQrExpired(mp),
        loading: false,
      })
      await this.syncOrderGroupChatState()
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: String((e && e.message) || '加载失败').slice(0, 20), icon: 'none' })
    }
  },
  async syncOrderGroupChatState() {
    const mpOrderId = String(this.data.mpOrderId || '').trim()
    if (!mpOrderId) return
    try {
      const body = await mpOrderGroupChatApi.getGroup(mpOrderId)
      const group = body && body.group
      if (!group) {
        this.setData({ orderGroupChatActive: false, orderGroupChatClosed: false, orderGroupChatTitle: '' })
        return
      }
      this.setData({
        orderGroupChatActive: true,
        orderGroupChatClosed: group.status === 'closed',
        orderGroupChatTitle: group.title || '',
        groupContactMode: this.data.groupContactMode || 'mp_group',
      })
    } catch (_) {
      this.setData({ orderGroupChatActive: false, orderGroupChatClosed: false, orderGroupChatTitle: '' })
    }
  },
  onAddMore() {
    const { mpOrderId, inviteResponseHours, invitePhaseFinalized } = this.data
    if (invitePhaseFinalized) {
      wx.showToast({ title: '邀约已结束', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/subpack-pr/mine-pr-targeted-pick/mine-pr-targeted-pick?id=${encodeURIComponent(mpOrderId)}&hours=${inviteResponseHours}`,
    })
  },
  onGoSchedule() {
    const { mpOrderId } = this.data
    wx.navigateTo({
      url: `/pages/subpack-pr/mine-pr-order-schedule/mine-pr-order-schedule?id=${encodeURIComponent(mpOrderId)}`,
    })
  },
  onPickGroupContactMode(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (id !== 'wechat_qr' && id !== 'mp_group') return
    if (this.data.stats.accepted <= 0) {
      wx.showToast({ title: '暂无已同意达人', icon: 'none' })
      return
    }
    const patch = { groupContactMode: id }
    if (id !== 'wechat_qr') patch.showGroupQrPreview = false
    this.setData(patch)
  },
  onEnterOrderGroupChat() {
    const mpOrderId = String(this.data.mpOrderId || '').trim()
    if (!mpOrderId) return
    wx.navigateTo({
      url: `/pages/subpack-pr/order-group-chat/order-group-chat?mpOrderId=${encodeURIComponent(mpOrderId)}`,
    })
  },
  async onConfirmCreateOrderGroupChat() {
    if (this.data.orderGroupChatCreating) return
    if (this.data.stats.accepted <= 0) {
      wx.showToast({ title: '暂无已同意达人', icon: 'none' })
      return
    }
    if (this.data.orderGroupChatActive) {
      this.onEnterOrderGroupChat()
      return
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认拉群',
        content: `将为已同意 ${this.data.stats.accepted} 位达人创建小程序商单群。是否确认？`,
        confirmText: '确认拉群',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!confirmed) return
    this.setData({ orderGroupChatCreating: true, groupContactMode: 'mp_group' })
    wx.showLoading({ title: '拉群中…', mask: true })
    try {
      const body = await mpOrderGroupChatApi.createGroup(this.data.mpOrderId)
      const group = body && body.group
      this.setData({
        orderGroupChatActive: true,
        orderGroupChatClosed: false,
        orderGroupChatTitle: (group && group.title) || '',
      })
      wx.showToast({ title: body.existed ? '群已存在' : '商单群已创建', icon: 'success' })
      setTimeout(() => this.onEnterOrderGroupChat(), 400)
    } catch (e) {
      wx.showToast({ title: String(e.message || '创建失败').slice(0, 28), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ orderGroupChatCreating: false })
    }
  },
  onUploadGroupQr() {
    if (this.data.groupQrUploading || this.data.groupQrExpired) return
    if (this.data.groupQrImage) {
      this.setData({ showGroupQrPreview: !this.data.showGroupQrPreview, groupContactMode: 'wechat_qr' })
      return
    }
    this.setData({ groupContactMode: 'wechat_qr' })
    void this.uploadGroupQrImage()
  },
  onReplaceGroupQr() {
    if (this.data.groupQrUploading || this.data.groupQrExpired) return
    void this.uploadGroupQrImage()
  },
  onPreviewGroupQr() {
    const url = this.data.groupQrImage
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  async uploadGroupQrImage() {
    try {
      const filePath = await mpGroupQr.chooseAndReadImageDataUrl()
      this.setData({ groupQrUploading: true })
      wx.showLoading({ title: '上传中…', mask: true })
      const patchResult = await mpGroupQr.patchGroupQrImage(this.data.mpOrderId, filePath)
      const imageUrl = String((patchResult && patchResult.imageUrl) || filePath || '').trim()
      this.setData({
        groupQrImage: imageUrl,
        showGroupQrPreview: true,
        groupContactMode: 'wechat_qr',
      })
      wx.showToast({ title: '群二维码已保存', icon: 'success' })
    } catch (e) {
      const msg = String(e && e.message ? e.message : e)
      if (msg !== 'cancel') {
        wx.showToast({ title: msg.slice(0, 28), icon: 'none', duration: 2800 })
      }
    } finally {
      wx.hideLoading()
      this.setData({ groupQrUploading: false })
    }
  },
  async onConfirmInvitePhase() {
    if (this.data.confirmingPhase || this.data.invitePhaseFinalized) return
    if (this.data.stats.accepted <= 0) {
      wx.showToast({ title: '暂无已同意达人', icon: 'none' })
      return
    }
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '确认完成邀约',
        content: `将把 ${this.data.stats.accepted} 位已同意达人移入「待排期」，未响应邀约将标记过期。是否继续？`,
        confirmText: '确认进入待排期',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!ok) return
    this.setData({ confirmingPhase: true })
    wx.showLoading({ title: '处理中…', mask: true })
    try {
      await mpTargetedRecruitApi.confirmInvitePhase(this.data.mpOrderId)
      wx.showToast({ title: '已进入待排期', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/subpack-pr/mine-pr-orders/mine-pr-orders?tab=pending_schedule`,
        })
      }, 500)
    } catch (e) {
      wx.showToast({ title: String(e.message || '操作失败').slice(0, 24), icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ confirmingPhase: false })
    }
  },
  async onCancel(e) {
    const inviteId = e.currentTarget.dataset.id
    const { mpOrderId, invitePhaseFinalized } = this.data
    if (!inviteId || !mpOrderId || invitePhaseFinalized) return
    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: '取消邀约',
        content: '确认取消该达人的邀约/合作？',
        success: (r) => resolve(!!r.confirm),
      })
    })
    if (!ok) return
    try {
      await mpTargetedRecruitApi.cancelInvite(mpOrderId, inviteId)
      wx.showToast({ title: '已取消', icon: 'success' })
      this.load()
    } catch (err) {
      wx.showToast({ title: String((err && err.message) || '失败').slice(0, 20), icon: 'none' })
    }
  },
})
