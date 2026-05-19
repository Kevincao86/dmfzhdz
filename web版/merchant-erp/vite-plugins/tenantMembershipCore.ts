import {
  buildTenantEntitlements,
  membershipAllowsProvider,
  membershipAllowsTokenMix,
  normalizeMembershipPlan,
  type MembershipPlan,
  FREE_DIRECT_AI_CALL_LIMIT,
} from '../src/lib/membershipPlan.js'

export type TenantAiContext = {
  tenantId: string
  plan: MembershipPlan
  tokenmixApiKey: string | null
  directAiCallsUsed: number
  directAiUsageMonth: string | null
}

function currentUsageMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

export async function loadTenantAiContextForUser(
  userId: string,
  env: Record<string, string>,
): Promise<TenantAiContext | null> {
  const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceRole = (
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_SERVICE_ROLE ??
    ''
  ).trim()
  if (!supabaseUrl || !serviceRole || !userId) return null

  const base = supabaseUrl.replace(/\/$/, '')
  const headers = serviceRoleHeaders(serviceRole)

  const memUrl = `${base}/rest/v1/tenant_members?select=tenant_id&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=1`
  const memRes = await fetch(memUrl, { headers: { ...headers, Prefer: 'return=representation' } })
  if (!memRes.ok) return null
  let memRows: { tenant_id?: string }[]
  try {
    memRows = JSON.parse(await memRes.text()) as typeof memRows
  } catch {
    return null
  }
  const tenantId = memRows?.[0]?.tenant_id
  if (!tenantId) return null

  const selectCols =
    'id,membership_plan,tokenmix_api_key,direct_ai_calls_used,direct_ai_usage_month'
  const tUrl = `${base}/rest/v1/tenants?select=${encodeURIComponent(selectCols)}&id=eq.${encodeURIComponent(tenantId)}&limit=1`
  const tRes = await fetch(tUrl, { headers: { ...headers, Prefer: 'return=representation' } })
  if (!tRes.ok) return null
  let trows: Record<string, unknown>[]
  try {
    trows = JSON.parse(await tRes.text()) as Record<string, unknown>[]
  } catch {
    return null
  }
  const row = trows?.[0]
  if (!row) return null

  return {
    tenantId,
    plan: normalizeMembershipPlan(row.membership_plan),
    tokenmixApiKey:
      typeof row.tokenmix_api_key === 'string' && row.tokenmix_api_key.trim()
        ? row.tokenmix_api_key.trim()
        : null,
    directAiCallsUsed: Math.max(0, Math.floor(Number(row.direct_ai_calls_used) || 0)),
    directAiUsageMonth:
      typeof row.direct_ai_usage_month === 'string' ? row.direct_ai_usage_month : null,
  }
}

export type AiAccessCheck =
  | { ok: true; envForChat: Record<string, string> }
  | { ok: false; status: number; error: string; detail?: string }

export async function assertAiChatAccess(
  userId: string,
  provider: string,
  env: Record<string, string>,
): Promise<AiAccessCheck> {
  const ctx = await loadTenantAiContextForUser(userId, env)
  if (!ctx) {
    return { ok: false, status: 403, error: 'tenant_not_found', detail: '未找到租户，无法调用 AI' }
  }

  if (!membershipAllowsProvider(ctx.plan, provider)) {
    return {
      ok: false,
      status: 403,
      error: 'plan_model_restricted',
      detail:
        ctx.plan === 'member_plus'
          ? '当前套餐不允许该模型'
          : '当前套餐仅支持豆包、通义千问、MiniMax、DeepSeek；升级会员 Plus 可使用全部模型',
    }
  }

  const p = provider.trim().toLowerCase()
  const isDirectBasic =
    p === 'qwen' || p === 'doubao' || p === 'minimax' || p === 'deepseek'

  if (p === 'tokenmix') {
    if (!membershipAllowsTokenMix(ctx.plan)) {
      return {
        ok: false,
        status: 403,
        error: 'tokenmix_requires_plus',
        detail: 'TokenMix 全模型仅会员 Plus 可用',
      }
    }
    const key = ctx.tokenmixApiKey ?? (env.TOKENMIX_API_KEY ?? '').trim()
    if (!key) {
      return {
        ok: false,
        status: 503,
        error: 'tokenmix_not_configured',
        detail: '请先在运营管控台为客户绑定 TokenMix API 密钥',
      }
    }
    return { ok: true, envForChat: { ...env, TOKENMIX_API_KEY: key } }
  }

  if (ctx.plan === 'free' && isDirectBasic) {
    const month = currentUsageMonth()
    let used = ctx.directAiCallsUsed
    if (ctx.directAiUsageMonth !== month) used = 0
    if (used >= FREE_DIRECT_AI_CALL_LIMIT) {
      return {
        ok: false,
        status: 429,
        error: 'free_ai_quota_exceeded',
        detail: `免费版直连 AI 每月上限 ${FREE_DIRECT_AI_CALL_LIMIT} 次，请升级会员版`,
      }
    }
    const inc = await incrementDirectAiUsage(ctx.tenantId, month, used, env)
    if (!inc.ok) {
      return { ok: false, status: 502, error: 'usage_increment_failed', detail: inc.detail }
    }
  }

  return { ok: true, envForChat: env }
}

async function incrementDirectAiUsage(
  tenantId: string,
  month: string,
  currentUsed: number,
  env: Record<string, string>,
): Promise<{ ok: boolean; detail?: string }> {
  const supabaseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceRole = (
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_SERVICE_ROLE ??
    ''
  ).trim()
  if (!supabaseUrl || !serviceRole) return { ok: true }

  const patch = {
    direct_ai_calls_used: currentUsed + 1,
    direct_ai_usage_month: month,
    updated_at: new Date().toISOString(),
  }
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: serviceRoleHeaders(serviceRole),
    body: JSON.stringify(patch),
  })
  if (!r.ok) {
    const t = await r.text()
    return { ok: false, detail: t.slice(0, 300) }
  }
  return { ok: true }
}

export { buildTenantEntitlements, normalizeMembershipPlan }
