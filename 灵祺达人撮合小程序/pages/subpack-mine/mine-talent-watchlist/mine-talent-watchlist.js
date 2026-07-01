const { prepareXingxuanSubPage } = require('../../../utils/pageIdentityChrome.js')
const xingxuan = require('../../../utils/xingxuanEnhanceApi.js')

Page({
  data: {
    activeTab: 'blacklist',
    entries: [],
    blacklist: [],
    graylist: [],
  },
  async onShow() {
    const ready = await prepareXingxuanSubPage(this)
    if (!ready) return
    await this.load()
  },
  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh())
  },
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab === 'graylist' ? 'graylist' : 'blacklist'
    const entries = tab === 'graylist' ? this.data.graylist : this.data.blacklist
    this.setData({ activeTab: tab, entries })
  },
  async load() {
    try {
      const res = await xingxuan.getTalentWatchlist()
      const blacklist = res.blacklist || []
      const graylist = res.graylist || []
      const activeTab = this.data.activeTab
      this.setData({
        blacklist,
        graylist,
        entries: activeTab === 'graylist' ? graylist : blacklist,
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
  remove(e) {
    const entryId = e.currentTarget.dataset.id
    if (!entryId) return
    wx.showModal({
      title: '移出名单',
      content: '确定移出该达人？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await xingxuan.removeWatchlist(this.data.activeTab, entryId)
          await this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      },
    })
  },
})
