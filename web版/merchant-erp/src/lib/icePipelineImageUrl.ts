/** 多图成片提交前校验（与 vite-plugins/aliyunOssIceParse 规则一致） */

const ICE_OSS_HTTPS_RE = /^https:\/\/[^/]+\.oss-[a-z0-9-]+\.aliyuncs\.com\/.+/i

function toBareOssHttps(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (/^([^.]+)\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(u.hostname)) {
      u.protocol = 'https:'
      u.search = ''
      u.hash = ''
      return u.toString()
    }
  } catch {
    /* ignore */
  }
  return trimmed.replace(/^http:\/\//i, 'https://')
}

function isIcePlaceholderExampleUrl(url: string): boolean {
  const raw = String(url || '').trim()
  if (!raw) return false
  if (/your-cdn\.com|example\.com|placeholder/i.test(raw)) return true
  if (/\/photo-0[1-9]\.jpe?g(?:\?|$)/i.test(raw)) return true
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase()
    if (host === 'bucket.oss-cn-shanghai.aliyuncs.com') return true
    if (/^bucket\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(host)) return true
  } catch {
    /* ignore */
  }
  return false
}

/** 返回 null 表示可用 */
export function validateIcePipelineImageUrl(url: string): string | null {
  const raw = String(url || '').trim()
  if (!raw) return '图片地址为空'
  if (isIcePlaceholderExampleUrl(raw)) {
    return '检测到页面示例占位链接（bucket.oss…/photo-01.jpg），请删除后点「本地上传」'
  }
  if (/localhost|127\.0\.0\.1|blob:/i.test(raw)) {
    return '图片须为公网 OSS 地址，请使用「本地上传」'
  }
  if (raw.includes('?') || /[?#].*signature/i.test(raw)) {
    return '勿使用带 ?Signature= 的签名链接，请重新本地上传'
  }
  if (!ICE_OSS_HTTPS_RE.test(toBareOssHttps(raw))) {
    return '须为阿里云 OSS 直链，请本地上传后提交（勿粘贴外链或示例 URL）'
  }
  return null
}

export function findInvalidIcePipelineImageUrl(urls: string[]): string | null {
  for (let i = 0; i < urls.length; i++) {
    const err = validateIcePipelineImageUrl(urls[i] ?? '')
    if (err) return `第 ${i + 1} 张：${err}`
  }
  return null
}

/** 视频/图片混剪素材 URL 校验（与服务端 sanitizeIcePipelineMediaUrl 一致） */
export function validateIceMixMaterialUrl(url: string): string | null {
  const raw = String(url || '').trim()
  if (!raw) return '素材地址为空'
  if (isIcePlaceholderExampleUrl(raw)) {
    return '检测到页面示例占位链接，请删除后点「本地上传」'
  }
  if (/localhost|127\.0\.0\.1|blob:/i.test(raw)) {
    return '请使用「本地上传」，勿使用本地预览地址'
  }
  if (raw.includes('?') || /[?#].*signature/i.test(raw)) {
    return '检测到签名链接，请删除该素材并重新本地上传'
  }
  if (raw.startsWith('oss://') || ICE_OSS_HTTPS_RE.test(toBareOssHttps(raw))) return null
  if (/^https?:\/\//i.test(raw)) return null
  return '素材地址无效'
}

export function sanitizeIceMixMaterialUrlForPipeline(url: string): string {
  return toBareOssHttps(String(url || '').trim())
}
