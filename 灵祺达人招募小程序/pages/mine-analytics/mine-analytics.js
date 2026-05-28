const applicationsStore = require('../../utils/applicationsStore.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const merchant = require('../../utils/merchantApi.js')
const userProfile = require('../../utils/userProfile.js')

Page({
  data: {
    stats: [],
  },
  onShow() {
    this.load()
  },
  async load() {
    const apps = applicationsStore.readApplications()
    const published = applicationsStore.readPublishedOrders()
    const identity = userProfile.identityLabel(userProfile.readIdentity())
    let openOrders = 0
    if (merchant.hasMerchantApi()) {
      try {
        const reg = await ops.fetchRegistry()
        openOrders = (reg.mpRecruitmentOrders || []).filter(
          (o) => o.status === 'open' || o.status === 'collecting',
        ).length
      } catch {
        /* ignore */
      }
    }
    this.setData({
      stats: [
        { label: '当前身份', value: identity },
        { label: '我的报名', value: String(apps.length) },
        { label: '我的发单', value: String(published.length) },
        { label: '大厅在招', value: String(openOrders) },
      ],
    })
  },
})
