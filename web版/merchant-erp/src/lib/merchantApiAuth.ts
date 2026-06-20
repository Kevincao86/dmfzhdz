/**
 * 商家 ERP API 鉴权：cs/fws 用 Supabase JWT；dr 履约嵌入用星选 mp 会话 token。
 */
import { supabase, supabaseConfigured } from './supabaseClient'

const MP_TOKEN_KEY = 'lingqi_mp_session_token'
export const MP_DEV_PREVIEW_TOKEN = 'dev-preview-local'

export type MerchantApiAuthSource = 'supabase' | 'mp_session'

export function isFulfillmentEmbedHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h === 'dr.mofangdianai.com'
}

export function readMpSessionToken(): string | null {
  try {
    const t = localStorage.getItem(MP_TOKEN_KEY)?.trim()
    return t || null
  } catch {
    return null
  }
}

export async function resolveMerchantApiBearer(): Promise<{
  token: string | null
  source: MerchantApiAuthSource | null
}> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession()
    const jwt = data.session?.access_token?.trim()
    if (jwt) return { token: jwt, source: 'supabase' }
  }

  const mp = readMpSessionToken()
  if (mp) return { token: mp, source: 'mp_session' }

  return { token: null, source: null }
}

export function merchantApiAuthHeaders(
  token: string | null,
  source: MerchantApiAuthSource | null,
): Record<string, string> {
  if (!token) return {}
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (source === 'mp_session') headers['X-Mp-Session'] = token
  return headers
}
