import {
  merchantSupabaseAdminEnvConfigureHint,
  readMerchantSupabaseAdminEnv,
} from '../../vite-plugins/merchantSupabaseAdminEnv.js'
import type { RegistryFile, RegistryIceVideoSlot, RegistryMpRecruitmentOrder, RegistryMpPrUser } from './opsRegistryTypes.js'
import { resolveApplicantCountFromMp } from './mpRecruitCount.js'
import { isVercelServerless } from './mpErpRuntime.js'
import { proxyGetErpApi } from './mpErpApiProxy.js'
import {
  mergeMpRecruitmentOrdersForHallContext,
  type HallMergeOptions,
  type PrOwnerKeys,
} from './registryTenantIsolation.js'
import {
  filterTalentInboxForHall,
  filterTalentInboxForOrderIds,
  talentInboxMatchKeysFromProfile,
} from './mpTalentInboxHallFilter.js'
import {
  buildMpGroupQrByOrderIdForFormRelayGroupQrApply,
  buildMpGroupQrByOrderIdForIncludedOrderIds,
  buildMpGroupQrByOrderIdForSession,
  buildMpGroupQrByOrderIdForPrOwner,
} from './mpGroupQrHallSlice.js'
import type { RegistryMpTalentMember } from './opsRegistryTypes.js'
import { supabaseAdminFetch } from './supabaseAdminFetch.js'
import { hydrateRecommendHallInlineImagesToOss } from './recommendHallInlineImagesOss.js'
import { hydrateRecommendHallAvatarsFromAccounts } from './recommendHallMemberAvatars.js'
import {
  readMpFormRelayGroupQrViaPg,
  readMpRecruitmentOrdersByIdsViaPg,
} from './registrySnapshotPgAppend.js'
import { isFormRelayGroupQrRelay, readExternalFormRelay } from './formRelayPlatforms.js'

function looksLikePhone(raw: string): boolean {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length === 11 && /^1\d{10}$/.test(digits)
}

function isValidPublisherName(name: string, order?: RegistryMpRecruitmentOrder): boolean {
  const n = String(name || '').trim()
  if (!n || looksLikePhone(n)) return false
  const title = String(order?.title || '').trim()
  const customer = String(order?.customerName || '').trim()
  if (title && n === title) return false
  if (customer && n === customer) return false
  return true
}

/** PR 用户库「名称」列：公司名 / 个人名（与商家后台一致） */
export function prUserDisplayNameForOrder(
  user: RegistryMpPrUser,
  order?: RegistryMpRecruitmentOrder,
): string {
  const accountType = user.accountType === 'personal' ? 'personal' : 'company'
  const candidates =
    accountType === 'personal'
      ? [user.personalName, user.companyName, user.contactName]
      : [user.companyName, user.personalName, user.contactName]
  for (const raw of candidates) {
    const name = String(raw || '').trim()
    if (isValidPublisherName(name, order)) return name
  }
  return ''
}

/** 分享海报：始终返回 PR 用户库主名称，不与订单标题比对 */
export function prUserDisplayNameForPoster(user: RegistryMpPrUser): string {
  const accountType = user.accountType === 'personal' ? 'personal' : 'company'
  const raw = accountType === 'personal' ? user.personalName : user.companyName
  const name = String(raw || '').trim()
  if (!name || looksLikePhone(name)) return ''
  return name
}

/** 详情/海报分享：仅附带发单方 PR 用户库条目（与「名称」列一致） */
function publisherPrUsersForOrders(
  file: RegistryFile,
  orders: RegistryMpRecruitmentOrder[],
): RegistryMpPrUser[] {
  const users = Array.isArray(file.mpPrUsers) ? file.mpPrUsers : []
  if (!users.length || !orders.length) return []
  const lingqiSet = new Set<string>()
  const registrySet = new Set<string>()
  const participantSet = new Set<string>()
  for (const o of orders) {
    const meta =
      o.mpPublishMeta && typeof o.mpPublishMeta === 'object'
        ? (o.mpPublishMeta as Record<string, unknown>)
        : {}
    const lq = String(meta.lingqiPrId || '').trim()
    const reg = String(meta.registryPrId || '').trim()
    const pk = String(meta.prParticipantKey || '').trim()
    if (lq) lingqiSet.add(lq)
    if (reg) registrySet.add(reg)
    if (pk) participantSet.add(pk)
  }
  if (!lingqiSet.size && !registrySet.size && !participantSet.size) return []
  return users
    .filter((u) => {
      if (!u) return false
      const uLq = String(u.lingqiPrId || '').trim()
      const uId = String(u.id || '').trim()
      if (lingqiSet.has(uLq) || lingqiSet.has(uId)) return true
      if (registrySet.has(uId) || registrySet.has(uLq)) return true
      if (participantSet.size) {
        const phone = String(u.contactPhone || '')
          .replace(/\D/g, '')
          .slice(-11)
        if (phone && participantSet.has(`pr_${phone}`)) return true
      }
      return false
    })
    .slice(0, 20)
}

export function findPrUserForMpOrder(
  users: RegistryMpPrUser[],
  order: RegistryMpRecruitmentOrder,
): RegistryMpPrUser | null {
  const direct = lookupPrUserByOrderKeys(users, order)
  if (direct) return direct
  if (!users.length || !order) return null
  const slice = publisherPrUsersForOrders({ mpPrUsers: users } as RegistryFile, [order])
  if (slice.length === 1) return slice[0]!
  if (slice.length > 1) {
    const meta =
      order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
        ? (order.mpPublishMeta as Record<string, unknown>)
        : {}
    const reg = String(meta.registryPrId || '').trim()
    if (reg) {
      const hit = slice.find((u) => String(u.id || '').trim() === reg)
      if (hit) return hit
    }
    const lq = String(meta.lingqiPrId || '').trim()
    if (lq) {
      const hit = slice.find((u) => String(u.lingqiPrId || '').trim() === lq)
      if (hit) return hit
    }
  }
  return null
}

/** 商单编号 → mpPublishMeta 平台账号 → PR 用户库唯一匹配 */
export function lookupPrUserByOrderKeys(
  users: RegistryMpPrUser[],
  order: RegistryMpRecruitmentOrder | null,
): RegistryMpPrUser | null {
  if (!users.length || !order) return null
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const registryPrId = String(meta.registryPrId || '').trim()
  const lingqiPrId = String(meta.lingqiPrId || '').trim()
  const participantKey = String(meta.prParticipantKey || '').trim()

  if (registryPrId) {
    const hit = users.find(
      (u) =>
        String(u.id || '').trim() === registryPrId ||
        String(u.lingqiPrId || '').trim() === registryPrId,
    )
    if (hit) return hit
  }
  if (lingqiPrId) {
    const hit = users.find(
      (u) =>
        String(u.lingqiPrId || '').trim() === lingqiPrId ||
        String(u.id || '').trim() === lingqiPrId,
    )
    if (hit) return hit
  }
  if (participantKey) {
    const hit = users.find((u) => {
      const phone = String(u.contactPhone || '')
        .replace(/\D/g, '')
        .slice(-11)
      return phone.length === 11 && participantKey === `pr_${phone}`
    })
    if (hit) return hit
  }
  return null
}

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

/** 仅拉 mpRecruitmentOrders 列，比全量 registry 更小更稳（运营台列表读专用，不做 slim） */
export async function fetchRegistryMpOrdersFromDb(
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

/** 仅拉 mpGroupQrByOrderId（转发群码/入选群码 side map；订单体已脱敏不含码） */
async function fetchRegistryMpGroupQrByOrderIdFromDb(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile & { mpGroupQrByOrderId?: Record<string, string> }>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=mpGroupQrByOrderId:registry-%3EmpGroupQrByOrderId`
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
    throw new Error(`registry_mp_group_qr_${res.status}:${text.slice(0, 240)}`)
  }
  let rows: { mpGroupQrByOrderId?: unknown }[]
  try {
    rows = JSON.parse(text || '[]') as { mpGroupQrByOrderId?: unknown }[]
  } catch {
    throw new Error(`registry_mp_group_qr_parse:${text.slice(0, 120)}`)
  }
  const map = rows[0]?.mpGroupQrByOrderId
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {}
  return { mpGroupQrByOrderId: map as Record<string, string> }
}

/** 仅拉 mpPrUsers 列，供海报/详情读取发单方名称 */
async function fetchRegistryMpPrUsersFromDb(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=mpPrUsers:registry-%3EmpPrUsers`
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
    throw new Error(`registry_mp_pr_users_${res.status}:${text.slice(0, 240)}`)
  }
  let rows: { mpPrUsers?: unknown }[]
  try {
    rows = JSON.parse(text || '[]') as { mpPrUsers?: unknown }[]
  } catch {
    throw new Error(`registry_mp_pr_users_parse:${text.slice(0, 120)}`)
  }
  const pr = rows[0]?.mpPrUsers
  if (!Array.isArray(pr)) return {}
  return { mpPrUsers: pr as RegistryMpPrUser[] }
}

/** 分享海报：按招商单 ID 实时读取 PR 用户库对应名称 */
export async function resolvePublisherDisplayForMpOrder(
  mpOrderId: string,
  supabaseUrl: string,
  serviceRole: string,
): Promise<{
  ok: boolean
  displayName: string
  prUser: RegistryMpPrUser | null
  mpOrderId: string
}> {
  const id = String(mpOrderId || '').trim()
  if (!id) return { ok: false, displayName: '', prUser: null, mpOrderId: '' }

  const resolveFromOrder = (
    order: RegistryMpRecruitmentOrder | null,
    users: RegistryMpPrUser[],
  ) => {
    if (!order) return null
    const prUser = findPrUserForMpOrder(users, order)
    const displayName = prUser ? prUserDisplayNameForPoster(prUser) : ''
    if (!displayName) return null
    return { displayName, prUser }
  }

  const { missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length === 0) {
    try {
      const [ordersPartial, prPartial] = await Promise.all([
        fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole),
        fetchRegistryMpPrUsersFromDb(supabaseUrl, serviceRole),
      ])
      const orders = Array.isArray(ordersPartial.mpRecruitmentOrders)
        ? (ordersPartial.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
        : []
      const users = Array.isArray(prPartial.mpPrUsers) ? (prPartial.mpPrUsers as RegistryMpPrUser[]) : []
      const order = orders.find((o) => o && String(o.id) === id) || null
      const hit = resolveFromOrder(order, users)
      if (hit) return { ok: true, mpOrderId: id, ...hit }
    } catch {
      /* fall through */
    }
  }

  try {
    const hallPayload = await loadMpHallRegistryPayload({ includeMpOrderIds: [id] })
    const orders = Array.isArray(hallPayload.mpRecruitmentOrders)
      ? (hallPayload.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
      : []
    const order = orders.find((o) => o && String(o.id) === id) || null
    let users = Array.isArray(hallPayload.mpPrUsers)
      ? (hallPayload.mpPrUsers as RegistryMpPrUser[])
      : []
    if (order && !users.length) {
      try {
        const prPartial = await fetchRegistryMpPrUsersFromDb(supabaseUrl, serviceRole)
        users = Array.isArray(prPartial.mpPrUsers) ? (prPartial.mpPrUsers as RegistryMpPrUser[]) : []
      } catch {
        /* optional slice */
      }
    }
    const hit = resolveFromOrder(order, users)
    if (hit) return { ok: true, mpOrderId: id, ...hit }
  } catch {
    /* fall through to DB slices */
  }

  if (missingParts.length > 0) {
    return { ok: false, displayName: '', prUser: null, mpOrderId: id }
  }

  try {
    let orders: RegistryMpRecruitmentOrder[] = []
    let users: RegistryMpPrUser[] = []
    try {
      const [ordersPartial, prPartial] = await Promise.all([
        fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole),
        fetchRegistryMpPrUsersFromDb(supabaseUrl, serviceRole),
      ])
      orders = Array.isArray(ordersPartial.mpRecruitmentOrders)
        ? ordersPartial.mpRecruitmentOrders
        : []
      users = Array.isArray(prPartial.mpPrUsers) ? prPartial.mpPrUsers : []
    } catch {
      const partial = await fetchRegistryPartialFromDb(supabaseUrl, serviceRole)
      orders = Array.isArray(partial.mpRecruitmentOrders) ? partial.mpRecruitmentOrders : []
      users = Array.isArray(partial.mpPrUsers) ? partial.mpPrUsers : []
    }
    const order = orders.find((o) => o && String(o.id) === id) || null
    const hit = resolveFromOrder(order, users)
    if (hit) return { ok: true, mpOrderId: id, ...hit }
  } catch {
    /* ignore */
  }
  return { ok: false, displayName: '', prUser: null, mpOrderId: id }
}

/** 仅拉 mpTalentInbox 列，供 PR 报名管理页统计「已通知」 */
async function fetchRegistryTalentInboxFromDb(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=mpTalentInbox:registry-%3EmpTalentInbox`
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
    throw new Error(`registry_talent_inbox_${res.status}:${text.slice(0, 240)}`)
  }
  let rows: { mpTalentInbox?: unknown }[]
  try {
    rows = JSON.parse(text || '[]') as { mpTalentInbox?: unknown }[]
  } catch {
    throw new Error(`registry_talent_inbox_parse:${text.slice(0, 120)}`)
  }
  const inbox = rows[0]?.mpTalentInbox
  if (!Array.isArray(inbox)) return {}
  return { mpTalentInbox: inbox as RegistryFile['mpTalentInbox'] }
}

/** 达人已登录：拉 inbox 列并按会话身份过滤（与星选 Web 全量 registry + 客户端过滤等价） */
export async function loadTalentInboxForMpSession(opts?: {
  talentMember?: RegistryMpTalentMember | null
  talentAccount?: {
    lingqi_talent_id?: string | null
    registry_member_id?: string | null
    openid?: string | null
    login_name?: string | null
  }
}): Promise<RegistryFile['mpTalentInbox']> {
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) return []
  try {
    const inboxPartial = await fetchRegistryTalentInboxFromDb(supabaseUrl, serviceRole)
    const keys = opts?.talentAccount
      ? talentInboxMatchKeysFromProfile(opts.talentAccount, opts?.talentMember ?? null)
      : new Set<string>()
    return filterTalentInboxForHall(inboxPartial.mpTalentInbox, keys)
  } catch {
    return []
  }
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

/**
 * 小程序首页大厅：剥离 applicants 等大字段，避免云函数 callFunction 响应 >1MB（-501000）。
 * 保留 applicantCount、iceVideoSlots 认领字段供列表展示。
 */
export function slimMpRecruitmentOrdersForHallList(
  orders: RegistryMpRecruitmentOrder[],
): RegistryMpRecruitmentOrder[] {
  if (!Array.isArray(orders) || !orders.length) return []
  return orders.map((raw) => {
    const o = { ...raw }
    o.applicantCount = resolveApplicantCountFromMp(o)
    if (Array.isArray(o.applicants) && o.applicants.length > 0) {
      delete o.applicants
    }
    if (Array.isArray(o.iceVideoSlots) && o.iceVideoSlots.length > 0) {
      o.iceVideoSlots = o.iceVideoSlots.map((slot) => {
        if (!slot || typeof slot !== 'object') return slot as RegistryIceVideoSlot
        const s = slot as RegistryIceVideoSlot
        return {
          slotId: String(s.slotId || ''),
          label: String(s.label || ''),
          downloadUrl: '',
          assignedApplicantId: s.assignedApplicantId,
          assignedAt: s.assignedAt,
          deliverStatus: s.deliverStatus,
        }
      })
    }
    const cover = String(o.coverImage || '').trim()
    if (cover.startsWith('data:') && cover.length > 256) {
      delete o.coverImage
    }
    const groupQr = String(o.groupQrImage || '').trim()
    if (groupQr.startsWith('data:') && groupQr.length > 256) {
      delete o.groupQrImage
    }
    return o
  })
}

/** 推荐大厅 / PR 库：拉取达人·团队·PR 相关切片（禁止写回 DB） */
async function fetchRegistryRecommendPoolFromDb(
  supabaseUrl: string,
  serviceRole: string,
): Promise<Partial<RegistryFile>> {
  const base = supabaseUrl.replace(/\/$/, '')
  const select = [
    'mpRecruitmentOrders:registry->mpRecruitmentOrders',
    'mpTalentMembers:registry->mpTalentMembers',
    'talentLibraryEntries:registry->talentLibraryEntries',
    'shootTeamLibraryEntries:registry->shootTeamLibraryEntries',
    'editTeamLibraryEntries:registry->editTeamLibraryEntries',
    'mpPrUsers:registry->mpPrUsers',
  ].join(',')
  const url = `${base}/rest/v1/ops_registry_snapshot?id=eq.1&select=${encodeURIComponent(select)}`
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
    throw new Error(`registry_recommend_pool_${res.status}:${text.slice(0, 240)}`)
  }
  let rows: Record<string, unknown>[]
  try {
    rows = JSON.parse(text || '[]') as Record<string, unknown>[]
  } catch {
    throw new Error(`registry_recommend_pool_parse:${text.slice(0, 120)}`)
  }
  const row = rows[0]
  if (!row || typeof row !== 'object') return {}
  return row as Partial<RegistryFile>
}

function recommendPoolCount(partial: Partial<RegistryFile>): number {
  const n = (key: keyof RegistryFile) => (Array.isArray(partial[key]) ? (partial[key] as unknown[]).length : 0)
  return (
    n('mpTalentMembers') +
    n('talentLibraryEntries') +
    n('shootTeamLibraryEntries') +
    n('editTeamLibraryEntries') +
    n('mpPrUsers')
  )
}

function buildHallPayload(
  partial: Partial<RegistryFile>,
  includeMpOrderIds?: string[],
  prOwnerKeys?: PrOwnerKeys,
  talentMember?: RegistryMpTalentMember | null,
  talentAccount?: {
    lingqi_talent_id?: string | null
    registry_member_id?: string | null
    openid?: string | null
    login_name?: string | null
  },
  includeRecommendPool?: boolean,
  hallMergeOpts?: HallMergeOptions,
): { payload: Record<string, unknown>; partial: Partial<RegistryFile> } {
  const file = partial as RegistryFile
  const mpRaw = Array.isArray(file.mpRecruitmentOrders)
    ? (file.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
    : []
  const mpRecruitmentOrders = mergeMpRecruitmentOrdersForHallContext(
    mpRaw,
    includeMpOrderIds,
    prOwnerKeys,
    hallMergeOpts,
  )
  const inboxKeys = talentAccount
    ? talentInboxMatchKeysFromProfile(talentAccount, talentMember ?? null)
    : new Set<string>()
  let mpTalentInbox = filterTalentInboxForHall(file.mpTalentInbox, inboxKeys)
  if (!mpTalentInbox.length && prOwnerKeys) {
    const orderIdSet = new Set(
      mpRecruitmentOrders.map((o) => String(o.id || '').trim()).filter(Boolean),
    )
    mpTalentInbox = filterTalentInboxForOrderIds(file.mpTalentInbox, orderIdSet)
  }
  let mpGroupQrByOrderId = talentMember
    ? buildMpGroupQrByOrderIdForSession(
        file,
        talentMember,
        talentAccount?.openid || talentMember.wxOpenId,
      )
    : talentAccount?.openid
      ? buildMpGroupQrByOrderIdForSession(file, null, talentAccount.openid)
      : {}
  if (prOwnerKeys) {
    const prOrderIds = new Set(
      mpRecruitmentOrders.map((o) => String(o.id || '').trim()).filter(Boolean),
    )
    mpGroupQrByOrderId = {
      ...mpGroupQrByOrderId,
      ...buildMpGroupQrByOrderIdForPrOwner(file, prOrderIds),
    }
  }
  mpGroupQrByOrderId = {
    ...mpGroupQrByOrderId,
    ...buildMpGroupQrByOrderIdForFormRelayGroupQrApply(file),
    ...buildMpGroupQrByOrderIdForIncludedOrderIds(file, includeMpOrderIds),
  }
  const publisherPrUsers = publisherPrUsersForOrders(file, mpRecruitmentOrders)
  const payload: Record<string, unknown> = {
    ok: true,
    mpRecruitmentOrders,
    ...(mpTalentInbox.length ? { mpTalentInbox } : {}),
    ...(Object.keys(mpGroupQrByOrderId).length ? { mpGroupQrByOrderId } : {}),
    ...(publisherPrUsers.length ? { mpPrUsers: publisherPrUsers } : {}),
  }
  if (includeRecommendPool) {
    const members = Array.isArray(file.mpTalentMembers) ? file.mpTalentMembers : []
    const library = Array.isArray(file.talentLibraryEntries) ? file.talentLibraryEntries : []
    const shootLib = Array.isArray(file.shootTeamLibraryEntries) ? file.shootTeamLibraryEntries : []
    const editLib = Array.isArray(file.editTeamLibraryEntries) ? file.editTeamLibraryEntries : []
    const prUsers = Array.isArray(file.mpPrUsers) ? file.mpPrUsers : []
    if (members.length) payload.mpTalentMembers = members
    if (library.length) payload.talentLibraryEntries = library
    if (shootLib.length) payload.shootTeamLibraryEntries = shootLib
    if (editLib.length) payload.editTeamLibraryEntries = editLib
    if (prUsers.length) payload.mpPrUsers = prUsers
    payload._recommendPoolMeta = {
      source: 'ops_registry_snapshot',
      talentLibraryCount: library.length,
      shootTeamLibraryCount: shootLib.length,
      editTeamLibraryCount: editLib.length,
      mpTalentMembersCount: members.length,
      mpPrUsersCount: prUsers.length,
    }
  }
  return {
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
  talentAccount?: {
    lingqi_talent_id?: string | null
    registry_member_id?: string | null
    openid?: string | null
    login_name?: string | null
  },
  includeRecommendPool?: boolean,
  hallMergeOpts?: HallMergeOptions,
): { payload: Record<string, unknown>; partial: Partial<RegistryFile> } {
  try {
    return buildHallPayload(
      partial,
      includeMpOrderIds,
      prOwnerKeys,
      talentMember,
      talentAccount,
      includeRecommendPool,
      hallMergeOpts,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[hall_registry] buildHallPayload failed:', msg.slice(0, 400))
    const mp = Array.isArray(partial.mpRecruitmentOrders)
      ? partial.mpRecruitmentOrders.filter((o) => o && o.id)
      : []
    const payload: Record<string, unknown> =
      mp.length > 0 ? { ok: true, mpRecruitmentOrders: mp } : emptyHallPayload()
    if (includeRecommendPool) {
      const members = Array.isArray(partial.mpTalentMembers) ? partial.mpTalentMembers : []
      const library = Array.isArray(partial.talentLibraryEntries) ? partial.talentLibraryEntries : []
      const shootLib = Array.isArray(partial.shootTeamLibraryEntries) ? partial.shootTeamLibraryEntries : []
      const editLib = Array.isArray(partial.editTeamLibraryEntries) ? partial.editTeamLibraryEntries : []
      const prUsers = Array.isArray(partial.mpPrUsers) ? partial.mpPrUsers : []
      if (members.length) payload.mpTalentMembers = members
      if (library.length) payload.talentLibraryEntries = library
      if (shootLib.length) payload.shootTeamLibraryEntries = shootLib
      if (editLib.length) payload.editTeamLibraryEntries = editLib
      if (prUsers.length) payload.mpPrUsers = prUsers
      payload._recommendPoolMeta = {
        source: 'ops_registry_snapshot',
        talentLibraryCount: library.length,
        shootTeamLibraryCount: shootLib.length,
        editTeamLibraryCount: editLib.length,
        mpTalentMembersCount: members.length,
        mpPrUsersCount: prUsers.length,
      }
    }
    if (mp.length || Object.keys(payload).length > 2) {
      return { payload, partial }
    }
    return { payload: emptyHallPayload(), partial: {} }
  }
}

async function tryLoadHallFromPartial(
  partialLoader: () => Promise<Partial<RegistryFile>>,
  opts: {
    includeMpOrderIds: string[]
    prOwnerKeys?: PrOwnerKeys
    talentMember?: RegistryMpTalentMember | null
    talentAccount?: {
      lingqi_talent_id?: string | null
      registry_member_id?: string | null
      openid?: string | null
      login_name?: string | null
    }
    includeRecommendPool: boolean
    hallMergeOpts?: HallMergeOptions
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
    opts.hallMergeOpts,
  )
  return built.payload
}

async function finalizeRecommendHallPayload(
  payload: Record<string, unknown> | null | undefined,
  includeRecommendPool: boolean,
  db?: { supabaseUrl: string; serviceRole: string },
): Promise<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') return payload || { ok: true, mpRecruitmentOrders: [] }
  if (!includeRecommendPool) return payload
  let out = payload
  if (db?.supabaseUrl && db?.serviceRole) {
    out = await hydrateRecommendHallAvatarsFromAccounts(out, db.supabaseUrl, db.serviceRole)
  }
  return hydrateRecommendHallInlineImagesToOss(out)
}

export async function loadMpHallRegistryPayload(opts?: {
  includeMpOrderIds?: string[]
  prOwnerKeys?: PrOwnerKeys
  talentMember?: RegistryMpTalentMember | null
  talentAccount?: {
    lingqi_talent_id?: string | null
    registry_member_id?: string | null
    openid?: string | null
    login_name?: string | null
  }
  /** 已登录 PR 推荐大厅：附带达人/团队库（轻量大厅默认不含） */
  includeRecommendPool?: boolean
  /** 显式 includePrOwned：合并 PR 全部发单 */
  includeAllPrOwned?: boolean
  /** PR 商单列表：仅名下发单 + 列表瘦身 */
  prOwnedList?: boolean
  slimPrListApplicants?: boolean
  /** 仅返回 includeMpOrderIds（海报/详情），不合并公开大厅 */
  includeOnly?: boolean
}): Promise<Record<string, unknown>> {
  const includeMpOrderIds = (opts?.includeMpOrderIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean)
    .slice(0, 120)
  const prOwnerKeys = opts?.prOwnerKeys
  const talentMember = opts?.talentMember
  const talentAccount = opts?.talentAccount
  const includeRecommendPool = opts?.includeRecommendPool === true
  const includeAllPrOwned = opts?.includeAllPrOwned === true
  const hallMergeOpts: HallMergeOptions = {
    includeAllPrOwned,
    prOwnedOnly: opts?.prOwnedList === true,
    slimPrListApplicants: opts?.slimPrListApplicants === true,
    includeOnly: opts?.includeOnly === true,
  }
  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  const attempts: string[] = []
  const buildOpts = {
    includeMpOrderIds,
    prOwnerKeys,
    talentMember,
    talentAccount,
    includeRecommendPool,
    hallMergeOpts,
  }

  /** 详情/单单页：PG 按 id 抽取，跳过整列 mpRecruitmentOrders */
  const detailFastPath =
    hallMergeOpts.includeOnly === true &&
    includeMpOrderIds.length > 0 &&
    !includeRecommendPool &&
    !includeAllPrOwned &&
    opts?.prOwnedList !== true

  if (detailFastPath) {
    try {
      const pg = await readMpRecruitmentOrdersByIdsViaPg(includeMpOrderIds)
      if (pg.ok) {
        let partial: Partial<RegistryFile> = {
          mpRecruitmentOrders: pg.orders as RegistryMpRecruitmentOrder[],
          mpPrUsers: pg.mpPrUsers as RegistryMpPrUser[],
          mpGroupQrByOrderId: pg.groupQrByOrderId,
        }
        const needsInboxSlice =
          missingParts.length === 0 && (!!prOwnerKeys || !!talentAccount || !!talentMember)
        if (needsInboxSlice) {
          try {
            const inboxPartial = await fetchRegistryTalentInboxFromDb(supabaseUrl, serviceRole)
            if (Array.isArray(inboxPartial.mpTalentInbox)) {
              partial = { ...partial, mpTalentInbox: inboxPartial.mpTalentInbox }
            }
          } catch {
            /* inbox optional */
          }
        }
        const payload = await tryLoadHallFromPartial(async () => partial, buildOpts)
        return finalizeRecommendHallPayload(payload!, includeRecommendPool, {
          supabaseUrl,
          serviceRole,
        })
      }
      attempts.push(`detail_pg_fast:${pg.error}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`detail_pg_fast_ex:${msg.slice(0, 160)}`)
    }
  }

  if (missingParts.length === 0) {
    const loaders: Array<() => Promise<Partial<RegistryFile>>> = includeRecommendPool
      ? [
          () => fetchRegistryRecommendPoolFromDb(supabaseUrl, serviceRole),
          () => fetchRegistryPartialFromDb(supabaseUrl, serviceRole),
        ]
      : [
          () => fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole),
          () => fetchRegistryPartialFromDb(supabaseUrl, serviceRole),
          () => fetchHallRegistryViaRpc(supabaseUrl, serviceRole),
        ]
    let lastPayload: Record<string, unknown> | null = null
    for (let i = 0; i < loaders.length; i++) {
      try {
        let partial = await loaders[i]!()
        if (includeMpOrderIds.length > 0 && !Array.isArray(partial.mpPrUsers)) {
          try {
            const prSlice = await fetchRegistryMpPrUsersFromDb(supabaseUrl, serviceRole)
            if (Array.isArray(prSlice.mpPrUsers)) {
              partial = { ...partial, mpPrUsers: prSlice.mpPrUsers }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            attempts.push(`mpPrUsers_slice:${msg.slice(0, 120)}`)
          }
        }
        const needsInboxSlice =
          !Array.isArray(partial.mpTalentInbox) && (!!prOwnerKeys || !!talentAccount || !!talentMember)
        if (needsInboxSlice) {
          try {
            const inboxPartial = await fetchRegistryTalentInboxFromDb(supabaseUrl, serviceRole)
            if (Array.isArray(inboxPartial.mpTalentInbox)) {
              partial = { ...partial, mpTalentInbox: inboxPartial.mpTalentInbox }
            }
          } catch {
            /* inbox slice optional */
          }
        }
        const needsQrSlice =
          includeMpOrderIds.length > 0 ||
          !partial.mpGroupQrByOrderId ||
          typeof partial.mpGroupQrByOrderId !== 'object' ||
          Array.isArray(partial.mpGroupQrByOrderId)
        if (needsQrSlice) {
          try {
            const qrSlice = await fetchRegistryMpGroupQrByOrderIdFromDb(supabaseUrl, serviceRole)
            if (qrSlice.mpGroupQrByOrderId && typeof qrSlice.mpGroupQrByOrderId === 'object') {
              partial = {
                ...partial,
                mpGroupQrByOrderId: {
                  ...((partial.mpGroupQrByOrderId as Record<string, string>) || {}),
                  ...(qrSlice.mpGroupQrByOrderId as Record<string, string>),
                },
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            attempts.push(`mpGroupQr_slice:${msg.slice(0, 120)}`)
          }
        }
        const payload = await tryLoadHallFromPartial(async () => partial, buildOpts)
        const orders = hallOrderCount(payload)
        const pool = includeRecommendPool ? recommendPoolCount(partial) : 0
        if (orders > 0 || (includeRecommendPool && pool > 0)) {
          return finalizeRecommendHallPayload(payload!, includeRecommendPool, {
            supabaseUrl,
            serviceRole,
          })
        }
        lastPayload = payload
        attempts.push(`loader_${i}:built_empty`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        attempts.push(msg.slice(0, 240))
      }
    }
    if (lastPayload) {
      return finalizeRecommendHallPayload(lastPayload, includeRecommendPool, {
        supabaseUrl,
        serviceRole,
      })
    }
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
      return finalizeRecommendHallPayload(built.payload, includeRecommendPool)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      attempts.push(`ecs_proxy:${msg.slice(0, 240)}`)
    }
  }

  console.error('[hall_registry] all paths failed:', attempts.join(' | '))
  return emptyHallPayload()
}

export type FormRelayGroupQrResolve =
  | { ok: true; mpOrderId: string; title: string; groupQrImage: string; via: string }
  | { ok: false; error: string; status: number }

function groupQrFromSideMap(
  map: Record<string, string> | null | undefined,
  mpOrderId: string,
): string {
  const id = String(mpOrderId || '').trim()
  if (!id || !map || typeof map !== 'object') return ''
  return String(map[id] || '').trim()
}

function isGroupQrRelayMpOrder(order: RegistryMpRecruitmentOrder | null | undefined): boolean {
  if (!order) return false
  const relay = readExternalFormRelay(order as unknown as Record<string, unknown>)
  return !!relay && isFormRelayGroupQrRelay(relay)
}

/** 转发代收扫码进群：优先 PG 直读 side map，回退 PostgREST 切片 */
export async function resolveFormRelayGroupQrForMpOrder(
  mpOrderId: string,
  supabaseUrl: string,
  serviceRole: string,
): Promise<FormRelayGroupQrResolve> {
  const id = String(mpOrderId || '').trim()
  if (!id) return { ok: false, error: 'invalid_mp_order', status: 400 }

  const pg = await readMpFormRelayGroupQrViaPg(id)
  if (pg.ok) {
    return { ok: true, mpOrderId: pg.mpOrderId, title: pg.title, groupQrImage: pg.groupQrImage, via: 'pg' }
  }
  if (pg.error !== 'pg_not_configured' && pg.error !== 'group_qr_missing') {
    if (pg.error === 'not_found' || pg.error === 'not_group_qr_relay') {
      return { ok: false, error: pg.error, status: pg.status }
    }
  }

  let orders: RegistryMpRecruitmentOrder[] = []
  let qrMap: Record<string, string> = {}
  try {
    const orderSlice = await fetchRegistryMpOrdersFromDb(supabaseUrl, serviceRole)
    orders = Array.isArray(orderSlice.mpRecruitmentOrders)
      ? (orderSlice.mpRecruitmentOrders as RegistryMpRecruitmentOrder[])
      : []
  } catch {
    /* optional */
  }
  const order = orders.find((o) => o && String(o.id || '').trim() === id) || null
  if (!isGroupQrRelayMpOrder(order)) {
    return { ok: false, error: 'not_group_qr_relay', status: 404 }
  }

  try {
    const qrSlice = await fetchRegistryMpGroupQrByOrderIdFromDb(supabaseUrl, serviceRole)
    if (qrSlice.mpGroupQrByOrderId && typeof qrSlice.mpGroupQrByOrderId === 'object') {
      qrMap = qrSlice.mpGroupQrByOrderId as Record<string, string>
    }
  } catch {
    /* optional */
  }

  const qr = groupQrFromSideMap(qrMap, id)
  if (!qr) return { ok: false, error: 'group_qr_missing', status: 404 }

  return {
    ok: true,
    mpOrderId: id,
    title: String(order?.title || '').trim(),
    groupQrImage: qr,
    via: 'registry_slice',
  }
}
