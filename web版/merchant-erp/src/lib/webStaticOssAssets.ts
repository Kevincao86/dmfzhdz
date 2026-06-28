/**
 * Web 静态资源 OSS（cs / fws / dr）：优先 OSS，失败回退同源 local public 路径
 * 上传：bash scripts/ecs-upload-web-static-oss.sh
 */
export const WEB_STATIC_OSS_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/web-static'

/** 与 mp-recruit-covers 根路径对齐（封面库 / 海报，小程序同源） */
export const RECRUIT_COVER_OSS_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers'

export const RECRUIT_COVER_CDN_BASE = 'https://mofangdianai.com/recruit-covers'

/** dr 营销 landing 历史前缀（兼容已上传 dr-landing/） */
export const DR_LANDING_LEGACY_OSS_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/dr-landing'

export const WEB_STATIC_ASSET_VER = '20260628b'

export type WebStaticApp = 'dr' | 'merchant'

export function webStaticLocalPath(localPath: string): string {
  const p = String(localPath || '').trim()
  if (!p) return ''
  return p.startsWith('/') ? p : `/${p}`
}

function ossObjectKey(app: WebStaticApp, localPath: string): string {
  const rel = webStaticLocalPath(localPath).replace(/^\/+/, '')
  return `${app}/${rel}`
}

export function webStaticOssUrl(app: WebStaticApp, localPath: string): string {
  const key = ossObjectKey(app, localPath)
  if (!key || key === `${app}/`) return ''
  return `${WEB_STATIC_OSS_BASE}/${key}?v=${WEB_STATIC_ASSET_VER}`
}

export function drLandingLegacyOssUrl(localPath: string): string {
  const rel = webStaticLocalPath(localPath).replace(/^\/+/, '').replace(/^landing\//, '')
  if (!rel) return ''
  return `${DR_LANDING_LEGACY_OSS_BASE}/${rel}?v=${WEB_STATIC_ASSET_VER}`
}

export function webStaticCandidates(app: WebStaticApp, localPath: string): string[] {
  const local = webStaticLocalPath(localPath)
  const out: string[] = []
  const seen = new Set<string>()
  const add = (u: string) => {
    const s = String(u || '').trim()
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  add(webStaticOssUrl(app, localPath))
  if (app === 'dr' && /^\/landing\//.test(local)) {
    add(drLandingLegacyOssUrl(localPath))
  }
  add(local)
  return out
}

export function recruitCoverAssetCandidates(relativePath: string): string[] {
  const rel = String(relativePath || '')
    .replace(/^\/+/, '')
    .replace(/^recruit-covers\//, '')
  if (!rel) return []
  const out: string[] = []
  const seen = new Set<string>()
  const add = (u: string) => {
    const s = String(u || '').trim()
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  add(`${RECRUIT_COVER_OSS_BASE}/${rel}?v=${WEB_STATIC_ASSET_VER}`)
  add(`${RECRUIT_COVER_CDN_BASE}/${rel}?v=${WEB_STATIC_ASSET_VER}`)
  add(`/recruit-covers/${rel}`)
  return out
}

export function webAssetUrlWithOss(localPath: string, app: WebStaticApp = 'dr'): string {
  return webStaticCandidates(app, localPath)[0] || webStaticLocalPath(localPath)
}

export function merchantStaticUrl(localPath: string): string {
  return webAssetUrlWithOss(localPath, 'merchant')
}

export function drStaticUrl(localPath: string): string {
  return webAssetUrlWithOss(localPath, 'dr')
}
