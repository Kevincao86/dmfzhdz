function hostFromUrl(url) {
  try {
    return String(new URL(String(url || '').trim()).hostname || '').toLowerCase()
  } catch (_) {
    return ''
  }
}

/** 仅自家业务域名可内嵌 web-view（须在小程序后台配置业务域名） */
function canEmbedFormRelayWebView(url) {
  const host = hostFromUrl(url)
  if (!host) return false
  return /(?:^|\.)mofangdianai\.com$/i.test(host)
}

Page({
  data: {
    url: '',
    embed: false,
    copied: false,
  },
  onLoad(query) {
    const raw = query && query.url ? decodeURIComponent(String(query.url)) : ''
    const embedQuery = String((query && query.embed) || '')
    const embed = embedQuery === '1' ? true : embedQuery === '0' ? false : canEmbedFormRelayWebView(raw)
    if (!/^https?:\/\//i.test(raw)) {
      wx.showToast({ title: '链接无效', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ url: raw, embed })
    if (!embed) this.copyLink(false)
  },
  copyLink(showToast) {
    const url = String(this.data.url || '').trim()
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => {
        this.setData({ copied: true })
        if (showToast !== false) {
          wx.showToast({ title: '链接已复制', icon: 'success' })
        }
      },
    })
  },
})
