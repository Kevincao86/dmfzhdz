/** 与商家版 merchantErpApiBase 一致：/erp-api 反代到 ECS /api/ */
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
    let out = u.toString().replace(/\/$/, '')
    // 误配 VITE_MP_API_BASE=.../erp-api/api 会导致请求 /erp-api/api/meoo-*
    out = out.replace(/\/erp-api\/api$/i, '/erp-api')
    return out
  } catch {
    return ''
  }
}

export function mpErpApiBase(): string {
  const fromEnv = normalizeErpApiBase(
    (import.meta.env.VITE_MP_API_BASE as string | undefined) ?? '',
  )
  if (fromEnv) return fromEnv
  if (import.meta.env.PROD) return 'https://mofangdianai.com/erp-api'
  return ''
}

/** /api/foo → https://host/erp-api/foo（勿重复 /api） */
export function buildMpErpApiUrl(base: string, apiPath: string): string {
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

export function mpApiFetchCandidates(apiPath: string, opts?: { includeVercelSms?: boolean }): string[] {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }

  const base = mpErpApiBase()
  if (base) add(buildMpErpApiUrl(base, path))

  if (opts?.includeVercelSms && path === '/api/meoo-auth-sms-send') {
    add(`https://mofangdianai.com${path}`)
  }

  if (typeof window !== 'undefined') {
    add(`${window.location.origin}${path}`)
  } else if (!base) {
    add(path)
  }

  return urls
}
