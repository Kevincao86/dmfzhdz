const URL_IN_TEXT_RE = /https?:\/\/[^\s\u4e00-\u9fff，。；！？、「」""''()（）【】]+/i

function extractProfileLinkUrl(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const m = text.match(URL_IN_TEXT_RE)
  if (m && m[0]) return m[0].replace(/[.,;:!?)、】]+$/, '')
  const first = text.split(/\s+/)[0] || ''
  if (/^https?:\/\//i.test(first)) return first
  if (/^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}/i.test(first)) return `https://${first}`
  return ''
}

function resolveTalentProfileHref(_platform, rawLink) {
  const url = extractProfileLinkUrl(rawLink)
  return url || ''
}

function shortProfileLinkButtonLabel(platform) {
  const plat = String(platform || '抖音').trim()
  if (plat.indexOf('抖音') >= 0) return '抖音主页'
  if (plat.indexOf('红') >= 0) return '小红书'
  if (plat.indexOf('快手') >= 0) return '快手主页'
  if (plat.indexOf('点评') >= 0 || plat.indexOf('大众') >= 0) return '大众点评'
  if (plat.indexOf('视频号') >= 0) return '视频号'
  return '平台主页'
}

/** 小程序内无法直接外链跳转，复制解析后的 URL 供用户在 App/浏览器打开 */
function openTalentProfileLink(rawLink) {
  const url = resolveTalentProfileHref('', rawLink) || String(rawLink || '').trim()
  if (!url) {
    wx.showToast({ title: '暂无平台主页链接', icon: 'none' })
    return
  }
  wx.setClipboardData({
    data: url,
    success() {
      wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none', duration: 2500 })
    },
  })
}

module.exports = {
  extractProfileLinkUrl,
  resolveTalentProfileHref,
  shortProfileLinkButtonLabel,
  openTalentProfileLink,
}
