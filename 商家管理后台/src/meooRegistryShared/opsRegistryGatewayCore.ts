/**
 * Vercel：须留在运营台 src 内（勿引用仓库外 web版/merchant-erp），否则 Serverless 打包无该目录 → FUNCTION_INVOCATION_FAILED。
 * 逻辑与 ERP `vite-plugins/opsRegistryGatewayCore.ts` 对齐；变更时请双端同步。
 */
import {
  catalogCustomEntriesOnly,
  mergeBuiltinAiVendorCatalog,
  normalizeCatalogLogoUrl,
  normalizeVendorKeysFromDisk,
} from './aiVendorCatalogShared.js'
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
} from './opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from './registryVideoAiNormalize.js'

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
  const talentLibraryEntries: RegistryTalentLibraryEntry[] = Array.isArray(parsed?.talentLibraryEntries)
    ? (parsed!.talentLibraryEntries as RegistryTalentLibraryEntry[])
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
  const videoAi = normalizeRegistryVideoAi(parsed?.videoAi)
  const videoAiUpdatedAt =
    typeof parsed?.videoAiUpdatedAt === 'string' && parsed.videoAiUpdatedAt
      ? parsed.videoAiUpdatedAt
      : new Date(0).toISOString()
  const videoAiWriter = parsed?.videoAiWriter === 'ops' ? 'ops' : 'erp'
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
    talentLibraryEntries,
    talentPoolCandidates,
    recruitmentScheduleRows,
    recruitmentVideoSubmissions,
  }
}

export function registryForPersistentFile(data: RegistryFile): RegistryFile {
  const vendorKeys = normalizeVendorKeysFromDisk(data.vendorKeys)
  return {
    ...data,
    vendorKeys,
    aiVendorCatalog: catalogCustomEntriesOnly(data.aiVendorCatalog ?? []),
  }
}
