import { randomBytes } from 'node:crypto'
import type { RegistryFile } from './opsRegistryTypes.js'
import type {
  DistributionAttributionLandingSurface,
  DistributionAttributionSubjectType,
  RegistryDistributionAttribution,
  RegistryDistributionAffiliate,
  RegistryDistributionSalesperson,
} from './distributionRegistryTypes.js'

function nowIso(): string {
  return new Date().toISOString()
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

function ensureAttributions(data: RegistryFile): void {
  if (!data.distributionAttributions) data.distributionAttributions = []
}

export type ResolvedDistributionRef = {
  refCode: string
  channelType: 'individual' | 'partner'
  affiliateId?: string
  partnerTenantId?: string
  salespersonId?: string
  affiliate?: RegistryDistributionAffiliate
  salesperson?: RegistryDistributionSalesperson
}

export function resolveDistributionRefFromSnapshot(
  data: RegistryFile,
  refCodeRaw: unknown,
): ResolvedDistributionRef | null {
  const refCode = String(refCodeRaw || '').trim()
  if (!refCode) return null

  for (const partner of data.distributionPartnerChannels ?? []) {
    for (const sp of partner.salespersons ?? []) {
      if (sp.refCode === refCode && sp.status === 'active') {
        return {
          refCode,
          channelType: 'partner',
          partnerTenantId: partner.partnerTenantId,
          salespersonId: sp.id,
          salesperson: sp,
        }
      }
    }
  }

  const affiliate = (data.distributionAffiliates ?? []).find(
    (a) => a.refCode === refCode && a.status === 'active',
  )
  if (affiliate) {
    return {
      refCode,
      channelType: 'individual',
      affiliateId: affiliate.id,
      affiliate,
    }
  }

  return null
}

export function findAttributionBySubjectFromSnapshot(
  data: RegistryFile,
  subjectType: DistributionAttributionSubjectType,
  subjectRegistryId: string,
): RegistryDistributionAttribution | null {
  ensureAttributions(data)
  const subjectId = String(subjectRegistryId || '').trim()
  if (!subjectId) return null
  return (
    (data.distributionAttributions ?? []).find(
      (row) => row.subjectType === subjectType && row.subjectRegistryId === subjectId,
    ) ?? null
  )
}

export function bindDistributionAttributionFromSnapshot(
  data: RegistryFile,
  params: {
    refCode: string
    subjectType: DistributionAttributionSubjectType
    subjectRegistryId: string
    landingSurface: DistributionAttributionLandingSurface
    subjectLabel?: string
  },
): { ok: true; attribution: RegistryDistributionAttribution; created: boolean } | { ok: false; error: string } {
  ensureAttributions(data)
  const subjectRegistryId = String(params.subjectRegistryId || '').trim()
  if (!subjectRegistryId) return { ok: false, error: 'invalid_subject' }

  const existing = findAttributionBySubjectFromSnapshot(data, params.subjectType, subjectRegistryId)
  if (existing) return { ok: true, attribution: existing, created: false }

  const resolved = resolveDistributionRefFromSnapshot(data, params.refCode)
  if (!resolved) return { ok: false, error: 'invalid_ref' }

  const ts = nowIso()
  const attribution: RegistryDistributionAttribution = {
    id: newId('attr'),
    refCode: resolved.refCode,
    channelType: resolved.channelType,
    affiliateId: resolved.affiliateId,
    partnerTenantId: resolved.partnerTenantId,
    salespersonId: resolved.salespersonId,
    subjectType: params.subjectType,
    subjectRegistryId,
    landingSurface: params.landingSurface,
    subjectLabel: String(params.subjectLabel || '').trim() || undefined,
    boundAt: ts,
    activatedAt: ts,
    status: 'activated',
  }
  data.distributionAttributions!.push(attribution)
  return { ok: true, attribution, created: true }
}

export function markDistributionAttributionPaidFromSnapshot(
  data: RegistryFile,
  params: {
    subjectType: DistributionAttributionSubjectType
    subjectRegistryId: string
    paidAmountCents: number
  },
): { ok: true; attribution: RegistryDistributionAttribution | null; updated: boolean } {
  ensureAttributions(data)
  const subjectRegistryId = String(params.subjectRegistryId || '').trim()
  if (!subjectRegistryId) return { ok: true, attribution: null, updated: false }

  const row = findAttributionBySubjectFromSnapshot(data, params.subjectType, subjectRegistryId)
  if (!row) return { ok: true, attribution: null, updated: false }

  const paidAmountCents = Math.max(0, Math.floor(Number(params.paidAmountCents) || 0))
  const ts = nowIso()
  row.firstPaidAt = row.firstPaidAt || ts
  row.paidAmountCents = Math.max(row.paidAmountCents ?? 0, paidAmountCents)
  row.status = 'paid'
  if (!row.activatedAt) row.activatedAt = ts
  return { ok: true, attribution: row, updated: true }
}

export type DistributionLineStats = {
  registrations: number
  paidCount: number
  paidAmountCents: number
}

export type PartnerSalespersonStatsRow = {
  salespersonId: string
  realName: string
  phone: string
  refCode: string
  status: RegistryDistributionSalesperson['status']
  registrations: number
  paidCount: number
  paidAmountCents: number
  erp: DistributionLineStats
  xingxuan: DistributionLineStats
}

export type PartnerDistributionAttributionRow = {
  id: string
  refCode: string
  salespersonId?: string
  salespersonName?: string
  subjectType: DistributionAttributionSubjectType
  subjectLabel?: string
  landingSurface: DistributionAttributionLandingSurface
  boundAt: string
  firstPaidAt?: string
  paidAmountCents?: number
  status: RegistryDistributionAttribution['status']
}

export type PartnerDistributionStats = {
  totals: DistributionLineStats & {
    erp: DistributionLineStats
    xingxuan: DistributionLineStats
  }
  bySalesperson: PartnerSalespersonStatsRow[]
  recentAttributions: PartnerDistributionAttributionRow[]
}

function emptyLineStats(): DistributionLineStats {
  return { registrations: 0, paidCount: 0, paidAmountCents: 0 }
}

function isXingxuanSubject(subjectType: DistributionAttributionSubjectType): boolean {
  return subjectType !== 'erp_merchant'
}

function addAttributionToLineStats(stats: DistributionLineStats, row: RegistryDistributionAttribution): void {
  stats.registrations += 1
  if (row.status === 'paid' || row.firstPaidAt) {
    stats.paidCount += 1
    stats.paidAmountCents += row.paidAmountCents ?? 0
  }
}

function salespersonNameMap(data: RegistryFile, partnerTenantId: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const partner of data.distributionPartnerChannels ?? []) {
    if (partner.partnerTenantId !== partnerTenantId) continue
    for (const sp of partner.salespersons ?? []) {
      map.set(sp.id, sp.realName)
    }
  }
  return map
}

export function buildPartnerDistributionStatsFromSnapshot(
  data: RegistryFile,
  partnerTenantId: string,
): PartnerDistributionStats {
  ensureAttributions(data)
  const tid = String(partnerTenantId || '').trim()
  const rows = (data.distributionAttributions ?? []).filter((row) => row.partnerTenantId === tid)
  const spNames = salespersonNameMap(data, tid)
  const salespersons = (data.distributionPartnerChannels ?? [])
    .find((p) => p.partnerTenantId === tid)
    ?.salespersons?.slice() ?? []

  const byId = new Map<string, PartnerSalespersonStatsRow>()
  for (const sp of salespersons) {
    byId.set(sp.id, {
      salespersonId: sp.id,
      realName: sp.realName,
      phone: sp.phone,
      refCode: sp.refCode,
      status: sp.status,
      registrations: 0,
      paidCount: 0,
      paidAmountCents: 0,
      erp: emptyLineStats(),
      xingxuan: emptyLineStats(),
    })
  }

  const totals = {
    ...emptyLineStats(),
    erp: emptyLineStats(),
    xingxuan: emptyLineStats(),
  }

  for (const row of rows) {
    addAttributionToLineStats(totals, row)
    if (isXingxuanSubject(row.subjectType)) addAttributionToLineStats(totals.xingxuan, row)
    else addAttributionToLineStats(totals.erp, row)

    if (!row.salespersonId) continue
    let spStats = byId.get(row.salespersonId)
    if (!spStats) {
      spStats = {
        salespersonId: row.salespersonId,
        realName: spNames.get(row.salespersonId) ?? '未知分销员',
        phone: '',
        refCode: row.refCode,
        status: 'disabled',
        registrations: 0,
        paidCount: 0,
        paidAmountCents: 0,
        erp: emptyLineStats(),
        xingxuan: emptyLineStats(),
      }
      byId.set(row.salespersonId, spStats)
    }
    addAttributionToLineStats(spStats, row)
    if (isXingxuanSubject(row.subjectType)) addAttributionToLineStats(spStats.xingxuan, row)
    else addAttributionToLineStats(spStats.erp, row)
  }

  const recentAttributions = rows
    .slice()
    .sort((a, b) => (a.boundAt < b.boundAt ? 1 : -1))
    .slice(0, 80)
    .map((row) => ({
      id: row.id,
      refCode: row.refCode,
      salespersonId: row.salespersonId,
      salespersonName: row.salespersonId ? spNames.get(row.salespersonId) : undefined,
      subjectType: row.subjectType,
      subjectLabel: row.subjectLabel,
      landingSurface: row.landingSurface,
      boundAt: row.boundAt,
      firstPaidAt: row.firstPaidAt,
      paidAmountCents: row.paidAmountCents,
      status: row.status,
    }))

  return {
    totals,
    bySalesperson: [...byId.values()].sort((a, b) =>
      a.registrations === b.registrations ? a.realName.localeCompare(b.realName, 'zh-CN') : b.registrations - a.registrations,
    ),
    recentAttributions,
  }
}

export function lookupSalespersonByPhoneFromSnapshot(
  data: RegistryFile,
  phoneRaw: unknown,
): { partnerTenantId: string; partnerName: string; salesperson: RegistryDistributionSalesperson } | null {
  const phone = String(phoneRaw || '').replace(/\D/g, '')
  if (!/^1\d{10}$/.test(phone)) return null
  for (const partner of data.distributionPartnerChannels ?? []) {
    const sp = (partner.salespersons ?? []).find((row) => row.phone === phone && row.status === 'active')
    if (sp) {
      return {
        partnerTenantId: partner.partnerTenantId,
        partnerName: partner.partnerName,
        salesperson: sp,
      }
    }
  }
  return null
}

export type SalespersonPortalStats = {
  registrations: number
  paidCount: number
  paidAmountCents: number
  erp: DistributionLineStats
  xingxuan: DistributionLineStats
}

export function buildSalespersonPortalFromSnapshot(
  data: RegistryFile,
  salespersonId: string,
): {
  stats: SalespersonPortalStats
  attributions: PartnerDistributionAttributionRow[]
} {
  ensureAttributions(data)
  const sid = String(salespersonId || '').trim()
  const rows = (data.distributionAttributions ?? []).filter((row) => row.salespersonId === sid)
  const stats: SalespersonPortalStats = {
    registrations: 0,
    paidCount: 0,
    paidAmountCents: 0,
    erp: emptyLineStats(),
    xingxuan: emptyLineStats(),
  }

  for (const row of rows) {
    addAttributionToLineStats(stats, row)
    if (isXingxuanSubject(row.subjectType)) addAttributionToLineStats(stats.xingxuan, row)
    else addAttributionToLineStats(stats.erp, row)
  }

  const attributions = rows
    .slice()
    .sort((a, b) => (a.boundAt < b.boundAt ? 1 : -1))
    .slice(0, 100)
    .map((row) => ({
      id: row.id,
      refCode: row.refCode,
      salespersonId: row.salespersonId,
      subjectType: row.subjectType,
      subjectLabel: row.subjectLabel,
      landingSurface: row.landingSurface,
      boundAt: row.boundAt,
      firstPaidAt: row.firstPaidAt,
      paidAmountCents: row.paidAmountCents,
      status: row.status,
    }))

  return { stats, attributions }
}

export function subjectTypeLabel(subjectType: DistributionAttributionSubjectType): string {
  switch (subjectType) {
    case 'erp_merchant':
      return 'ERP 商家'
    case 'xingxuan_pr':
      return '星选 PR'
    case 'xingxuan_talent':
      return '星选达人'
    case 'xingxuan_shoot':
      return '星选拍摄'
    case 'xingxuan_edit':
      return '星选剪辑'
    default:
      return subjectType
  }
}

export function landingSurfaceLabel(surface: DistributionAttributionLandingSurface): string {
  switch (surface) {
    case 'cs':
      return '商家 ERP'
    case 'dr':
      return '星选 Web'
    case 'mp':
      return '星选小程序'
    default:
      return surface
  }
}
