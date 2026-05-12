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

/** 解析抖音 JSON 响应（去 BOM）；失败时返回 {}，与其它接口容错一致 */
export function parseDouyinJson(raw: string): Record<string, unknown> {
  const s = (raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!s) return {}
  try {
    const v = JSON.parse(s) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  return v as Record<string, unknown>
}

/**
 * 从 client_token 接口 JSON 中取凭证（兼容 data 嵌套、data 为 JSON 字符串、client_access_token 等别名）。
 * 文档示例：data.access_token；部分网关/版本字段可能略有差异。
 */
export function extractClientTokenPayload(j: Record<string, unknown>): { token: string; expiresIn: number } | null {
  const tryRec = (rec: Record<string, unknown> | undefined): { token: string; expiresIn: number } | null => {
    if (!rec) return null
    for (const k of ['access_token', 'client_access_token', 'token'] as const) {
      const t = rec[k]
      if (typeof t === 'string' && t.trim()) {
        const ei = Number(rec.expires_in ?? 7200)
        return { token: t.trim(), expiresIn: Number.isFinite(ei) && ei > 0 ? ei : 7200 }
      }
    }
    return null
  }

  let hit = tryRec(asRecord(j))
  if (hit) return hit

  const d0 = asRecord(j.data)
  if (d0) {
    hit = tryRec(d0)
    if (hit) return hit
    hit = tryRec(asRecord(d0.data))
    if (hit) return hit
  }

  if (typeof j.data === 'string' && j.data.trim()) {
    try {
      const p = JSON.parse(j.data) as unknown
      const pr = asRecord(p)
      hit = tryRec(pr)
      if (hit) return hit
      if (pr) {
        hit = tryRec(asRecord(pr.data))
        if (hit) return hit
      }
    } catch {
      return null
    }
  }

  hit = tryRec(asRecord(j.result))
  if (hit) return hit

  return null
}
