import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isVercelServerless } from './mpErpRuntime.js'
import { proxyGetErpApi } from './mpErpApiProxy.js'
import { syncExpiredMpOrdersInSnapshot } from './mpGroupQrCleanup.js'
import { syncDedupeApplicantsInSnapshot } from './mpApplicantIdentity.js'
import {
  mergeMpRecruitmentOrdersForHallContext,
  type PrOwnerKeys,
} from './registryTenantIsolation.js'
import {
  filterTalentInboxForHall,
  talentInboxMatchKeysFromProfile,
} from './mpTalentInboxHallFilter.js'
import { buildMpGroupQrByOrderIdForTalent } from './mpGroupQrHallSlice.js'
import type { RegistryMpTalentMember } from './opsRegistryTypes.js'

const HALL_FETCH_MS = 20_000

function hallFetchSignal(): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(HALL_FETCH_MS)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), HALL_FETCH_MS)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

/** 只读 PostgREST registry 列，不做 normalizeRegistryFile（避免大厅拉全量注册表卡住） */
async function fetchRegistryPartialFromDb(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry`
  const res = await fetch(url, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Accept: 'application/json',
    },
    signal: hallFetchSignal(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`registry_rest_${res.status}:${text.slice(0, 240)}`)
  }
  let rows: { registry?: unknown }[]
  try {
    rows = JSON.parse(text || '[]') as { registry?: unknown }[]
  } catch {
    throw new Error(`registry_parse_failed:${text.slice(0, 120)}`)
  }
  const reg = rows[0]?.registry
  if (!reg || typeof reg !== 'object') return {}
  return reg as Partial<RegistryFile>
}


function buildHallPayload(
  partial: Partial<RegistryFile>,
  includeMpOrderIds?: string[],
  prOwnerKeys?: PrOwnerKeys,
  talentMember?: RegistryMpTalentMember | null,
  talentAccount?: { lingqi_talent_id?: string | null; registry_member_id?: string | null },
): { payload: Record<string, unknown>; needPersist: boolean; partial: Partial<RegistryFile> } {
  const file = partial as RegistryFile
  const deduped = syncDedupeApplicantsInSnapshot(file)
  const expired = syncExpiredMpOrdersInSnapshot(file)
  const mpRaw = Array.isArray(file.mpRecruitmentOrders)
    ? (file.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
    : []
  const mpRecruitmentOrders = mergeMpRecruitmentOrdersForHallContext(
    mpRaw,
    includeMpOrderIds,
    prOwnerKeys,
  )
  const inboxKeys =
    talentAccount && talentMember
      ? talentInboxMatchKeysFromProfile(talentAccount, talentMember)
      : new Set<string>()
  const mpTalentInbox = filterTalentInboxForHall(file.mpTalentInbox, inboxKeys)
  const mpGroupQrByOrderId = talentMember
    ? buildMpGroupQrByOrderIdForTalent(file, talentMember)
    : {}
  return {
    needPersist: expired.syncedIds.length > 0 || deduped.syncedOrderIds.length > 0,
    partial: file,
    payload: {
      ok: true,
      mpRecruitmentOrders,
      ...(mpTalentInbox.length ? { mpTalentInbox } : {}),
      ...(Object.keys(mpGroupQrByOrderId).length ? { mpGroupQrByOrderId } : {}),
    },
  }
}

async function persistRegistryIfNeeded(
  supabaseUrl: string,
  serviceRole: string,
  partial: Partial<RegistryFile>,
): Promise<void> {
  const base = supabaseUrl.replace(/\/$/, '')
  const { registryForPersistentFile } = await import('./opsRegistryGatewayCore.js')
  const persist = registryForPersistentFile(partial as RegistryFile)
  const nowIso = new Date().toISOString()
  const body = JSON.stringify({
    id: 1,
    registry: persist as unknown as Record<string, unknown>,
    updated_at: nowIso,
  })
  const res = await fetch(`${base}/rest/v1/ops_registry_snapshot`, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body,
    signal: hallFetchSignal(),
  })
  if (!res.ok) {
    const t = await res.text()
    console.warn('[hall_registry] persist expired sync failed:', t.slice(0, 240))
  }
}

export async function loadMpHallRegistryPayload(opts?: {
  includeMpOrderIds?: string[]
  prOwnerKeys?: PrOwnerKeys
  talentMember?: RegistryMpTalentMember | null
  talentAccount?: { lingqi_talent_id?: string | null; registry_member_id?: string | null }
}): Promise<Record<string, unknown>> {
  const includeMpOrderIds = (opts?.includeMpOrderIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean)
    .slice(0, 120)
  const prOwnerKeys = opts?.prOwnerKeys
  const talentMember = opts?.talentMember
  const talentAccount = opts?.talentAccount
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const attempts: string[] = []

  if (missingParts.length === 0) {
    try {
      const partial = await fetchRegistryPartialFromDb(supabaseUrl, serviceRole)
      const built = buildHallPayload(partial, includeMpOrderIds, prOwnerKeys, talentMember, talentAccount)
      if (built.needPersist) {
        void persistRegistryIfNeeded(supabaseUrl, serviceRole, built.partial).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn('[hall_registry] async persist failed:', msg.slice(0, 200))
        })
      }
      return built.payload
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`registry_direct:${msg.slice(0, 240)}`)
      if (!isVercelServerless()) throw e
    }
  } else if (isVercelServerless()) {
    attempts.push(`registry_env_missing:${missingParts.join(',')}`)
  } else {
    throw new Error(
      `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
    )
  }

  if (isVercelServerless()) {
    try {
      const remote = await proxyGetErpApi('/api/meoo-ops-mp-hall-registry')
      const built = buildHallPayload(remote as Partial<RegistryFile>, includeMpOrderIds, prOwnerKeys)
      return built.payload
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`ecs_proxy:${msg.slice(0, 240)}`)
      const hint = missingParts.length
        ? '请在 Vercel Production 配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 后 Redeploy。'
        : '直连注册表与 ECS 代理均失败。'
      throw new Error(`${attempts.join(' | ')} — ${hint}`)
    }
  }

  throw new Error(
    `supabase_admin_not_configured: ${missingParts.join(',')} — ${merchantSupabaseAdminEnvConfigureHint(missingParts)}`,
  )
}
