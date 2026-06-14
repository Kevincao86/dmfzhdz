const formRelaySourceMpLink = require('../../utils/formRelaySourceMpLink.js')

function hostFromUrl(url) {
  try {
    return String(new URL(String(url || '').trim()).hostname || '').toLowerCase()
  } catch (_) {
    return ''
  }
}

function canEmbedFormRelayWebView(url) {
  return formRelaySourceMpLink.shouldTryFormRelayWebView(url)
}

Page({
  data: {
    url: '',
    embed: false,
    embedFailed: false,
    copied: false,
    relayMode: false,
  },
  onLoad(query) {
    const raw = query && query.url ? decodeURIComponent(String(query.url)) : ''
    const embedQuery = String((query && query.embed) || '')
    const relayMode = String((query && query.relay) || '') === '1'
    let embed = false
    if (embedQuery === '1') embed = true
    else if (embedQuery === '0') embed = false
    else embed = canEmbedFormRelayWebView(raw)
    if (!/^https?:\/\//i.test(raw)) {
      wx.showToast({ title: '链接无效', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    this.setData({ url: raw, embed, relayMode })
    if (!embed) this.copyLink(false)
  },
  onWebViewError() {
    this.setData({ embedFailed: true, embed: false })
    this.copyLink(false)
    if (this.data.relayMode) {
      wx.showToast({ title: '内嵌打开失败，已复制链接', icon: 'none' })
    }
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
