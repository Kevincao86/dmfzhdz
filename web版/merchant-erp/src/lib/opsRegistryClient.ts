import type {
  RegistryAiModels,
  RegistryFile,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoSubmission,
} from './opsRegistryTypes'
import { supabase, supabaseConfigured } from './supabaseClient'
import {
  filterRegistrySnapshotForMerchant,
  stripRegistryRecruitmentForAnonymous,
} from './registryTenantIsolation'
import { filterRegistryForTenant } from './tenantRegistryScope'
import { fetchPrimaryTenantId } from './tenantBilling'

/** 注册表与商户网关分离：优先运营台域名（线上 ERP 静态站无 /api/ops-sync 时需配置）。 */
function registryApiBase(): string {
  const admin = (import.meta.env.VITE_MERCHANT_ADMIN_ORIGIN as string | undefined)?.replace(/\/$/, '')?.trim()
  if (admin) return admin
  return (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
}

function url(path: string) {
  const b = registryApiBase()
  return `${b}${path}`
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
  const res = await fetch(url(path), { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`registry ${res.status}`)
  try {
    return JSON.parse(text) as RegistryFile
  } catch {
    throw new Error('registry_non_json')
  }
}

/** 线上 ERP 与 Vercel 扁平 `/api/meoo-*` 对齐；未部署时回退旧路径（运营台域名）。 */
async function postRegistrySync(pathMeoo: string, pathLegacy: string, jsonBody: unknown): Promise<Response> {
  const payload = JSON.stringify(jsonBody)
  const headers = await registryAuthHeaders()
  const r1 = await fetch(url(pathMeoo), { method: 'POST', headers, body: payload })
  if (r1.ok) return r1
  return fetch(url(pathLegacy), { method: 'POST', headers, body: payload })
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

export async function setTalentPoolCandidatesOnOps(candidates: RegistryTalentPoolRow[]): Promise<void> {
  const headers = await registryAuthHeaders()
  const body = JSON.stringify({ candidates })
  const r1 = await fetch(url('/api/meoo-ops-talent-pool-set'), { method: 'POST', headers, body })
  if (r1.ok) return
  const res = await fetch(url('/api/ops-sync/talent-pool/set'), { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`talent pool set ${res.status}`)
}

export async function setRecruitmentScheduleRowsOnOps(rows: RegistryScheduleRow[]): Promise<void> {
  const headers = await registryAuthHeaders()
  const body = JSON.stringify({ rows })
  const r1 = await fetch(url('/api/meoo-ops-recruitment-schedule-set'), { method: 'POST', headers, body })
  if (r1.ok) return
  const res = await fetch(url('/api/ops-sync/recruitment-schedule/set'), { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`schedule set ${res.status}`)
}

export async function setRecruitmentVideoSubmissionsOnOps(videos: RegistryVideoSubmission[]): Promise<void> {
  const headers = await registryAuthHeaders()
  const res = await fetch(url('/api/ops-sync/recruitment-videos/set'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ videos }),
  })
  if (!res.ok) throw new Error(`videos set ${res.status}`)
}
