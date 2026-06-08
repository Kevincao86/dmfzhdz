import type {
  RegistryAiModels,
  RegistryFile,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoSubmission,
} from './opsRegistryTypes'
import type { MpRecruitmentPatchBody } from './mpRecruitmentOrderRegistryMutations'
import type { RecruitmentOrderPatchBody } from './recruitmentOrderPatchMutations'
import { buildMerchantErpApiUrl, merchantErpApiBase } from './merchantErpApiBase'
import { supabase, supabaseConfigured } from './supabaseClient'
import {
  filterRegistrySnapshotForMerchant,
  stripRegistryRecruitmentForAnonymous,
} from './registryTenantIsolation'
import { filterRegistryForTenant } from './tenantRegistryScope'
import { fetchPrimaryTenantId } from './tenantBilling'

const REGISTRY_FETCH_TIMEOUT_MS = 18_000

function registryFetchSignal(): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(REGISTRY_FETCH_TIMEOUT_MS)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), REGISTRY_FETCH_TIMEOUT_MS)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

/** 注册表：cs 等静态站固定走轻量 /erp-api，避免同源 /api 双跳 pending。 */
function registryFetchUrls(path: string): string[] {
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  const erp = merchantErpApiBase()
  if (erp) add(buildMerchantErpApiUrl(erp, path))
  const admin = (import.meta.env.VITE_MERCHANT_ADMIN_ORIGIN as string | undefined)?.replace(/\/$/, '')?.trim()
  if (admin) add(`${admin}${path}`)
  const apiBase = (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined)?.replace(/\/$/, '')?.trim()
  if (apiBase) add(`${apiBase}${path}`)
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host !== 'cs.mofangdianai.com') add(`${window.location.origin}${path}`)
  }
  return urls
}

async function registryAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!supabaseConfigured || !supabase) return headers
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    /* ignore */
  }
  return headers
}

async function fetchRegistryAt(path: string): Promise<RegistryFile> {
  const headers = await registryAuthHeaders()
  let lastErr = 'registry_unreachable'
  for (const url of registryFetchUrls(path)) {
    try {
      const res = await fetch(url, { headers, signal: registryFetchSignal() })
      const text = await res.text()
      if (!res.ok) {
        lastErr = `registry ${res.status}`
        continue
      }
      try {
        return JSON.parse(text) as RegistryFile
      } catch {
        lastErr = 'registry_non_json'
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

/** 线上 ERP 与 Vercel 扁平 `/api/meoo-*` 对齐；未部署时回退旧路径（运营台域名）。 */
async function postRegistrySync(pathMeoo: string, pathLegacy: string, jsonBody: unknown): Promise<Response> {
  const payload = JSON.stringify(jsonBody)
  const headers = await registryAuthHeaders()
  for (const url of registryFetchUrls(pathMeoo)) {
    try {
      const r1 = await fetch(url, { method: 'POST', headers, body: payload, signal: registryFetchSignal() })
      if (r1.ok) return r1
    } catch {
      /* try next */
    }
  }
  for (const url of registryFetchUrls(pathLegacy)) {
    try {
      return await fetch(url, { method: 'POST', headers, body: payload, signal: registryFetchSignal() })
    } catch {
      /* try next */
    }
  }
  throw new Error('registry_post_unreachable')
}

async function resolveClientTenantId(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  return fetchPrimaryTenantId(supabase)
}

/** 优先扁平路由；服务端按 JWT 过滤招募数据，客户端再按租户兜底。 */
export async function fetchOpsRegistry(): Promise<RegistryFile> {
  let raw: RegistryFile
  try {
    raw = await fetchRegistryAt('/api/meoo-ops-sync-registry')
  } catch {
    raw = await fetchRegistryAt('/api/ops-sync/registry')
  }
  const tenantId = await resolveClientTenantId()
  if (tenantId) return filterRegistrySnapshotForMerchant(tenantId, raw)
  return stripRegistryRecruitmentForAnonymous(raw)
}

/** 商户 ERP：仅返回当前租户的招募/排期/视频/Brief 相关切片 */
export async function fetchOpsRegistryForTenant(tenantId: string | null): Promise<RegistryFile> {
  if (!tenantId) {
    const raw = await fetchOpsRegistry()
    return filterRegistryForTenant(raw, null)
  }
  const raw = await fetchOpsRegistry()
  return filterRegistryForTenant(raw, tenantId)
}

export async function pushErpTenant(tenant: RegistryTenant): Promise<void> {
  const res = await postRegistrySync('/api/meoo-ops-sync-tenants-erp', '/api/ops-sync/tenants/erp', { tenant })
  if (!res.ok) throw new Error(`push erp tenant ${res.status}`)
}

export async function pushAiModels(models: Omit<RegistryAiModels, 'updatedAt'> & { updatedAt?: string }): Promise<void> {
  const res = await postRegistrySync('/api/meoo-ops-sync-ai', '/api/ops-sync/ai', {
    textModel: models.textModel,
    imageModel: models.imageModel,
    lastWriter: models.lastWriter,
  })
  if (!res.ok) throw new Error(`push ai ${res.status}`)
}

export async function appendRecruitmentOrderToOps(order: RegistryRecruitmentOrder): Promise<void> {
  const res = await postRegistrySync(
    '/api/meoo-ops-recruitment-orders-append',
    '/api/ops-sync/recruitment-orders/append',
    { order },
  )
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).trim()
    } catch {
      /* noop */
    }
    throw new Error(detail ? `HTTP ${res.status}: ${detail.slice(0, 400)}` : `HTTP ${res.status}`)
  }
}

async function postRegistryPath(pathMeoo: string, pathLegacy: string, body: string): Promise<Response> {
  const headers = await registryAuthHeaders()
  for (const url of registryFetchUrls(pathMeoo)) {
    try {
      const r1 = await fetch(url, { method: 'POST', headers, body, signal: registryFetchSignal() })
      if (r1.ok) return r1
    } catch {
      /* try next */
    }
  }
  for (const url of registryFetchUrls(pathLegacy)) {
    try {
      return await fetch(url, { method: 'POST', headers, body, signal: registryFetchSignal() })
    } catch {
      /* try next */
    }
  }
  throw new Error('registry_post_unreachable')
}

export async function setTalentPoolCandidatesOnOps(candidates: RegistryTalentPoolRow[]): Promise<void> {
  const body = JSON.stringify({ candidates })
  const res = await postRegistryPath('/api/meoo-ops-talent-pool-set', '/api/ops-sync/talent-pool/set', body)
  if (!res.ok) throw new Error(`talent pool set ${res.status}`)
}

export async function setRecruitmentScheduleRowsOnOps(rows: RegistryScheduleRow[]): Promise<void> {
  const body = JSON.stringify({ rows })
  const res = await postRegistryPath(
    '/api/meoo-ops-recruitment-schedule-set',
    '/api/ops-sync/recruitment-schedule/set',
    body,
  )
  if (!res.ok) throw new Error(`schedule set ${res.status}`)
}

export async function patchRecruitmentOrderOnOps(body: RecruitmentOrderPatchBody): Promise<{ ok: boolean; error?: string }> {
  const res = await postRegistrySync(
    '/api/meoo-ops-recruitment-orders-patch',
    '/api/ops-sync/recruitment-orders/patch',
    body,
  )
  if (!res.ok) {
    let err = `patch recruitment ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) err = j.error
    } catch {
      /* ignore */
    }
    return { ok: false, error: err }
  }
  return { ok: true }
}

export async function appendMpRecruitmentOrderToOps(
  order: RegistryMpRecruitmentOrder,
): Promise<{ ok: boolean; id?: string; error?: string; existingId?: string }> {
  const res = await postRegistrySync(
    '/api/meoo-ops-mp-recruitment-orders-append',
    '/api/ops-sync/mp-recruitment-orders/append',
    { order },
  )
  let data: { ok?: boolean; error?: string; id?: string; existingId?: string } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false, error: data.error ?? `append mp ${res.status}`, existingId: data.existingId }
  }
  return { ok: true, id: data.id ?? order.id }
}

export async function patchMpRecruitmentOrderOnOps(body: MpRecruitmentPatchBody): Promise<{ ok: boolean; error?: string }> {
  const res = await postRegistrySync(
    '/api/meoo-ops-mp-recruitment-orders-patch',
    '/api/ops-sync/mp-recruitment-orders/patch',
    body,
  )
  if (!res.ok) {
    let err = `patch mp ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) err = j.error
    } catch {
      /* ignore */
    }
    return { ok: false, error: err }
  }
  return { ok: true }
}

export type TalentInboxEntryInput = {
  talentMemberId: string
  title: string
  body: string
  category?: 'order' | 'business' | 'system'
  mpOrderId?: string
  contact?: string
  platformAccount?: string
  applicantId?: string
  imageUrl?: string
  noticeType?: 'selection' | 'general' | 'video_reject'
}

export async function appendTalentInboxOnOps(entries: TalentInboxEntryInput[]): Promise<{ ok: boolean; count?: number }> {
  const res = await postRegistrySync('/api/meoo-ops-mp-talent-inbox-append', '/api/ops-sync/mp-talent-inbox/append', {
    entries,
  })
  if (!res.ok) return { ok: false }
  try {
    const j = (await res.json()) as { count?: number }
    return { ok: true, count: j.count }
  } catch {
    return { ok: true }
  }
}

export async function setRecruitmentVideoSubmissionsOnOps(videos: RegistryVideoSubmission[]): Promise<void> {
  const headers = await registryAuthHeaders()
  for (const url of registryFetchUrls('/api/ops-sync/recruitment-videos/set')) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ videos }),
        signal: registryFetchSignal(),
      })
      if (!res.ok) throw new Error(`videos set ${res.status}`)
      return
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('videos set ')) throw e
    }
  }
  throw new Error('videos set unreachable')
}
