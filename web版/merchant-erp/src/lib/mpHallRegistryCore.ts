import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isVercelServerless } from './mpErpRuntime.js'
import { proxyGetErpApi } from './mpErpApiProxy.js'
import { mpRecruitmentOrdersForTalentHall } from './registryTenantIsolation.js'

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

function sliceRegistryList<T>(raw: unknown, max = 5000): T[] {
  return Array.isArray(raw) ? (raw as T[]).slice(0, max) : []
}

function buildHallPayload(partial: Partial<RegistryFile>): Record<string, unknown> {
  const mpRaw = Array.isArray(partial.mpRecruitmentOrders)
    ? (partial.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
    : []
  const stub = { mpRecruitmentOrders: mpRaw } as RegistryFile
  const mpRecruitmentOrders = mpRecruitmentOrdersForTalentHall(stub)
  return {
    ok: true,
    mpRecruitmentOrders,
    mpTalentMembers: sliceRegistryList(partial.mpTalentMembers),
    mpTalentInbox: sliceRegistryList(partial.mpTalentInbox),
    talentLibraryEntries: sliceRegistryList(partial.talentLibraryEntries),
    shootTeamLibraryEntries: sliceRegistryList(partial.shootTeamLibraryEntries),
    editTeamLibraryEntries: sliceRegistryList(partial.editTeamLibraryEntries),
  }
}

export async function loadMpHallRegistryPayload(): Promise<Record<string, unknown>> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const attempts: string[] = []

  if (missingParts.length === 0) {
    try {
      const partial = await fetchRegistryPartialFromDb(supabaseUrl, serviceRole)
      return buildHallPayload(partial)
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
      if (remote && Array.isArray(remote.mpRecruitmentOrders)) {
        return buildHallPayload(remote as Partial<RegistryFile>)
      }
      return buildHallPayload(remote as Partial<RegistryFile>)
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
