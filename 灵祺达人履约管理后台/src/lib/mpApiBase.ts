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

/** 单路径 API URL（优先 erp-api 反代） */
export function apiUrl(apiPath: string): string {
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const base = mpErpApiBase()
  if (base) return buildMpErpApiUrl(base, path)
  return path
}

export function mpErpApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    // dr 履约站：优先同源 /erp-api（Nginx 反代轻量），避免跨域直连主域卡住
    if (/^dr\./i.test(host)) {
      return `${window.location.origin}/erp-api`
    }
    // 本地 dev（127.0.0.1:5176）：走 Vite 反代 /erp-api → 线上轻量
    if (
      import.meta.env.DEV &&
      (host === '127.0.0.1' || host === 'localhost')
    ) {
      return `${window.location.origin}/erp-api`
    }
  }
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

  // 验证码发送与注册核验走同一 erp-api 网关，避免 Vercel/ECS 双通道导致 sms_code_invalid

  if (typeof window !== 'undefined') {
    add(`${window.location.origin}${path}`)
  } else if (!base) {
    add(path)
  }

  return urls
}
