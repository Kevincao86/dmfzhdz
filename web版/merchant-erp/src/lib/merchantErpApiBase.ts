/**
 * 商户 ERP 浏览器直连 ECS /erp-api（与 tenantRegisterApi、运营台 opsErpApiBase 一致）。
 * 智能体 / 注册等应优先走此基址，避免 Vercel Serverless 连不上自建 Supabase。
 */
function normalizeErpApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/api\.mofangdianai\.com/i.test(trimmed)) {
    return 'https://mofangdianai.com/erp-api'
  }
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (u.hostname === 'api.mofangdianai.com') {
      return 'https://mofangdianai.com/erp-api'
    }
    if (u.hostname === 'mofangdianai.com' && !u.pathname.startsWith('/erp-api')) {
      const tail = u.pathname === '/' ? '' : u.pathname
      u.pathname = `/erp-api${tail}`
    }
    return u.toString().replace(/\/$/, '').replace(/\/erp-api\/api$/i, '/erp-api')
  } catch {
    return ''
  }
}

export function merchantErpApiBase(): string {
  // cs / fws 静态站：API 固定走轻量 erp-api，避免同源 /api 双跳 pending
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (ECS_ERP_API_HOSTS.has(host)) {
      return 'https://mofangdianai.com/erp-api'
    }
  }
  const fromEnv = normalizeErpApiBase(
    (import.meta.env.VITE_ERP_AUTH_API_BASE as string | undefined) ??
      (import.meta.env.VITE_MP_API_BASE as string | undefined) ??
      (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ??
      '',
  )
  if (fromEnv) return fromEnv
  if (import.meta.env.PROD) return 'https://mofangdianai.com/erp-api'
  return ''
}

export function buildMerchantErpApiUrl(base: string, apiPath: string): string {
  const b = base.replace(/\/$/, '')
  let path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  let query = ''
  const qIdx = path.indexOf('?')
  if (qIdx >= 0) {
    query = path.slice(qIdx)
    path = path.slice(0, qIdx)
  }
  const rel = path.replace(/^\/api\//, '')
  return `${b}/${rel}${query}`
}

/** 同一 API 路径：erp-api 优先，再同源 Vercel（保留 ?query） */
export function merchantApiFetchUrls(apiPathWithOptionalQuery: string): string[] {
  return merchantErpApiCandidates(apiPathWithOptionalQuery)
}

const ECS_ERP_API_HOSTS = new Set(['cs.mofangdianai.com', 'fws.mofangdianai.com'])

/** ECS 静态站（cs / fws / dr）：优先同源 /api/（Nginx → 轻量），再 erp-api */
const ECS_WEB_HOSTS = new Set(['cs.mofangdianai.com', 'fws.mofangdianai.com', 'dr.mofangdianai.com'])

export function publicPortalApiFetchUrls(apiPathWithOptionalQuery: string): string[] {
  const path = apiPathWithOptionalQuery.startsWith('/')
    ? apiPathWithOptionalQuery
    : `/${apiPathWithOptionalQuery}`
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (ECS_WEB_HOSTS.has(host)) {
      add(`${window.location.origin}${path}`)
    }
  }
  for (const u of merchantErpApiCandidates(path)) {
    add(u)
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (!ECS_WEB_HOSTS.has(host)) {
      add(`${window.location.origin}${path}`)
    }
  } else if (!merchantErpApiBase()) {
    add(path)
  }
  return urls
}

export async function fetchPublicPortalJson<T extends { ok?: boolean; error?: string }>(
  apiPathWithOptionalQuery: string,
): Promise<T> {
  const urls = publicPortalApiFetchUrls(apiPathWithOptionalQuery)
  let lastErr = 'fetch_failed'
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]!, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as T
      if (res.ok && data.ok === true) return data
      lastErr = String(data.error || `http_${res.status}`)
      const retry =
        (res.status === 404 || lastErr === 'not_found' || res.status >= 502) && i < urls.length - 1
      if (retry) continue
      break
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < urls.length - 1) continue
    }
  }
  throw new Error(lastErr)
}

/**
 * 二进制下载（云剪 MP4 等）：ECS 静态站优先走同源 /api/（Nginx → 轻量 IP，避免跨域 erp-api 二进制 500）。
 * JSON API 仍用 merchantApiFetchUrls / merchantErpApiCandidates。
 */
export function merchantBinaryApiFetchUrls(apiPathWithOptionalQuery: string): string[] {
  const path = apiPathWithOptionalQuery.startsWith('/')
    ? apiPathWithOptionalQuery
    : `/${apiPathWithOptionalQuery}`
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (ECS_WEB_HOSTS.has(host)) {
      add(`${window.location.origin}${path}`)
    }
  }
  for (const u of merchantErpApiCandidates(path)) {
    add(u)
  }
  return urls
}

/** 生产默认 erp-api 优先，再同源 Vercel（避免 tenant_not_found / 密钥未合并） */
export function merchantErpApiCandidates(apiPath: string): string[] {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }

  const base = merchantErpApiBase()
  if (base) add(buildMerchantErpApiUrl(base, path))

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    // cs / fws 仅 erp-api 单跳；其它环境保留同源 fallback
    if (!ECS_ERP_API_HOSTS.has(host)) {
      add(`${window.location.origin}${path}`)
    }
  } else if (!base) {
    add(path)
  }

  return urls
}
