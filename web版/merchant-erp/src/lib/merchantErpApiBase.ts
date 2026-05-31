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
    return u.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function merchantErpApiBase(): string {
  const fromEnv = normalizeErpApiBase(
    (import.meta.env.VITE_ERP_AUTH_API_BASE as string | undefined) ??
      (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ??
      '',
  )
  if (fromEnv) return fromEnv
  if (import.meta.env.PROD) return 'https://mofangdianai.com/erp-api'
  return ''
}

export function buildMerchantErpApiUrl(base: string, apiPath: string): string {
  const b = base.replace(/\/$/, '')
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  const rel = path.replace(/^\/api\//, '')
  return `${b}/${rel}`
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
    add(`${window.location.origin}${path}`)
  } else if (!base) {
    add(path)
  }

  return urls
}
