/**
 * 只更新注册表 JSON 的 marketingCenter 键，避免整表 PATCH 覆盖招募单。
 */
import pg from 'pg'
import type { RegistryFile } from './opsRegistryTypes.js'
import { readRegistryPgConnectionString } from './registrySnapshotPgAppend.js'
import {
  type GrantOutcome,
  type MarketingSurface,
  type PublishOrderForCash,
  type RegistryMarketingCenter,
  applyCampaignSave,
  grantCashForOrder,
  markCashWithdrawPaid,
  normalizeMarketingCenter,
  requestCashWithdraw,
} from './marketingCampaignCore.js'

const { Client } = pg

type Mutation<T> = (center: RegistryMarketingCenter) => {
  center: RegistryMarketingCenter
  result: T
  write?: boolean
}

async function mutateViaPg<T>(fn: Mutation<T>): Promise<T> {
  const cs = readRegistryPgConnectionString()
  if (!cs) throw new Error('pg_not_configured')
  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    await client.query('BEGIN')
    const read = await client.query(
      `SELECT registry->'marketingCenter' AS center FROM ops_registry_snapshot WHERE id = 1 FOR UPDATE`,
    )
    const next = fn(normalizeMarketingCenter(read.rows[0]?.center))
    if (next.write === false) {
      await client.query('ROLLBACK')
      return next.result
    }
    await client.query(
      `UPDATE ops_registry_snapshot
       SET registry = jsonb_set(COALESCE(registry, '{}'::jsonb), '{marketingCenter}', $1::jsonb, true)
       WHERE id = 1`,
      [JSON.stringify(next.center)],
    )
    await client.query('COMMIT')
    return next.result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

async function readViaPg(): Promise<RegistryMarketingCenter | null> {
  const cs = readRegistryPgConnectionString()
  if (!cs) return null
  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const read = await client.query(
      `SELECT registry->'marketingCenter' AS center FROM ops_registry_snapshot WHERE id = 1`,
    )
    return normalizeMarketingCenter(read.rows[0]?.center)
  } finally {
    await client.end()
  }
}

async function mutateViaIo<T>(fn: Mutation<T>): Promise<T> {
  const { readMerchantSupabaseAdminEnv } = await import('../../vite-plugins/merchantSupabaseAdminEnv.js')
  const { createRegistrySnapshotIoFetch } = await import('./registrySnapshotIoFetch.js')
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) throw new Error('supabase_admin_not_configured')
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const next = fn(normalizeMarketingCenter((data as RegistryFile).marketingCenter))
  if (next.write === false) return next.result
  ;(data as RegistryFile).marketingCenter = next.center
  await io.save(data)
  return next.result
}

async function mutateMarketingCenter<T>(fn: Mutation<T>): Promise<T> {
  if (readRegistryPgConnectionString()) return mutateViaPg(fn)
  return mutateViaIo(fn)
}

export async function readMarketingCenter(): Promise<RegistryMarketingCenter> {
  if (readRegistryPgConnectionString()) {
    const row = await readViaPg()
    if (row) return row
  }
  try {
    const { readMerchantSupabaseAdminEnv } = await import('../../vite-plugins/merchantSupabaseAdminEnv.js')
    const { createRegistrySnapshotIoFetch } = await import('./registrySnapshotIoFetch.js')
    const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
    if (missingParts.length > 0) return normalizeMarketingCenter(null)
    const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
    const data = await io.load()
    return normalizeMarketingCenter((data as RegistryFile).marketingCenter)
  } catch {
    return normalizeMarketingCenter(null)
  }
}

export async function saveMarketingCampaign(
  surface: MarketingSurface,
  patch: Record<string, unknown>,
): Promise<RegistryMarketingCenter> {
  return mutateMarketingCenter((center) => {
    const amountCents =
      patch.amountYuan != null ? Math.round(Number(patch.amountYuan) * 100) : undefined
    const next = applyCampaignSave(center, {
      surface,
      title: typeof patch.title === 'string' ? patch.title : undefined,
      subtitle: typeof patch.subtitle === 'string' ? patch.subtitle : undefined,
      enabled: patch.enabled === true,
      amountCents: Number.isFinite(amountCents) ? amountCents : undefined,
      totalQuota: patch.totalQuota != null ? Number(patch.totalQuota) : undefined,
      posterUrl: typeof patch.posterUrl === 'string' ? patch.posterUrl : undefined,
      rulesText: typeof patch.rulesText === 'string' ? patch.rulesText : undefined,
      withdrawAfterOrders: patch.withdrawAfterOrders != null ? Number(patch.withdrawAfterOrders) : undefined,
    })
    return { center: next, result: next }
  })
}

export async function grantPrCashRedPacketForPublishedOrder(order: PublishOrderForCash): Promise<GrantOutcome> {
  const preview = grantCashForOrder(normalizeMarketingCenter(null), order)
  if (!preview.outcome.granted && preview.outcome.reason === 'not_qualified') return preview.outcome
  return mutateMarketingCenter((center) => {
    const next = grantCashForOrder(center, order)
    return { center: next.center, result: next.outcome, write: next.outcome.granted }
  })
}

export async function withdrawPrCashWallet(prKey: string, displayName = '') {
  return mutateMarketingCenter((center) => {
    const next = requestCashWithdraw(center, prKey, displayName)
    return { center: next.center, result: next }
  })
}

export async function markPrCashWithdrawPaid(withdrawId: string) {
  return mutateMarketingCenter((center) => {
    const next = markCashWithdrawPaid(center, withdrawId)
    return { center: next.center, result: next }
  })
}
