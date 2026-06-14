/**
 * 转发工具原表链接 → 小程序展示/跳转（小程序端优先打开对应小程序）
 */
import { detectFormRelayPlatform, formRelayPlatformLabel } from './formRelayPlatforms.js'

export type FormRelaySourceMpLink = {
  displayLink: string
  openKind: 'miniProgram' | 'webView' | 'mpSchemeText' | 'copy'
  appId?: string
  path?: string
  webUrl: string
  rawUrl: string
}

const BAOMING_MP = {
  appId: 'wx8b6c33d344f46d19',
  appName: '报名工具',
}

/** 可在小程序 web-view 内嵌尝试打开的转发原表域名（须在小程序后台配置业务域名） */
const FORM_RELAY_EMBED_HOST_PATTERNS = [
  /(?:^|\.)mofangdianai\.com$/i,
  /(?:^|\.)baominggongju\.com$/i,
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

function hostFromUrl(url: string): string {
  try {
    return String(new URL(String(url || '').trim()).hostname || '').toLowerCase()
  } catch {
    return ''
  }
}

export function shouldTryFormRelayWebView(url: string): boolean {
  const host = hostFromUrl(url)
  if (!host) return false
  return FORM_RELAY_EMBED_HOST_PATTERNS.some((re) => re.test(host))
}

function extractBaomingEid(url: string): string {
  const raw = String(url || '').trim()
  try {
    const u = new URL(raw)
    return String(u.searchParams.get('eid') || '').trim()
  } catch {
    const m = raw.match(/[?&]eid=([^&]+)/i)
    return m?.[1] ? decodeURIComponent(m[1]).trim() : ''
  }
}

function normalizeBaomingMiniPath(rawPath: string): string {
  const path = String(rawPath || '').trim().replace(/^\//, '')
  if (!path) return ''
  if (path.startsWith('pages/')) return path
  const eid = extractBaomingEid(path.includes('eid=') ? `https://x/?${path.split('?')[1] || ''}` : path)
  if (eid) return `pages/detail/detail?eid=${encodeURIComponent(eid)}`
  return ''
}

function parseMpSchemeText(raw: string): { appName: string; path: string } | null {
  const m = String(raw || '').trim().match(/^#小程序:\/\/([^/]+)\/(.+)$/i)
  if (!m) return null
  return { appName: m[1].trim(), path: m[2].trim() }
}

function mpSchemeDisplay(appName: string, path: string): string {
  return `#小程序://${appName}/${path.replace(/^\//, '')}`
}

function resolveBaomingMiniProgram(
  rawUrl: string,
  pathHint?: string,
): Pick<FormRelaySourceMpLink, 'displayLink' | 'openKind' | 'appId' | 'path' | 'webUrl'> | null {
  const path = normalizeBaomingMiniPath(pathHint || '')
  if (!path) return null
  const webUrl = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : (() => {
        const eid = extractBaomingEid(path.includes('eid=') ? `https://x/?${path.split('?')[1] || ''}` : rawUrl)
        return eid ? `https://p.baominggongju.com/share?eid=${encodeURIComponent(eid)}` : rawUrl
      })()
  return {
    displayLink: mpSchemeDisplay(BAOMING_MP.appName, path),
    openKind: 'miniProgram',
    appId: BAOMING_MP.appId,
    path,
    webUrl,
  }
}

export function resolveFormRelaySourceMpLink(
  sourceUrl: string,
  platform?: string,
  cached?: { sourceMpDisplayLink?: string; sourceMpAppId?: string; sourceMpPath?: string },
): FormRelaySourceMpLink {
  const rawUrl = String(sourceUrl || '').trim()
  if (!rawUrl) {
    return { displayLink: '', openKind: 'copy', webUrl: '', rawUrl: '' }
  }

  if (cached?.sourceMpDisplayLink && cached.sourceMpAppId && cached.sourceMpPath) {
    const webUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : cached.sourceMpDisplayLink
    return {
      displayLink: String(cached.sourceMpDisplayLink),
      openKind: 'miniProgram',
      appId: String(cached.sourceMpAppId),
      path: String(cached.sourceMpPath),
      webUrl,
      rawUrl,
    }
  }

  if (/^#小程序:\/\//.test(rawUrl)) {
    const parsed = parseMpSchemeText(rawUrl)
    if (parsed && (parsed.appName === BAOMING_MP.appName || /报名工具/.test(parsed.appName))) {
      const hit = resolveBaomingMiniProgram(rawUrl, parsed.path)
      if (hit) return { ...hit, rawUrl }
    }
    return { displayLink: rawUrl, openKind: 'mpSchemeText', webUrl: rawUrl, rawUrl }
  }

  if (/^\/pages\//.test(rawUrl)) {
    const path = rawUrl.replace(/^\//, '')
    const platformId = detectFormRelayPlatform(rawUrl)
    if (platformId === 'signup_tool' || path.startsWith('pages/detail/detail')) {
      const hit = resolveBaomingMiniProgram(rawUrl, path)
      if (hit) return { ...hit, rawUrl }
    }
    const appName =
      platformId === 'signup_tool' ? BAOMING_MP.appName : formRelayPlatformLabel(platformId) || '小程序'
    return {
      displayLink: mpSchemeDisplay(appName, path),
      openKind: 'mpSchemeText',
      webUrl: rawUrl,
      rawUrl,
    }
  }

  const platformId = String(platform || detectFormRelayPlatform(rawUrl) || '').trim()
  if (/baominggongju\.com/i.test(rawUrl) || platformId === 'signup_tool') {
    const eid = extractBaomingEid(rawUrl)
    if (eid) {
      const hit = resolveBaomingMiniProgram(rawUrl, `pages/detail/detail?eid=${encodeURIComponent(eid)}`)
      if (hit) return { ...hit, rawUrl }
    }
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return { displayLink: rawUrl, openKind: 'webView', webUrl: rawUrl, rawUrl }
  }

  return { displayLink: rawUrl, openKind: 'copy', webUrl: rawUrl, rawUrl }
}

export function pickFormRelaySourceMpCache(relay: Record<string, unknown> | null | undefined) {
  if (!relay || typeof relay !== 'object') return undefined
  return {
    sourceMpDisplayLink: String(relay.sourceMpDisplayLink || '').trim() || undefined,
    sourceMpAppId: String(relay.sourceMpAppId || '').trim() || undefined,
    sourceMpPath: String(relay.sourceMpPath || '').trim() || undefined,
  }
}

export function resolveFormRelayHttpsOpenUrl(
  link: FormRelaySourceMpLink | null | undefined,
  fallbackUrl?: string,
): string {
  const open = link && typeof link === 'object' ? link : null
  const candidates = [
    open?.webUrl,
    open?.openKind === 'webView' ? open.displayLink : '',
    fallbackUrl,
    open?.rawUrl,
  ]
  for (const raw of candidates) {
    const url = String(raw || '').trim()
    if (/^https?:\/\//i.test(url)) return url
  }
  return ''
}

type BrowserShell = {
  open?: (url: string, target: string, features: string) => unknown
  location?: { assign: (url: string) => void }
  alert?: (message?: string) => void
}

function browserShell(): { window?: BrowserShell; navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } } | null {
  const g = globalThis as {
    window?: BrowserShell
    navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } }
  }
  return typeof g.window !== 'undefined' ? g : null
}

/** Web / H5 端打开原表链接 */
export function openFormRelaySourceLinkWeb(
  link: FormRelaySourceMpLink | null | undefined,
  fallbackUrl?: string,
): boolean {
  const browser = browserShell()
  const w = browser?.window
  if (!w) return false

  const httpsUrl = resolveFormRelayHttpsOpenUrl(link, fallbackUrl)
  if (httpsUrl) {
    const opened = w.open?.(httpsUrl, '_blank', 'noopener,noreferrer')
    if (!opened) w.location?.assign(httpsUrl)
    return true
  }
  const scheme = String(link?.displayLink || link?.rawUrl || fallbackUrl || '').trim()
  if (link?.openKind === 'mpSchemeText' && scheme) {
    const clip = browser?.navigator?.clipboard
    if (clip?.writeText) {
      void clip.writeText(scheme).then(
        () => w.alert?.('原表为微信小程序链接，已复制。请在微信聊天中粘贴并打开。'),
        () => w.alert?.(`请复制原表小程序链接：\n${scheme}`),
      )
    } else {
      w.alert?.(`请复制原表小程序链接：\n${scheme}`)
    }
    return true
  }
  if (scheme) {
    w.alert?.(`当前环境无法直接打开原表，请复制链接到微信中打开：\n${scheme}`)
    return false
  }
  return false
}
