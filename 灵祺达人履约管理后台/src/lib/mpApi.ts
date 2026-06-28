import type { MpAccount } from './mpSession'
import { getAccount, getToken } from './mpSession'
import { readApplications, readPublishedOrders } from './mpSync/applicationsStore'
import { prParticipantKey } from './mpSync/participant'
import { readPrProfile } from './mpSync/userProfile'
import { formatMpApiErr } from './mpApiErrors'
import { buildMpErpApiUrl, mpApiFetchCandidates, mpErpApiBase } from './mpApiBase'
import { normalizeHallRegistryPayload } from './mpSync/hallRegistryParse'
import { registryHasRecommendTalentPool } from './mpRecruitment/recommendAllTalentsPool'
import { buildPrWorkflowOrderPatch, type PrWorkflowMeta } from './mpRecruitment/prOrderWorkflowStage'

const REGISTRY_FETCH_MS = 25_000
const HALL_REGISTRY_CACHE_MS = 45_000

let hallRegistryInflight: Partial<Record<string, Promise<Record<string, unknown>>>> = {}
let hallRegistryCache: Partial<
  Record<string, { data: Record<string, unknown>; expiresAt: number }>
> = {}

function registryFetchSignal(): AbortSignal | undefined {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(REGISTRY_FETCH_MS)
  return undefined
}

async function parseJsonRes(res: Response) {
  const text = await res.text()
  if (!text.trim()) {
    throw new Error(
      mpErpApiBase()
        ? `接口返回为空（HTTP ${res.status}）`
        : '接口返回为空：生产环境请配置 VITE_MP_API_BASE；本地请用 npm run dev 启动',
    )
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    if (res.status === 413 || /Request Entity Too Large/i.test(text)) {
      throw new Error('request_entity_too_large')
    }
    throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
  }
}

function throwApiError(data: Record<string, unknown>, status: number) {
  const serverMsg = String(data.message || '').trim()
  const detail = String(data.detail || '').trim()
  const code = String(data.error || data.detail || `http_${status}`).trim()
  if (serverMsg && /[\u4e00-\u9fa5]/.test(serverMsg)) {
    throw new Error(serverMsg)
  }
  if (detail && /[\u4e00-\u9fa5]/.test(detail)) {
    throw new Error(detail)
  }
  throw new Error(formatMpApiErr(new Error(code), '请求失败，请稍后重试'))
}

async function postJsonCandidates(
  apiPath: string,
  body: unknown,
  opts?: { includeVercelSms?: boolean; extraHeaders?: Record<string, string> },
) {
  const candidates = mpApiFetchCandidates(apiPath, opts)
  if (!candidates.length) {
    throw new Error('未配置 VITE_MP_API_BASE，请在 Vercel 设置如 https://mofangdianai.com/erp-api 后重新部署')
  }
  let lastErr = 'request_failed'
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i]!
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...opts?.extraHeaders,
        },
        body: JSON.stringify(body),
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        const err = String(data.error || data.message || `http_${res.status}`)
        if ((res.status === 404 || err === 'not_found') && i < candidates.length - 1) {
          lastErr = err
          continue
        }
        throwApiError(data, res.status)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < candidates.length - 1 && /not_found|404|response_not_json/i.test(lastErr)) continue
      throw e
    }
  }
  throw new Error(lastErr)
}

function apiUrl(path: string) {
  const base = mpErpApiBase()
  if (!base) {
    if (import.meta.env.PROD) {
      throw new Error('未配置 VITE_MP_API_BASE，请在 Vercel 设置如 https://mofangdianai.com/erp-api 后重新部署')
    }
    return path
  }
  return buildMpErpApiUrl(base, path)
}

async function mpAuthRequest(action: string, body: Record<string, unknown> = {}) {
  const token = getToken()
  return postJsonCandidates(
    '/api/meoo-ops-mp-auth',
    { action, ...(token ? { sessionToken: token } : {}), ...body },
    {
      extraHeaders: token ? { 'X-Mp-Session': token } : {},
    },
  )
}

export async function passwordLogin(loginName: string, password: string) {
  const data = await mpAuthRequest('password_login', { loginName, password })
  return {
    token: String(data.token),
    account: data.account as MpAccount,
  }
}

export async function scanCreate() {
  const data = await mpAuthRequest('scan_create')
  return {
    ticket: String(data.ticket),
    expiresAt: String(data.expiresAt),
    qrPayload: String(data.qrPayload),
    pollUrl: String(data.pollUrl),
  }
}

export async function scanPoll(ticket: string) {
  const q = new URLSearchParams({ action: 'scan_poll', ticket })
  const base = mpErpApiBase()
  const path = `/api/meoo-ops-mp-auth?${q}`
  const url = base ? buildMpErpApiUrl(base, path) : path
  const res = await fetch(url)
  const data = await parseJsonRes(res)
  if (!res.ok || data.ok === false) throw new Error(String(data.error))
  return {
    status: String(data.status),
    token: data.token ? String(data.token) : undefined,
    account: data.account as MpAccount | undefined,
    message: data.message ? String(data.message) : undefined,
  }
}

export async function dyOAuthBegin(workIdentity: string) {
  const data = await mpAuthRequest('dy_oauth_begin', { workIdentity })
  return {
    authorizeUrl: String(data.authorizeUrl || ''),
    ticket: String(data.ticket || ''),
    expiresAt: String(data.expiresAt || ''),
    redirectUri: String(data.redirectUri || ''),
  }
}

export async function dyOAuthComplete(code: string, state: string) {
  const data = await mpAuthRequest('dy_oauth_complete', { code, state })
  return {
    token: String(data.token),
    workIdentity: String(data.workIdentity || 'talent'),
    account: data.account as MpAccount,
  }
}

export async function switchRole(role: 'talent' | 'pr') {
  const data = await mpAuthRequest('switch_role', { role })
  return { account: data.account as MpAccount }
}

/** 登录/切换身份后确保 PRID、达人ID 及拍摄/剪辑团队 ID 已写入注册表并绑定账号 */
export async function ensureIdentity(
  role: 'talent' | 'pr',
  workIdentity?: 'talent' | 'shoot' | 'edit',
) {
  const data = await mpAuthRequest('ensure_identity', { role, workIdentity })
  return { account: data.account as MpAccount }
}

export async function fetchSession() {
  const data = await mpAuthRequest('session')
  return { account: data.account as MpAccount }
}

/** 设置登录名；password 留空则仅改登录名、保留原密码 */
export async function setLoginCredentials(loginName: string, password?: string) {
  const data = await mpAuthRequest('set_login_credentials', {
    loginName: loginName.trim(),
    password: password ?? '',
  })
  return { account: data.account as MpAccount }
}

export async function sendRegisterSms(phone: string) {
  return postJsonCandidates('/api/meoo-auth-sms-send', { phone: phone.trim() })
}

export async function phoneRegister(input: {
  phone: string
  smsCode: string
  password: string
  role: 'talent' | 'pr'
}) {
  const data = await mpAuthRequest('register', {
    phone: input.phone.trim(),
    smsCode: input.smsCode.trim(),
    password: input.password,
    role: input.role,
  })
  return {
    token: String(data.token),
    account: data.account as MpAccount,
  }
}

function collectIncludeMpOrderIds(extra?: string[]): string[] {
  const ids = new Set<string>()
  for (const a of readApplications()) {
    const id = String(a.mpOrderId || '').trim()
    if (id) ids.add(id)
  }
  for (const p of readPublishedOrders()) {
    const id = String(p.mpOrderId || '').trim()
    if (id) ids.add(id)
  }
  for (const id of extra || []) {
    const s = String(id || '').trim()
    if (s) ids.add(s)
  }
  return [...ids].slice(0, 120)
}

function buildHallRegistryOwnerPayload() {
  const acc = getAccount()
  const pr = readPrProfile()
  return {
    lingqiPrId: String(acc?.lingqiPrId || pr?.lingqiPrId || '').trim(),
    registryPrId: String(acc?.registryPrId || acc?.registryMemberId || pr?.id || '').trim(),
    prParticipantKey: prParticipantKey(pr),
  }
}

function hallRegistryCacheKey(scope: 'hall' | 'full', includeRecommendPool: boolean): string {
  const acc = getAccount()
  const owner = String(acc?.registryPrId || acc?.lingqiPrId || acc?.registryMemberId || 'anon').trim() || 'anon'
  const pool = includeRecommendPool ? ':rec' : ''
  return `${scope}:${owner}${pool}`
}

function hallRegistryCacheUsable(
  data: Record<string, unknown> | null | undefined,
  includeRecommendPool: boolean,
): boolean {
  if (!hallRegistryHasOrders(data)) return false
  if (includeRecommendPool && !registryHasRecommendTalentPool(data)) return false
  return true
}

function isRetryableRegistryErr(msg: string): boolean {
  return /timeout|abort|reset|502|503|504|ECONNRESET|registry_snapshot|meoo_ops|hall_registry/i.test(msg)
}

async function fetchHallRegistryRemote(opts: {
  includeMpOrderIds: string[]
  includePrOwned: boolean
  includeRecommendPool: boolean
}): Promise<Record<string, unknown>> {
  const { includeMpOrderIds, includePrOwned, includeRecommendPool } = opts
  let lastErr = 'registry_failed'

  if (!includePrOwned && !includeMpOrderIds.length) {
    const getPath = includeRecommendPool
      ? '/api/meoo-ops-mp-hall-registry?includeRecommendPool=1'
      : '/api/meoo-ops-mp-hall-registry'
    try {
      const res = await fetch(apiUrl(getPath), { signal: registryFetchSignal() })
      const data = await parseJsonRes(res)
      if (res.ok && data.ok !== false) {
        return normalizeHallRegistryPayload(data)
      }
      lastErr = String(data.error || data.detail || `http_${res.status}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = /abort/i.test(msg) ? '招募大厅加载超时，请刷新重试' : msg
    }
  }

  try {
    const data = await mpAuthRequest('hall_registry', {
      includeMpOrderIds,
      ...(includePrOwned
        ? { includePrOwned: true, ...buildHallRegistryOwnerPayload() }
        : {}),
      ...(includeRecommendPool ? { includeRecommendPool: true } : {}),
    })
    return normalizeHallRegistryPayload(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg || lastErr)
  }
}

async function fetchFullRegistryRemote(): Promise<Record<string, unknown>> {
  const paths = ['/api/meoo-ops-sync-registry', '/api/ops-sync/registry']
  let lastErr = 'registry_failed'
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path), { signal: registryFetchSignal() })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        lastErr = String(data.error || data.detail || `http_${res.status}`)
        continue
      }
      return data
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = /abort/i.test(msg) ? '招募大厅加载超时，请刷新重试' : msg
    }
  }
  throw new Error(formatMpApiErr(new Error(lastErr), '招募数据加载失败，请刷新重试'))
}

async function fetchRegistryRemoteWithRetry(
  fetchOnce: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  try {
    return await fetchOnce()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isRetryableRegistryErr(msg)) throw e
    await new Promise((r) => setTimeout(r, 400))
    return fetchOnce()
  }
}

function hallRegistryHasOrders(data: Record<string, unknown> | null | undefined): boolean {
  return Array.isArray(data?.mpRecruitmentOrders) && data!.mpRecruitmentOrders!.length > 0
}

export function clearMpRegistryCache(): void {
  hallRegistryCache = {}
  hallRegistryInflight = {}
}

export async function fetchMpRegistry(opts?: {
  includeMpOrderIds?: string[]
  includePrOwned?: boolean
  /** 合并本机报名/发单中的 mpOrderId（仅「我的报名」等场景，大厅勿开） */
  includeLocalContext?: boolean
  /** hall：仅招募单（大厅列表）；full：完整注册表（消息/聊天等） */
  scope?: 'hall' | 'full'
  /** PR 推荐大厅：经 hall_registry POST 附带达人/团队库（须已登录） */
  includeRecommendPool?: boolean
}) {
  const explicitIds = (opts?.includeMpOrderIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean)
  const includeMpOrderIds = opts?.includeLocalContext || opts?.includePrOwned
    ? collectIncludeMpOrderIds(explicitIds)
    : [...new Set(explicitIds)].slice(0, 120)
  const includePrOwned = opts?.includePrOwned === true
  const includeRecommendPool = opts?.includeRecommendPool === true
  const scope = opts?.scope === 'full' ? 'full' : 'hall'

  const now = Date.now()
  const cacheKey = hallRegistryCacheKey(scope, includeRecommendPool)
  /** 详情/报名/PR 发单须带 orderId 拉全量字段（含 visitScheduleMeta），不可复用大厅列表缓存 */
  const bypassHallCache =
    explicitIds.length > 0 || includePrOwned || opts?.includeLocalContext === true
  const cached = bypassHallCache ? undefined : hallRegistryCache[cacheKey]
  if (cached && cached.expiresAt > now && hallRegistryCacheUsable(cached.data, includeRecommendPool)) {
    return cached.data
  }
  const inflightKey = bypassHallCache
    ? `${cacheKey}:ids:${[...includeMpOrderIds].sort().join(',')}${includePrOwned ? ':pr' : ''}${opts?.includeLocalContext ? ':ctx' : ''}`
    : cacheKey
  const inflight = hallRegistryInflight[inflightKey]
  if (inflight) return inflight

  const fetchOnce = async () => {
    if (scope === 'full') {
      return fetchFullRegistryRemote()
    }
    return fetchHallRegistryRemote({
      includeMpOrderIds,
      includePrOwned,
      includeRecommendPool,
    })
  }

  const pending = fetchRegistryRemoteWithRetry(fetchOnce)
    .then((data) => {
      if (hallRegistryCacheUsable(data, includeRecommendPool)) {
        hallRegistryCache[cacheKey] = { data, expiresAt: Date.now() + HALL_REGISTRY_CACHE_MS }
      }
      return data
    })
    .catch((e) => {
      if (cached?.data && hallRegistryCacheUsable(cached.data, includeRecommendPool)) return cached.data
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(formatMpApiErr(new Error(msg), '招募数据加载失败，请刷新重试'))
    })
    .finally(() => {
      delete hallRegistryInflight[inflightKey]
    })
  hallRegistryInflight[inflightKey] = pending
  return pending
}

/** @deprecated use fetchMpRegistry */
export async function fetchHallRegistry() {
  return fetchMpRegistry()
}

export async function postMpRecruitmentAi(body: Record<string, unknown>) {
  const res = await fetch(apiUrl('/api/meoo-mp-recruitment-ai'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'X-Mp-Session': getToken() } : {}) },
    body: JSON.stringify(body),
  })
  const data = await parseJsonRes(res)
  if (!res.ok || data.ok === false) throw new Error(String(data.error || `http_${res.status}`))
  return data
}

export async function fetchRecruitmentPosterDesign(
  order: Record<string, unknown>,
  styleIndex = 0,
) {
  const res = await fetch(apiUrl('/api/meoo-mp-recruitment-share-poster-design'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'X-Mp-Session': getToken() } : {}) },
    body: JSON.stringify({ order, styleIndex }),
  })
  const data = (await parseJsonRes(res)) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.detail || data.error || `http_${res.status}`))
  }
  return data as {
    design: import('./mpSync/recruitmentSharePosterCore').PosterDesignTokens
    fields: import('./mpSync/recruitmentSharePosterCore').PosterInput
    fallback: import('./mpSync/recruitmentSharePosterCore').PosterDesignTokens
  }
}

export type ParsedProfileLink = {
  ok: true
  platform: string
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  gender: '' | '男' | '女'
  accountTags: string[]
  talentGrade?: string
  reviewCount?: string
}

export async function parseProfileLink(link: string, platform = '抖音'): Promise<ParsedProfileLink> {
  const data = await postJsonCandidates(
    '/api/meoo-ops-mp-profile-link-parse',
    { link: String(link || '').trim(), platform },
    { extraHeaders: getToken() ? { 'X-Mp-Session': getToken()! } : {} },
  )
  return { ok: true, ...data } as ParsedProfileLink
}

export type ParsedFormRelaySource = {
  ok: true
  platform: string
  taskDetail: string
  merchantRequirements: string
  city: string
  region: string
  titleHint: string
  budgetHint: string
  recruitPlatform?: string
}

export async function parseFormRelaySource(
  url: string,
  platform?: string,
): Promise<ParsedFormRelaySource> {
  const data = await postJsonCandidates(
    '/api/meoo-ops-mp-form-relay-source-parse',
    { url: String(url || '').trim(), platform },
    { extraHeaders: getToken() ? { 'X-Mp-Session': getToken()! } : {} },
  )
  return { ok: true, ...data } as ParsedFormRelaySource
}

export async function patchMpRecruitmentOrder(body: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-patch', '/api/ops-sync/mp-recruitment-orders/patch'],
    body,
  )
}

export async function initMpGroupQrOssUpload(body: Record<string, unknown>) {
  return postMpWithFallback(['/api/meoo-ops-mp-group-qr-upload-init'], body)
}

export async function patchPrOrderWorkflow(
  mp: Record<string, unknown>,
  patch: PrWorkflowMeta,
  status?: string,
) {
  return patchMpRecruitmentOrder(buildPrWorkflowOrderPatch(mp, patch, status))
}

export async function deleteMpRecruitmentOrder(id: string) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-delete', '/api/ops-sync/mp-recruitment-orders/delete'],
    { id: String(id || '').trim() },
  )
}

async function postMpWithFallback(paths: string[], body: Record<string, unknown>) {
  let lastErr = 'request_failed'
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'X-Mp-Session': getToken() } : {}) },
        body: JSON.stringify(body),
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) {
        const detail = String(data.detail || data.message || '').trim()
        lastErr = detail ? `${String(data.error || `http_${res.status}`)}: ${detail}` : String(data.error || `http_${res.status}`)
        if (/404|not_found/i.test(lastErr)) continue
        throw new Error(lastErr)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  throw new Error(lastErr)
}

export async function bumpMpRecruitmentEngagement(
  mpOrderId: string,
  action: 'detail_view' | 'form_relay_click',
) {
  return postMpWithFallback(['/api/meoo-ops-mp-recruitment-engagement-bump'], { mpOrderId, action })
}

export async function applyToMpOrder(
  mpOrderId: string,
  applicant: Record<string, unknown>,
  workIdentity?: string,
  claimSlotCount?: number,
) {
  const body: Record<string, unknown> = { mpOrderId, applicant }
  const wid = String(workIdentity || '').trim()
  if (wid) body.workIdentity = wid
  if (claimSlotCount != null && Number.isFinite(claimSlotCount)) {
    body.claimSlotCount = Math.max(1, Math.floor(claimSlotCount))
  }
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-apply', '/api/ops-sync/mp-recruitment-orders/apply'],
    body,
  )
}

export async function submitEditDeliverLinks(
  mpOrderId: string,
  applicantId: string,
  deliverText: string,
) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-edit-deliver-submit', '/api/ops-sync/mp-recruitment-edit-deliver-submit'],
    { mpOrderId, applicantId, deliverText },
  )
}

export async function registerTalentMember(member: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-talent-member-register', '/api/ops-sync/mp-talent-members/register'],
    { member },
  )
}

export type TalentPrExclusiveQuoteRow = {
  prLingqiId: string
  prRegistryId?: string
  prDisplayName?: string
  platform: string
  quoteYuan: number
  note?: string
  updatedAt: string
}

export async function fetchTalentPrQuotes(): Promise<TalentPrExclusiveQuoteRow[]> {
  const token = getToken()
  const urls = mpApiFetchCandidates('/api/meoo-ops-mp-talent-pr-quotes')
  let lastErr = 'request_failed'
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: token ? { 'X-Mp-Session': token } : {},
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) throwApiError(data, res.status)
      const quotes = Array.isArray(data.quotes) ? data.quotes : []
      return quotes as TalentPrExclusiveQuoteRow[]
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function upsertTalentPrQuote(input: {
  prLingqiId: string
  prRegistryId?: string
  prDisplayName?: string
  platform: string
  quoteYuan: number
  note?: string
}): Promise<TalentPrExclusiveQuoteRow[]> {
  const data = await postMpWithFallback(['/api/meoo-ops-mp-talent-pr-quotes'], {
    action: 'upsert',
    ...input,
  })
  return (Array.isArray(data.quotes) ? data.quotes : []) as TalentPrExclusiveQuoteRow[]
}

export async function deleteTalentPrQuote(prLingqiId: string, platform: string): Promise<TalentPrExclusiveQuoteRow[]> {
  const data = await postMpWithFallback(['/api/meoo-ops-mp-talent-pr-quotes'], {
    action: 'delete',
    prLingqiId,
    platform,
  })
  return (Array.isArray(data.quotes) ? data.quotes : []) as TalentPrExclusiveQuoteRow[]
}

export type MpPrUserSearchHit = {
  id: string
  lingqiPrId: string
  displayName: string
  city?: string
  accountType?: string
}

export async function searchPrUsers(query: string): Promise<MpPrUserSearchHit[]> {
  const q = String(query || '').trim()
  if (!q) return []
  const token = getToken()
  const urls = mpApiFetchCandidates(`/api/meoo-ops-mp-pr-user-search?q=${encodeURIComponent(q)}`)
  let lastErr = 'request_failed'
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: token ? { 'X-Mp-Session': token } : {},
      })
      const data = await parseJsonRes(res)
      if (!res.ok || data.ok === false) throwApiError(data, res.status)
      return Array.isArray(data.results) ? (data.results as MpPrUserSearchHit[]) : []
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export type TalentCooperationStats = {
  minYuan: number
  maxYuan: number
  avgYuan: number
  sampleCount: number
  windowDays: number
}

export async function fetchTalentCooperationStats(
  talents: Array<{
    key: string
    lingqiTalentId?: string
    talentMemberId?: string
    platformAccount?: string
    wxOpenId?: string
    platform?: string
  }>,
  windowDays = 30,
): Promise<Record<string, TalentCooperationStats | null>> {
  const data = await postMpWithFallback(['/api/meoo-ops-mp-talent-cooperation-stats'], {
    windowDays,
    talents,
  })
  const stats = data.stats
  return stats && typeof stats === 'object' ? (stats as Record<string, TalentCooperationStats | null>) : {}
}

/** 从注册表数据库拉取当前账号达人/PR/团队资料（权威数据源） */
export async function fetchRegistryProfile(): Promise<{
  talentMember: Record<string, unknown> | null
  prProfile: Record<string, unknown> | null
  prFeatureAccess: { addons: boolean; recommendHall: boolean }
  mpMembershipPlan: string
  mpMembershipExpiresAt?: string
}> {
  const data = await mpAuthRequest('registry_profile_get', {})
  const raw = data.prFeatureAccess as { addons?: boolean; recommendHall?: boolean } | undefined
  const expiresRaw = data.mpMembershipExpiresAt
  return {
    talentMember:
      data.talentMember && typeof data.talentMember === 'object'
        ? (data.talentMember as Record<string, unknown>)
        : null,
    prProfile:
      data.prProfile && typeof data.prProfile === 'object'
        ? (data.prProfile as Record<string, unknown>)
        : null,
    prFeatureAccess: {
      addons: raw?.addons === true,
      recommendHall: raw?.recommendHall === true,
    },
    mpMembershipPlan: String(data.mpMembershipPlan || 'basic').trim() || 'basic',
    mpMembershipExpiresAt:
      typeof expiresRaw === 'string' && expiresRaw.trim() ? expiresRaw.trim() : undefined,
  }
}

export type MpMembershipOrderRow = {
  id: string
  role: 'pr' | 'talent' | 'shoot' | 'edit'
  planId: string
  billing: 'monthly' | 'yearly'
  amountCents: number
  channel: 'wechat' | 'alipay'
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  outTradeNo?: string
  payMode?: 'manual' | 'wechat_native' | 'wechat_jsapi'
  paidAt?: string
}

export type MpPointsOrderRow = {
  id: string
  role: 'pr' | 'talent' | 'shoot' | 'edit'
  points: number
  amountCents: number
  channel: 'wechat' | 'alipay'
  status: 'pending' | 'confirmed' | 'rejected'
  createdAt: string
  outTradeNo?: string
  payMode?: 'manual' | 'wechat_native' | 'wechat_jsapi'
  paidAt?: string
}

/** 我的订单：会员开通 + 积分充值 */
export async function fetchMyPaymentOrders(): Promise<{
  membershipOrders: MpMembershipOrderRow[]
  pointsOrders: MpPointsOrderRow[]
}> {
  const data = await mpAuthRequest('my_payment_orders_list', {})
  return {
    membershipOrders: Array.isArray(data.membershipOrders)
      ? (data.membershipOrders as MpMembershipOrderRow[])
      : [],
    pointsOrders: Array.isArray(data.pointsOrders)
      ? (data.pointsOrders as MpPointsOrderRow[])
      : [],
  }
}

/** 本机态与云端合并同步（报名/草稿/通知） */
export async function syncClientState(state: Record<string, unknown>) {
  const data = await mpAuthRequest('client_state_sync', { state })
  return {
    state: (data.state || {}) as Record<string, unknown>,
    updatedAt: data.updatedAt ? String(data.updatedAt) : '',
  }
}

/** 微信群可点击报名短链（微信 genwxashortlink） */
export async function fetchMpApplyShortLink(mpOrderId: string, title?: string) {
  const data = await mpAuthRequest('mp_apply_shortlink_get', {
    mpOrderId: String(mpOrderId || '').trim(),
    title: String(title || '').trim(),
  })
  return {
    link: String(data.link || '').trim(),
    source: String(data.source || '').trim(),
  }
}

/** 招募详情页微信官方小程序码（圆形太阳码 PNG data URL） */
export async function fetchMpApplyWxacode(mpOrderId: string) {
  const data = await mpAuthRequest('mp_apply_wxacode_get', {
    mpOrderId: String(mpOrderId || '').trim(),
  })
  return {
    dataUrl: String(data.dataUrl || '').trim(),
    source: String(data.source || '').trim(),
  }
}

export async function registerPrUser(prUser: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-pr-user-register', '/api/ops-sync/mp-pr-users/register'],
    { prUser },
  )
}

export async function appendMpRecruitmentOrder(order: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-append', '/api/ops-sync/mp-recruitment-orders/append'],
    { order },
  )
}

export async function updateMpRecruitmentOrder(order: Record<string, unknown>) {
  const id = String(order.id || '')
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-patch', '/api/ops-sync/mp-recruitment-orders/patch'],
    { id, order },
  )
}

export type TalentInboxEntry = {
  talentMemberId: string
  title: string
  body: string
  category?: 'order' | 'business' | 'system'
  mpOrderId?: string
  contact?: string
  platformAccount?: string
  applicantId?: string
  imageUrl?: string
  noticeType?: 'selection' | 'general' | 'schedule'
  pinned?: boolean
}

export async function appendTalentInbox(entries: TalentInboxEntry[]) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-talent-inbox-append', '/api/ops-sync/mp-talent-inbox/append'],
    { entries },
  )
}
