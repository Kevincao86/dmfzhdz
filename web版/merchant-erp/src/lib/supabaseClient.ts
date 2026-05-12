import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url?.trim() && anon?.trim())

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
