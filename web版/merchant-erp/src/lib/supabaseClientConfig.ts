/** ECS 部署时由 dist/meoo-client-config.js 或 /api/meoo-erp-client-config 注入 */
export type MeooClientRuntimeConfig = {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

declare global {
  interface Window {
    __MEOO_CLIENT_CONFIG__?: MeooClientRuntimeConfig
  }
}

const ECS_HOSTS_WITH_SAME_ORIGIN_PROXY = new Set([
  'cs.mofangdianai.com',
  'fws.mofangdianai.com',
  'admin.mofangdianai.com',
  'dr.mofangdianai.com',
])

function readNodeProcessEnv(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined
  if (key === 'VITE_SUPABASE_URL') {
    const fromProcess = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim()
    return fromProcess || undefined
  }
  const fromProcess = (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim()
  return fromProcess || undefined
}

function readViteClientEnv(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
    const fromMeta = meta.env?.[key]
    if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim()
  } catch {
    /* Node / tsx 无 Vite 注入 */
  }
  return readNodeProcessEnv(key)
}

const CLIENT_CONFIG_SESSION_KEY = 'meoo_client_runtime_config_v1'

function readSessionStoredConfig(): MeooClientRuntimeConfig {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(CLIENT_CONFIG_SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as MeooClientRuntimeConfig
    return {
      supabaseUrl: typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined,
      supabaseAnonKey: typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : undefined,
    }
  } catch {
    return {}
  }
}

function persistRuntimeConfig(cfg: MeooClientRuntimeConfig): void {
  if (typeof window === 'undefined') return
  window.__MEOO_CLIENT_CONFIG__ = cfg
  try {
    sessionStorage.setItem(CLIENT_CONFIG_SESSION_KEY, JSON.stringify(cfg))
  } catch {
    /* private mode / quota */
  }
}

function readRuntimeConfig(): MeooClientRuntimeConfig {
  if (typeof window === 'undefined') return {}
  const fromWindow = window.__MEOO_CLIENT_CONFIG__
  if (fromWindow?.supabaseAnonKey?.trim()) return fromWindow
  return readSessionStoredConfig()
}

/** cs/fws 等子域 Nginx 已反代 /auth/v1、/rest/v1，同源最稳 */
export function defaultEcsBrowserSupabaseUrl(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname.toLowerCase()
  if (ECS_HOSTS_WITH_SAME_ORIGIN_PROXY.has(host)) return window.location.origin
  if (host === 'mofangdianai.com' || host === 'www.mofangdianai.com') return 'https://mofangdianai.com'
  return ''
}

function isLoopbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  } catch {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(raw)
  }
}

export function effectiveSupabaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    const host = window.location.hostname.toLowerCase()
    const loopback = isLoopbackUrl(trimmed)
    if (ECS_HOSTS_WITH_SAME_ORIGIN_PROXY.has(host)) {
      // 轻量内网 PostgREST（127.0.0.1:8888）浏览器不可达 → 同源反代
      if (trimmed === origin || loopback) return origin
      // 新 ECS 备案后：Nginx 已反代 /auth/v1、/rest/v1，根域或旧 env 一律改同源
      if (
        trimmed === 'https://mofangdianai.com' ||
        trimmed === 'https://www.mofangdianai.com' ||
        /cs\.|fws\.|admin\.|dr\.|api\./i.test(trimmed)
      ) {
        return origin
      }
    }
    if (loopback && (host === 'mofangdianai.com' || host === 'www.mofangdianai.com')) {
      return 'https://mofangdianai.com'
    }
  }
  return trimmed
}

export function resolveSupabaseUrl(): string {
  const runtime = readRuntimeConfig()
  const fromEnv = readViteClientEnv('VITE_SUPABASE_URL')
  const raw = fromEnv ?? runtime.supabaseUrl ?? defaultEcsBrowserSupabaseUrl()
  return effectiveSupabaseUrl(raw)
}

export function resolveSupabaseAnonKey(): string {
  const runtime = readRuntimeConfig()
  return (readViteClientEnv('VITE_SUPABASE_ANON_KEY') ?? runtime.supabaseAnonKey ?? '').trim()
}

export function missingSupabaseClientEnvKeys(): string[] {
  const missing: string[] = []
  if (!resolveSupabaseUrl()) missing.push('VITE_SUPABASE_URL')
  if (!resolveSupabaseAnonKey()) missing.push('VITE_SUPABASE_ANON_KEY')
  return missing
}

export async function fetchAndApplyEcsClientConfig(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const res = await fetch('/api/meoo-erp-client-config', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      supabaseUrl?: string
      supabaseAnonKey?: string
    }
    if (!res.ok || j.ok === false || !j.supabaseAnonKey?.trim()) return false
    const publicUrl =
      effectiveSupabaseUrl(j.supabaseUrl?.trim()) || defaultEcsBrowserSupabaseUrl() || undefined
    persistRuntimeConfig({
      supabaseUrl: publicUrl,
      supabaseAnonKey: j.supabaseAnonKey.trim(),
    })
    return true
  } catch {
    return false
  }
}
