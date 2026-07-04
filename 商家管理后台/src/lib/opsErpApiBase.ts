/**
 * 运营管控台访问 ECS 反代 /erp-api（Vercel 服务端无法出站访问 ECS 时，由浏览器直连）。
 */
export function normalizeOpsErpApiBase(raw: string): string {
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
    return u.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

/** 构建时 env 或生产默认 https://mofangdianai.com/erp-api */
export function opsErpApiBase(): string {
  const fromEnv = normalizeOpsErpApiBase(
    (import.meta.env.VITE_MEEO_SUPPORT_OPS_API_BASE as string | undefined) ??
      (import.meta.env.VITE_MEEO_OPS_API_BASE as string | undefined) ??
      '',
  )
  if (fromEnv) return fromEnv
  if (import.meta.env.PROD) return 'https://mofangdianai.com/erp-api'
  return ''
}

/** /api/meoo-* → https://mofangdianai.com/erp-api/meoo-*；无 base 时返回同源 path */
export function opsErpApiUrl(apiPath: string): string {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const base = opsErpApiBase()
  if (!base) {
    if (typeof window !== 'undefined') return `${window.location.origin}${path}`
    return path
  }
  const rel = path.replace(/^\/api\//, '').replace(/^\//, '')
  return `${base.replace(/\/$/, '')}/${rel}`
}

/** 注册表读写 URL 列表：生产优先直连 erp-api，其次同源 307 跳转 */
export function opsRegistryApiUrls(apiPath: string): string[] {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const urls: string[] = []
  const erp = opsErpApiUrl(path)
  if (erp) urls.push(erp)
  if (typeof window !== 'undefined') {
    urls.push(`${window.location.origin}${path}`)
  }
  return [...new Set(urls.filter(Boolean))]
}

export function opsErpApiCandidates(apiPath: string): string[] {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  const base = opsErpApiBase()
  if (base) add(opsErpApiUrl(path))
  if (typeof window !== 'undefined') {
    add(`${window.location.origin}${path}`)
  } else if (!base) {
    add(path)
  }
  return urls
}

/** 优先 ECS erp-api，失败再回退运营台同源 /api（注册表等同源会 307 至 erp-api） */
export type FetchOpsErpApiOptions = {
  /** 在线客服 relay 仅走 ECS erp-api，禁止回退 Vercel /api（避免写入云端 Supabase） */
  ecsOnly?: boolean
}

export async function fetchOpsErpApi(
  apiPath: string,
  init?: RequestInit,
  options?: FetchOpsErpApiOptions,
): Promise<Response> {
  const registryLike =
    apiPath.includes('ops-sync') ||
    apiPath.includes('meoo-ops-sync-registry') ||
    apiPath.includes('meoo-ops-mp-recruitment-orders-list') ||
    apiPath.includes('meoo-ops-mp-announcement') ||
    apiPath.includes('meoo-ops-registry-tenant-delete') ||
    apiPath.includes('tenants/delete') ||
    apiPath.includes('vendor-keys') ||
    apiPath.includes('video-ai')
  const supportRelayLike =
    options?.ecsOnly ||
    apiPath.includes('support-poll') ||
    apiPath.includes('support-ops-send') ||
    apiPath.includes('meoo-ops-staff-')
  const candidates = supportRelayLike
    ? [opsErpApiUrl(apiPath), ...(typeof window !== 'undefined' && !opsErpApiBase() ? [`${window.location.origin}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`] : [])].filter(Boolean)
    : registryLike
      ? opsRegistryApiUrls(apiPath)
      : opsErpApiCandidates(apiPath)
  let last: unknown
  for (let i = 0; i < candidates.length; i++) {
    try {
      const res = await fetch(candidates[i]!, { ...init, cache: 'no-store' })
      const retry =
        !res.ok &&
        (res.status >= 502 || res.status === 0) &&
        i < candidates.length - 1
      if (!retry) return res
    } catch (e) {
      last = e
      if (i < candidates.length - 1) continue
      const hint = registryLike
        ? `（已尝试 ${candidates.join(' → ')}；请确认 ECS auth-api 与 https://mofangdianai.com/erp-api 可访问）`
        : ''
      throw new Error(`${e instanceof Error ? e.message : String(e)}${hint}`)
    }
  }
  throw last instanceof Error ? last : new Error('fetch failed')
}
