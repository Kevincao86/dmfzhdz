/** dr 履约 Web 营销静态资源：优先 OSS，404 时回退 dr 本地（原图/原视频） */
export const DR_LANDING_OSS_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/dr-landing'

/** 重新上传 OSS 后 bump，避免浏览器长期缓存旧路径 */
export const DR_LANDING_ASSET_VER = '20260628a'

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

export function drLandingAssetOssUrl(filename: string): string {
  const rel = normalizeLandingFile(filename)
  if (!rel) return ''
  const base = DR_LANDING_OSS_BASE.replace(/\/$/, '')
  return `${base}/${rel}?v=${DR_LANDING_ASSET_VER}`
}

/** OSS 优先，本地 dr 为兜底（OSS 未上传时仍可显示） */
export function drLandingAssetCandidates(filename: string): string[] {
  const oss = drLandingAssetOssUrl(filename)
  const local = drLandingAssetLocalUrl(filename)
  if (!oss) return local ? [local] : []
  if (!local || oss === local) return [oss]
  return [oss, local]
}

/** @deprecated 请用 drLandingAssetCandidates + LandingOssImage */
export function drLandingAssetUrl(filename: string): string {
  return drLandingAssetOssUrl(filename)
}
