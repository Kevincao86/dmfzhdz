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

function parseMpSchemeText(raw: string): { appName: string; path: string } | null {
  const m = String(raw || '').trim().match(/^#小程序:\/\/([^/]+)\/(.+)$/i)
  if (!m) return null
  return { appName: m[1].trim(), path: m[2].trim() }
}

function mpSchemeDisplay(appName: string, path: string): string {
  return `#小程序://${appName}/${path.replace(/^\//, '')}`
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
    if (parsed?.appName === BAOMING_MP.appName && parsed.path) {
      const eid = extractBaomingEid(`https://p.baominggongju.com/share?eid=${parsed.path.split('eid=')[1] || ''}`)
      const path =
        parsed.path.startsWith('pages/') ? parsed.path : eid ? `pages/detail/detail?eid=${encodeURIComponent(eid)}` : parsed.path
      if (path.startsWith('pages/')) {
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
    const platformId = detectFormRelayPlatform(rawUrl)
    const appName =
      platformId === 'signup_tool' ? BAOMING_MP.appName : formRelayPlatformLabel(platformId) || '小程序'
    return {
      displayLink: mpSchemeDisplay(appName, path),
      openKind: path.startsWith('pages/') && appName === BAOMING_MP.appName ? 'miniProgram' : 'mpSchemeText',
      appId: appName === BAOMING_MP.appName ? BAOMING_MP.appId : undefined,
      path: path.startsWith('pages/') ? path : undefined,
      webUrl: rawUrl,
      rawUrl,
    }
  }

  const platformId = String(platform || detectFormRelayPlatform(rawUrl) || '').trim()
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

export function pickFormRelaySourceMpCache(relay: Record<string, unknown> | null | undefined) {
  if (!relay || typeof relay !== 'object') return undefined
  return {
    sourceMpDisplayLink: String(relay.sourceMpDisplayLink || '').trim() || undefined,
    sourceMpAppId: String(relay.sourceMpAppId || '').trim() || undefined,
    sourceMpPath: String(relay.sourceMpPath || '').trim() || undefined,
  }
}
