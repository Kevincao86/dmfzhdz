import type {
  RegistryFile,
  RegistryMpRecruitmentOrder,
  RegistryRecruitmentOrder,
  RegistryScheduleRow,
  RegistryTalentPoolRow,
  RegistryMpRecruitmentApplicant,
} from './opsRegistryTypes.js'
import { resolveApplicantCountFromMp } from './mpRecruitCount.js'
import { isMpOrderHallVisible } from './mpGroupQrCleanup.js'
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

/** 单条招募单脱敏（隐藏群码，补全 prSelected） */
export function sanitizeMpRecruitmentOrderForTalentHall(o: RegistryMpRecruitmentOrder): RegistryMpRecruitmentOrder {
  const selectedSet = new Set(
    (Array.isArray(o.selectedApplicantIds) ? o.selectedApplicantIds : []).map((id) => String(id)),
  )
  const meta =
    o.mpPublishMeta && typeof o.mpPublishMeta === 'object'
      ? {
          ...o.mpPublishMeta,
          groupQrImage: undefined,
          editGroupQrImage: undefined,
        }
      : o.mpPublishMeta
  const applicants = (o.applicants ?? []).map((a) => ({
    ...a,
    prSelected: a.prSelected === true || selectedSet.has(String(a.id)),
  }))
  return {
    ...o,
    groupQrImage: undefined,
    editGroupQrImage: undefined,
    applicants,
    mpPublishMeta: meta,
  }
}

/** 达人招募小程序大厅可读：招募中/收集中/已停止/已截止（closed，含截止判断） */
export function mpRecruitmentOrdersForTalentHall(file: RegistryFile, nowMs = Date.now()) {
  return (file.mpRecruitmentOrders ?? [])
    .filter((o) => o && isMpOrderHallVisible(o, nowMs))
    .map(sanitizeMpRecruitmentOrderForTalentHall)
}

export type PrOwnerKeys = {
  lingqiPrId?: string
  registryPrId?: string
  prParticipantKey?: string
}

/** hall_registry 合并策略：控制是否捎带 PR 全部发单 / 是否仅返回指定单 */
export type HallMergeOptions = {
  /** 显式 includePrOwned：合并 PR 名下全部发单 */
  includeAllPrOwned?: boolean
  /** PR 商单列表：不附带大厅公开单，仅返回名下发单 */
  prOwnedOnly?: boolean
  /** PR 商单列表：报名人只保留排期/审片计数所需字段 */
  slimPrListApplicants?: boolean
}

/** PR 商单列表：报名人瘦身（保留 workflow / 待审计数字段） */
export function slimApplicantForPrOrderList(
  a: RegistryMpRecruitmentApplicant,
): RegistryMpRecruitmentApplicant {
  return {
    id: a.id,
    name: a.name,
    platform: a.platform,
    followers: a.followers,
    contact: a.contact,
    appliedAt: a.appliedAt,
    prSelected: a.prSelected,
    merchantSelected: a.merchantSelected,
    taskStatus: a.taskStatus,
    videoUrl: a.videoUrl,
    douyinPublishUrl: a.douyinPublishUrl,
    videoStatus: a.videoStatus,
    scriptUrl: a.scriptUrl,
    scriptLinkUrl: a.scriptLinkUrl,
    scriptStatus: a.scriptStatus,
    assignedVisitAt: a.assignedVisitAt,
    visitAssignmentStatus: a.visitAssignmentStatus,
  }
}

export function slimMpOrderForPrOrderList(
  o: RegistryMpRecruitmentOrder,
  prOwnerKeys?: PrOwnerKeys,
): RegistryMpRecruitmentOrder {
  const full = mpOrderForPrManagementHall(o, prOwnerKeys)
  const applicants = (full.applicants ?? []).map(slimApplicantForPrOrderList)
  return {
    ...full,
    applicants,
    applicantCount: resolveApplicantCountFromMp({ ...full, applicants }),
  }
}

function mapManagementOrder(
  o: RegistryMpRecruitmentOrder,
  prOwnerKeys?: PrOwnerKeys,
  slimPrList?: boolean,
): RegistryMpRecruitmentOrder {
  if (slimPrList && prOwnerKeys && mpOrderOwnedByPrKeys(o, prOwnerKeys)) {
    return slimMpOrderForPrOrderList(o, prOwnerKeys)
  }
  return mpOrderForPrManagementHall(o, prOwnerKeys)
}

/** 注册表商单是否由指定 PR 账号发布 */
export function mpOrderOwnedByPrKeys(
  o: RegistryMpRecruitmentOrder,
  keys: PrOwnerKeys,
): boolean {
  const pub = String(o.publisherIdentity || '').trim()
  if (pub && pub !== 'pr') return false
  const meta =
    o.mpPublishMeta && typeof o.mpPublishMeta === 'object'
      ? (o.mpPublishMeta as Record<string, unknown>)
      : {}
  const prId = String(keys.lingqiPrId || '').trim()
  const registryPrId = String(keys.registryPrId || '').trim()
  const metaPrId = String(meta.lingqiPrId || '').trim()
  const metaRegistryPrId = String(meta.registryPrId || '').trim()
  if (prId && metaPrId && prId === metaPrId) return true
  if (registryPrId && metaRegistryPrId && registryPrId === metaRegistryPrId) return true
  const myKey = String(keys.prParticipantKey || '').trim()
  const metaKey = String(meta.prParticipantKey || '').trim()
  if (myKey && metaKey && myKey === metaKey) return true
  return false
}

/** PR 管理自己的发单：保留群码/已通知字段；公开大厅仍脱敏 */
export function mpOrderForPrManagementHall(
  o: RegistryMpRecruitmentOrder,
  prOwnerKeys?: PrOwnerKeys,
): RegistryMpRecruitmentOrder {
  if (prOwnerKeys && mpOrderOwnedByPrKeys(o, prOwnerKeys)) {
    const selectedSet = new Set(
      (Array.isArray(o.selectedApplicantIds) ? o.selectedApplicantIds : []).map((id) => String(id)),
    )
    return {
      ...o,
      applicants: (o.applicants ?? []).map((a) => ({
        ...a,
        prSelected: a.prSelected === true || selectedSet.has(String(a.id)),
      })),
    }
  }
  return sanitizeMpRecruitmentOrderForTalentHall(o)
}

/** 大厅开放单 + 客户端指定的历史单（已结束/待结算等，供我的报名、我的发单、详情页） */
export function mergeMpRecruitmentOrdersForHallContext(
  allOrders: RegistryMpRecruitmentOrder[],
  includeMpOrderIds?: string[],
  prOwnerKeys?: PrOwnerKeys,
  mergeOpts?: HallMergeOptions,
): RegistryMpRecruitmentOrder[] {
  const includeAllPrOwned = mergeOpts?.includeAllPrOwned === true
  const prOwnedOnly = mergeOpts?.prOwnedOnly === true
  const slimPrList = mergeOpts?.slimPrListApplicants === true
  const includeSet = new Set(
    (includeMpOrderIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  )

  if (prOwnedOnly && includeAllPrOwned && prOwnerKeys) {
    const owned: RegistryMpRecruitmentOrder[] = []
    for (const o of allOrders) {
      if (!o?.id || !mpOrderOwnedByPrKeys(o, prOwnerKeys)) continue
      owned.push(mapManagementOrder(o, prOwnerKeys, slimPrList))
    }
    return owned
  }

  if (includeSet.size > 0 && !includeAllPrOwned) {
    const out: RegistryMpRecruitmentOrder[] = []
    const seen = new Set<string>()
    for (const o of allOrders) {
      if (!o?.id) continue
      const id = String(o.id)
      if (!includeSet.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push(mapManagementOrder(o, prOwnerKeys, false))
    }
    return out
  }

  const fullByIncludeId = new Map<string, RegistryMpRecruitmentOrder>()
  if (includeSet.size > 0) {
    for (const o of allOrders) {
      if (!o?.id) continue
      const id = String(o.id)
      if (!includeSet.has(id)) continue
      fullByIncludeId.set(id, mapManagementOrder(o, prOwnerKeys, false))
    }
  }
  const hall = mpRecruitmentOrdersForTalentHall({ mpRecruitmentOrders: allOrders } as RegistryFile).map(
    (o) => {
      const id = String(o.id || '')
      return id && fullByIncludeId.has(id) ? fullByIncludeId.get(id)! : o
    },
  )
  const seen = new Set(hall.map((o) => String(o.id)))
  const extra: RegistryMpRecruitmentOrder[] = []
  for (const o of allOrders) {
    if (!o?.id) continue
    const id = String(o.id)
    if (seen.has(id) || !includeSet.has(id)) continue
    seen.add(id)
    extra.push(fullByIncludeId.get(id) || mapManagementOrder(o, prOwnerKeys, slimPrList))
  }
  if (prOwnerKeys && includeAllPrOwned) {
    for (const o of allOrders) {
      if (!o?.id) continue
      const id = String(o.id)
      if (seen.has(id)) continue
      if (!mpOrderOwnedByPrKeys(o, prOwnerKeys)) continue
      seen.add(id)
      extra.push(mapManagementOrder(o, prOwnerKeys, slimPrList))
    }
  }
  return [...hall, ...extra]
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
