import type {
  RegistryAiModels,
  RegistryFile,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoSubmission,
} from './opsRegistryTypes'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

function url(path: string) {
  const b = apiBase()
  return `${b}${path}`
}

export async function fetchOpsRegistry(): Promise<RegistryFile> {
  const res = await fetch(url('/api/ops-sync/registry'))
  if (!res.ok) throw new Error(`registry ${res.status}`)
  return (await res.json()) as RegistryFile
}

export async function pushErpTenant(tenant: RegistryTenant): Promise<void> {
  const res = await fetch(url('/api/ops-sync/tenants/erp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant }),
  })
  if (!res.ok) throw new Error(`push erp tenant ${res.status}`)
}

export async function pushAiModels(models: Omit<RegistryAiModels, 'updatedAt'> & { updatedAt?: string }): Promise<void> {
  const res = await fetch(url('/api/ops-sync/ai'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      textModel: models.textModel,
      imageModel: models.imageModel,
      lastWriter: models.lastWriter,
    }),
  })
  if (!res.ok) throw new Error(`push ai ${res.status}`)
}

export async function appendRecruitmentOrderToOps(order: RegistryRecruitmentOrder): Promise<void> {
  const res = await fetch(url('/api/ops-sync/recruitment-orders/append'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  })
  if (!res.ok) throw new Error(`append recruitment order ${res.status}`)
}

export async function setTalentPoolCandidatesOnOps(candidates: RegistryTalentPoolRow[]): Promise<void> {
  const res = await fetch(url('/api/ops-sync/talent-pool/set'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates }),
  })
  if (!res.ok) throw new Error(`talent pool set ${res.status}`)
}

export async function setRecruitmentScheduleRowsOnOps(rows: RegistryScheduleRow[]): Promise<void> {
  const res = await fetch(url('/api/ops-sync/recruitment-schedule/set'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  if (!res.ok) throw new Error(`schedule set ${res.status}`)
}

export async function setRecruitmentVideoSubmissionsOnOps(videos: RegistryVideoSubmission[]): Promise<void> {
  const res = await fetch(url('/api/ops-sync/recruitment-videos/set'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videos }),
  })
  if (!res.ok) throw new Error(`videos set ${res.status}`)
}
