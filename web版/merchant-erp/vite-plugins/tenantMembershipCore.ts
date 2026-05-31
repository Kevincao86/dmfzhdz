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

function supabaseBase(env: Record<string, string>): string {
  return (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
}

function serviceRoleKey(env: Record<string, string>): string {
  return (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '').trim()
}

function anonKey(env: Record<string, string>): string {
  return (env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '').trim()
}

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

function userJwtHeaders(anon: string, jwt: string): Record<string, string> {
  return {
    apikey: anon,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

function parseTenantRow(
  tenantId: string,
  row: Record<string, unknown> | undefined,
  tokenmixApiKey: string | null,
): TenantAiContext | null {
  if (!row) return null
  return {
    tenantId,
    plan: normalizeMembershipPlan(row.membership_plan),
    tokenmixApiKey,
    directAiCallsUsed: Math.max(0, Math.floor(Number(row.direct_ai_calls_used) || 0)),
    directAiUsageMonth:
      typeof row.direct_ai_usage_month === 'string' ? row.direct_ai_usage_month : null,
  }
}

function tenantIdHintFromJwt(userJwt: string): string | null {
  try {
    const part = userJwt.split('.')[1]
    if (!part) return null
    const pad = '='.repeat((4 - (part.length % 4)) % 4)
    const b64 = (part + pad).replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as {
      user_metadata?: { tenant_id?: unknown }
      app_metadata?: { tenant_id?: unknown }
    }
    const raw = payload.user_metadata?.tenant_id ?? payload.app_metadata?.tenant_id
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

async function fetchTenantIdForUser(
  base: string,
  userId: string,
  headers: Record<string, string>,
  tenantIdHint?: string,
): Promise<string | null> {
  const filters = [`user_id=eq.${encodeURIComponent(userId)}`]
  if (tenantIdHint) filters.push(`tenant_id=eq.${encodeURIComponent(tenantIdHint)}`)
  const memUrl = `${base}/rest/v1/tenant_members?select=tenant_id&${filters.join('&')}&order=created_at.asc&limit=1`
  const memRes = await fetch(memUrl, { headers: { ...headers, Prefer: 'return=representation' } })
  if (!memRes.ok) return null
  let memRows: { tenant_id?: string }[]
  try {
    memRows = JSON.parse(await memRes.text()) as typeof memRows
  } catch {
    return null
  }
  const tenantId = memRows?.[0]?.tenant_id
  return tenantId ? String(tenantId) : null
}

async function fetchTenantRowById(
  base: string,
  tenantId: string,
  headers: Record<string, string>,
  opts: { includeTokenmix: boolean },
): Promise<Record<string, unknown> | null> {
  const selectCols = opts.includeTokenmix
    ? 'id,membership_plan,tokenmix_api_key,direct_ai_calls_used,direct_ai_usage_month'
    : 'id,membership_plan,direct_ai_calls_used,direct_ai_usage_month'
  const tUrl = `${base}/rest/v1/tenants?select=${encodeURIComponent(selectCols)}&id=eq.${encodeURIComponent(tenantId)}&limit=1`
  const tRes = await fetch(tUrl, { headers: { ...headers, Prefer: 'return=representation' } })
  if (!tRes.ok) {
    if (opts.includeTokenmix) {
      return fetchTenantRowById(base, tenantId, headers, { includeTokenmix: false })
    }
    return null
  }
  let trows: Record<string, unknown>[]
  try {
    trows = JSON.parse(await tRes.text()) as Record<string, unknown>[]
  } catch {
    return null
  }
  return trows?.[0] ?? null
}

async function loadTenantAiContextViaServiceRole(
  userId: string,
  env: Record<string, string>,
  tenantIdHint?: string,
): Promise<TenantAiContext | null> {
  const base = supabaseBase(env)
  const serviceRole = serviceRoleKey(env)
  if (!base || !serviceRole || !userId) return null

  try {
    const headers = serviceRoleHeaders(serviceRole)
    const tenantId =
      (tenantIdHint && (await fetchTenantIdForUser(base, userId, headers, tenantIdHint))) ||
      (await fetchTenantIdForUser(base, userId, headers))
    if (!tenantId) return null

    const row = await fetchTenantRowById(base, tenantId, headers, { includeTokenmix: true })
    const tokenmixApiKey =
      typeof row?.tokenmix_api_key === 'string' && row.tokenmix_api_key.trim()
        ? row.tokenmix_api_key.trim()
        : null
    return parseTenantRow(tenantId, row ?? undefined, tokenmixApiKey)
  } catch {
    return null
  }
}

/** 与浏览器 MembershipContext 相同：用户 JWT + anon，经 RLS 读 membership_plan */
async function loadTenantAiContextViaUserJwt(
  userId: string,
  userJwt: string,
  env: Record<string, string>,
  tenantIdHint?: string,
): Promise<TenantAiContext | null> {
  const base = supabaseBase(env)
  const anon = anonKey(env)
  if (!base || !anon || !userId || !userJwt) return null

  try {
    const headers = userJwtHeaders(anon, userJwt)
    const hints = [
      tenantIdHint?.trim(),
      tenantIdHintFromJwt(userJwt),
    ].filter((x): x is string => Boolean(x))

    let tenantId: string | null = null
    for (const hint of hints) {
      tenantId = await fetchTenantIdForUser(base, userId, headers, hint)
      if (tenantId) break
    }
    if (!tenantId) {
      tenantId = await fetchTenantIdForUser(base, userId, headers)
    }
    if (!tenantId) return null

    const row = await fetchTenantRowById(base, tenantId, headers, { includeTokenmix: false })
    return parseTenantRow(tenantId, row ?? undefined, null)
  } catch {
    return null
  }
}

export async function loadTenantAiContextForUser(
  userId: string,
  env: Record<string, string>,
  userJwt?: string,
  tenantIdHint?: string,
): Promise<TenantAiContext | null> {
  const hint = tenantIdHint?.trim() || undefined

  /** 1) 用户 JWT（与浏览器 RLS 一致，Vercel 上最可靠） */
  if (userJwt) {
    const viaJwt = await loadTenantAiContextViaUserJwt(userId, userJwt, env, hint)
    if (viaJwt) {
      if (viaJwt.plan !== 'member_plus') return viaJwt
      const viaService = await loadTenantAiContextViaServiceRole(userId, env, viaJwt.tenantId)
      if (viaService?.tokenmixApiKey) {
        return { ...viaJwt, tokenmixApiKey: viaService.tokenmixApiKey }
      }
      return viaJwt
    }
  }

  /** 2) Service Role（读 tokenmix_api_key、递增用量） */
  const viaService = await loadTenantAiContextViaServiceRole(userId, env, hint)
  if (viaService) return viaService

  /** 3) 再试 JWT（无 hint） */
  if (userJwt && hint) {
    return loadTenantAiContextViaUserJwt(userId, userJwt, env)
  }

  return null
}

export type AiAccessCheck =
  | { ok: true; envForChat: Record<string, string> }
  | { ok: false; status: number; error: string; detail?: string }

function tenantNotFoundDetail(env: Record<string, string>): string {
  const base = supabaseBase(env)
  const anon = anonKey(env)
  const serviceRole = serviceRoleKey(env)
  if (!base) {
    return '未找到租户，无法调用 AI。请在 Vercel 配置 SUPABASE_URL（或与 VITE_SUPABASE_URL 相同）并 Redeploy。'
  }
  if (!anon && !serviceRole) {
    return '未找到租户，无法调用 AI。请在 Vercel 配置 SUPABASE_ANON_KEY 或 SUPABASE_SERVICE_ROLE_KEY 并 Redeploy。'
  }
  return '未找到租户，无法调用 AI。请确认账号已完成注册并关联商户；子账号需由主账号创建。'
}

export async function assertAiChatAccess(
  userId: string,
  provider: string,
  env: Record<string, string>,
  userJwt?: string,
  tenantIdHint?: string,
): Promise<AiAccessCheck> {
  const allowUnauth = (env.MEOO_AI_CHAT_ALLOW_UNAUTHENTICATED ?? '').trim() === '1'
  if (allowUnauth && userId === 'dev-unauthenticated') {
    return { ok: true, envForChat: env }
  }

  const ctx = await loadTenantAiContextForUser(userId, env, userJwt, tenantIdHint)
  if (!ctx) {
    return {
      ok: false,
      status: 403,
      error: 'tenant_not_found',
      detail: tenantNotFoundDetail(env),
    }
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
        detail: 'OpenAI / Claude / Gemini / Grok 等高级模型仅会员 Plus 可用',
      }
    }
    const key = ctx.tokenmixApiKey ?? (env.TOKENMIX_API_KEY ?? '').trim()
    if (!key) {
      return {
        ok: false,
        status: 503,
        error: 'tokenmix_not_configured',
        detail: '高级 AI 模型通道未配置，请联系运营或客服',
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
  const base = supabaseBase(env)
  const serviceRole = serviceRoleKey(env)
  if (!base || !serviceRole) return { ok: true }

  const patch = {
    direct_ai_calls_used: currentUsed + 1,
    direct_ai_usage_month: month,
    updated_at: new Date().toISOString(),
  }
  const url = `${base}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}`
  try {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, detail: msg.slice(0, 300) }
  }
}

export { buildTenantEntitlements, normalizeMembershipPlan }
