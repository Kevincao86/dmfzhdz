/**
 * 注册表规范化（无 Vite 依赖）：供 ERP dev 插件与运营台 Supabase dispatch 共用。
 * 避免运营台 tsc 编译 sibling 目录内含 `import from 'vite'` 的文件时解析失败。
 */
import {
  catalogCustomEntriesOnly,
  mergeBuiltinAiVendorCatalog,
  normalizeCatalogLogoUrl,
  normalizeVendorKeysFromDisk,
} from '../src/lib/aiVendorCatalogShared.js'
import { registryFileForPersist } from '../src/lib/mpRecruitmentRegistryPersist.js'
import type {
  AiVendorCatalogEntry,
  RegistryAiModels,
  RegistryFile,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
  RegistryTalentLibraryEntry,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryTenant,
  RegistryVideoSubmission,
} from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'

function readCustomCatalogFromDisk(parsed: Partial<RegistryFile> | null): AiVendorCatalogEntry[] {
  const raw = parsed?.aiVendorCatalog
  if (!Array.isArray(raw)) return []
  const out: AiVendorCatalogEntry[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim().toLowerCase() : ''
    if (!id) continue
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim() : id
    const hint = typeof r.hint === 'string' && r.hint.trim() ? r.hint.trim().slice(0, 280) : undefined
    const logoUrl = normalizeCatalogLogoUrl(r.logoUrl)
    out.push({ id, label: label.slice(0, 64), hint, ...(logoUrl ? { logoUrl } : {}) })
  }
  return catalogCustomEntriesOnly(out)
}

export const DEFAULT_AI: RegistryAiModels = {
  /** 不固定运营侧「默认厂商」；ERP 在自动模式下按目录与已配置 Key 动态选择 */
  textModel: 'auto',
  imageModel: 'auto',
  updatedAt: new Date(0).toISOString(),
  lastWriter: 'erp',
  controlledByOps: false,
}

export function normalizeRegistryFile(parsed: Partial<RegistryFile> | null): RegistryFile {
  const tenants: RegistryTenant[] = Array.isArray(parsed?.tenants) ? (parsed!.tenants as RegistryTenant[]) : []
  const ai: RegistryAiModels = { ...DEFAULT_AI }
  if (parsed?.aiModels && typeof parsed.aiModels === 'object') {
    const a = parsed.aiModels as Partial<RegistryAiModels>
    if (typeof a.textModel === 'string' && a.textModel) ai.textModel = a.textModel
    if (typeof a.imageModel === 'string' && a.imageModel) ai.imageModel = a.imageModel
    if (typeof a.updatedAt === 'string' && a.updatedAt) ai.updatedAt = a.updatedAt
    if (a.lastWriter === 'ops') ai.lastWriter = 'ops'
    if (typeof a.controlledByOps === 'boolean') ai.controlledByOps = a.controlledByOps
  }
  const aiVendorCatalog = mergeBuiltinAiVendorCatalog(readCustomCatalogFromDisk(parsed))
  const vendorKeys = normalizeVendorKeysFromDisk(parsed?.vendorKeys)
  const vendorKeysUpdatedAt =
    typeof parsed?.vendorKeysUpdatedAt === 'string' && parsed.vendorKeysUpdatedAt
      ? parsed.vendorKeysUpdatedAt
      : new Date(0).toISOString()
  const vendorKeysWriter = parsed?.vendorKeysWriter === 'ops' ? 'ops' : 'erp'
  const recruitmentOrders: RegistryRecruitmentOrder[] = Array.isArray(parsed?.recruitmentOrders)
    ? (parsed!.recruitmentOrders as RegistryRecruitmentOrder[])
    : []
  const mpRecruitmentOrders: RegistryMpRecruitmentOrder[] = Array.isArray(parsed?.mpRecruitmentOrders)
    ? (parsed!.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
    : []
  const mpTalentMembers = Array.isArray(parsed?.mpTalentMembers) ? parsed!.mpTalentMembers : []
  const mpPrUsers = Array.isArray(parsed?.mpPrUsers) ? parsed!.mpPrUsers : []
  const talentLibraryEntries: RegistryTalentLibraryEntry[] = Array.isArray(parsed?.talentLibraryEntries)
    ? (parsed!.talentLibraryEntries as RegistryTalentLibraryEntry[])
    : []
  const shootTeamLibraryEntries = Array.isArray(parsed?.shootTeamLibraryEntries)
    ? parsed!.shootTeamLibraryEntries
    : []
  const editTeamLibraryEntries = Array.isArray(parsed?.editTeamLibraryEntries)
    ? parsed!.editTeamLibraryEntries
    : []
  const talentPoolCandidates: RegistryTalentPoolRow[] = Array.isArray(parsed?.talentPoolCandidates)
    ? (parsed!.talentPoolCandidates as RegistryTalentPoolRow[])
    : []
  const recruitmentScheduleRows: RegistryScheduleRow[] = Array.isArray(parsed?.recruitmentScheduleRows)
    ? (parsed!.recruitmentScheduleRows as RegistryScheduleRow[])
    : []
  const recruitmentVideoSubmissions: RegistryVideoSubmission[] = Array.isArray(parsed?.recruitmentVideoSubmissions)
    ? (parsed!.recruitmentVideoSubmissions as RegistryVideoSubmission[])
    : []
  const mpTalentInbox = Array.isArray(parsed?.mpTalentInbox) ? parsed!.mpTalentInbox : []
  const mpOpsAnnouncements = Array.isArray(parsed?.mpOpsAnnouncements) ? parsed!.mpOpsAnnouncements : []
  const mpGroupQrByOrderIdRaw = (parsed as Partial<RegistryFile> | null)?.mpGroupQrByOrderId
  const mpGroupQrByOrderId: Record<string, string> | undefined =
    mpGroupQrByOrderIdRaw && typeof mpGroupQrByOrderIdRaw === 'object' && !Array.isArray(mpGroupQrByOrderIdRaw)
      ? Object.fromEntries(
          Object.entries(mpGroupQrByOrderIdRaw as Record<string, unknown>)
            .map(([k, v]) => [String(k).trim(), String(v ?? '').trim()] as const)
            .filter(([k, v]) => k && v),
        )
      : undefined
  const helpManualCategories = Array.isArray(parsed?.helpManualCategories) ? parsed!.helpManualCategories : []
  const helpManualArticles = Array.isArray(parsed?.helpManualArticles) ? parsed!.helpManualArticles : []
  const teamIntro =
    parsed?.teamIntro &&
    typeof parsed.teamIntro === 'object' &&
    Array.isArray((parsed.teamIntro as { paragraphs?: unknown }).paragraphs)
      ? (parsed.teamIntro as RegistryFile['teamIntro'])
      : undefined
  const videoAi = normalizeRegistryVideoAi(parsed?.videoAi)
  const videoAiUpdatedAt =
    typeof parsed?.videoAiUpdatedAt === 'string' && parsed.videoAiUpdatedAt
      ? parsed.videoAiUpdatedAt
      : new Date(0).toISOString()
  const videoAiWriter = parsed?.videoAiWriter === 'ops' ? 'ops' : 'erp'
  const membershipPlanVersionKeys = [
    'talentMembershipPlanVersions',
    'prMembershipPlanVersions',
    'shootMembershipPlanVersions',
    'editMembershipPlanVersions',
  ] as const
  const membershipPlanVersions: Partial<
    Pick<
      RegistryFile,
      | 'talentMembershipPlanVersions'
      | 'prMembershipPlanVersions'
      | 'shootMembershipPlanVersions'
      | 'editMembershipPlanVersions'
    >
  > = {}
  for (const key of membershipPlanVersionKeys) {
    const raw = parsed?.[key]
    if (Array.isArray(raw) && raw.length) {
      membershipPlanVersions[key] = raw as RegistryFile[typeof key]
    }
  }
  const mpMembershipCheckoutRequests = Array.isArray(parsed?.mpMembershipCheckoutRequests)
    ? parsed!.mpMembershipCheckoutRequests
    : []
  const mpPointsCheckoutRequests = Array.isArray(parsed?.mpPointsCheckoutRequests)
    ? parsed!.mpPointsCheckoutRequests
    : []
  const mpAiPointsSpendLedger = Array.isArray(parsed?.mpAiPointsSpendLedger)
    ? parsed!.mpAiPointsSpendLedger
    : []
  return {
    tenants,
    aiModels: ai,
    aiVendorCatalog,
    vendorKeys,
    vendorKeysUpdatedAt,
    vendorKeysWriter,
    videoAi,
    videoAiUpdatedAt,
    videoAiWriter,
    recruitmentOrders,
    mpRecruitmentOrders,
    mpTalentMembers,
    mpPrUsers,
    talentLibraryEntries,
    shootTeamLibraryEntries,
    editTeamLibraryEntries,
    talentPoolCandidates,
    recruitmentScheduleRows,
    recruitmentVideoSubmissions,
    mpTalentInbox,
    mpOpsAnnouncements,
    ...(mpGroupQrByOrderId && Object.keys(mpGroupQrByOrderId).length
      ? { mpGroupQrByOrderId }
      : {}),
    helpManualCategories,
    helpManualArticles,
    teamIntro,
    ...membershipPlanVersions,
    mpMembershipCheckoutRequests,
    mpPointsCheckoutRequests,
    mpAiPointsSpendLedger,
  }
}

export function registryForPersistentFile(data: RegistryFile): RegistryFile {
  const vendorKeys = normalizeVendorKeysFromDisk(data.vendorKeys)
  return registryFileForPersist({
    ...data,
    vendorKeys,
    aiVendorCatalog: catalogCustomEntriesOnly(data.aiVendorCatalog ?? []),
  })
}
