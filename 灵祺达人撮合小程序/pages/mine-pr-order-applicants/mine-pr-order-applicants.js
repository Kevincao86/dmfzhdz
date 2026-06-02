const ops = require('../../utils/opsRegistryTalentMp.js')
const merchant = require('../../utils/merchantApi.js')
const userProfile = require('../../utils/userProfile.js')
const chat = require('../../utils/talentChat.js')
const appDisplay = require('../../utils/applicationDisplay.js')
const heroMeta = require('../../utils/mpOrderHeroMeta.js')
const selection = require('../../utils/mpApplicantSelection.js')
const { exportApplicantsExcel, formatExportError } = require('../../utils/mpApplicantsExport.js')

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
    applicants: [],
    selectedIds: [],
    selectedCount: 0,
    selectedApplicants: [],
    showSelectedPanel: false,
    exportingAll: false,
    exportingSelected: false,
    notifying: false,
    savingSelect: false,
    chatEnabled: false,
    chattingId: '',
    mpOrder: null,
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
  applyApplicantsState(applicants, selectedIds) {
    const ids = selection.normalizeSelectedIds(selectedIds)
    const stamped = selection.stampApplicantsSelected(applicants, ids)
    const selectedApplicants = selection.filterSelectedApplicants(stamped, ids)
    this.setData({
      applicants: stamped,
      selectedIds: ids,
      selectedCount: ids.length,
      selectedApplicants,
    })
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
          mpOrder: null,
        })
        return
      }
      const meta = heroMeta.buildMpOrderHeroMeta(mp)
      let selectedIds = selection.selectedIdsFromMp(mp)
      if (!selectedIds.length) selectedIds = selection.readLocalSelectedIds(mpOrderId)
      const applicants = (mp.applicants || []).map((a, i) => appDisplay.enrichApplicantRow(a, i, reg))
      this.setData({
        loading: false,
        title: mp.title || mp.customerName || mpOrderId,
        orderNo: meta.orderNo,
        publishedAt: meta.publishedAt,
        deadlineText: meta.deadlineText,
        status: mp.status || 'open',
        statusLabel: appDisplay.statusLabel(mp.status),
        hallLabel: appDisplay.hallLabelFromMp(mp),
        mpOrder: mp,
        err: '',
      })
      this.applyApplicantsState(applicants, selectedIds)
    } catch (e) {
      this.setData({
        loading: false,
        err: String(e && e.message ? e.message : e).slice(0, 80),
      })
    }
  },
  async onToggleSelect(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const a = this.data.applicants[idx]
    if (!a || !a.id || this.data.savingSelect) return
    const set = new Set(this.data.selectedIds)
    if (set.has(a.id)) set.delete(a.id)
    else set.add(a.id)
    const selectedIds = [...set]
    this.applyApplicantsState(this.data.applicants, selectedIds)
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
    if (!this.data.selectedCount) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    this.setData({ showSelectedPanel: true })
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
    wx.showLoading({ title: '生成表格…', mask: true })
    try {
      const res = await exportApplicantsExcel(list, this.data.mpOrderId)
      if (res.mode === 'clipboard') {
        wx.showToast({ title: '已复制，可粘贴到 Excel', icon: 'none', duration: 2500 })
      } else if (res.mode === 'saved') {
        wx.showModal({
          title: '表格已生成',
          content:
            'CSV 已保存到本机。当前环境无法自动打开时，请用电脑微信打开小程序，或长按复制报名页「复制全部资料」。',
          showCancel: false,
          confirmText: '知道了',
        })
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
  onExportSelected() {
    this.runExport(this.data.selectedApplicants, 'exportingSelected')
  },
  async onNotifySelected() {
    if (this.data.notifying) return
    const selected = this.data.selectedApplicants
    if (!selected.length) {
      wx.showToast({ title: '请先确认选择达人', icon: 'none' })
      return
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '通知已选达人',
        content: `将向 ${selected.length} 位达人发送站内信，提醒查看入选结果。是否继续？`,
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
        const talentMemberId = selection.resolveTalentMemberId(a, reg)
        if (!talentMemberId) {
          skipped.push(a.displayName || a.id)
          continue
        }
        entries.push({
          talentMemberId,
          mpOrderId: this.data.mpOrderId,
          category: 'business',
          title: '恭喜入选招募',
          body: `您已被 PR 选入「${title}」（单号 ${this.data.orderNo}）。请尽快查看商单详情并与招募方沟通排期。`,
        })
      }
      if (!entries.length) {
        wx.showToast({ title: '所选达人未绑定会员资料', icon: 'none' })
        return
      }
      await ops.appendTalentInbox(entries)
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
  onOpenProfile(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const a = this.data.applicants[idx]
    if (!a) return
    appDisplay.openTalentProfileLink(a.profileLink, a.displayPlatform)
  },
  noop() {},
  onCopyApplicant(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const a = this.data.applicants[idx]
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
      a.selected ? '状态：已入选' : '',
    ].filter(Boolean)
    wx.setClipboardData({ data: lines.join('\n') })
  },
})
