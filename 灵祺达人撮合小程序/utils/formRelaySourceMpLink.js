/** 转发工具原表链接 → 小程序展示/跳转（与 web 版 formRelaySourceMpLink 对齐） */
const formRelayPlatforms = require('./formRelayPlatforms.js')

const BAOMING_MP = {
  appId: 'wxfaa08012777a431e',
  appName: '报名工具',
}
/** 历史误写的 appId，读取缓存时须纠正 */
const BAOMING_MP_APPID_LEGACY = 'wx8b6c33d344f46d19'

const FORM_RELAY_EMBED_HOST_PATTERNS = [
  /(?:^|\.)mofangdianai\.com$/i,
  /(?:^|\.)tungea\.com$/i,
  /(?:^|\.)docs\.qq\.com$/i,
  /(?:^|\.)doc\.weixin\.qq\.com$/i,
  /(?:^|\.)forms\.tencent\.com$/i,
  /(?:^|\.)kdocs\.cn$/i,
  /(?:^|\.)wps\.cn$/i,
  /(?:^|\.)f\.wps\.cn$/i,
  /(?:^|\.)jinshuju\.net$/i,
  /(?:^|\.)wjx\.cn$/i,
]

function isBaomingGongjuHost(url) {
  const host = hostFromUrl(url)
  return /(?:^|\.)baominggongju\.com$/i.test(host)
}

function hostFromUrl(url) {
  try {
    return String(new URL(String(url || '').trim()).hostname || '').toLowerCase()
  } catch (_) {
    return ''
  }
}

function shouldTryFormRelayWebView(url) {
  const host = hostFromUrl(url)
  if (!host) return false
  return FORM_RELAY_EMBED_HOST_PATTERNS.some((re) => re.test(host))
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

function normalizeBaomingMiniPath(rawPath) {
  const path = String(rawPath || '').trim().replace(/^\//, '')
  if (!path) return ''
  if (path.indexOf('pages/') === 0) return path
  const eid = extractBaomingEid(path.indexOf('eid=') >= 0 ? `https://x/?${(path.split('?')[1] || '')}` : path)
  if (eid) return `pages/detail/detail?eid=${encodeURIComponent(eid)}`
  return ''
}

function parseMpSchemeText(raw) {
  const m = String(raw || '').trim().match(/^#小程序:\/\/([^/]+)\/(.+)$/i)
  if (!m) return null
  return { appName: m[1].trim(), path: m[2].trim() }
}

function mpSchemeDisplay(appName, path) {
  return `#小程序://${appName}/${String(path || '').replace(/^\//, '')}`
}

function buildBaomingMiniPath(rawUrl, pathHint) {
  const fromHint = normalizeBaomingMiniPath(pathHint || '')
  if (fromHint) return fromHint
  const eid = extractBaomingEid(rawUrl)
  return eid ? `pages/detail/detail?eid=${encodeURIComponent(eid)}` : ''
}

function resolveBaomingMiniProgram(rawUrl, pathHint) {
  const path = buildBaomingMiniPath(rawUrl, pathHint)
  if (!path) return null
  let webUrl = rawUrl
  if (!/^https?:\/\//i.test(webUrl)) {
    const eid = extractBaomingEid(path.indexOf('eid=') >= 0 ? `https://x/?${(path.split('?')[1] || '')}` : rawUrl)
    webUrl = eid ? `https://p.baominggongju.com/share?eid=${encodeURIComponent(eid)}` : rawUrl
  }
  return {
    displayLink: mpSchemeDisplay(BAOMING_MP.appName, path),
    openKind: 'miniProgram',
    appId: BAOMING_MP.appId,
    path,
    webUrl,
  }
}

function resolveFormRelaySourceMpLink(sourceUrl, platform, cached) {
  const rawUrl = String(sourceUrl || '').trim()
  if (!rawUrl) {
    return { displayLink: '', openKind: 'copy', webUrl: '', rawUrl: '' }
  }

  if (cached && cached.sourceMpDisplayLink && cached.sourceMpAppId && cached.sourceMpPath) {
    const webUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : String(cached.sourceMpDisplayLink)
    let appId = String(cached.sourceMpAppId)
    let path = String(cached.sourceMpPath)
    if (/baominggongju\.com/i.test(rawUrl) || appId === BAOMING_MP_APPID_LEGACY) {
      appId = BAOMING_MP.appId
      path = buildBaomingMiniPath(rawUrl, path) || path
    }
    return {
      displayLink: String(cached.sourceMpDisplayLink),
      openKind: 'miniProgram',
      appId,
      path,
      webUrl,
      rawUrl,
    }
  }

  if (/^#小程序:\/\//.test(rawUrl)) {
    const parsed = parseMpSchemeText(rawUrl)
    if (parsed && (parsed.appName === BAOMING_MP.appName || /报名工具/.test(parsed.appName))) {
      const hit = resolveBaomingMiniProgram(rawUrl, parsed.path)
      if (hit) return Object.assign({ rawUrl }, hit)
    }
    return { displayLink: rawUrl, openKind: 'mpSchemeText', webUrl: rawUrl, rawUrl }
  }

  if (/^\/pages\//.test(rawUrl)) {
    const path = rawUrl.replace(/^\//, '')
    const platformId = formRelayPlatforms.detectFormRelayPlatform(rawUrl)
    if (platformId === 'signup_tool' || path.indexOf('pages/detail/detail') === 0) {
      const hit = resolveBaomingMiniProgram(rawUrl, path)
      if (hit) return Object.assign({ rawUrl }, hit)
    }
    const appName =
      platformId === 'signup_tool'
        ? BAOMING_MP.appName
        : formRelayPlatforms.formRelayPlatformLabel(platformId) || '小程序'
    return {
      displayLink: mpSchemeDisplay(appName, path),
      openKind: 'mpSchemeText',
      webUrl: rawUrl,
      rawUrl,
    }
  }

  const platformId = String(platform || formRelayPlatforms.detectFormRelayPlatform(rawUrl) || '').trim()
  if (/baominggongju\.com/i.test(rawUrl) || platformId === 'signup_tool') {
    const eid = extractBaomingEid(rawUrl)
    if (eid) {
      const hit = resolveBaomingMiniProgram(
        rawUrl,
        `pages/detail/detail?eid=${encodeURIComponent(eid)}`,
      )
      if (hit) return Object.assign({ rawUrl }, hit)
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

function resolveFormRelayHttpsOpenUrl(link, fallbackUrl) {
  const open = link && typeof link === 'object' ? link : null
  const candidates = [
    open && open.webUrl,
    open && open.openKind === 'webView' ? open.displayLink : '',
    fallbackUrl,
    open && open.rawUrl,
  ]
  for (let i = 0; i < candidates.length; i++) {
    const url = String(candidates[i] || '').trim()
    if (/^https?:\/\//i.test(url)) return url
  }
  return ''
}

function copyLinkGuide(text, title, content) {
  wx.setClipboardData({
    data: text,
    success: () =>
      wx.showModal({
        title: title || '打开原表报名',
        content:
          content ||
          '原表链接已复制。请粘贴到微信聊天中点击打开；若已在小程序内，也可尝试配置业务域名后内嵌打开。',
        showCancel: false,
      }),
  })
}

function openHttpsFormUrl(webUrl, forceEmbed) {
  if (!/^https?:\/\//i.test(webUrl)) {
    if (webUrl) copyLinkGuide(webUrl)
    return
  }
  if (isBaomingGongjuHost(webUrl)) {
    copyLinkGuide(
      webUrl,
      '打开原表报名',
      '报名工具须跳转对应小程序打开，链接已复制。请粘贴到微信聊天中点击，或联系管理员配置小程序跳转白名单。',
    )
    return
  }
  const embed = forceEmbed === true || shouldTryFormRelayWebView(webUrl)
  wx.navigateTo({
    url: `/pages/web-link/web-link?url=${encodeURIComponent(webUrl)}&embed=${embed ? '1' : '0'}&relay=1`,
    fail: () => copyLinkGuide(webUrl),
  })
}

function openFormRelaySourceLink(link, fallbackUrl) {
  const open = link && typeof link === 'object' ? link : null
  const httpsUrl = resolveFormRelayHttpsOpenUrl(open, fallbackUrl)

  function fallbackWeb(fromMiniProgramFail) {
    if (httpsUrl) {
      if (fromMiniProgramFail || isBaomingGongjuHost(httpsUrl)) {
        copyLinkGuide(
          httpsUrl,
          '打开原表报名',
          fromMiniProgramFail
            ? '未能跳转报名工具小程序，链接已复制。请粘贴到微信聊天中点击打开。'
            : '原表链接已复制。请粘贴到微信聊天中点击打开。',
        )
        return
      }
      openHttpsFormUrl(httpsUrl, true)
      return
    }
    const scheme = String((open && open.displayLink) || fallbackUrl || '').trim()
    if (scheme) copyLinkGuide(scheme, '原表小程序链接', '小程序链接已复制，请在微信聊天中粘贴打开。')
  }

  if (open && open.openKind === 'miniProgram' && open.appId && open.path) {
    wx.navigateToMiniProgram({
      appId: open.appId,
      path: open.path,
      envVersion: 'release',
      fail: () => fallbackWeb(true),
    })
    return
  }

  if (open && open.openKind === 'mpSchemeText') {
    const parsed = parseMpSchemeText(open.displayLink || open.rawUrl || fallbackUrl || '')
    if (parsed && (parsed.appName === BAOMING_MP.appName || /报名工具/.test(parsed.appName))) {
      const hit = resolveBaomingMiniProgram(open.rawUrl || fallbackUrl || '', parsed.path)
      if (hit && hit.appId && hit.path) {
        wx.navigateToMiniProgram({
          appId: hit.appId,
          path: hit.path,
          envVersion: 'release',
          fail: () => fallbackWeb(true),
        })
        return
      }
    }
    fallbackWeb(false)
    return
  }

  if (open && open.openKind === 'webView' && httpsUrl) {
    openHttpsFormUrl(httpsUrl, true)
    return
  }

  fallbackWeb(false)
}

module.exports = {
  resolveFormRelaySourceMpLink,
  pickFormRelaySourceMpCache,
  openFormRelaySourceLink,
  shouldTryFormRelayWebView,
  resolveFormRelayHttpsOpenUrl,
}
