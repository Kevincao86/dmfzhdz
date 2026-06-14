const legal = require('../../utils/legalContentMp.js')
const { syncPageIdentity } = require('../../utils/pageIdentityChrome.js')

Page({
  data: {
    title: '',
    sections: [],
    meta: legal.LEGAL_META,
  },
  onLoad(options) {
    syncPageIdentity(this)
    const doc = String((options && options.doc) || 'privacy').trim()
    const isAup = doc === 'aup'
    wx.setNavigationBarTitle({ title: isAup ? '用户协议' : '隐私政策' })
    this.setData({
      title: isAup ? '灵祺星选 · 用户协议' : '灵祺星选 · 隐私政策',
      sections: isAup ? legal.buildAupSections() : legal.buildPrivacySections(),
      meta: legal.LEGAL_META,
    })
  },
})
