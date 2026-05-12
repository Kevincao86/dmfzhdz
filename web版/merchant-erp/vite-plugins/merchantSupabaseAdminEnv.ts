/**
 * 商户 ERP Serverless（/api/*、Vite 网关）读 Supabase 注册表等管理接口时用。
 * 与前端 `VITE_SUPABASE_*` 不同：Service Role 仅应出现在 Vercel 环境变量中，勿写入前端包。
 */
export type MerchantSupabaseAdminEnvParts = {
  supabaseUrl: string
  serviceRole: string
  missingParts: ('url' | 'serviceRole')[]
}

export function readMerchantSupabaseAdminEnv(): MerchantSupabaseAdminEnvParts {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceRole = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    ''
  ).trim()
  const missingParts: ('url' | 'serviceRole')[] = []
  if (!supabaseUrl) missingParts.push('url')
  if (!serviceRole) missingParts.push('serviceRole')
  return { supabaseUrl, serviceRole, missingParts }
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
