/**
 * Dev：本机 Vite 插件直接读写「项目根/.meoo-dev-sync」注册表，与 ERP 共用。
 * 线上：浏览器优先经 ECS /erp-api 读写 Supabase 快照（Vercel Function 无法访问 ECS）。
 */
import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'
import type { RecruitmentPlatform } from '../meooRegistryShared/recruitmentInfoFilter.js'
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
  /** 订阅确认累加（运营不可改） */
  subscriptionDays?: number
  /** 运营赠送（可编辑） */
  opsGiftDays?: number
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
  membershipPlan?: 'free' | 'member' | 'member_plus'
  tokenmixBound?: boolean
  directAiCallsUsed?: number
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
  orderKind?: 'recruitment' | 'recruitment_ice'
  acceptMode?: 'manual' | 'miniprogram' | 'ice'
  linkedMpOrderId?: string
  recruitmentPlatform?: RecruitmentPlatform
  iceVideoCount?: number
  iceVideoSlots?: Array<{
    slotId: string
    label: string
    downloadUrl: string
    iceJobId?: string
    assignedApplicantId?: string
    assignedAt?: string
  }>
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
  assignedIceSlotId?: string
  assignedVideoLabel?: string
  assignedVideoDownloadUrl?: string
  douyinPublishUrl?: string
  aiVerifyStatus?: 'pending' | 'passed' | 'failed'
  aiVerifyNote?: string
  completedAt?: string
  taskStatus?: 'applied' | 'pending_confirm' | 'confirmed' | 'rejected' | 'shortlisted' | 'approved'
}

export type RegistrySupplierTeamLibraryEntry = {
  id: string
  memberId?: string
  lingqiTeamId?: string
  lingqiTalentId?: string
  teamType: 'shoot' | 'edit'
  wxNickName: string
  wxAvatarUrl?: string
  contact: string
  wechatId: string
  province?: string
  city?: string
  platform?: '抖音' | '小红书'
  platformAccount?: string
  platformNickname?: string
  accountTags?: string[]
  sourceChannel?: 'mp' | 'web'
  updatedAt: string
}

export type RegistryTalentLibraryEntry = {
  id: string
  lingqiTalentId?: string
  platform: '抖音' | '小红书' | '大众点评' | '快手' | '微信视频号'
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

export type RegistryMpTalentMember = {
  id: string
  lingqiTalentId?: string
  memberType: 'douyin' | 'xiaohongshu' | 'both'
  wxNickName: string
  wxAvatarUrl: string
  wxOpenId?: string
  contact: string
  wechatId: string
  province?: string
  city?: string
  workIdentity?: 'talent' | 'shoot' | 'edit'
  lingqiShootTeamId?: string
  lingqiEditTeamId?: string
  accountTags?: string[]
  registeredAt: string
  updatedAt: string
}

export type RegistryMpPrUser = {
  id: string
  lingqiPrId: string
  accountType: 'company' | 'personal'
  companyName?: string
  personalName?: string
  contactName?: string
  contactPhone?: string
  wechatId?: string
  province?: string
  city?: string
  intro?: string
  wxNickName?: string
  wxAvatarUrl?: string
  wxOpenId?: string
  registeredAt: string
  updatedAt: string
}

export type RegistryMpRecruitmentOrder = {
  id: string
  sourceMerchantOrderId: string
  customerName: string
  storeName: string
  merchantRequirements: string
  status: 'open' | 'collecting' | 'pending_settlement' | 'closed' | 'done'
  createdAt: string
  updatedAt: string
  applicants?: RegistryMpRecruitmentApplicant[]
  orderKind?: 'recruitment' | 'recruitment_ice'
  hall?: 'normal' | 'urgent' | 'ice'
  iceVideoSlots?: RegistryRecruitmentOrder['iceVideoSlots']
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
  fulfillmentLoop?: 'open' | 'closed'
  /** 发布方身份：商家 ERP 创建为 merchant；PR 小程序创建为 pr */
  publisherIdentity?: 'pr' | 'merchant'
  mpPublishMeta?: Record<string, unknown>
  recruitTarget?: 'talent' | 'shoot' | 'edit'
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
  arkChatEndpoints?: string
  arkVideoApiKey?: string
  iceAppId?: string
  iceAccessKeyId?: string
  iceAccessKeySecret?: string
  iceRegion?: string
  iceVodStorageLocation?: string
  iceOutputOssUrlPrefix?: string
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
  mpTalentMembers?: RegistryMpTalentMember[]
  mpPrUsers?: RegistryMpPrUser[]
  talentLibraryEntries?: RegistryTalentLibraryEntry[]
  shootTeamLibraryEntries?: RegistrySupplierTeamLibraryEntry[]
  editTeamLibraryEntries?: RegistrySupplierTeamLibraryEntry[]
  talentPoolCandidates?: RegistryTalentPoolRow[]
  recruitmentScheduleRows?: RegistryScheduleRow[]
  recruitmentVideoSubmissions?: RegistryVideoSubmission[]
  helpManualCategories?: RegistryHelpManualCategory[]
  helpManualArticles?: RegistryHelpManualArticle[]
}

export type HelpManualEdition = 'merchant' | 'partner' | 'fulfillment'

export type RegistryHelpManualCategory = {
  id: string
  edition: HelpManualEdition
  title: string
  sortOrder: number
}

export type RegistryHelpManualArticle = {
  id: string
  edition: HelpManualEdition
  categoryId: string
  title: string
  body: string
  sortOrder: number
  updatedAt: string
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
    const res = await fetchOpsErpApi(path, {
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
      const res = await fetchOpsErpApi(path, { method: 'GET' })
      const text = await res.text()
      if (!res.ok) {
        if (/502\s+Bad\s+Gateway/i.test(text) || res.status === 502) {
          throw new Error(
            'erp-api 返回 502：ECS 上 auth-api 未常驻。请 SSH 执行 bash scripts/ecs-fix-erp-api-502.sh（安装 systemd）后，再 Redeploy 运营台。',
          )
        }
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
        if (snippet.startsWith('<')) {
          throw new Error(
            `注册表 HTTP ${res.status}（网关 HTML 错误页）。请在 ECS 执行 ecs-fix-erp-api-502.sh 并确认 https://mofangdianai.com/erp-api/meoo-ops-sync-registry 可访问。`,
          )
        }
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

export async function deleteRegistryTenant(body: {
  id: string
  merchantName?: string
  loginName?: string
}): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const paths = [
    '/api/meoo-ops-registry-tenant-delete',
    '/api/ops-sync/tenants/delete',
  ]
  const { res, j } = await postRegistrySync(paths, body)
  if (!res.ok) {
    return {
      ok: false,
      error: String(j.error || mapHttpError(res.status)),
      detail: typeof j.detail === 'string' ? j.detail : undefined,
    }
  }
  return { ok: j.ok !== false }
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
  const { res } = await postRegistrySync(['/api/ops-sync/ai'], body)
  if (!res.ok) throw new Error(mapHttpError(res.status))
}

export async function postVendorKeys(body: {
  keys: RegistryVendorKeys
  /** 仅存自定义条目；网关会与内置目录合并后再落盘 */
  aiVendorCatalog?: AiVendorCatalogEntry[]
  lastWriter?: 'erp' | 'ops'
}): Promise<void> {
  const { res, j } = await postRegistrySync(['/api/ops-sync/vendor-keys'], {
    ...body,
    lastWriter: body.lastWriter ?? 'ops',
  })
  if (!res.ok) {
    const detail = typeof j.detail === 'string' ? j.detail.trim() : ''
    throw new Error(detail || mapHttpError(res.status))
  }
}

export async function postVideoAiBindings(body: {
  videoAi: RegistryVideoAi
  lastWriter?: 'erp' | 'ops'
}): Promise<void> {
  const { res } = await postRegistrySync(['/api/ops-sync/video-ai'], {
    ...body,
    lastWriter: body.lastWriter ?? 'ops',
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
  workflowStage?: string
  paymentState?: string
  scheduleMeta?: Record<string, unknown>
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
  status?: RegistryMpRecruitmentOrder['status']
  applicants?: RegistryMpRecruitmentOrder['applicants']
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

export async function deleteMpRecruitmentOrders(body: {
  id?: string
  ids?: string[]
}): Promise<{ ok: boolean; deletedIds?: string[]; error?: string }> {
  const { res, j } = await postRegistrySync(
    ['/api/meoo-ops-mp-recruitment-orders-delete', '/api/ops-sync/mp-recruitment-orders/delete'],
    body,
  )
  if (!res.ok) {
    return { ok: false, error: String(j.error || mapHttpError(res.status)) }
  }
  return {
    ok: j.ok !== false,
    deletedIds: Array.isArray(j.deletedIds) ? (j.deletedIds as string[]) : undefined,
  }
}

export type MpLibraryDeleteKind = 'talent' | 'shoot' | 'edit' | 'pr'

export async function deleteMpLibraryEntries(body: {
  kind: MpLibraryDeleteKind
  ids: string[]
}): Promise<{ ok: boolean; deletedCount?: number; error?: string }> {
  const { res, j } = await postRegistrySync(
    ['/api/meoo-ops-mp-library-delete', '/api/ops-sync/mp-library/delete'],
    body,
  )
  if (!res.ok) {
    return { ok: false, error: String(j.error || mapHttpError(res.status)) }
  }
  return {
    ok: j.ok !== false,
    deletedCount: typeof j.deletedCount === 'number' ? j.deletedCount : undefined,
  }
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

export async function syncSupplierTeamLibrary(
  role: 'shoot' | 'edit' | 'all' = 'all',
): Promise<{ ok: boolean; shootCount: number; editCount: number; error?: string }> {
  const { res, j } = await postRegistrySync(
    [
      '/api/meoo-ops-supplier-team-library-sync',
      '/api/ops-sync/supplier-team-library/sync',
    ],
    { role },
  )
  if (!res.ok) {
    return {
      ok: false,
      shootCount: 0,
      editCount: 0,
      error: String(j.error || j.detail || mapHttpError(res.status)),
    }
  }
  return {
    ok: true,
    shootCount: Number(j.shootCount) || 0,
    editCount: Number(j.editCount) || 0,
  }
}
