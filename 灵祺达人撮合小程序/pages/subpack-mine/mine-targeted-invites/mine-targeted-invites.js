const mpTargetedRecruitApi = require('../../../utils/mpTargetedRecruitApi.js')
const mpTargetedRecruit = require('../../../utils/mpTargetedRecruit.js')
const participant = require('../../../utils/participant.js')
const auth = require('../../../utils/auth.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    rows: [],
    loading: true,
  },
  onShow() {
    prepareMineSubPage('talent')
    this.load()
  },
  resolveMemberId() {
    const acct = auth.readAccount()
    const mid = String((acct && acct.registryMemberId) || participant.resolveTalentMemberId() || '').trim()
    return mid
  },
  async load() {
    const talentMemberId = this.resolveMemberId()
    if (!talentMemberId) {
      this.setData({ loading: false, rows: [] })
      return
    }
    this.setData({ loading: true })
    try {
      const res = await mpTargetedRecruitApi.listForTalent(talentMemberId)
      const rows = (res.invites || []).map((item) => ({
        ...item,
        statusLabel: mpTargetedRecruit.statusLabel(item.status),
      }))
      this.setData({ rows, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: String((e && e.message) || '加载失败').slice(0, 20), icon: 'none' })
    }
  },
  async onAccept(e) {
    const mpOrderId = e.currentTarget.dataset.order
    await this.respond(mpOrderId, 'accept')
  },
  async onReject(e) {
    const mpOrderId = e.currentTarget.dataset.order
    const reason = await new Promise((resolve) => {
      wx.showModal({
        title: '拒绝邀约',
        content: '确认拒绝该定向合作邀约？',
        editable: true,
        placeholderText: '可选：填写拒绝原因',
        success: (r) => resolve(r.confirm ? String(r.content || '').trim() : null),
      })
    })
    if (reason === null) return
    await this.respond(mpOrderId, 'reject', reason)
  },
  async respond(mpOrderId, response, rejectReason) {
    const talentMemberId = this.resolveMemberId()
    if (!mpOrderId || !talentMemberId) return
    try {
      await mpTargetedRecruitApi.respond(mpOrderId, talentMemberId, response, rejectReason)
      wx.showToast({ title: response === 'accept' ? '已接受' : '已拒绝', icon: 'success' })
      this.load()
    } catch (err) {
      wx.showToast({ title: String((err && err.message) || '操作失败').slice(0, 20), icon: 'none' })
    }
  },
})
