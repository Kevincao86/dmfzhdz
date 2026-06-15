/** 招募分享海报静态资源：Web Canvas 优先 CDN（CORS），OSS 备份 */
const POSTER_CDN_BASE = 'https://mofangdianai.com/recruit-covers/posters'
const POSTER_OSS_BASE = 'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/posters'
/** 改图后 bump，避免浏览器缓存旧 PNG */
export const POSTER_ASSET_CACHE_VER = '20260615e'

function withCacheBust(url: string): string {
  const u = String(url || '').trim()
  if (!/^https?:\/\//i.test(u)) return u
  if (/[?&]v=/.test(u)) return u
  return `${u}${u.includes('?') ? '&' : '?'}v=${POSTER_ASSET_CACHE_VER}`
}

export function posterAssetUrl(filename: string): string {
  const rel = String(filename || '').replace(/^\/+/, '')
  if (!rel) return ''
  return withCacheBust(`${POSTER_CDN_BASE}/${rel}`)
}

/** CDN 优先（Nginx 带 CORS），OSS 备份；避免 OSS 无 CORS 导致 Canvas 回退渐变色 */
export function posterAssetUrlCandidates(filename: string): string[] {
  const rel = String(filename || '').replace(/^\/+/, '')
  if (!rel) return []
  const out: string[] = []
  const seen = new Set<string>()
  const add = (base: string) => {
    const root = String(base || '').replace(/\/$/, '')
    if (!root) return
    const url = withCacheBust(`${root}/${rel}`)
    if (seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  add(POSTER_CDN_BASE)
  add(POSTER_OSS_BASE)
  return out
}

export function posterBackgroundCandidates(tmpl: {
  backgroundFile?: string
  backgroundUrl?: string
}): string[] {
  const file = String(tmpl.backgroundFile || '').trim()
  if (file) return posterAssetUrlCandidates(file)
  const url = String(tmpl.backgroundUrl || '').trim()
  return url ? [withCacheBust(url)] : []
}

export function posterQrFrameCandidates(tmpl: {
  qrFrameFile?: string
  qrFrameUrl?: string
}): string[] {
  const file = String(tmpl.qrFrameFile || '').trim()
  if (file) return posterAssetUrlCandidates(file)
  const url = String(tmpl.qrFrameUrl || '').trim()
  return url ? [withCacheBust(url)] : []
}
