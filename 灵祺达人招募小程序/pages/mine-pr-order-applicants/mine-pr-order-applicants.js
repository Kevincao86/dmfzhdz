const ops = require('../../utils/opsRegistryTalentMp.js')
const merchant = require('../../utils/merchantApi.js')
const userProfile = require('../../utils/userProfile.js')
const chat = require('../../utils/talentChat.js')
const { exportApplicantsExcel } = require('../../utils/mpApplicantsExport.js')

function formatApplicant(a, index) {
  const followers = a.followers != null ? `${a.followers}` : '—'
  return {
    ...a,
    index: index + 1,
    displayName: a.platformNickname || a.name || '未填写昵称',
    displayFollowers: followers,
    displayPlatform: a.platform || '—',
    displayAppliedAt: a.appliedAt || '—',
  }
}

Page({
  data: {
    mpOrderId: '',
    loading: true,
    err: '',
    title: '',
    status: '',
    hallLabel: '',
    applicants: [],
    exporting: false,
    chatEnabled: false,
    chattingId: '',
  },
  onShow() {
    this.setData({ chatEnabled: chat.canChat() && userProfile.readIdentity() === 'pr' })
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
  async loadOrder() {
    const { mpOrderId } = this.data
    if (!mpOrderId) return
    if (!merchant.hasMerchantApi()) {
      this.setData({ loading: false, err: '未配置后台地址，无法拉取报名' })
      return
    }
    this.setData({ loading: true, err: '' })
    try {
      const reg = await ops.fetchRegistry()
      const mp = (reg.mpRecruitmentOrders || []).find((o) => o && o.id === mpOrderId)
      if (!mp) {
        this.setData({
          loading: false,
          err: '未找到该招募单，请下拉刷新',
          applicants: [],
        })
        return
      }
      const hall =
        mp.hall === 'urgent' || mp.urgent
          ? '急单大厅'
          : mp.hall === 'ice' || mp.orderKind === 'ice'
            ? '云剪任务'
            : '招募大厅'
      const applicants = (mp.applicants || []).map(formatApplicant)
      this.setData({
        loading: false,
        title: mp.title || mp.customerName || mpOrderId,
        status: mp.status || 'open',
        hallLabel: hall,
        applicants,
        err: '',
      })
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 80),
      })
    }
  },
  async onExportExcel() {
    if (this.data.exporting) return
    const { applicants, mpOrderId } = this.data
    if (!applicants.length) {
      wx.showToast({ title: '暂无报名可导出', icon: 'none' })
      return
    }
    this.setData({ exporting: true })
    wx.showLoading({ title: '生成表格…', mask: true })
    try {
      const res = await exportApplicantsExcel(applicants, mpOrderId)
      if (res.mode === 'clipboard') {
        wx.showToast({ title: '已复制，可粘贴到 Excel', icon: 'none', duration: 2500 })
      }
    } catch (e) {
      wx.showToast({
        title: String(e && e.message ? e.message : e).slice(0, 36),
        icon: 'none',
      })
    } finally {
      wx.hideLoading()
      this.setData({ exporting: false })
    }
  },
  async onChatApplicant(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const a = this.data.applicants[idx]
    if (!a || !a.id) return
    if (!this.data.chatEnabled) {
      wx.showToast({ title: '请先配置后台地址', icon: 'none' })
      return
    }
    this.setData({ chattingId: a.id })
    wx.showLoading({ title: '连接中' })
    try {
      await chat.syncProfile()
      const sessionId = await chat.ensureSessionWithTalent({
        id: a.id,
        talentMemberId: a.talentMemberId || a.id,
        name: a.displayName || a.platformNickname || '达人',
        avatar: a.avatar || '',
      })
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
  noop() {},
  onCopyApplicant(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const a = this.data.applicants[idx]
    if (!a) return
    const lines = [
      `昵称：${a.displayName}`,
      `平台：${a.platform || ''}`,
      `账号：${a.platformAccount || ''}`,
      `粉丝：${a.displayFollowers}`,
      `报价：${a.quotePrice || ''}`,
      `探店：${a.visitTimeSlot || ''}`,
      `联系：${a.contact || ''}`,
      `微信：${a.wechatId || ''}`,
      `主页：${a.profileLink || ''}`,
    ]
    wx.setClipboardData({ data: lines.join('\n') })
  },
})
