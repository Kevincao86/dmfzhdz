import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  missingSupabaseClientEnvKeys as missingKeys,
  resolveSupabaseAnonKey,
  resolveSupabaseUrl,
} from './supabaseClientConfig'

const url = resolveSupabaseUrl()
const anon = resolveSupabaseAnonKey()

export const supabaseConfigured = Boolean(url && anon)

export function missingSupabaseClientEnvKeys(): string[] {
  return missingKeys()
}

function accessTokenExpMs(token: string): number {
  try {
    const part = token.split('.')[1]
    if (!part) return 0
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(padded)) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp * 1000 : 0
  } catch {
    return 0
  }
}

/**
 * getSession() 会直接交还本地缓存，哪怕 access_token 已过期。
 * GoTrue 默认约 1 小时过期，页面仍显示已登录，随后接口报登录无效。
 */
function installFreshSession(client: SupabaseClient): void {
  const auth = client.auth
  const rawGetSession = auth.getSession.bind(auth)
  let refreshing = false
  auth.getSession = async () => {
    const first = await rawGetSession()
    if (refreshing) return first
    const token = first.data.session?.access_token || ''
    const exp = token ? accessTokenExpMs(token) : 0
    if (!token || !exp || exp > Date.now() + 120_000) return first
    refreshing = true
    try {
      await auth.refreshSession()
    } catch {
      return first
    } finally {
      refreshing = false
    }
    return rawGetSession()
  }
}

export const supabase = supabaseConfigured
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /** 密码登录为主：关闭 URL 内 token 探测，避免与 history/hash 交互导致会话异常或误态 */
        detectSessionInUrl: false,
      },
    })
  : null

if (supabase) installFreshSession(supabase)
