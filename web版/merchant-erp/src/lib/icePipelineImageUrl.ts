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

/** 返回 null 表示可用 */
export function validateIcePipelineImageUrl(url: string): string | null {
  const raw = String(url || '').trim()
  if (!raw) return '图片地址为空'
  if (/your-cdn\.com|example\.com|placeholder/i.test(raw)) {
    return '检测到示例占位链接，请删除后使用「本地上传」写入 OSS'
  }
  if (/^https:\/\/bucket\.oss-/i.test(raw) || /^https:\/\/(example|your|test)-bucket\.oss-/i.test(raw)) {
    return '检测到文档示例链接（bucket.oss-...），请使用「本地上传」写入真实 OSS'
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
