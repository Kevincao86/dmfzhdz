/**
 * 注册表规范化（无 Vite 依赖）：供 ERP dev 插件与运营台 Supabase dispatch 共用。
 * 避免运营台 tsc 编译 sibling 目录内含 `import from 'vite'` 的文件时解析失败。
 */
import {
  catalogCustomEntriesOnly,
  mergeBuiltinAiVendorCatalog,
  normalizeVendorKeysFromDisk,
} from '../src/lib/aiVendorCatalogShared.js'
import type {
  AiVendorCatalogEntry,
  RegistryAiModels,
  RegistryFile,
  RegistryRecruitmentOrder,
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
    out.push({ id, label: label.slice(0, 64), hint })
  }
  return catalogCustomEntriesOnly(out)
}

export const DEFAULT_AI: RegistryAiModels = {
  textModel: 'qwen',
  imageModel: 'qwen',
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
