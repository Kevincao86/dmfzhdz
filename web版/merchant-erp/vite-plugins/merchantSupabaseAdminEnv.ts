/**
 * 商户 ERP Serverless（/api/*、Vite 网关）读 Supabase 注册表等管理接口时用。
 * 与前端 `VITE_SUPABASE_*` 不同：Service Role 仅应出现在 Vercel 环境变量中，勿写入前端包。
 */

/** 官方本地 `supabase start` 固定 demo JWT（仅用于 127.0.0.1:54321，勿用于线上）。 */
const LOCAL_SUPABASE_DEMO_SERVICE_ROLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

function isLocalSupabaseDemoUrl(supabaseUrl: string): boolean {
  try {
    const u = new URL(supabaseUrl)
    const port = u.port || (u.protocol === 'https:' ? '443' : '80')
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && port === '54321'
  } catch {
    return false
  }
}

/** 本地 54321 未写 SUPABASE_SERVICE_ROLE_KEY 时使用 CLI 内置 demo JWT（与商家管理后台一致）。 */
function effectiveServiceRoleKey(supabaseUrl: string, fromEnv: string): string {
  const t = fromEnv.trim()
  if (isLocalSupabaseDemoUrl(supabaseUrl)) {
    if (process.env.SUPABASE_LOCAL_USE_PRINTED_SERVICE_ROLE === '1' && t) return t
    return LOCAL_SUPABASE_DEMO_SERVICE_ROLE
  }
  return t
}

export type MerchantSupabaseAdminEnvParts = {
  supabaseUrl: string
  serviceRole: string
  missingParts: ('url' | 'serviceRole')[]
}

export function readMerchantSupabaseAdminEnv(): MerchantSupabaseAdminEnvParts {
  const supabaseUrl = (
    process.env.MEOO_SUPABASE_ADMIN_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ''
  )
    .trim()
    .replace(/\/$/, '')
  const fromEnv = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    ''
  ).trim()
  const serviceRole = effectiveServiceRoleKey(supabaseUrl, fromEnv)
  const missingParts: ('url' | 'serviceRole')[] = []
  if (!supabaseUrl) missingParts.push('url')
  if (!serviceRole) missingParts.push('serviceRole')
  return { supabaseUrl, serviceRole, missingParts }
}

/** 校验用户 JWT（anon）与 Service Role 分离；Vercel 上常配 SUPABASE_ANON_KEY。 */
export function readMerchantSupabaseAnonKey(): string {
  return (process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '').trim()
}

/** 给人看的配置说明（JSON hint 字段等） */
export function merchantSupabaseAdminEnvConfigureHint(missingParts: ('url' | 'serviceRole')[]): string {
  const lines: string[] = [
    '请在「商户 ERP」绑定的 Vercel 项目 → Settings → Environment Variables 中，为 Production（及 Preview 如需）勾选并填写：',
  ]
  if (missingParts.includes('url')) {
    lines.push(
      '· VITE_SUPABASE_URL 或 SUPABASE_URL：与 ERP 登录页使用的 Supabase 项目 URL 一致（https://xxx.supabase.co，无末尾斜杠）。',
    )
  }
  if (missingParts.includes('serviceRole')) {
    lines.push(
      '· SUPABASE_SERVICE_ROLE_KEY：Supabase Dashboard → Project Settings → API →「service_role」密钥（勿用 anon key）。与运营台读同一注册表时，填同一项目下的 service_role。',
    )
  }
  lines.push('保存后必须对商户 ERP 执行一次 Redeploy，Serverless 才会加载新变量。')
  return lines.join('')
}
