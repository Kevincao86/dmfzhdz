/** dr 履约 Web 营销静态资源 OSS 前缀（原图/原视频，bash scripts/upload-dr-landing-assets-oss.js） */
export const DR_LANDING_OSS_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/dr-landing'

/** 重新上传 OSS 后 bump，避免浏览器长期缓存旧路径 */
export const DR_LANDING_ASSET_VER = '20260628a'

export function drLandingAssetUrl(filename: string): string {
  const rel = String(filename || '')
    .replace(/^\/+/, '')
    .replace(/^landing\//, '')
  if (!rel) return ''
  const base = DR_LANDING_OSS_BASE.replace(/\/$/, '')
  return `${base}/${rel}?v=${DR_LANDING_ASSET_VER}`
}
