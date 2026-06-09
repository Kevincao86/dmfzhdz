import type { MpAccount } from './mpSession'
import { getAccount, getToken } from './mpSession'
import { readApplications, readPublishedOrders } from './mpSync/applicationsStore'
import { prParticipantKey } from './mpSync/participant'
import { readPrProfile } from './mpSync/userProfile'
import { formatMpApiErr } from './mpApiErrors'
import { buildMpErpApiUrl, mpApiFetchCandidates, mpErpApiBase } from './mpApiBase'

const REGISTRY_FETCH_MS = 25_000

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
    throw new Error(`接口返回非 JSON（HTTP ${res.status}）`)
  }
}

function throwApiError(data: Record<string, unknown>, status: number) {
  const serverMsg = String(data.message || '').trim()
  const code = String(data.error || data.detail || `http_${status}`).trim()
  if (serverMsg && /[\u4e00-\u9fa5]/.test(serverMsg)) {
    throw new Error(serverMsg)
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

export async function fetchMpRegistry(opts?: { includeMpOrderIds?: string[]; includePrOwned?: boolean }) {
  const includeMpOrderIds = collectIncludeMpOrderIds(opts?.includeMpOrderIds)
  const includePrOwned = opts?.includePrOwned === true
  if (includeMpOrderIds.length || includePrOwned) {
    try {
      const data = await mpAuthRequest('hall_registry', {
        includeMpOrderIds,
        ...(includePrOwned
          ? { includePrOwned: true, ...buildHallRegistryOwnerPayload() }
          : {}),
      })
      return data
    } catch (e) {
      if (includePrOwned) throw e
      /* fallback GET only when not requesting PR-owned orders */
    }
  }
  const paths = ['/api/meoo-ops-mp-hall-registry', '/api/meoo-ops-sync-registry', '/api/ops-sync/registry']
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
  throw new Error(lastErr)
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

export async function patchMpRecruitmentOrder(body: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-patch', '/api/ops-sync/mp-recruitment-orders/patch'],
    body,
  )
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

export async function applyToMpOrder(mpOrderId: string, applicant: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-recruitment-orders-apply', '/api/ops-sync/mp-recruitment-orders/apply'],
    { mpOrderId, applicant },
  )
}

export async function registerTalentMember(member: Record<string, unknown>) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-talent-member-register', '/api/ops-sync/mp-talent-members/register'],
    { member },
  )
}

/** 从注册表数据库拉取当前账号达人/PR/团队资料（权威数据源） */
export async function fetchRegistryProfile(): Promise<{
  talentMember: Record<string, unknown> | null
  prProfile: Record<string, unknown> | null
}> {
  const data = await mpAuthRequest('registry_profile_get', {})
  return {
    talentMember:
      data.talentMember && typeof data.talentMember === 'object'
        ? (data.talentMember as Record<string, unknown>)
        : null,
    prProfile:
      data.prProfile && typeof data.prProfile === 'object'
        ? (data.prProfile as Record<string, unknown>)
        : null,
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
  noticeType?: 'selection' | 'general'
  pinned?: boolean
}

export async function appendTalentInbox(entries: TalentInboxEntry[]) {
  return postMpWithFallback(
    ['/api/meoo-ops-mp-talent-inbox-append', '/api/ops-sync/mp-talent-inbox/append'],
    { entries },
  )
}
