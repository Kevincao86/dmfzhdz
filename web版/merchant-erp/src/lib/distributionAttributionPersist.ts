import { readMerchantSupabaseAdminEnv } from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import {
  bindDistributionAttributionFromSnapshot,
  markDistributionAttributionPaidFromSnapshot,
  type ResolvedDistributionRef,
} from './distributionAttributionCore.js'
import type {
  DistributionAttributionLandingSurface,
  DistributionAttributionSubjectType,
} from './distributionRegistryTypes.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'

export async function persistBindDistributionAttribution(params: {
  refCode: string
  subjectType: DistributionAttributionSubjectType
  subjectRegistryId: string
  landingSurface: DistributionAttributionLandingSurface
  subjectLabel?: string
}): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const refCode = String(params.refCode || '').trim()
  if (!refCode) return { ok: false, error: 'missing_ref' }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) return { ok: false, error: 'supabase_not_configured' }

  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const result = bindDistributionAttributionFromSnapshot(data, params)
  if (!result.ok) return { ok: false, error: result.error }
  if (result.created) await io.save(data)
  return { ok: true, created: result.created }
}

export async function persistMarkDistributionAttributionPaid(params: {
  subjectType: DistributionAttributionSubjectType
  subjectRegistryId: string
  paidAmountCents: number
}): Promise<void> {
  const subjectRegistryId = String(params.subjectRegistryId || '').trim()
  if (!subjectRegistryId) return

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length) return

  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const result = markDistributionAttributionPaidFromSnapshot(data, params)
  if (result.updated) await io.save(data)
}

export type { ResolvedDistributionRef }
