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
  appId: 'wxfaa08012777a431e',
  appName: '报名工具',
}
const BAOMING_MP_APPID_LEGACY = 'wx8b6c33d344f46d19'

/** 群报数小程序（s.qun100.com 分享链经 launchApp 跳转） */
export const QUNBAOSHU_MP = {
  appId: 'wxfc4ef6d539d03373',
  appName: '群报数',
}

const MOBILE_UA_QUN100 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export function isQunbaoshuUrl(url: string): boolean {
  return /qun100\.com/i.test(String(url || '').trim())
}

export function extractQunbaoshuAddressFromLaunchUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://www.qun100.com${raw.startsWith('/') ? raw : `/${raw}`}`)
    const address = String(u.searchParams.get('address') || '').trim()
    if (address) return decodeURIComponent(address).replace(/^\//, '')
  } catch {
    const m = raw.match(/[?&]address=([^&]+)/i)
    if (m?.[1]) return decodeURIComponent(m[1]).replace(/^\//, '').trim()
  }
  return ''
}

function qunbaoshuMiniLink(path: string): Pick<FormRelaySourceMpLink, 'displayLink' | 'openKind' | 'appId' | 'path' | 'webUrl'> {
  const normalized = String(path || '').trim().replace(/^\//, '')
  return {
    displayLink: mpSchemeDisplay(QUNBAOSHU_MP.appName, normalized),
    openKind: 'miniProgram',
    appId: QUNBAOSHU_MP.appId,
    path: normalized,
    webUrl: '',
  }
}

export function resolveQunbaoshuMiniProgramSync(rawUrl: string): FormRelaySourceMpLink | null {
  const raw = String(rawUrl || '').trim()
  if (!raw) return null
  const address = extractQunbaoshuAddressFromLaunchUrl(raw)
  if (address) {
    return { ...qunbaoshuMiniLink(address), webUrl: /^https?:\/\//i.test(raw) ? raw : '', rawUrl: raw }
  }
  return null
}

/** 跟随 qun100 短链重定向，解析 launchApp address → 小程序 path */
export async function resolveQunbaoshuLinkRedirect(
  url: string,
  fetchMs = 18_000,
): Promise<Pick<FormRelaySourceMpLink, 'displayLink' | 'openKind' | 'appId' | 'path'> | null> {
  const raw = String(url || '').trim()
  if (!raw) return null
  const sync = resolveQunbaoshuMiniProgramSync(raw)
  if (sync?.path) {
    return {
      displayLink: sync.displayLink,
      openKind: 'miniProgram',
      appId: sync.appId!,
      path: sync.path,
    }
  }
  if (!isQunbaoshuUrl(raw) || !/^https?:\/\//i.test(raw)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), fetchMs)
  try {
    const res = await fetch(raw, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': MOBILE_UA_QUN100, Accept: 'text/html,*/*' },
    })
    let loc = String(res.headers.get('location') || '').trim()
    if (loc && !/^https?:\/\//i.test(loc)) {
      loc = new URL(loc, raw).toString()
    }
    const address = extractQunbaoshuAddressFromLaunchUrl(loc)
    if (!address) return null
    return qunbaoshuMiniLink(address)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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

function buildBaomingMiniPath(rawUrl: string, pathHint?: string): string {
  const fromHint = normalizeBaomingMiniPath(pathHint || '')
  if (fromHint) return fromHint
  const eid = extractBaomingEid(rawUrl)
  return eid ? `pages/detail/detail?eid=${encodeURIComponent(eid)}` : ''
}

function resolveBaomingMiniProgram(
  rawUrl: string,
  pathHint?: string,
): Pick<FormRelaySourceMpLink, 'displayLink' | 'openKind' | 'appId' | 'path' | 'webUrl'> | null {
  const path = buildBaomingMiniPath(rawUrl, pathHint)
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
      if (hit) return { ...hit, rawUrl }
    }
    if (parsed && (parsed.appName === QUNBAOSHU_MP.appName || /群报数/.test(parsed.appName))) {
      const path = String(parsed.path || '').trim().replace(/^\//, '')
      if (path) return { ...qunbaoshuMiniLink(path), webUrl: rawUrl, rawUrl }
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

  if (platformId === 'qunbaoshu' || isQunbaoshuUrl(rawUrl)) {
    const qHit = resolveQunbaoshuMiniProgramSync(rawUrl)
    if (qHit) return qHit
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
