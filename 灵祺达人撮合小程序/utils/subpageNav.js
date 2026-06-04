const { applyCapsulePadding } = require('./navLayout.js')

const PAD_KEYS = { band: 'subNavBandStyle', right: 'subNavInnerStyle' }

function setupSubpageNav(page, title) {
  applyCapsulePadding(page, null, PAD_KEYS)
  if (title) page.setData({ subNavTitle: title })
}

function onSubNavBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 })
    return
  }
  wx.switchTab({ url: '/pages/mine/mine' })
}

module.exports = { setupSubpageNav, onSubNavBack, PAD_KEYS }
