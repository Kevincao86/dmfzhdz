/**
 * 商户 ERP Serverless（/api/*、Vite 网关）读 Supabase 注册表等管理接口时用。
 * 与前端 `VITE_SUPABASE_*` 不同：Service Role 仅应出现在 Vercel 环境变量中，勿写入前端包。
 */

import { supabaseAdminFetch } from '../src/lib/supabaseAdminFetch.js'

/** ECS PostgREST 公网根域（与小程序 /erp-api 同一轻量；勿用 *.supabase.co 云项目） */
export const MEOO_ECS_POSTGREST_PUBLIC_DEFAULT = 'https://mofangdianai.com'

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

function buildMerchantSupabaseAdminEnvParts(supabaseUrl: string): MerchantSupabaseAdminEnvParts {
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

export function readMerchantSupabaseAdminEnv(): MerchantSupabaseAdminEnvParts {
  const supabaseUrl = (
    process.env.MEOO_SUPABASE_ADMIN_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ''
  )
    .trim()
    .replace(/\/$/, '')
  return buildMerchantSupabaseAdminEnvParts(supabaseUrl)
}

function isCloudSupabaseHost(url: string): boolean {
  try {
    return /\.supabase\.co$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * 在线客服 relay：须与小程序 meoo-ops-mp-support-relay 读写同一 ECS Postgres。
 * Vercel 上 VITE_SUPABASE_URL 若仍为云端 *.supabase.co，此处强制回落 ECS 根域，避免运营回复写入错误库。
 */
export function readSupportRelaySupabaseAdminEnv(): MerchantSupabaseAdminEnvParts {
  const explicit = process.env.MEOO_SUPABASE_ADMIN_URL?.trim().replace(/\/$/, '')
  if (explicit) return buildMerchantSupabaseAdminEnvParts(explicit)

  if (process.env.MEOO_AUTH_API_SERVER === '1') {
    const local = (
      process.env.SUPABASE_URL ??
      process.env.VITE_SUPABASE_URL ??
      'http://127.0.0.1:8888'
    )
      .trim()
      .replace(/\/$/, '')
    return buildMerchantSupabaseAdminEnvParts(local)
  }

  const fromEnv = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '')
    .trim()
    .replace(/\/$/, '')
  if (fromEnv && !isCloudSupabaseHost(fromEnv)) {
    return buildMerchantSupabaseAdminEnvParts(fromEnv)
  }

  const ecsPublic = (
    process.env.MEOO_ECS_POSTGREST_PUBLIC_URL ?? MEOO_ECS_POSTGREST_PUBLIC_DEFAULT
  )
    .trim()
    .replace(/\/$/, '')
  return buildMerchantSupabaseAdminEnvParts(ecsPublic)
}

/** support_relay_messages 读写：ECS 根域走备案 bypass fetch */
export function supportRelayAdminFetch(url: string, init?: RequestInit): Promise<Response> {
  return supabaseAdminFetch(url, init ?? {})
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

export function supportRelaySupabaseEnvConfigureHint(missingParts: ('url' | 'serviceRole')[]): string {
  const lines: string[] = [
    '在线客服须与小程序共用 ECS Postgres（support_relay_messages）。请在 Vercel 商家管理后台配置：',
  ]
  if (missingParts.includes('url')) {
    lines.push(
      `· MEOO_SUPABASE_ADMIN_URL=${MEOO_ECS_POSTGREST_PUBLIC_DEFAULT}（或轻量内网 http://127.0.0.1:8888，勿用 *.supabase.co）`,
    )
  }
  if (missingParts.includes('serviceRole')) {
    lines.push(
      '· SUPABASE_SERVICE_ROLE_KEY：与 ECS auth-api.env 中 service_role JWT 一致（bash scripts/ecs-run-auth-api.sh 生成）。',
    )
  }
  lines.push(
    '· VITE_MEEO_SUPPORT_OPS_API_BASE=https://mofangdianai.com/erp-api；MEOO_SUPPORT_OPS_HTTP_TOKEN 与 VITE_ 同名变量一致。',
  )
  lines.push('保存后 Redeploy 运营台；轻量执行 git pull && bash scripts/ecs-deploy-auth-api.sh。')
  return lines.join('')
}
