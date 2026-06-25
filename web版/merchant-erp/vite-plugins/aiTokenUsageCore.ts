import type { TenantAiContext } from './tenantMembershipCore.js'
import { readSupportRelaySupabaseAdminEnv } from './merchantSupabaseAdminEnv.js'

export type AiUsageScope = { scopeType: 'tenant' | 'mp_account'; scopeId: string }

export type AiTokenUsageQuery = {
  range: 'day' | 'week' | 'month' | 'custom'
  from?: string
  to?: string
}

export type AiTokenUsageSummary = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  callCount: number
}

export type AiTokenUsageProviderRow = {
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  callCount: number
}

export type AiTokenUsageDailyRow = {
  date: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  callCount: number
}

export type AiTokenUsageResult = {
  ok: true
  range: AiTokenUsageQuery['range']
  from: string
  to: string
  summary: AiTokenUsageSummary
  byProvider: AiTokenUsageProviderRow[]
  dailySeries: AiTokenUsageDailyRow[]
  /** false 表示 Postgres 未建表或 RPC 不可用，写入也会失败 */
  storageReady?: boolean
  storageHint?: string
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 上海日历日 YYYY-MM-DD */
export function shanghaiDateString(d = new Date()): string {
  const sh = new Date(d.getTime() + SHANGHAI_OFFSET_MS)
  return `${sh.getUTCFullYear()}-${pad2(sh.getUTCMonth() + 1)}-${pad2(sh.getUTCDate())}`
}

function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return new Date(Date.UTC(y, mo - 1, da))
}

function addDays(dateStr: string, delta: number): string {
  const d = parseDateOnly(dateStr)
  if (!d) return dateStr
  d.setUTCDate(d.getUTCDate() + delta)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function resolveAiTokenUsageDateRange(q: AiTokenUsageQuery): { from: string; to: string } {
  const today = shanghaiDateString()
  if (q.range === 'day') return { from: today, to: today }
  if (q.range === 'week') return { from: addDays(today, -6), to: today }
  if (q.range === 'month') {
    const sh = new Date(Date.now() + SHANGHAI_OFFSET_MS)
    const from = `${sh.getUTCFullYear()}-${pad2(sh.getUTCMonth() + 1)}-01`
    return { from, to: today }
  }
  const from = q.from?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(q.from.trim()) ? q.from.trim() : addDays(today, -29)
  const to = q.to?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(q.to.trim()) ? q.to.trim() : today
  if (from > to) return { from: to, to: from }
  return { from, to }
}

export function resolveAiUsageScope(
  userId: string,
  usageCtx?: TenantAiContext | null,
  tenantIdHint?: string,
): AiUsageScope | null {
  if (usageCtx?.tenantId?.trim()) {
    return { scopeType: 'tenant', scopeId: usageCtx.tenantId.trim() }
  }
  const hint = tenantIdHint?.trim()
  if (hint && /^[0-9a-f-]{36}$/i.test(hint)) {
    return { scopeType: 'tenant', scopeId: hint }
  }
  if (userId.startsWith('mp:')) {
    const id = userId.slice(3).trim()
    if (id && id !== 'dev-preview') return { scopeType: 'mp_account', scopeId: id }
  }
  return null
}

function resolveSupabaseAdmin(env: Record<string, string>): { base: string; serviceRole: string } {
  const admin = readSupportRelaySupabaseAdminEnv()
  if (admin.supabaseUrl && admin.serviceRole) {
    return { base: admin.supabaseUrl.replace(/\/$/, ''), serviceRole: admin.serviceRole }
  }
  const base = (
    env.MEOO_SUPABASE_ADMIN_URL ??
    env.SUPABASE_URL ??
    env.VITE_SUPABASE_URL ??
    ''
  )
    .trim()
    .replace(/\/$/, '')
  const serviceRole = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '').trim()
  return { base, serviceRole }
}

function emptySummary(): AiTokenUsageSummary {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 }
}

/** 中文为主文本：粗估 LLM Token（无厂商 usage 字段时） */
export function estimateLlmTokensFromText(
  inputText: string,
  outputText: string,
): Record<string, number> {
  const prompt = Math.max(1, Math.ceil(inputText.length / 2))
  const completion = Math.max(1, Math.ceil(outputText.length / 2))
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  }
}

/** 图生/文生视频：按段时长粗估等价 Token（与 LLM 面板统一展示） */
export function estimateVideoGenerationTokens(input?: {
  durationSec?: number
  promptChars?: number
}): Record<string, number> {
  const dur = Math.max(1, Math.round(input?.durationSec ?? 5))
  const prompt = Math.max(0, Math.ceil((input?.promptChars ?? 0) / 2))
  const completion = Math.max(800, dur * 300)
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion }
}

/** 检测 ai_token_usage_daily 表与 increment RPC 是否可用（只读 HEAD） */
export async function checkAiTokenUsageStorageReady(
  env: Record<string, string>,
): Promise<{ ready: boolean; hint?: string }> {
  const { base, serviceRole } = resolveSupabaseAdmin(env)
  if (!base || !serviceRole) {
    return {
      ready: false,
      hint: '未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，Token 用量无法入库。',
    }
  }
  const migrationHint =
    '请在轻量 ECS 执行一次：bash scripts/ecs-fix-ai-token-usage.sh --remote'
  try {
    const r = await fetch(`${base}/rest/v1/ai_token_usage_daily?select=usage_date&limit=0`, {
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    })
    if (r.status === 404) {
      return { ready: false, hint: `数据库缺少 ai_token_usage_daily 表。${migrationHint}` }
    }
    const text = await r.text().catch(() => '')
    if (!r.ok && /PGRST205|does not exist|schema cache/i.test(text)) {
      return { ready: false, hint: `Token 用量表未就绪。${migrationHint}` }
    }
    return { ready: r.ok }
  } catch (e) {
    return {
      ready: false,
      hint: `无法连接 PostgREST：${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

function authHeaderFromReq(req?: import('node:http').IncomingMessage): string | undefined {
  const raw = req?.headers?.authorization ?? req?.headers?.Authorization
  return typeof raw === 'string' ? raw : undefined
}

/** 从 HTTP 请求解析租户并记账（视频/策划/TTS 等共用） */
export async function recordAiTokenUsageFromHttpRequest(opts: {
  req?: import('node:http').IncomingMessage
  env: Record<string, string>
  provider: string
  model?: string | null
  usage?: Record<string, number> | null
  tenantIdHint?: string
  inputText?: string
  outputText?: string
}): Promise<void> {
  const auth = authHeaderFromReq(opts.req)
  let userId = 'anonymous'
  let usageCtx: TenantAiContext | null = null
  try {
    if (auth) {
      const { verifyBearerJwt } = await import('./aiGateway/authSupabase.js')
      const { loadTenantAiContextForUser } = await import('./tenantMembershipCore.js')
      const user = await verifyBearerJwt(auth, opts.env)
      if (user) {
        userId = user.id
        const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : auth.trim()
        usageCtx = await loadTenantAiContextForUser(
          user.id,
          opts.env,
          bearer,
          opts.tenantIdHint,
        )
      }
    }
    let usage = opts.usage
    if (!usage && (opts.inputText || opts.outputText)) {
      usage = estimateLlmTokensFromText(opts.inputText ?? '', opts.outputText ?? '')
    }
    await recordAiTokenUsageAfterSuccess({
      userId,
      usageCtx,
      tenantIdHint: opts.tenantIdHint,
      provider: opts.provider,
      model: opts.model,
      usage,
      env: opts.env,
    })
  } catch {
    /* 用量记账失败不影响主流程 */
  }
}

/** TTS/语音合成：按口播字数计入等价 Token（与 LLM 面板统一展示） */
export function estimateTtsCharacterTokens(text: string): Record<string, number> {
  const chars = Math.max(1, [...String(text ?? '').trim()].length)
  return { prompt_tokens: 0, completion_tokens: chars, total_tokens: chars }
}

type DbRow = {
  usage_date?: string
  provider?: string
  model?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  call_count?: number
}

function sumRows(rows: DbRow[]): AiTokenUsageSummary {
  let promptTokens = 0
  let completionTokens = 0
  let totalTokens = 0
  let callCount = 0
  for (const r of rows) {
    promptTokens += Math.max(0, Number(r.prompt_tokens) || 0)
    completionTokens += Math.max(0, Number(r.completion_tokens) || 0)
    totalTokens += Math.max(0, Number(r.total_tokens) || 0)
    callCount += Math.max(0, Number(r.call_count) || 0)
  }
  return { promptTokens, completionTokens, totalTokens, callCount }
}

export async function recordAiTokenUsageAfterSuccess(opts: {
  userId: string
  usageCtx?: TenantAiContext | null
  tenantIdHint?: string
  provider: string
  model?: string | null
  usage?: Record<string, number> | null
  env: Record<string, string>
}): Promise<void> {
  const scope = resolveAiUsageScope(opts.userId, opts.usageCtx, opts.tenantIdHint)
  if (!scope) return

  const usage = opts.usage ?? {}
  const prompt = Math.max(0, Math.floor(Number(usage.prompt_tokens) || 0))
  const completion = Math.max(0, Math.floor(Number(usage.completion_tokens) || 0))
  let total = Math.max(0, Math.floor(Number(usage.total_tokens) || 0))
  if (!total && (prompt || completion)) total = prompt + completion
  if (!total && !prompt && !completion) {
    total = 1
  }

  const { base, serviceRole } = resolveSupabaseAdmin(opts.env)
  if (!base || !serviceRole) return

  const usageDate = shanghaiDateString()
  const url = `${base}/rest/v1/rpc/increment_ai_token_usage`
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_scope_type: scope.scopeType,
        p_scope_id: scope.scopeId,
        p_usage_date: usageDate,
        p_provider: (opts.provider || 'unknown').slice(0, 40),
        p_model: String(opts.model || '').slice(0, 120),
        p_prompt: prompt,
        p_completion: completion,
        p_total: total,
      }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      console.warn('[aiTokenUsage] record failed', r.status, t.slice(0, 200))
    }
  } catch (e) {
    console.warn('[aiTokenUsage] record error', e instanceof Error ? e.message : String(e))
  }
}

export async function queryAiTokenUsage(
  scope: AiUsageScope,
  q: AiTokenUsageQuery,
  env: Record<string, string>,
): Promise<AiTokenUsageResult> {
  const { from, to } = resolveAiTokenUsageDateRange(q)
  const empty: AiTokenUsageResult = {
    ok: true,
    range: q.range,
    from,
    to,
    summary: emptySummary(),
    byProvider: [],
    dailySeries: [],
  }

  const storage = await checkAiTokenUsageStorageReady(env)
  empty.storageReady = storage.ready
  if (storage.hint) empty.storageHint = storage.hint
  if (!storage.ready) return empty

  const { base, serviceRole } = resolveSupabaseAdmin(env)
  if (!base || !serviceRole) {
    empty.storageReady = false
    empty.storageHint = empty.storageHint ?? '未配置 Supabase 管理密钥，无法查询 Token 用量。'
    return empty
  }

  const filter = [
    `scope_type=eq.${encodeURIComponent(scope.scopeType)}`,
    `scope_id=eq.${encodeURIComponent(scope.scopeId)}`,
    `usage_date=gte.${from}`,
    `usage_date=lte.${to}`,
  ].join('&')
  const url = `${base}/rest/v1/ai_token_usage_daily?select=usage_date,provider,model,prompt_tokens,completion_tokens,total_tokens,call_count&${filter}&order=usage_date.asc`
  try {
    const r = await fetch(url, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    })
    if (!r.ok) return empty
    const rows = (await r.json()) as DbRow[]
    if (!Array.isArray(rows) || !rows.length) return empty

    const summary = sumRows(rows)

    const providerMap = new Map<string, AiTokenUsageProviderRow>()
    for (const row of rows) {
      const provider = String(row.provider || 'unknown')
      const model = String(row.model || '')
      const key = `${provider}::${model}`
      const prev = providerMap.get(key) ?? {
        provider,
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        callCount: 0,
      }
      prev.promptTokens += Math.max(0, Number(row.prompt_tokens) || 0)
      prev.completionTokens += Math.max(0, Number(row.completion_tokens) || 0)
      prev.totalTokens += Math.max(0, Number(row.total_tokens) || 0)
      prev.callCount += Math.max(0, Number(row.call_count) || 0)
      providerMap.set(key, prev)
    }
    const byProvider = [...providerMap.values()].sort((a, b) => b.totalTokens - a.totalTokens)

    const dailyMap = new Map<string, AiTokenUsageDailyRow>()
    for (const row of rows) {
      const date = String(row.usage_date || '').slice(0, 10)
      if (!date) continue
      const prev = dailyMap.get(date) ?? {
        date,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        callCount: 0,
      }
      prev.promptTokens += Math.max(0, Number(row.prompt_tokens) || 0)
      prev.completionTokens += Math.max(0, Number(row.completion_tokens) || 0)
      prev.totalTokens += Math.max(0, Number(row.total_tokens) || 0)
      prev.callCount += Math.max(0, Number(row.call_count) || 0)
      dailyMap.set(date, prev)
    }

    const dailySeries: AiTokenUsageDailyRow[] = []
    let cursor = from
    while (cursor <= to) {
      dailySeries.push(
        dailyMap.get(cursor) ?? {
          date: cursor,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          callCount: 0,
        },
      )
      cursor = addDays(cursor, 1)
    }

    return { ok: true, range: q.range, from, to, summary, byProvider, dailySeries, storageReady: true }
  } catch {
    return empty
  }
}
