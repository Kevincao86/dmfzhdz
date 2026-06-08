const DEFAULT_TITLE = '灵祺星选平台 · 达人招募与商单撮合'

function defaultShare(path) {
  return {
    title: DEFAULT_TITLE,
    path: path || '/pages/index/index',
  }
}

function enableShareMenu() {
  if (typeof wx.showShareMenu !== 'function') return
  try {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    })
  } catch (_) {}
}

module.exports = {
  DEFAULT_TITLE,
  defaultShare,
  enableShareMenu,
}
