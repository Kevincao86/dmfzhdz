/** 转发工具原表链接 → 小程序展示/跳转（与 web 版 formRelaySourceMpLink 对齐） */
const formRelayPlatforms = require('./formRelayPlatforms.js')

const BAOMING_MP = {
  appId: 'wx8b6c33d344f46d19',
  appName: '报名工具',
}

function extractBaomingEid(url) {
  const raw = String(url || '').trim()
  try {
    const u = new URL(raw)
    return String(u.searchParams.get('eid') || '').trim()
  } catch (_) {
    const m = raw.match(/[?&]eid=([^&]+)/i)
    return m && m[1] ? decodeURIComponent(m[1]).trim() : ''
  }
}

function parseMpSchemeText(raw) {
  const m = String(raw || '').trim().match(/^#小程序:\/\/([^/]+)\/(.+)$/i)
  if (!m) return null
  return { appName: m[1].trim(), path: m[2].trim() }
}

function mpSchemeDisplay(appName, path) {
  return `#小程序://${appName}/${String(path || '').replace(/^\//, '')}`
}

function resolveFormRelaySourceMpLink(sourceUrl, platform, cached) {
  const rawUrl = String(sourceUrl || '').trim()
  if (!rawUrl) {
    return { displayLink: '', openKind: 'copy', webUrl: '', rawUrl: '' }
  }

  if (cached && cached.sourceMpDisplayLink && cached.sourceMpAppId && cached.sourceMpPath) {
    return {
      displayLink: String(cached.sourceMpDisplayLink),
      openKind: 'miniProgram',
      appId: String(cached.sourceMpAppId),
      path: String(cached.sourceMpPath),
      webUrl: rawUrl,
      rawUrl,
    }
  }

  if (/^#小程序:\/\//.test(rawUrl)) {
    const parsed = parseMpSchemeText(rawUrl)
    if (parsed && parsed.appName === BAOMING_MP.appName && parsed.path) {
      const path = parsed.path.startsWith('pages/') ? parsed.path : parsed.path
      if (path.indexOf('pages/') === 0) {
        return {
          displayLink: mpSchemeDisplay(BAOMING_MP.appName, path),
          openKind: 'miniProgram',
          appId: BAOMING_MP.appId,
          path,
          webUrl: rawUrl,
          rawUrl,
        }
      }
    }
    return { displayLink: rawUrl, openKind: 'mpSchemeText', webUrl: rawUrl, rawUrl }
  }

  if (/^\/pages\//.test(rawUrl)) {
    const path = rawUrl.replace(/^\//, '')
    const platformId = formRelayPlatforms.detectFormRelayPlatform(rawUrl)
    const appName =
      platformId === 'signup_tool'
        ? BAOMING_MP.appName
        : formRelayPlatforms.formRelayPlatformLabel(platformId) || '小程序'
    return {
      displayLink: mpSchemeDisplay(appName, path),
      openKind: appName === BAOMING_MP.appName ? 'miniProgram' : 'mpSchemeText',
      appId: appName === BAOMING_MP.appName ? BAOMING_MP.appId : undefined,
      path: path.indexOf('pages/') === 0 ? path : undefined,
      webUrl: rawUrl,
      rawUrl,
    }
  }

  const platformId = String(platform || formRelayPlatforms.detectFormRelayPlatform(rawUrl) || '').trim()
  if (/baominggongju\.com/i.test(rawUrl) || platformId === 'signup_tool') {
    const eid = extractBaomingEid(rawUrl)
    if (eid) {
      const path = `pages/detail/detail?eid=${encodeURIComponent(eid)}`
      return {
        displayLink: mpSchemeDisplay(BAOMING_MP.appName, path),
        openKind: 'miniProgram',
        appId: BAOMING_MP.appId,
        path,
        webUrl: rawUrl,
        rawUrl,
      }
    }
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return { displayLink: rawUrl, openKind: 'webView', webUrl: rawUrl, rawUrl }
  }

  return { displayLink: rawUrl, openKind: 'copy', webUrl: rawUrl, rawUrl }
}

function pickFormRelaySourceMpCache(relay) {
  if (!relay || typeof relay !== 'object') return undefined
  return {
    sourceMpDisplayLink: String(relay.sourceMpDisplayLink || '').trim() || undefined,
    sourceMpAppId: String(relay.sourceMpAppId || '').trim() || undefined,
    sourceMpPath: String(relay.sourceMpPath || '').trim() || undefined,
  }
}

function openFormRelaySourceLink(link, fallbackUrl) {
  const open = link && typeof link === 'object' ? link : null
  const webUrl = String((open && open.webUrl) || fallbackUrl || '').trim()

  function fallbackWeb() {
    if (!/^https?:\/\//i.test(webUrl)) {
      if (webUrl) {
        wx.setClipboardData({
          data: webUrl,
          success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
        })
      }
      return
    }
    wx.navigateTo({
      url: `/pages/web-link/web-link?url=${encodeURIComponent(webUrl)}`,
      fail: () => {
        wx.setClipboardData({
          data: webUrl,
          success: () =>
            wx.showModal({
              title: '原表链接',
              content: '链接已复制，请在浏览器中打开。',
              showCancel: false,
            }),
        })
      },
    })
  }

  if (open && open.openKind === 'miniProgram' && open.appId && open.path) {
    wx.navigateToMiniProgram({
      appId: open.appId,
      path: open.path,
      fail: () => fallbackWeb(),
    })
    return
  }

  if (open && open.openKind === 'mpSchemeText' && open.displayLink) {
    wx.setClipboardData({
      data: open.displayLink,
      success: () =>
        wx.showModal({
          title: '原表小程序链接',
          content: '已复制小程序链接，可在微信聊天中粘贴打开。',
          showCancel: false,
        }),
    })
    return
  }

  fallbackWeb()
}

module.exports = {
  resolveFormRelaySourceMpLink,
  pickFormRelaySourceMpCache,
  openFormRelaySourceLink,
}
