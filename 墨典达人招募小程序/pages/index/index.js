const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const display = require('../../utils/recruitmentDisplay.js')
const memberStore = require('../../utils/talentMember.js')
const { isUrgentMpOrder, isIceMpOrder } = require('../../utils/recruitmentUrgent.js')

const STATUS_LABEL = {
  open: '招募中',
  collecting: '收集中',
  pending_settlement: '待结算',
  closed: '已关闭',
  done: '已完成',
}

function mapRow(mp, reg) {
  const merchantOrder = display.findMerchantOrder(reg, mp.sourceMerchantOrderId)
  const view = display.enrichMpOrder(mp, merchantOrder)
  const urgent = isUrgentMpOrder(mp)
  return {
    id: mp.id,
    merchantOrderNo: view.merchantOrderNo,
    merchantName: view.merchantName,
    storeName: view.storeName,
    title: view.title,
    statusLabel: STATUS_LABEL[mp.status] || mp.status,
    platform: view.platform,
    region: view.region,
    summary: view.summaryShort,
    applicantCount: view.applicantCount,
    urgent,
    isIce: isIceMpOrder(mp),
  }
}

Page({
  data: {
    unconfigured: false,
    loading: true,
    err: '',
    hallTab: 'normal',
    member: null,
    memberTypeLabel: '',
    normalRows: [],
    urgentRows: [],
    iceRows: [],
    displayRows: [],
  },
  onShow() {
    this.refreshMember()
    this.loadList()
  },
  refreshMember() {
    const member = memberStore.readMember()
    this.setData({
      member,
      memberTypeLabel: member ? memberStore.memberTypeLabel(member.memberType) : '',
    })
  },
  async loadList() {
    if (!merchant.hasMerchantApi()) {
      this.setData({
        unconfigured: true,
        loading: false,
        normalRows: [],
        urgentRows: [],
        iceRows: [],
        displayRows: [],
      })
      return
    }
    this.setData({ loading: true, err: '', unconfigured: false })
    try {
      const reg = await ops.fetchRegistry()
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const openList = mpList.filter((o) => o && (o.status === 'open' || o.status === 'collecting'))
      const mapped = openList.map((mp) => mapRow(mp, reg))
      const iceRows = mapped.filter((r) => r.isIce)
      const urgentRows = mapped.filter((r) => r.urgent && !r.isIce)
      const normalRows = mapped.filter((r) => !r.urgent && !r.isIce)
      this.setData({ normalRows, urgentRows, iceRows, loading: false })
      this.applyHallTab(this.data.hallTab)
    } catch (e) {
      const msg = String(e.message || e)
      const hint =
        msg.includes('fail') || msg.includes('网络')
          ? '无法连接后台，请确认已运行 npm run dev，且 config.local.js 中 MERCHANT_API_BASE_URL 正确（模拟器可用 http://127.0.0.1:5173）'
          : msg
      this.setData({
        loading: false,
        err: hint,
        normalRows: [],
        urgentRows: [],
        iceRows: [],
        displayRows: [],
      })
    }
  },
  applyHallTab(tab) {
    let displayRows = this.data.normalRows
    if (tab === 'urgent') displayRows = this.data.urgentRows
    else if (tab === 'ice') displayRows = this.data.iceRows
    this.setData({ hallTab: tab, displayRows })
  },
  onHallTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === 'urgent' || tab === 'normal' || tab === 'ice') this.applyHallTab(tab)
  },
  goRegister() {
    wx.navigateTo({ url: '/pages/register/register' })
  },
  goEditMember() {
    wx.navigateTo({ url: '/pages/register/register?edit=1' })
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` })
  },
})
