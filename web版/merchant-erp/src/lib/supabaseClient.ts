import { createClient } from '@supabase/supabase-js'

/** cs 子域勿走 ECS 双跳；Realtime wss 直连根域更稳（与 dr 履约站一致） */
function effectiveSupabaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'cs.mofangdianai.com' && /cs\.mofangdianai\.com/i.test(trimmed)) {
      return 'https://mofangdianai.com'
    }
  }
  return trimmed
}

const url = effectiveSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url?.trim() && anon?.trim())

/** 登录页提示：构建时未注入的 VITE_ 变量（仅前端可见项） */
export function missingSupabaseClientEnvKeys(): string[] {
  const missing: string[] = []
  if (!url?.trim()) missing.push('VITE_SUPABASE_URL')
  if (!anon?.trim()) missing.push('VITE_SUPABASE_ANON_KEY')
  return missing
}

export const supabase = supabaseConfigured
  ? createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /** 密码登录为主：关闭 URL 内 token 探测，避免与 history/hash 交互导致会话异常或误态 */
        detectSessionInUrl: false,
      },
    })
  : null
