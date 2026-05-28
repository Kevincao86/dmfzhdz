import type {
  RegistryFile,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
} from './opsRegistryTypes.js'
import { filterLegacyDemoRecruitmentOrders } from './recruitmentLegacyDemoOrders.js'
import {
  filterRegistryForTenant,
  recruitmentOrderBelongsToTenant,
} from './tenantRegistryScope.js'

export function tenantScheduleRowId(tenantId: string, localId: string): string {
  const tid = tenantId.trim()
  const lid = localId.trim()
  if (!tid) return lid
  if (lid.startsWith(`sch@${tid}@`)) return lid
  const bare = lid.replace(/^sch@/, '').replace(new RegExp(`^${tid}@`), '')
  return `sch@${tid}@${bare}`
}

export function scheduleRowBelongsToTenant(row: RegistryScheduleRow, tenantId: string): boolean {
  return row.id.trim().startsWith(`sch@${tenantId.trim()}@`)
}

export function tenantRecruitmentOrderIds(file: RegistryFile, tenantId: string): Set<string> {
  return new Set(
    filterLegacyDemoRecruitmentOrders(file.recruitmentOrders ?? [])
      .filter((o) => recruitmentOrderBelongsToTenant(o, tenantId))
      .map((o) => o.id),
  )
}

export function appendRecruitmentOrderForTenant(
  file: RegistryFile,
  order: RegistryRecruitmentOrder,
  tenantId: string,
  ownerUserId?: string,
): RegistryFile {
  const tid = tenantId.trim()
  const normalized: RegistryRecruitmentOrder = {
    ...order,
    tenantId: tid,
    ownerUserId: ownerUserId ?? order.ownerUserId,
  }
  const others = (file.recruitmentOrders ?? []).filter((o) => !recruitmentOrderBelongsToTenant(o, tid))
  const own = filterLegacyDemoRecruitmentOrders(
    (file.recruitmentOrders ?? []).filter((o) => recruitmentOrderBelongsToTenant(o, tid)),
  )
  const ownNext = [normalized, ...own.filter((o) => o.id !== normalized.id)]
  return {
    ...file,
    recruitmentOrders: [...ownNext, ...others].slice(0, 300),
  }
}

export function setTalentPoolCandidatesForTenant(
  file: RegistryFile,
  tenantId: string,
  candidates: RegistryTalentPoolRow[],
): RegistryFile {
  const orderIds = tenantRecruitmentOrderIds(file, tenantId)
  const rest = (file.talentPoolCandidates ?? []).filter((t) => {
    const src = typeof t.sourceRecruitmentOrderId === 'string' ? t.sourceRecruitmentOrderId.trim() : ''
    return !src || !orderIds.has(src)
  })
  const own = candidates.filter((c) => {
    const src = typeof c.sourceRecruitmentOrderId === 'string' ? c.sourceRecruitmentOrderId.trim() : ''
    return src && orderIds.has(src)
  })
  return {
    ...file,
    talentPoolCandidates: [...own, ...rest].slice(0, 400),
  }
}

export function setRecruitmentScheduleRowsForTenant(
  file: RegistryFile,
  tenantId: string,
  rows: RegistryScheduleRow[],
): RegistryFile {
  const tid = tenantId.trim()
  const normalized = rows.map((r) => ({
    ...r,
    id: tenantScheduleRowId(tid, r.id),
  }))
  const rest = (file.recruitmentScheduleRows ?? []).filter((r) => !scheduleRowBelongsToTenant(r, tid))
  return {
    ...file,
    recruitmentScheduleRows: [...normalized, ...rest].slice(0, 500),
  }
}

/** 商户 JWT 请求：招募相关切片按租户；AI/厂商 Key 仍全局（运营台下发） */
export function filterRegistrySnapshotForMerchant(authTenantId: string, file: RegistryFile): RegistryFile {
  const tid = authTenantId.trim()
  const scoped = filterRegistryForTenant(file, tid)
  const schedule = (file.recruitmentScheduleRows ?? []).filter((r) => scheduleRowBelongsToTenant(r, tid))
  const orderIds = tenantRecruitmentOrderIds(file, tid)
  const mpRecruitmentOrders = (file.mpRecruitmentOrders ?? []).filter((o) => {
    const sid = String(o.sourceMerchantOrderId || '').trim()
    return sid && orderIds.has(sid)
  })
  const tenants = (file.tenants ?? []).filter((t) => t.id === tid)
  return {
    ...scoped,
    recruitmentScheduleRows: schedule,
    mpRecruitmentOrders,
    tenants,
    talentLibraryEntries: [],
    mpTalentMembers: [],
  }
}

/** 达人招募小程序大厅可读：开放中的小程序招募单 */
export function mpRecruitmentOrdersForTalentHall(file: RegistryFile) {
  return (file.mpRecruitmentOrders ?? []).filter(
    (o) => o && (o.status === 'open' || o.status === 'collecting'),
  )
}

/** 未登录或无法识别租户时：隐藏商户侧招募；保留小程序招募大厅公开单 */
export function stripRegistryRecruitmentForAnonymous(file: RegistryFile): RegistryFile {
  return {
    ...file,
    recruitmentOrders: [],
    recruitmentScheduleRows: [],
    recruitmentVideoSubmissions: [],
    talentPoolCandidates: [],
    mpRecruitmentOrders: mpRecruitmentOrdersForTalentHall(file),
    talentLibraryEntries: [],
    mpTalentMembers: [],
  }
}
