import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isVercelServerless } from './mpErpRuntime.js'
import { proxyGetErpApi } from './mpErpApiProxy.js'
import { syncExpiredMpOrdersInSnapshot } from './mpGroupQrCleanup.js'
import { syncExpiredIcePendingConfirmInSnapshot } from './mpRecruitmentIceCore.js'
import { syncDedupeApplicantsInSnapshot } from './mpApplicantIdentity.js'
import {
  mergeMpRecruitmentOrdersForHallContext,
  type PrOwnerKeys,
} from './registryTenantIsolation.js'
import {
  filterTalentInboxForHall,
  talentInboxMatchKeysFromProfile,
} from './mpTalentInboxHallFilter.js'
import { buildMpGroupQrByOrderIdForSession } from './mpGroupQrHallSlice.js'
import type { RegistryMpTalentMember } from './opsRegistryTypes.js'
import { supabaseAdminFetch } from './supabaseAdminFetch.js'

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
  const res = await supabaseAdminFetch(url, {
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

/** 仅拉 mpRecruitmentOrders 列，比全量 registry 更小更稳 */
async function fetchRegistryMpOrdersFromDb(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=mpRecruitmentOrders:registry-%3EmpRecruitmentOrders`
  const res = await supabaseAdminFetch(url, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Accept: 'application/json',
    },
    signal: hallFetchSignal(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`registry_mp_orders_${res.status}:${text.slice(0, 240)}`)
  }
  let rows: { mpRecruitmentOrders?: unknown }[]
  try {
    rows = JSON.parse(text || '[]') as { mpRecruitmentOrders?: unknown }[]
  } catch {
    throw new Error(`registry_mp_orders_parse:${text.slice(0, 120)}`)
  }
  const mp = rows[0]?.mpRecruitmentOrders
  if (!Array.isArray(mp)) return {}
  return { mpRecruitmentOrders: mp as RegistryMpRecruitmentOrder[] }
}

/** PostgREST RPC：库内过滤大厅单，避免 Node 拉全量 registry 解析失败 */
async function fetchHallRegistryViaRpc(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/rpc/mp_talent_fetch_hall_registry`
  const res = await supabaseAdminFetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: hallFetchSignal(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`hall_rpc_${res.status}:${text.slice(0, 240)}`)
  }
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text || '{}') as Record<string, unknown>
  } catch {
    throw new Error(`hall_rpc_parse:${text.slice(0, 120)}`)
  }
  if (data.ok === false) {
    throw new Error(String(data.error || data.detail || 'hall_rpc_failed'))
  }
  const mpRaw = data.mpRecruitmentOrders
  const mpList = Array.isArray(mpRaw)
    ? mpRaw
    : typeof mpRaw === 'string'
      ? (() => {
          try {
            return JSON.parse(mpRaw) as unknown[]
          } catch {
            return []
          }
        })()
      : []
  return {
    mpRecruitmentOrders: mpList as RegistryMpRecruitmentOrder[],
    recruitmentOrders: Array.isArray(data.recruitmentOrders) ? data.recruitmentOrders : [],
    mpTalentInbox: Array.isArray(data.mpTalentInbox) ? data.mpTalentInbox : [],
    mpTalentMembers: Array.isArray(data.mpTalentMembers) ? data.mpTalentMembers : [],
  }
}

function emptyHallPayload(): Record<string, unknown> {
  return { ok: true, mpRecruitmentOrders: [] }
}

function buildHallPayload(
  partial: Partial<RegistryFile>,
  includeMpOrderIds?: string[],
  prOwnerKeys?: PrOwnerKeys,
  talentMember?: RegistryMpTalentMember | null,
  talentAccount?: { lingqi_talent_id?: string | null; registry_member_id?: string | null; openid?: string | null },
  includeRecommendPool?: boolean,
): { payload: Record<string, unknown>; needPersist: boolean; partial: Partial<RegistryFile> } {
  const file = partial as RegistryFile
  const mpRaw = Array.isArray(file.mpRecruitmentOrders)
    ? (file.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
    : []
  /** 须先于 sync* 变更 status，否则 open 单被提前标 done 后大厅过滤为空 */
  const mpRecruitmentOrders = mergeMpRecruitmentOrdersForHallContext(
    mpRaw,
    includeMpOrderIds,
    prOwnerKeys,
  )
  const deduped = syncDedupeApplicantsInSnapshot(file)
  const expired = syncExpiredMpOrdersInSnapshot(file)
  const pendingExpired = syncExpiredIcePendingConfirmInSnapshot(file)
  const inboxKeys =
    talentAccount && talentMember
      ? talentInboxMatchKeysFromProfile(talentAccount, talentMember)
      : new Set<string>()
  const mpTalentInbox = filterTalentInboxForHall(file.mpTalentInbox, inboxKeys)
  const mpGroupQrByOrderId = talentMember
    ? buildMpGroupQrByOrderIdForSession(
        file,
        talentMember,
        talentAccount?.openid || talentMember.wxOpenId,
      )
    : talentAccount?.openid
      ? buildMpGroupQrByOrderIdForSession(file, null, talentAccount.openid)
      : {}
  const payload: Record<string, unknown> = {
    ok: true,
    mpRecruitmentOrders,
    ...(mpTalentInbox.length ? { mpTalentInbox } : {}),
    ...(Object.keys(mpGroupQrByOrderId).length ? { mpGroupQrByOrderId } : {}),
  }
  if (includeRecommendPool) {
    const members = Array.isArray(file.mpTalentMembers) ? file.mpTalentMembers : []
    const library = Array.isArray(file.talentLibraryEntries) ? file.talentLibraryEntries : []
    const shootLib = Array.isArray(file.shootTeamLibraryEntries) ? file.shootTeamLibraryEntries : []
    const editLib = Array.isArray(file.editTeamLibraryEntries) ? file.editTeamLibraryEntries : []
    if (members.length) payload.mpTalentMembers = members
    if (library.length) payload.talentLibraryEntries = library
    if (shootLib.length) payload.shootTeamLibraryEntries = shootLib
    if (editLib.length) payload.editTeamLibraryEntries = editLib
  }
  return {
    needPersist:
      expired.syncedIds.length > 0 ||
      deduped.syncedOrderIds.length > 0 ||
      pendingExpired.syncedOrderIds.length > 0,
    partial: file,
    payload,
  }
}

function hallOrderCount(payload: Record<string, unknown> | null | undefined): number {
  return Array.isArray(payload?.mpRecruitmentOrders) ? payload!.mpRecruitmentOrders!.length : 0
}

function buildHallPayloadSafe(
  partial: Partial<RegistryFile>,
  includeMpOrderIds?: string[],
  prOwnerKeys?: PrOwnerKeys,
  talentMember?: RegistryMpTalentMember | null,
  talentAccount?: { lingqi_talent_id?: string | null; registry_member_id?: string | null; openid?: string | null },
  includeRecommendPool?: boolean,
): { payload: Record<string, unknown>; needPersist: boolean; partial: Partial<RegistryFile> } {
  try {
    return buildHallPayload(
      partial,
      includeMpOrderIds,
      prOwnerKeys,
      talentMember,
      talentAccount,
      includeRecommendPool,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[hall_registry] buildHallPayload failed:', msg.slice(0, 400))
    const mp = Array.isArray(partial.mpRecruitmentOrders)
      ? partial.mpRecruitmentOrders.filter((o) => o && o.id)
      : []
    if (mp.length) {
      return {
        payload: { ok: true, mpRecruitmentOrders: mp },
        needPersist: false,
        partial,
      }
    }
    return { payload: emptyHallPayload(), needPersist: false, partial: {} }
  }
}

async function tryLoadHallFromPartial(
  partialLoader: () => Promise<Partial<RegistryFile>>,
  supabaseUrl: string,
  serviceRole: string,
  opts: {
    includeMpOrderIds: string[]
    prOwnerKeys?: PrOwnerKeys
    talentMember?: RegistryMpTalentMember | null
    talentAccount?: { lingqi_talent_id?: string | null; registry_member_id?: string | null; openid?: string | null }
    includeRecommendPool: boolean
  },
): Promise<Record<string, unknown> | null> {
  const partial = await partialLoader()
  const built = buildHallPayloadSafe(
    partial,
    opts.includeMpOrderIds,
    opts.prOwnerKeys,
    opts.talentMember,
    opts.talentAccount,
    opts.includeRecommendPool,
  )
  if (built.needPersist) {
    void persistRegistryIfNeeded(supabaseUrl, serviceRole, built.partial).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[hall_registry] async persist failed:', msg.slice(0, 200))
    })
  }
  return built.payload
}

async function persistRegistryIfNeeded(
  supabaseUrl: string,
  serviceRole: string,
  partial: Partial<RegistryFile>,
): Promise<void> {
  const base = supabaseUrl.replace(/\/$/, '')
  const { registryForPersistentFile } = await import('../../vite-plugins/opsRegistryGatewayCore.js')
  const persist = registryForPersistentFile(partial as RegistryFile)
  const nowIso = new Date().toISOString()
  const body = JSON.stringify({
    id: 1,
    registry: persist as unknown as Record<string, unknown>,
    updated_at: nowIso,
  })
  const res = await supabaseAdminFetch(`${base}/rest/v1/ops_registry_snapshot`, {
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
  talentAccount?: { lingqi_talent_id?: string | null; registry_member_id?: string | null; openid?: string | null }
  /** 已登录 PR 推荐大厅：附带达人/团队库（轻量大厅默认不含） */
  includeRecommendPool?: boolean
}): Promise<Record<string, unknown>> {
  const includeMpOrderIds = (opts?.includeMpOrderIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean)
    .slice(0, 120)
  const prOwnerKeys = opts?.prOwnerKeys
  const talentMember = opts?.talentMember
  const talentAccount = opts?.talentAccount
  const includeRecommendPool = opts?.includeRecommendPool === true
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const attempts: string[] = []
  const buildOpts = {
    includeMpOrderIds,
    prOwnerKeys,
    talentMember,
    talentAccount,
    includeRecommendPool,
  }

  if (missingParts.length === 0) {
    const loaders: Array<() => Promise<Partial<RegistryFile>>> = includeRecommendPool
      ? [
          () => fetchRegistryPartialFromDb(supabaseUrl, serviceRole),
          () => fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole),
        ]
      : [
          () => fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole),
          () => fetchRegistryPartialFromDb(supabaseUrl, serviceRole),
          () => fetchHallRegistryViaRpc(supabaseUrl, serviceRole),
        ]
    let lastPayload: Record<string, unknown> | null = null
    for (let i = 0; i < loaders.length; i++) {
      try {
        const payload = await tryLoadHallFromPartial(loaders[i]!, supabaseUrl, serviceRole, buildOpts)
        if (hallOrderCount(payload) > 0) return payload!
        lastPayload = payload
        attempts.push(`loader_${i}:built_empty`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        attempts.push(msg.slice(0, 240))
      }
    }
    if (lastPayload) return lastPayload
  } else if (isVercelServerless()) {
    attempts.push(`registry_env_missing:${missingParts.join(',')}`)
  } else {
    console.error(
      '[hall_registry] supabase_admin_not_configured:',
      missingParts.join(','),
      merchantSupabaseAdminEnvConfigureHint(missingParts),
    )
    return emptyHallPayload()
  }

  if (isVercelServerless()) {
    try {
      const remote = await proxyGetErpApi('/api/meoo-ops-mp-hall-registry')
      const built = buildHallPayloadSafe(
        remote as Partial<RegistryFile>,
        includeMpOrderIds,
        prOwnerKeys,
        talentMember,
        talentAccount,
        includeRecommendPool,
      )
      return built.payload
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`ecs_proxy:${msg.slice(0, 240)}`)
    }
  }

  console.error('[hall_registry] all paths failed:', attempts.join(' | '))
  return emptyHallPayload()
}
