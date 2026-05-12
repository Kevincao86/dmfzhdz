/**
 * 抖音开放平台 HTTP 基址（仅服务端 / Vite 网关；勿暴露给浏览器 bundle）。
 * 未设置时为 https://open.douyin.com。
 * 可设为经自建 Nginx 反代到 open.douyin.com 的根路径，例如 `http://60.204.205.114/douyin`（勿以 / 结尾）。
 * Vercel：Settings → Environment Variables → `DOUYIN_OPENAPI_BASE_URL`
 */
const DEFAULT_BASE = 'https://open.douyin.com'

function normalizedBase(): string {
  const raw = process.env.DOUYIN_OPENAPI_BASE_URL?.trim()
  if (!raw) return DEFAULT_BASE
  return raw.replace(/\/+$/, '')
}

export function douyinOpenApiBaseUrl(): string {
  return normalizedBase()
}

/** @param path 以 / 开头的开放平台路径，如 `/oauth/client_token/` */
export function douyinOpenApiUrl(path: string): string {
  const base = normalizedBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
