/**
 * Dev：本机 Vite 插件直接读写「项目根/.meoo-dev-sync」注册表，与 ERP 共用。
 */
export type RegistryTenantSource = 'erp' | 'ops_manual' | 'supabase'

export type RegistryTenant = {
  id: string
  source: RegistryTenantSource
  loginName: string
  passwordHash?: string
  merchantName: string
  industry: string
  registeredAt: string
  accountStatus: 'normal' | 'disabled' | 'frozen'
  trialDays: number
  officialDays: number
  trialEndsAt?: string
  officialEndsAt?: string
  updatedAt: string
  /** Supabase Auth 登录邮箱（仅云端租户列表合并时填充） */
  authLoginEmail?: string
  /** 注册手机号（Supabase 租户列表合并时填充） */
  phone?: string
  walletBalanceCents?: number
  serviceExpireAt?: string
}

export type AiVendorCatalogEntry = {
  id: string
  label: string
  hint?: string
  logoUrl?: string
}

export type VendorKeyModelId =
  | 'minimax'
  | 'qwen'
  | 'doubao'
  | 'openai'
  | 'claude'
  | 'deepseek'
  | 'kimi'

export type RegistryVendorKeys = Partial<Record<string, string>>

export type RegistryAiModels = {
  textModel: string
  imageModel: string
  updatedAt: string
  lastWriter: 'erp' | 'ops'
  controlledByOps: boolean
}

export type RegistryRecruitmentOrder = {
  id: string
  customerName: string
  storeName: string
  talentId: string
  talentName: string
  fans: number
  accountType: string
  coopTimes: number
  createdAt: string
  status: 'pending' | 'accepted' | 'done' | 'cancelled' | 'refunded'
  serviceAmount: number
  commissionPct: number
  netAmount: number
  storeAddress: string
  category: string
  infoSummary?: string
  acceptMode?: 'manual' | 'miniprogram'
  linkedMpOrderId?: string
  recruitmentPlatform?: '抖音' | '小红书'
}

export type RegistryMpRecruitmentApplicant = {
  id: string
  name: string
  platform: string
  platformAccount?: string
  platformNickname?: string
  followers: number
  douyinSalesLevel?: string
  contact: string
  wechatId?: string
  quotePrice?: string
  visitTimeSlot?: string
  alipayAccount?: string
  intro?: string
  profileLink?: string
  paymentMethod?: string
  mpOrderId?: string
  merchantOrderNo?: string
  appliedAt: string
  province?: string
  city?: string
}

export type RegistryTalentLibraryEntry = {
  id: string
  platform: '抖音' | '小红书'
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  douyinSalesLevel?: string
  contact: string
  wechatId: string
  quotePrice: string
  paymentMethod: string
  alipayAccount?: string
  visitTimeSlot?: string
  updatedAt: string
  lastMpOrderId?: string
  lastMerchantOrderNo?: string
  province?: string
  city?: string
}

export type RegistryMpRecruitmentOrder = {
  id: string
  sourceMerchantOrderId: string
  customerName: string
  storeName: string
  merchantRequirements: string
  status: 'open' | 'collecting' | 'closed' | 'done'
  createdAt: string
  updatedAt: string
  applicants?: RegistryMpRecruitmentApplicant[]
  title?: string
  recruitmentInfo?: string
  taskDetail?: string
  platform?: string
  fansRequirement?: string
  budgetText?: string
  recruitCount?: number
  region?: string
  category?: string
  serviceAmount?: number
  /** 加急单 → 达人端急单大厅；否则招募大厅 */
  urgent?: boolean
}

export type RegistryTalentPoolRow = {
  id: string
  name: string
  platform: string
  contentFormat: string
  status: 'pending_confirm' | 'confirmed' | 'rejected' | 'communicating'
  followers: number
  niche: string
  baseFee: number
  bonus: number
  schedulingConflict?: boolean
  sourceRecruitmentOrderId?: string
}

export type RegistryScheduleRow = {
  id: string
  time: string
  talentName: string
  storeName: string
  tableNote: string
}

export type RegistryVideoSubmission = {
  id: string
  author: string
  title: string
  status: 'pending' | 'passed' | 'rejected'
  submittedAt: string
  aiNote: string
  thumbUrl?: string
  duration?: string
}

export type RegistryVideoAi = {
  klingAccessKey?: string
  klingSecretKey?: string
  klingApiBase?: string
  arkVideoEndpoints?: string
  arkVideoApiKey?: string
}

export type RegistryFile = {
  tenants: RegistryTenant[]
  aiModels: RegistryAiModels
  vendorKeys: RegistryVendorKeys
  vendorKeysUpdatedAt: string
  vendorKeysWriter: 'erp' | 'ops'
  /** 网关 GET 会与内置目录合并后再返回 */
  aiVendorCatalog?: AiVendorCatalogEntry[]
  videoAi?: RegistryVideoAi
  videoAiUpdatedAt?: string
  videoAiWriter?: 'erp' | 'ops'
  recruitmentOrders?: RegistryRecruitmentOrder[]
  mpRecruitmentOrders?: RegistryMpRecruitmentOrder[]
  talentLibraryEntries?: RegistryTalentLibraryEntry[]
  talentPoolCandidates?: RegistryTalentPoolRow[]
  recruitmentScheduleRows?: RegistryScheduleRow[]
  recruitmentVideoSubmissions?: RegistryVideoSubmission[]
}

function mapHttpError(status: number): string {
  if (status === 502 || status === 503) return '服务暂不可用（请确认本目录已 npm install 且 vite 插件已加载）'
  if (status === 404) return '未找到注册表接口（线上请确认已部署最新版并包含 meoo-ops-* 扁平 API）'
  return `http_${status}`
}

/** 线上 Vercel 优先扁平路由，dev 回退 ops-sync 多段路径 */
async function postRegistrySync(
  paths: string[],
  body: unknown,
): Promise<{ res: Response; j: Record<string, unknown> }> {
  let lastRes: Response | undefined
  let lastJ: Record<string, unknown> = {}
  for (const path of paths) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) return { res, j }
    lastRes = res
    lastJ = j
    if (res.status !== 404) break
  }
  return { res: lastRes!, j: lastJ }
}

export async function fetchRegistry(): Promise<RegistryFile> {
  const paths = ['/api/meoo-ops-sync-registry', '/api/ops-sync/registry']
  let lastErr: Error | undefined
  for (const path of paths) {
    try {
      const res = await fetch(path)
      const text = await res.text()
      if (!res.ok) {
        try {
          const j = JSON.parse(text) as {
            error?: string
            detail?: string
            hint?: string
            ok?: boolean
          }
          const parts = [j.detail, j.hint, j.error].filter((x) => typeof x === 'string' && x.trim())
          if (parts.length) throw new Error(parts.join(' — '))
        } catch (e) {
          if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e
        }
        const snippet = text.trim().slice(0, 280)
        throw new Error(snippet || mapHttpError(res.status))
      }
      try {
        return JSON.parse(text) as RegistryFile
      } catch {
        throw new Error('注册表接口返回非 JSON，请检查 Vercel 是否已部署 /api/meoo-ops-sync-registry')
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr ?? new Error('fetch_registry_failed')
}

export type ManualTenantPayload = {
  loginName: string
  password: string
  merchantName: string
  trialDays: number
  officialDays: number
}

export async function postManualTenant(body: ManualTenantPayload): Promise<{ ok: boolean; id?: string; error?: string }> {
  const res = await fetch('/api/ops-sync/tenants/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string }
  if (!res.ok) return { ok: false, error: j.error ?? mapHttpError(res.status) }
  return { ok: j.ok !== false, id: j.id }
}

export type PatchTenantPayload = {
  id: string
  merchantName?: string
  industry?: string
  accountStatus?: RegistryTenant['accountStatus']
  trialDays?: number
  officialDays?: number
  /** ≥6 字符：写入注册表 passwordHash（SHA-256 hex），与手动创建一致 */
  password?: string
}

export async function patchTenant(body: PatchTenantPayload): Promise<{
  ok: boolean
  error?: string
  detail?: string
}> {
  const res = await fetch('/api/ops-sync/tenants/patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    detail?: string
  }
  if (!res.ok)
    return {
      ok: false,
      error: j.error ?? mapHttpError(res.status),
      detail: typeof j.detail === 'string' ? j.detail : undefined,
    }
  return { ok: j.ok !== false, detail: typeof j.detail === 'string' ? j.detail : undefined }
}

export async function postAiModels(body: {
  textModel: string
  imageModel: string
  lastWriter: 'ops'
}): Promise<void> {
  const res = await fetch('/api/ops-sync/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(mapHttpError(res.status))
}

export async function postVendorKeys(body: {
  keys: RegistryVendorKeys
  /** 仅存自定义条目；网关会与内置目录合并后再落盘 */
  aiVendorCatalog?: AiVendorCatalogEntry[]
  lastWriter?: 'erp' | 'ops'
}): Promise<void> {
  const res = await fetch('/api/ops-sync/vendor-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, lastWriter: body.lastWriter ?? 'ops' }),
  })
  if (!res.ok) throw new Error(mapHttpError(res.status))
}

export async function postVideoAiBindings(body: {
  videoAi: RegistryVideoAi
  lastWriter?: 'erp' | 'ops'
}): Promise<void> {
  const res = await fetch('/api/ops-sync/video-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, lastWriter: body.lastWriter ?? 'ops' }),
  })
  if (!res.ok) throw new Error(mapHttpError(res.status))
}

export async function appendTalentPoolCandidates(
  candidates: RegistryTalentPoolRow[],
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/ops-sync/talent-pool/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates }),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: j.error ?? mapHttpError(res.status) }
  return { ok: j.ok !== false }
}

export async function patchRecruitmentOrder(body: {
  id: string
  status?: RegistryRecruitmentOrder['status']
  acceptMode?: RegistryRecruitmentOrder['acceptMode']
  linkedMpOrderId?: string
  recruitmentPlatform?: RegistryRecruitmentOrder['recruitmentPlatform']
}): Promise<{ ok: boolean; error?: string }> {
  const { res, j } = await postRegistrySync(
    ['/api/meoo-ops-recruitment-orders-patch', '/api/ops-sync/recruitment-orders/patch'],
    body,
  )
  if (!res.ok) return { ok: false, error: (j.error as string) ?? mapHttpError(res.status) }
  return { ok: j.ok !== false }
}

export async function appendMpRecruitmentOrder(
  order: RegistryMpRecruitmentOrder,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { res, j } = await postRegistrySync(
    ['/api/meoo-ops-mp-recruitment-orders-append', '/api/ops-sync/mp-recruitment-orders/append'],
    { order },
  )
  if (!res.ok) return { ok: false, error: (j.error as string) ?? mapHttpError(res.status) }
  return { ok: j.ok !== false, id: typeof j.id === 'string' ? j.id : undefined }
}

export async function patchMpRecruitmentOrder(body: {
  id: string
  status: RegistryMpRecruitmentOrder['status']
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/ops-sync/mp-recruitment-orders/patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: j.error ?? mapHttpError(res.status) }
  return { ok: j.ok !== false }
}

export async function setRecruitmentOrders(orders: RegistryRecruitmentOrder[]): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/ops-sync/recruitment-orders/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orders }),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: j.error ?? mapHttpError(res.status) }
  return { ok: j.ok !== false }
}
