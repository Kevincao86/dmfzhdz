/** dr 履约 Web 营销静态资源：优先 OSS（web-static/dr + 兼容 dr-landing/），404 时回退本地 */
import {
  drStaticUrl,
  webStaticCandidates,
  WEB_STATIC_ASSET_VER,
} from '@merchant/lib/webStaticOssAssets'

export { WEB_STATIC_ASSET_VER as DR_LANDING_ASSET_VER }

function normalizeLandingFile(filename: string): string {
  return String(filename || '')
    .replace(/^\/+/, '')
    .replace(/^landing\//, '')
}

export function drLandingAssetLocalUrl(filename: string): string {
  const rel = normalizeLandingFile(filename)
  if (!rel) return ''
  if (rel === 'login-hero.png') return '/login-hero.png'
  return `/landing/${rel}`
}

/** @deprecated 请用 drLandingAssetCandidates */
export function drLandingAssetOssUrl(filename: string): string {
  return drStaticUrl(drLandingAssetLocalUrl(filename))
}

export function drLandingAssetCandidates(filename: string): string[] {
  return webStaticCandidates('dr', drLandingAssetLocalUrl(filename))
}

/** @deprecated 请用 drLandingAssetCandidates + LandingOssImage */
export function drLandingAssetUrl(filename: string): string {
  return drLandingAssetOssUrl(filename)
}

export const DR_LANDING_OSS_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/dr-landing'
