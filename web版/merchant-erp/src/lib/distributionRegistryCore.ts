import { randomBytes } from 'node:crypto'
import type { RegistryFile } from './opsRegistryTypes.js'
import type {
  DistributionCommissionOverride,
  DistributionProductLineRates,
  RegistryDistributionAffiliate,
  RegistryDistributionPartnerChannel,
  RegistryDistributionPolicy,
  RegistryDistributionSalesperson,
  RegistryDistributionSettlementBatch,
  RegistryDistributionWithdrawRequest,
} from './distributionRegistryTypes.js'
import { mergeDistributionPolicy } from './distributionRegistryTypes.js'

function nowIso(): string {
  return new Date().toISOString()
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))]
}

function parseRates(raw: unknown): DistributionProductLineRates | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: DistributionProductLineRates = {}
  for (const key of [
    'partnerPoolRate',
    'partnerShareOfPool',
    'salespersonShareOfPool',
    'individualPoolRate',
  ] as const) {
    const n = Number(o[key])
    if (Number.isFinite(n) && n >= 0 && n <= 1) out[key] = n
  }
  const m = Number(o.maxCommissionMonths)
  if (Number.isFinite(m) && m >= 1 && m <= 120) out.maxCommissionMonths = Math.floor(m)
  return Object.keys(out).length ? out : undefined
}

function parseCommissionOverride(raw: unknown, updatedBy?: string): DistributionCommissionOverride | null {
  if (raw === null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const erp = parseRates(o.erp)
  const xingxuan = parseRates(o.xingxuan)
  const note = String(o.note ?? '').trim()
  if (!erp && !xingxuan && !note) return null
  return {
    ...(erp ? { erp } : {}),
    ...(xingxuan ? { xingxuan } : {}),
    ...(note ? { note } : {}),
    updatedAt: nowIso(),
    ...(updatedBy ? { updatedBy } : {}),
  }
}

function ensureDistribution(data: RegistryFile): void {
  if (!data.distributionPolicy) data.distributionPolicy = mergeDistributionPolicy(null)
  if (!data.distributionAffiliates) data.distributionAffiliates = []
  if (!data.distributionPartnerChannels) data.distributionPartnerChannels = []
  if (!data.distributionWithdrawRequests) data.distributionWithdrawRequests = []
  if (!data.distributionSettlementBatches) data.distributionSettlementBatches = []
  if (!data.distributionWallets) data.distributionWallets = []
}

function findPartner(data: RegistryFile, partnerTenantId: string): RegistryDistributionPartnerChannel | undefined {
  return (data.distributionPartnerChannels ?? []).find((p) => p.partnerTenantId === partnerTenantId)
}

export function patchDistributionPolicyFromSnapshot(
  data: RegistryFile,
  body: Record<string, unknown>,
): { ok: true; policy: RegistryDistributionPolicy } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const cur = mergeDistributionPolicy(data.distributionPolicy)
  if (typeof body.enabled === 'boolean') cur.enabled = body.enabled
  if (body.erp && typeof body.erp === 'object') {
    cur.erp = { ...cur.erp, ...parseRates(body.erp) }
  }
  if (body.xingxuan && typeof body.xingxuan === 'object') {
    cur.xingxuan = { ...cur.xingxuan, ...parseRates(body.xingxuan) }
  }
  for (const key of ['settleDelayDays', 'withdrawMinCents', 'withdrawMaxCents', 'withdrawMonthlyCapCents'] as const) {
    const n = Number(body[key])
    if (Number.isFinite(n) && n >= 0) cur[key] = Math.floor(n)
  }
  const minRate = Number(body.minPriceRateForCommission)
  if (Number.isFinite(minRate) && minRate > 0 && minRate <= 1) cur.minPriceRateForCommission = minRate
  cur.updatedAt = nowIso()
  data.distributionPolicy = cur
  return { ok: true, policy: cur }
}

function patchAffiliateCommission(
  data: RegistryFile,
  id: string,
  commissionOverride: DistributionCommissionOverride | null,
): boolean {
  const list = data.distributionAffiliates ?? []
  const idx = list.findIndex((a) => a.id === id)
  if (idx < 0) return false
  list[idx] = {
    ...list[idx]!,
    commissionOverride: commissionOverride ?? undefined,
  }
  data.distributionAffiliates = list
  return true
}

export function batchPatchAffiliateCommissionFromSnapshot(
  data: RegistryFile,
  rawIds: unknown,
  commissionOverrideRaw: unknown,
  updatedBy?: string,
): { ok: true; updatedCount: number; skippedIds: string[] } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const ids = normalizeIds(rawIds)
  if (!ids.length) return { ok: false, error: 'invalid_ids', status: 400 }
  const commissionOverride = parseCommissionOverride(commissionOverrideRaw, updatedBy)
  let updatedCount = 0
  const skippedIds: string[] = []
  for (const id of ids) {
    if (patchAffiliateCommission(data, id, commissionOverride)) updatedCount += 1
    else skippedIds.push(id)
  }
  return { ok: true, updatedCount, skippedIds }
}

export function patchPartnerCommissionFromSnapshot(
  data: RegistryFile,
  partnerTenantId: string,
  body: Record<string, unknown>,
  updatedBy?: string,
): { ok: true } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const id = String(partnerTenantId || '').trim()
  if (!id) return { ok: false, error: 'invalid_partner', status: 400 }
  let partner = findPartner(data, id)
  if (!partner) {
    partner = {
      partnerTenantId: id,
      partnerName: String(body.partnerName || id).trim() || id,
      channelEnabled: true,
      salespersons: [],
      updatedAt: nowIso(),
    }
    data.distributionPartnerChannels!.push(partner)
  }
  if (typeof body.channelEnabled === 'boolean') partner.channelEnabled = body.channelEnabled
  if (body.partnerName) partner.partnerName = String(body.partnerName).trim() || partner.partnerName
  if ('commissionOverride' in body) {
    partner.commissionOverride = parseCommissionOverride(body.commissionOverride, updatedBy) ?? undefined
  }
  partner.updatedAt = nowIso()
  return { ok: true }
}

export function batchPatchPartnerCommissionFromSnapshot(
  data: RegistryFile,
  rawIds: unknown,
  commissionOverrideRaw: unknown,
  updatedBy?: string,
): { ok: true; updatedCount: number; skippedIds: string[] } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const ids = normalizeIds(rawIds)
  if (!ids.length) return { ok: false, error: 'invalid_ids', status: 400 }
  const commissionOverride = parseCommissionOverride(commissionOverrideRaw, updatedBy)
  let updatedCount = 0
  const skippedIds: string[] = []
  for (const partnerTenantId of ids) {
    const r = patchPartnerCommissionFromSnapshot(
      data,
      partnerTenantId,
      { commissionOverride },
      updatedBy,
    )
    if (r.ok) updatedCount += 1
    else skippedIds.push(partnerTenantId)
  }
  return { ok: true, updatedCount, skippedIds }
}

export function patchSalespersonCommissionFromSnapshot(
  data: RegistryFile,
  partnerTenantId: string,
  salespersonId: string,
  commissionOverrideRaw: unknown,
  updatedBy?: string,
): { ok: true } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const partner = findPartner(data, partnerTenantId)
  if (!partner) return { ok: false, error: 'partner_not_found', status: 404 }
  const idx = partner.salespersons.findIndex((s) => s.id === salespersonId)
  if (idx < 0) return { ok: false, error: 'salesperson_not_found', status: 404 }
  partner.salespersons[idx] = {
    ...partner.salespersons[idx]!,
    commissionOverride: parseCommissionOverride(commissionOverrideRaw, updatedBy) ?? undefined,
  }
  partner.updatedAt = nowIso()
  return { ok: true }
}

export function batchPatchSalespersonCommissionFromSnapshot(
  data: RegistryFile,
  partnerTenantId: string,
  rawIds: unknown,
  commissionOverrideRaw: unknown,
  updatedBy?: string,
): { ok: true; updatedCount: number; skippedIds: string[] } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const ids = normalizeIds(rawIds)
  if (!ids.length) return { ok: false, error: 'invalid_ids', status: 400 }
  let updatedCount = 0
  const skippedIds: string[] = []
  for (const salespersonId of ids) {
    const r = patchSalespersonCommissionFromSnapshot(
      data,
      partnerTenantId,
      salespersonId,
      commissionOverrideRaw,
      updatedBy,
    )
    if (r.ok) updatedCount += 1
    else skippedIds.push(salespersonId)
  }
  return { ok: true, updatedCount, skippedIds }
}

function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return /^1\d{10}$/.test(digits) ? digits : null
}

function parseApplySource(raw: unknown): 'cs' | 'dr' | 'mp' | undefined {
  const s = String(raw || '').trim()
  return s === 'cs' || s === 'dr' || s === 'mp' ? s : undefined
}

export function maskAffiliatePhone(phone: string): string {
  const p = normalizePhone(phone)
  if (!p) return phone
  return `${p.slice(0, 3)}****${p.slice(-4)}`
}

export function publicAffiliateSummary(affiliate: RegistryDistributionAffiliate): Record<string, unknown> {
  return {
    id: affiliate.id,
    refCode: affiliate.status === 'active' ? affiliate.refCode : undefined,
    realName: affiliate.realName,
    phone: maskAffiliatePhone(affiliate.phone),
    status: affiliate.status,
    appliedAt: affiliate.appliedAt,
    approvedAt: affiliate.approvedAt,
    applySource: affiliate.applySource,
  }
}

export function applyAffiliateFromSnapshot(
  data: RegistryFile,
  body: Record<string, unknown>,
): | { ok: true; affiliate: RegistryDistributionAffiliate; created: boolean }
  | { ok: false; error: string; status: number; affiliate?: RegistryDistributionAffiliate } {
  ensureDistribution(data)
  const policy = mergeDistributionPolicy(data.distributionPolicy)
  if (!policy.enabled) return { ok: false, error: 'distribution_disabled', status: 403 }

  const realName = String(body.realName || '').trim()
  const phone = normalizePhone(body.phone)
  if (!realName || !phone) return { ok: false, error: 'invalid_fields', status: 400 }

  const applySource = parseApplySource(body.applySource)
  const note = String(body.note || '').trim() || undefined
  const list = data.distributionAffiliates!
  const idx = list.findIndex((a) => a.phone === phone)

  if (idx >= 0) {
    const cur = list[idx]!
    if (cur.status === 'active') {
      return { ok: false, error: 'already_active', status: 409, affiliate: cur }
    }
    if (cur.status === 'pending') {
      return { ok: true, affiliate: cur, created: false }
    }
    const affiliate: RegistryDistributionAffiliate = {
      ...cur,
      realName,
      status: 'pending',
      appliedAt: nowIso(),
      approvedAt: undefined,
      ...(applySource ? { applySource } : {}),
      ...(note ? { note } : {}),
    }
    list[idx] = affiliate
    return { ok: true, affiliate, created: false }
  }

  const affiliate: RegistryDistributionAffiliate = {
    id: newId('aff'),
    refCode: String(body.refCode || `IND-${randomBytes(3).toString('hex').toUpperCase()}`).trim(),
    realName,
    phone,
    status: 'pending',
    appliedAt: nowIso(),
    ...(applySource ? { applySource } : {}),
    ...(note ? { note } : {}),
  }
  list.push(affiliate)
  return { ok: true, affiliate, created: true }
}

export function lookupAffiliateByPhoneFromSnapshot(
  data: RegistryFile,
  phoneRaw: unknown,
): | { ok: true; affiliate: RegistryDistributionAffiliate | null }
  | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const phone = normalizePhone(phoneRaw)
  if (!phone) return { ok: false, error: 'invalid_phone', status: 400 }
  const affiliate = (data.distributionAffiliates ?? []).find((a) => a.phone === phone) ?? null
  return { ok: true, affiliate }
}

export function patchAffiliateStatusFromSnapshot(
  data: RegistryFile,
  body: Record<string, unknown>,
  updatedBy?: string,
): | { ok: true; affiliate: RegistryDistributionAffiliate }
  | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const id = String(body.id || '').trim()
  const status = String(body.status || '').trim() as RegistryDistributionAffiliate['status']
  if (!id || !['pending', 'active', 'rejected', 'disabled'].includes(status)) {
    return { ok: false, error: 'invalid_fields', status: 400 }
  }
  const list = data.distributionAffiliates!
  const idx = list.findIndex((a) => a.id === id)
  if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const note = String(body.note ?? list[idx]!.note ?? '').trim() || undefined
  const affiliate: RegistryDistributionAffiliate = {
    ...list[idx]!,
    status,
    ...(note ? { note } : {}),
    ...(status === 'active' ? { approvedAt: nowIso() } : {}),
    ...(updatedBy && status === 'active' ? { note: note ?? `审核通过 · ${updatedBy}` } : {}),
  }
  list[idx] = affiliate
  return { ok: true, affiliate }
}

export function upsertAffiliateFromSnapshot(
  data: RegistryFile,
  body: Record<string, unknown>,
): { ok: true; affiliate: RegistryDistributionAffiliate } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const realName = String(body.realName || '').trim()
  const phone = String(body.phone || '').trim()
  if (!realName || !phone) return { ok: false, error: 'invalid_fields', status: 400 }
  const list = data.distributionAffiliates!
  const existingId = String(body.id || '').trim()
  let affiliate: RegistryDistributionAffiliate
  if (existingId) {
    const idx = list.findIndex((a) => a.id === existingId)
    if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
    affiliate = {
      ...list[idx]!,
      realName,
      phone,
      status: (body.status as RegistryDistributionAffiliate['status']) || list[idx]!.status,
      note: String(body.note ?? list[idx]!.note ?? '').trim() || undefined,
    }
    list[idx] = affiliate
  } else {
    const id = newId('aff')
    const refCode = String(body.refCode || `IND-${randomBytes(3).toString('hex').toUpperCase()}`).trim()
    affiliate = {
      id,
      refCode,
      realName,
      phone,
      status: (body.status as RegistryDistributionAffiliate['status']) || 'pending',
      appliedAt: nowIso(),
      note: String(body.note || '').trim() || undefined,
    }
    list.push(affiliate)
  }
  return { ok: true, affiliate }
}

export function listPartnerSalespersonsFromSnapshot(
  data: RegistryFile,
  partnerTenantId: string,
): RegistryDistributionSalesperson[] {
  ensureDistribution(data)
  const tid = String(partnerTenantId || '').trim()
  if (!tid) return []
  return [...(findPartner(data, tid)?.salespersons ?? [])].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )
}

function partnerRefSlug(partnerName: string, partnerTenantId: string): string {
  const fromName = partnerName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()
  if (fromName.length >= 2) return fromName
  const fromId = partnerTenantId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()
  return fromId || randomBytes(2).toString('hex').toUpperCase()
}

export function upsertPartnerSalespersonFromSnapshot(
  data: RegistryFile,
  body: Record<string, unknown>,
): { ok: true; salesperson: RegistryDistributionSalesperson } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const partnerTenantId = String(body.partnerTenantId || '').trim()
  const realName = String(body.realName || '').trim()
  const phone = String(body.phone || '').trim()
  const employeeCode = String(body.employeeCode || '').trim()
  if (!partnerTenantId || !realName || !phone || !employeeCode) {
    return { ok: false, error: 'invalid_fields', status: 400 }
  }
  const partnerName = String(body.partnerName || partnerTenantId).trim()
  let partner = findPartner(data, partnerTenantId)
  if (!partner) {
    partner = {
      partnerTenantId,
      partnerName,
      channelEnabled: true,
      salespersons: [],
      updatedAt: nowIso(),
    }
    data.distributionPartnerChannels!.push(partner)
  } else if (partnerName && partnerName !== partnerTenantId) {
    partner.partnerName = partnerName
  }
  const existingId = String(body.id || '').trim()
  let sp: RegistryDistributionSalesperson
  if (existingId) {
    const idx = partner.salespersons.findIndex((s) => s.id === existingId)
    if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
    sp = {
      ...partner.salespersons[idx]!,
      realName,
      phone,
      employeeCode,
      status: (body.status as RegistryDistributionSalesperson['status']) || partner.salespersons[idx]!.status,
      note: typeof body.note === 'string' ? body.note.trim() || undefined : partner.salespersons[idx]!.note,
    }
    partner.salespersons[idx] = sp
  } else {
    const code = employeeCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || employeeCode
    const slug = partnerRefSlug(partner.partnerName || partnerName, partnerTenantId)
    sp = {
      id: newId('sp'),
      partnerTenantId,
      realName,
      phone,
      employeeCode,
      refCode: String(body.refCode || `FWS-${slug}-${code}`).trim(),
      status: 'active',
      createdAt: nowIso(),
      note: typeof body.note === 'string' ? body.note.trim() || undefined : undefined,
    }
    partner.salespersons.push(sp)
  }
  partner.updatedAt = nowIso()
  return { ok: true, salesperson: sp }
}

function adjustWallet(
  data: RegistryFile,
  ownerType: RegistryDistributionWithdrawRequest['ownerType'],
  ownerId: string,
  deltaAvailable: number,
  deltaFrozen: number,
  deltaWithdrawn: number,
): void {
  ensureDistribution(data)
  const list = data.distributionWallets!
  let w = list.find((x) => x.ownerType === ownerType && x.ownerId === ownerId)
  if (!w) {
    w = {
      ownerType,
      ownerId,
      availableCents: 0,
      frozenCents: 0,
      withdrawnCents: 0,
      updatedAt: nowIso(),
    }
    list.push(w)
  }
  w.availableCents = Math.max(0, w.availableCents + deltaAvailable)
  w.frozenCents = Math.max(0, w.frozenCents + deltaFrozen)
  w.withdrawnCents = Math.max(0, w.withdrawnCents + deltaWithdrawn)
  w.updatedAt = nowIso()
}

export function patchWithdrawRequestFromSnapshot(
  data: RegistryFile,
  requestId: string,
  action: 'approve' | 'reject' | 'mark_paid',
  body: Record<string, unknown>,
): { ok: true; request: RegistryDistributionWithdrawRequest } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const list = data.distributionWithdrawRequests!
  const idx = list.findIndex((r) => r.id === requestId)
  if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const row = { ...list[idx]! }
  const ts = nowIso()
  if (action === 'approve') {
    if (row.status !== 'pending_review') return { ok: false, error: 'invalid_status', status: 400 }
    row.status = 'approved'
    row.reviewedAt = ts
    row.opsNote = String(body.opsNote || row.opsNote || '').trim() || undefined
    adjustWallet(data, row.ownerType, row.ownerId, -row.amountCents, row.amountCents, 0)
  } else if (action === 'reject') {
    if (row.status !== 'pending_review' && row.status !== 'approved') {
      return { ok: false, error: 'invalid_status', status: 400 }
    }
    row.status = 'rejected'
    row.reviewedAt = ts
    row.failReason = String(body.failReason || body.opsNote || '已拒绝').trim()
    if (list[idx]!.status === 'approved') {
      adjustWallet(data, row.ownerType, row.ownerId, row.amountCents, -row.amountCents, 0)
    }
  } else if (action === 'mark_paid') {
    if (row.status !== 'approved') return { ok: false, error: 'invalid_status', status: 400 }
    row.status = 'paid'
    row.paidAt = ts
    row.externalBillNo = String(body.externalBillNo || body.bankReference || '').trim() || undefined
    row.opsNote = String(body.opsNote || row.opsNote || '').trim() || undefined
    adjustWallet(data, row.ownerType, row.ownerId, 0, -row.amountCents, row.amountCents)
  }
  list[idx] = row
  return { ok: true, request: row }
}

export function createSettlementBatchFromSnapshot(
  data: RegistryFile,
  body: Record<string, unknown>,
): { ok: true; batch: RegistryDistributionSettlementBatch } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const payeeId = String(body.payeeId || '').trim()
  const payeeLabel = String(body.payeeLabel || '').trim()
  const periodStart = String(body.periodStart || '').trim()
  const periodEnd = String(body.periodEnd || '').trim()
  const totalCents = Math.floor(Number(body.totalCents))
  if (!payeeId || !payeeLabel || !periodStart || !periodEnd || !Number.isFinite(totalCents) || totalCents < 0) {
    return { ok: false, error: 'invalid_fields', status: 400 }
  }
  const payeeType =
    body.payeeType === 'individual_affiliate' ? 'individual_affiliate' : 'partner_tenant'
  const ym = periodStart.slice(0, 7).replace('-', '')
  const seq = String((data.distributionSettlementBatches?.length ?? 0) + 1).padStart(3, '0')
  const batch: RegistryDistributionSettlementBatch = {
    id: `FWS-${ym}-${seq}`,
    payeeType,
    payeeId,
    payeeLabel,
    periodStart,
    periodEnd,
    totalCents,
    orderCount: Math.max(0, Math.floor(Number(body.orderCount) || 0)),
    status: 'draft',
    note: String(body.note || '').trim() || undefined,
    createdAt: nowIso(),
  }
  data.distributionSettlementBatches!.push(batch)
  return { ok: true, batch }
}

export function patchSettlementBatchFromSnapshot(
  data: RegistryFile,
  batchId: string,
  action: 'confirm' | 'mark_paid',
  body: Record<string, unknown>,
): { ok: true; batch: RegistryDistributionSettlementBatch } | { ok: false; error: string; status: number } {
  ensureDistribution(data)
  const list = data.distributionSettlementBatches!
  const idx = list.findIndex((b) => b.id === batchId)
  if (idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const row = { ...list[idx]! }
  if (action === 'confirm') {
    if (row.status !== 'draft') return { ok: false, error: 'invalid_status', status: 400 }
    row.status = 'confirmed'
    row.invoiceNo = String(body.invoiceNo || '').trim() || undefined
  } else if (action === 'mark_paid') {
    if (row.status !== 'confirmed' && row.status !== 'draft') {
      return { ok: false, error: 'invalid_status', status: 400 }
    }
    row.status = 'paid'
    row.paidAt = nowIso()
    row.bankReference = String(body.bankReference || body.externalBillNo || '').trim() || undefined
    row.invoiceNo = String(body.invoiceNo || row.invoiceNo || '').trim() || undefined
  }
  list[idx] = row
  return { ok: true, batch: row }
}

export function applyDistributionRegistryAction(
  data: RegistryFile,
  body: Record<string, unknown>,
): { ok: true; result: Record<string, unknown> } | { ok: false; error: string; status: number } {
  const action = String(body.action || '').trim()
  const updatedBy = String(body.updatedBy || 'ops').trim()

  switch (action) {
    case 'patch_policy': {
      const r = patchDistributionPolicyFromSnapshot(data, body)
      if (!r.ok) return r
      return { ok: true, result: { policy: r.policy } }
    }
    case 'patch_affiliate_commission': {
      const id = String(body.id || '').trim()
      if (!id) return { ok: false, error: 'invalid_id', status: 400 }
      ensureDistribution(data)
      if (!patchAffiliateCommission(data, id, parseCommissionOverride(body.commissionOverride, updatedBy))) {
        return { ok: false, error: 'not_found', status: 404 }
      }
      return { ok: true, result: { id } }
    }
    case 'batch_patch_affiliate_commission': {
      const r = batchPatchAffiliateCommissionFromSnapshot(data, body.ids, body.commissionOverride, updatedBy)
      if (!r.ok) return r
      return { ok: true, result: { updatedCount: r.updatedCount, skippedIds: r.skippedIds } }
    }
    case 'patch_partner_commission': {
      const r = patchPartnerCommissionFromSnapshot(data, String(body.partnerTenantId || ''), body, updatedBy)
      if (!r.ok) return r
      return { ok: true, result: { partnerTenantId: body.partnerTenantId } }
    }
    case 'batch_patch_partner_commission': {
      const r = batchPatchPartnerCommissionFromSnapshot(data, body.partnerTenantIds, body.commissionOverride, updatedBy)
      if (!r.ok) return r
      return { ok: true, result: { updatedCount: r.updatedCount, skippedIds: r.skippedIds } }
    }
    case 'patch_salesperson_commission': {
      const r = patchSalespersonCommissionFromSnapshot(
        data,
        String(body.partnerTenantId || ''),
        String(body.salespersonId || ''),
        body.commissionOverride,
        updatedBy,
      )
      if (!r.ok) return r
      return { ok: true, result: { salespersonId: body.salespersonId } }
    }
    case 'batch_patch_salesperson_commission': {
      const r = batchPatchSalespersonCommissionFromSnapshot(
        data,
        String(body.partnerTenantId || ''),
        body.salespersonIds,
        body.commissionOverride,
        updatedBy,
      )
      if (!r.ok) return r
      return { ok: true, result: { updatedCount: r.updatedCount, skippedIds: r.skippedIds } }
    }
    case 'patch_affiliate_status': {
      const r = patchAffiliateStatusFromSnapshot(data, body, updatedBy)
      if (!r.ok) return r
      return { ok: true, result: { affiliate: r.affiliate } }
    }
    case 'upsert_affiliate': {
      const r = upsertAffiliateFromSnapshot(data, body)
      if (!r.ok) return r
      return { ok: true, result: { affiliate: r.affiliate } }
    }
    case 'upsert_salesperson': {
      const r = upsertPartnerSalespersonFromSnapshot(data, body)
      if (!r.ok) return r
      return { ok: true, result: { salesperson: r.salesperson } }
    }
    case 'withdraw_approve':
    case 'withdraw_reject':
    case 'withdraw_mark_paid': {
      const sub = action.replace('withdraw_', '') as 'approve' | 'reject' | 'mark_paid'
      const r = patchWithdrawRequestFromSnapshot(data, String(body.requestId || ''), sub, body)
      if (!r.ok) return r
      return { ok: true, result: { request: r.request } }
    }
    case 'settlement_batch_create': {
      const r = createSettlementBatchFromSnapshot(data, body)
      if (!r.ok) return r
      return { ok: true, result: { batch: r.batch } }
    }
    case 'settlement_batch_confirm':
    case 'settlement_batch_mark_paid': {
      const sub = action === 'settlement_batch_confirm' ? 'confirm' : 'mark_paid'
      const r = patchSettlementBatchFromSnapshot(data, String(body.batchId || ''), sub, body)
      if (!r.ok) return r
      return { ok: true, result: { batch: r.batch } }
    }
    default:
      return { ok: false, error: 'invalid_action', status: 400 }
  }
}

export type AffiliatePortalWallet = {
  availableCents: number
  frozenCents: number
  withdrawnCents: number
}

export type AffiliatePortalStats = {
  settlementCount: number
  settlementTotalCents: number
  withdrawPendingCount: number
  withdrawPaidCents: number
}

export type AffiliatePortalSettlementRow = {
  id: string
  periodStart: string
  periodEnd: string
  totalCents: number
  orderCount: number
  status: RegistryDistributionSettlementBatch['status']
  paidAt?: string
}

export function buildDistributionPromoLinks(refCode: string): {
  cs: string
  drPr: string
  drTalent: string
  mpPath: string
} {
  const code = encodeURIComponent(refCode.trim())
  return {
    cs: `https://cs.mofangdianai.com/register?ref=${code}`,
    drPr: `https://dr.mofangdianai.com/register?ref=${code}&role=pr`,
    drTalent: `https://dr.mofangdianai.com/register?ref=${code}&role=talent`,
    mpPath: `/pages/welcome/welcome?ref=${refCode.trim()}`,
  }
}

export function buildAffiliatePortalFromSnapshot(
  data: RegistryFile,
  phoneRaw: unknown,
):
  | {
      ok: true
      affiliate: Record<string, unknown> | null
      wallet: AffiliatePortalWallet | null
      stats: AffiliatePortalStats | null
      settlements: AffiliatePortalSettlementRow[]
    }
  | { ok: false; error: string; status: number } {
  const lookup = lookupAffiliateByPhoneFromSnapshot(data, phoneRaw)
  if (!lookup.ok) return lookup
  if (!lookup.affiliate) {
    return { ok: true, affiliate: null, wallet: null, stats: null, settlements: [] }
  }

  ensureDistribution(data)
  const affiliate = lookup.affiliate
  const walletRow = (data.distributionWallets ?? []).find(
    (w) => w.ownerType === 'individual_affiliate' && w.ownerId === affiliate.id,
  )
  const wallet: AffiliatePortalWallet = walletRow
    ? {
        availableCents: walletRow.availableCents,
        frozenCents: walletRow.frozenCents,
        withdrawnCents: walletRow.withdrawnCents,
      }
    : { availableCents: 0, frozenCents: 0, withdrawnCents: 0 }

  const settlements = (data.distributionSettlementBatches ?? [])
    .filter((b) => b.payeeType === 'individual_affiliate' && b.payeeId === affiliate.id)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 24)
    .map((b) => ({
      id: b.id,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      totalCents: b.totalCents,
      orderCount: b.orderCount,
      status: b.status,
      paidAt: b.paidAt,
    }))

  const withdraws = (data.distributionWithdrawRequests ?? []).filter(
    (w) => w.ownerType === 'individual_affiliate' && w.ownerId === affiliate.id,
  )
  const stats: AffiliatePortalStats = {
    settlementCount: settlements.length,
    settlementTotalCents: settlements.reduce((sum, row) => sum + row.totalCents, 0),
    withdrawPendingCount: withdraws.filter((w) => w.status === 'pending_review').length,
    withdrawPaidCents: withdraws
      .filter((w) => w.status === 'paid')
      .reduce((sum, w) => sum + w.amountCents, 0),
  }

  return {
    ok: true,
    affiliate: publicAffiliateSummary(affiliate),
    wallet,
    stats,
    settlements,
  }
}
