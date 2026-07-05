const mpTargetedRecruitApi = require('../../../utils/mpTargetedRecruitApi.js')
const mpTargetedRecruit = require('../../../utils/mpTargetedRecruit.js')
const ops = require('../../../utils/opsRegistryTalentMp.js')
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
      this.setData({
        orderTitle: (mp && mp.title) || '定向招募',
        inviteDeadline: meta.inviteDeadline || '',
        inviteResponseHours: meta.inviteResponseHours || 72,
        stats: summary.stats || mpTargetedRecruit.inviteStats(mp),
        ...parts,
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: String((e && e.message) || '加载失败').slice(0, 20), icon: 'none' })
    }
  },
  onAddMore() {
    const { mpOrderId, inviteResponseHours } = this.data
    wx.navigateTo({
      url: `/pages/subpack-pr/mine-pr-targeted-pick/mine-pr-targeted-pick?id=${encodeURIComponent(mpOrderId)}&hours=${inviteResponseHours}`,
    })
  },
  onGoSchedule() {
    const { mpOrderId } = this.data
    wx.navigateTo({
      url: `/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(mpOrderId)}&view=selected`,
    })
  },
  async onCancel(e) {
    const inviteId = e.currentTarget.dataset.id
    const { mpOrderId } = this.data
    if (!inviteId || !mpOrderId) return
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
