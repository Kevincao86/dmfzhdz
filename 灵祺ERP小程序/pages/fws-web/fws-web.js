const fwsWeb = require('../../utils/fwsWebBridgeMp.js')

Page({
  data: {
    webUrl: '',
    loading: true,
    err: '',
  },

  onLoad(query) {
    const path = query && query.path ? decodeURIComponent(String(query.path)) : '/home'
    const extra = {}
    if (query && query.tab) extra.tab = String(query.tab)
    try {
      const webUrl = fwsWeb.buildFwsWebUrl(path, extra)
      this.setData({ webUrl, loading: false })
    } catch (e) {
      this.setData({
        loading: false,
        err: e instanceof Error ? e.message : '无法打开服务商页面',
      })
    }
  },
})
