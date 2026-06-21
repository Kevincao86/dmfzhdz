import { createClient } from '@supabase/supabase-js'
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
