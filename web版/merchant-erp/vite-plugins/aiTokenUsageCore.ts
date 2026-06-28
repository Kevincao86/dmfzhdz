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
  /** 查询维度：星选为 mp_account 单账号，商家 ERP 为 tenant */
  scopeType?: AiUsageScope['scopeType']
  scopeId?: string
  accountLabel?: string
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

/** 记账/查询共用：usageCtx 缺失时用 service_role 查 tenant_members */
export async function resolveTenantScopeForUsage(
  userId: string,
  env: Record<string, string>,
  tenantIdHint?: string,
  usageCtx?: TenantAiContext | null,
): Promise<AiUsageScope | null> {
  const direct = resolveAiUsageScope(userId, usageCtx, tenantIdHint)
  if (direct) return direct
  if (!userId || userId === 'anonymous' || userId.startsWith('mp:')) return null

  const { base, serviceRole } = resolveSupabaseAdmin(env)
  if (!base || !serviceRole) return null

  const headers = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }
  const filters = [`user_id=eq.${encodeURIComponent(userId)}`]
  const hint = tenantIdHint?.trim()
  if (hint && /^[0-9a-f-]{36}$/i.test(hint)) {
    filters.push(`tenant_id=eq.${encodeURIComponent(hint)}`)
  }
  const memUrl = `${base}/rest/v1/tenant_members?select=tenant_id&${filters.join('&')}&order=created_at.asc&limit=1`
  try {
    const r = await fetch(memUrl, { headers })
    if (!r.ok) return null
    const rows = (await r.json()) as { tenant_id?: string }[]
    const tid = rows?.[0]?.tenant_id
    if (tid) return { scopeType: 'tenant', scopeId: String(tid) }
  } catch {
    return null
  }
  return null
}

export type AiTokenUsageRecordOpts = {
  env: Record<string, string>
  scope?: AiUsageScope | null
  mpOrderId?: string
  /** 大厅商单标签等为平台公共能力，不计入登录账号 */
  skipBilling?: boolean
}

export function sessionTokenFromHeaders(
  headers?: Record<string, string | string[] | undefined>,
): string {
  if (!headers) return ''
  const mpRaw = headers['x-mp-session'] ?? headers['X-Mp-Session']
  if (typeof mpRaw === 'string' && mpRaw.trim()) return mpRaw.trim()
  const authRaw = headers.authorization ?? headers.Authorization
  const auth = typeof authRaw === 'string' ? authRaw.trim() : ''
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim()
  return auth
}

const MP_DEV_PREVIEW_TOKEN = 'dev-preview-local'

/** 星选 mp 会话 → mp_accounts.id（与查询 API 一致，不要求增值服务权限） */
export async function resolveMpAccountScopeFromSessionToken(
  token: string,
): Promise<AiUsageScope | null> {
  const t = token.trim()
  if (!t) return null
  if (t === MP_DEV_PREVIEW_TOKEN) {
    return { scopeType: 'mp_account', scopeId: 'dev-preview' }
  }
  try {
    const { createMpAuthRest, resolveSession } = await import('../src/lib/mpAccountAuth.js')
    const { readMerchantSupabaseAdminEnv } = await import('./merchantSupabaseAdminEnv.js')
    const admin = readMerchantSupabaseAdminEnv()
    if (!admin.supabaseUrl || !admin.serviceRole) return null
    const rest = createMpAuthRest(admin.supabaseUrl, admin.serviceRole)
    const sess = await resolveSession(rest, t)
    if (sess?.account?.id) {
      return { scopeType: 'mp_account', scopeId: sess.account.id }
    }
  } catch {
    return null
  }
  return null
}

/** 从 Authorization / X-Mp-Session 解析 tenant 或 mp_account 作用域 */
export async function resolveAiUsageScopeFromToken(
  token: string,
  env: Record<string, string>,
  tenantIdHint?: string,
): Promise<AiUsageScope | null> {
  const t = token.trim()
  if (!t) return null

  const adminHint = tenantIdHint?.trim()
  if (adminHint && /^[0-9a-f-]{36}$/i.test(adminHint)) {
    return { scopeType: 'tenant', scopeId: adminHint }
  }

  const mpScope = await resolveMpAccountScopeFromSessionToken(t)
  if (mpScope) return mpScope

  try {
    const { verifyBearerJwt } = await import('./aiGateway/authSupabase.js')
    const { loadTenantAiContextForUser } = await import('./tenantMembershipCore.js')
    const user = await verifyBearerJwt(`Bearer ${t}`, env)
    if (!user) return null
    const mpScope = resolveAiUsageScope(user.id, null, tenantIdHint)
    if (mpScope) return mpScope
    const ctx = await loadTenantAiContextForUser(user.id, env, t, tenantIdHint)
    return resolveTenantScopeForUsage(user.id, env, tenantIdHint, ctx)
  } catch {
    return null
  }
}

/** 商单 mpOrderId → 发单 PR 的 mp_accounts.id（达人侧 AI 计入 PR 面板） */
export async function resolvePublisherMpAccountScopeFromOrder(
  env: Record<string, string>,
  mpOrderId: string,
): Promise<AiUsageScope | null> {
  const orderId = mpOrderId.trim()
  if (!orderId) return null
  const { base, serviceRole } = resolveSupabaseAdmin(env)
  if (!base || !serviceRole) return null

  try {
    const { readMerchantSupabaseAdminEnv } = await import('./merchantSupabaseAdminEnv.js')
    const admin = readMerchantSupabaseAdminEnv()
    if (!admin.supabaseUrl || !admin.serviceRole) return null
    const { createRegistrySnapshotIoFetch } = await import('../src/lib/registrySnapshotIoFetch.js')
    const data = await createRegistrySnapshotIoFetch(admin.supabaseUrl, admin.serviceRole).load()
    const order = (data.mpRecruitmentOrders ?? []).find((o) => o && o.id === orderId)
    if (!order) return null
    const meta =
      order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
        ? (order.mpPublishMeta as Record<string, unknown>)
        : {}
    const registryPrId = String(meta.registryPrId || '').trim()
    const lingqiPrId = String(meta.lingqiPrId || '').trim()
    const orParts: string[] = []
    if (registryPrId) orParts.push(`registry_pr_id.eq.${registryPrId}`)
    if (lingqiPrId) orParts.push(`lingqi_pr_id.eq.${lingqiPrId}`)
    if (!orParts.length) return null
    const url = `${base}/rest/v1/mp_accounts?select=id&or=(${orParts.join(',')})&limit=1`
    const r = await fetch(url, {
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    })
    if (!r.ok) return null
    const rows = (await r.json()) as { id?: string }[]
    const accId = rows?.[0]?.id
    if (!accId) return null
    return { scopeType: 'mp_account', scopeId: String(accId) }
  } catch {
    return null
  }
}

export async function resolveAiUsageScopeForRecord(opts: {
  env: Record<string, string>
  scope?: AiUsageScope | null
  token?: string
  tenantIdHint?: string
  mpOrderId?: string
  usageCtx?: TenantAiContext | null
  userId?: string
}): Promise<AiUsageScope | null> {
  if (opts.scope) return opts.scope
  const direct = resolveAiUsageScope(opts.userId ?? '', opts.usageCtx, opts.tenantIdHint)
  if (direct) return direct
  if (opts.userId && !opts.userId.startsWith('mp:')) {
    const tenantScope = await resolveTenantScopeForUsage(
      opts.userId,
      opts.env,
      opts.tenantIdHint,
      opts.usageCtx,
    )
    if (tenantScope) return tenantScope
  }
  if (opts.token?.trim()) {
    const callerScope = await resolveAiUsageScopeFromToken(
      opts.token,
      opts.env,
      opts.tenantIdHint,
    )
    if (callerScope) return callerScope
  }
  // 无登录会话时（如达人小程序合规），按商单发单 PR 计入
  if (opts.mpOrderId?.trim()) {
    return resolvePublisherMpAccountScopeFromOrder(opts.env, opts.mpOrderId)
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
    '请在阿里云控制台登录轻量 139.196.42.5 后执行：cd ~/app && bash scripts/ecs-git-pull-gitee.sh && bash scripts/ecs-fix-ai-token-usage.sh'
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
    if (!r.ok) {
      return { ready: false, hint: `无法读取 ai_token_usage_daily（HTTP ${r.status}）。${migrationHint}` }
    }
    const rpcProbe = await fetch(`${base}/rest/v1/rpc/increment_ai_token_usage`, {
      method: 'POST',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        p_scope_type: 'tenant',
        p_scope_id: '00000000-0000-0000-0000-000000000099',
        p_usage_date: '2099-01-01',
        p_provider: '__storage_probe__',
        p_model: '',
        p_prompt: 0,
        p_completion: 0,
        p_total: 0,
      }),
    })
    const rpcText = await rpcProbe.text().catch(() => '')
    if (rpcProbe.status === 404 || /PGRST202|Could not find the function/i.test(rpcText)) {
      return {
        ready: false,
        hint: `缺少 increment_ai_token_usage 函数。${migrationHint}`,
      }
    }
    return { ready: true }
  } catch (e) {
    return {
      ready: false,
      hint: `无法连接 PostgREST：${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

/** 将 LLM 返回的 usage 规范为 Record<string, number>（兼容 unknown 字段） */
export function coerceLlmUsage(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return Object.keys(out).length ? out : undefined
}

/** 已知 scope 直接记账（LLM/视频/TTS 共用） */
export async function recordAiTokenUsageForScope(opts: {
  scope: AiUsageScope
  env: Record<string, string>
  provider: string
  model?: string | null
  usage?: Record<string, number> | null
  inputText?: string
  outputText?: string
}): Promise<void> {
  let usage = opts.usage
  if (!usage && (opts.inputText || opts.outputText)) {
    const inputCap = String(opts.inputText ?? '').slice(0, 6000)
    const outputCap = String(opts.outputText ?? '').slice(0, 2000)
    usage = estimateLlmTokensFromText(inputCap, outputCap)
  }
  const u = usage ?? {}
  const prompt = Math.max(0, Math.floor(Number(u.prompt_tokens) || 0))
  const completion = Math.max(0, Math.floor(Number(u.completion_tokens) || 0))
  let total = Math.max(0, Math.floor(Number(u.total_tokens) || 0))
  if (!total && (prompt || completion)) total = prompt + completion
  if (!total && !prompt && !completion) total = 1

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
        p_scope_type: opts.scope.scopeType,
        p_scope_id: opts.scope.scopeId,
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

/** LLM 成功后异步记账（招募/核查等 core 模块共用） */
export async function voidRecordLlmTokenUsage(
  record: AiTokenUsageRecordOpts | undefined,
  detail: {
    provider: string
    model?: string | null
    usage?: Record<string, number> | null
    inputText?: string
    outputText?: string
    token?: string
    userId?: string
    tenantIdHint?: string
  },
): Promise<void> {
  if (record?.skipBilling) return
  if (!record) return
  try {
    const scope = await resolveAiUsageScopeForRecord({
      env: record.env,
      scope: record.scope,
      mpOrderId: record.mpOrderId,
      token: detail.token,
      userId: detail.userId,
      tenantIdHint: detail.tenantIdHint,
    })
    if (!scope) {
      console.warn('[aiTokenUsage] skip record: no scope', detail.provider)
      return
    }
    await recordAiTokenUsageForScope({
      scope,
      env: record.env,
      provider: detail.provider,
      model: detail.model,
      usage: detail.usage,
      inputText: detail.inputText,
      outputText: detail.outputText,
    })
  } catch {
    /* 用量记账失败不影响主流程 */
  }
}

/** 从 HTTP 请求解析租户并记账（视频/策划/TTS 等共用） */
export async function recordAiTokenUsageFromHttpRequest(opts: {
  req?: import('node:http').IncomingMessage
  env: Record<string, string>
  provider: string
  model?: string | null
  usage?: Record<string, number> | null
  tenantIdHint?: string
  mpOrderId?: string
  inputText?: string
  outputText?: string
}): Promise<void> {
  try {
    const token = sessionTokenFromHeaders(
      opts.req?.headers as Record<string, string | string[] | undefined> | undefined,
    )
    await voidRecordLlmTokenUsage(
      { env: opts.env, mpOrderId: opts.mpOrderId },
      {
        provider: opts.provider,
        model: opts.model,
        usage: opts.usage,
        inputText: opts.inputText,
        outputText: opts.outputText,
        token,
        tenantIdHint: opts.tenantIdHint,
      },
    )
  } catch {
    /* 用量记账失败不影响主流程 */
  }
}

/** Vercel API handler 专用（支持 X-Mp-Session） */
export async function recordAiTokenUsageFromVercelRequest(
  req: { headers?: Record<string, string | string[] | undefined> },
  env: Record<string, string>,
  opts: {
    provider: string
    model?: string | null
    usage?: Record<string, number> | null
    tenantIdHint?: string
    mpOrderId?: string
    inputText?: string
    outputText?: string
  },
): Promise<void> {
  const token = sessionTokenFromHeaders(req.headers)
  await voidRecordLlmTokenUsage(
    { env, mpOrderId: opts.mpOrderId },
    {
      provider: opts.provider,
      model: opts.model,
      usage: opts.usage,
      inputText: opts.inputText,
      outputText: opts.outputText,
      token,
      tenantIdHint: opts.tenantIdHint,
    },
  )
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
  mpOrderId?: string
}): Promise<void> {
  const scope = await resolveAiUsageScopeForRecord({
    env: opts.env,
    userId: opts.userId,
    usageCtx: opts.usageCtx,
    tenantIdHint: opts.tenantIdHint,
    mpOrderId: opts.mpOrderId,
  })
  if (!scope) {
    console.warn('[aiTokenUsage] skip record: no scope for user', opts.userId.slice(0, 8))
    return
  }
  await recordAiTokenUsageForScope({
    scope,
    env: opts.env,
    provider: opts.provider,
    model: opts.model,
    usage: opts.usage,
  })
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
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
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

    return {
      ok: true,
      range: q.range,
      from,
      to,
      summary,
      byProvider,
      dailySeries,
      storageReady: true,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
    }
  } catch {
    return empty
  }
}

/** 星选面板：解析 mp_accounts 展示名 */
export async function fetchMpAccountUsageLabel(
  accountId: string,
  env: Record<string, string>,
): Promise<string | undefined> {
  const id = accountId.trim()
  if (!id || id === 'dev-preview') return '开发预览'
  const { base, serviceRole } = resolveSupabaseAdmin(env)
  if (!base || !serviceRole) return undefined
  try {
    const url = `${base}/rest/v1/mp_accounts?select=wx_nick_name,login_name&id=eq.${encodeURIComponent(id)}&limit=1`
    const r = await fetch(url, {
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    })
    if (!r.ok) return undefined
    const rows = (await r.json()) as { wx_nick_name?: string; login_name?: string }[]
    const row = rows?.[0]
    const nick = String(row?.wx_nick_name || '').trim()
    const login = String(row?.login_name || '').trim()
    return nick || login || undefined
  } catch {
    return undefined
  }
}
