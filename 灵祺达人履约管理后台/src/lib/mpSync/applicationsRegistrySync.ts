/**
 * 从 ECS 注册表回填「我的报名」：详情页能识别已报名但本地列表为空时同步。
 */
import { fetchMpRegistry } from '../mpApi'
import type { MpRegistry } from '../mpRecruitment/types'
import { readMember } from './talentMember'
import { findMyApplicant } from './talentContactPrGate'
import { talentMatchKeys, inboxRowMatchesTalent } from './talentInboxMatch'
import { readApplications, upsertApplication, type ApplicationLocal } from './applicationsStore'

const ICE_APPLICANT_PREFIX = 'meoo_ice_applicant_v1_'

export function applicationFromMpOrder(
  mp: Record<string, unknown>,
  applicant: Record<string, unknown>,
): ApplicationLocal | null {
  const mpOrderId = String(mp.id || '').trim()
  const applicantId = String(applicant.id || '').trim()
  if (!mpOrderId || !applicantId) return null
  return {
    mpOrderId,
    applicantId,
    title: String(mp.title || mp.sourceMerchantOrderId || mpOrderId).trim(),
    platform: String(applicant.platform || mp.platform || '抖音').trim(),
    appliedAt: String(applicant.appliedAt || mp.updatedAt || '').trim(),
  }
}

export function listApplicationsFromRegistry(reg: MpRegistry | Record<string, unknown> | null): ApplicationLocal[] {
  if (!reg) return []
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const rows: ApplicationLocal[] = []
  const seen = new Set<string>()
  for (const mp of mpList) {
    if (!mp || typeof mp !== 'object') continue
    const rec = mp as Record<string, unknown>
    const id = String(rec.id || '').trim()
    if (!id) continue
    const applicant = findMyApplicant(rec, id)
    if (!applicant) continue
    const entry = applicationFromMpOrder(rec, applicant)
    if (!entry || seen.has(entry.mpOrderId)) continue
    seen.add(entry.mpOrderId)
    rows.push(entry)
  }
  return rows
}

function collectIceClaimedOrderIds(): string[] {
  const ids: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(ICE_APPLICANT_PREFIX)) continue
      const id = String(k.slice(ICE_APPLICANT_PREFIX.length) || '').trim()
      if (id) ids.push(id)
    }
  } catch {
    /* ignore */
  }
  return ids
}

export function reconcileApplicationsFromRegistry(reg: MpRegistry | Record<string, unknown> | null): {
  added: number
  updated: number
  total: number
} {
  const remote = listApplicationsFromRegistry(reg)
  if (!remote.length) {
    return { added: 0, updated: 0, total: readApplications().length }
  }
  let added = 0
  let updated = 0
  for (const row of remote) {
    const r = upsertApplication(row)
    if (r === 'added') added += 1
    else if (r === 'updated') updated += 1
  }
  return { added, updated, total: readApplications().length }
}

function collectMissingApplicationOrderIds(
  reg: MpRegistry | Record<string, unknown>,
  member: Record<string, unknown> | null,
): string[] {
  if (!member) return []
  const keys = talentMatchKeys(member)
  const ids = new Set<string>()
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  for (const row of inbox) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const mpOrderId = String(rec.mpOrderId || '').trim()
    if (!mpOrderId) continue
    if (inboxRowMatchesTalent(rec, keys, member)) ids.add(mpOrderId)
  }
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const loaded = new Set(mpList.filter(Boolean).map((o) => String((o as Record<string, unknown>).id || '')))
  const missing: string[] = []
  for (const id of ids) {
    if (id && !loaded.has(id)) missing.push(id)
  }
  return missing.slice(0, 120)
}

export type RegistryFetchOpts = {
  includeLocalContext?: boolean
  includeMpOrderIds?: string[]
}

/** 拉注册表并回填报名（含站内信关联的历史单） */
export async function fetchRegistryAndReconcileApplications(
  fetchOpts?: RegistryFetchOpts,
): Promise<MpRegistry> {
  const member = readMember() as Record<string, unknown> | null
  const baseOpts = fetchOpts || { includeLocalContext: true }
  const iceIds = collectIceClaimedOrderIds()
  const mergedIds = [
    ...new Set([...((baseOpts && baseOpts.includeMpOrderIds) || []), ...iceIds]),
  ].slice(0, 120)
  const firstOpts =
    mergedIds.length > 0
      ? { ...baseOpts, includeMpOrderIds: mergedIds, includeLocalContext: true }
      : baseOpts
  let reg = (await fetchMpRegistry(firstOpts)) as MpRegistry
  reconcileApplicationsFromRegistry(reg)
  const extraIds = [
    ...new Set([...collectMissingApplicationOrderIds(reg, member), ...iceIds]),
  ].filter((id) => {
    const loaded = new Set(
      (reg.mpRecruitmentOrders || []).filter(Boolean).map((o) => String((o as Record<string, unknown>).id || '')),
    )
    return id && !loaded.has(id)
  })
  if (extraIds.length) {
    reg = (await fetchMpRegistry({
      includeMpOrderIds: extraIds.slice(0, 120),
      includeLocalContext: true,
    })) as MpRegistry
    reconcileApplicationsFromRegistry(reg)
  }
  return reg
}
