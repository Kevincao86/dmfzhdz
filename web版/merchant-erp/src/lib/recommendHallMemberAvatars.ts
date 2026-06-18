/**
 * 推荐大厅：从 mp_accounts / client_state 补全达人头像（只读，不写 registry）
 * 注册表快照里 wxAvatarUrl 常被剥离或空壳；账号表仍保留微信 HTTPS 头像。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import type { MpClientStatePayload } from './mpAccountClientStateMerge.js'
import { fetchAccountsWithClientState } from './registryRecoverLibraries.js'

function usableAvatar(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!s || s.startsWith('wxfile://')) return ''
  return s
}

function phoneKey(raw: unknown): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function platKey(platform: string, account: string): string | null {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return `${String(platform || '抖音').trim()}::${a}`
}

type AvatarIndex = {
  byMemberId: Map<string, string>
  byLq: Map<string, string>
  byOpenId: Map<string, string>
  byPhone: Map<string, string>
  byPlatformAccount: Map<string, string>
}

function buildAvatarIndex(rows: Awaited<ReturnType<typeof fetchAccountsWithClientState>>): AvatarIndex {
  const byMemberId = new Map<string, string>()
  const byLq = new Map<string, string>()
  const byOpenId = new Map<string, string>()
  const byPhone = new Map<string, string>()
  const byPlatformAccount = new Map<string, string>()

  const put = (map: Map<string, string>, key: string, av: string) => {
    if (!key || !av) return
    if (!map.has(key)) map.set(key, av)
  }

  for (const { account, state } of rows) {
    const av = pickAccountAvatar(account, state)
    if (!av) continue
    put(byMemberId, String(account.registry_member_id || '').trim(), av)
    put(byLq, String(account.lingqi_talent_id || '').trim(), av)
    put(byOpenId, String(account.openid || '').trim(), av)
    const phone = phoneKey(account.login_name)
    if (phone.length >= 11) put(byPhone, phone, av)
    indexPlatformProfiles(state, av, byPlatformAccount)
  }

  return { byMemberId, byLq, byOpenId, byPhone, byPlatformAccount }
}

function pickAccountAvatar(account: MpAccountRow, state: MpClientStatePayload): string {
  const draft = state.talentMemberDraft
  return (
    usableAvatar(account.wx_avatar_url) ||
    usableAvatar(draft?.wxAvatarUrl) ||
    ''
  )
}

function indexPlatformProfiles(
  state: MpClientStatePayload,
  av: string,
  byPlatformAccount: Map<string, string>,
): void {
  const draft = state.talentMemberDraft
  if (!draft || typeof draft !== 'object') return
  const pp = draft.platformProfiles
  if (!pp || typeof pp !== 'object') return
  const platformNames: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    kuaishou: '快手',
    dianping: '大众点评',
    weixin_video: '微信视频号',
  }
  for (const [id, prof] of Object.entries(pp as Record<string, Record<string, unknown>>)) {
    if (!prof || typeof prof !== 'object') continue
    const pk = platKey(platformNames[id] || id, String(prof.platformAccount || ''))
    if (pk) byPlatformAccount.set(pk, av)
  }
}

function resolveMemberAvatar(
  member: Record<string, unknown>,
  index: AvatarIndex,
): string {
  const existing = usableAvatar(member.wxAvatarUrl)
  if (existing && !existing.startsWith('data:image/')) return existing
  return (
    index.byMemberId.get(String(member.id || '').trim()) ||
    index.byLq.get(String(member.lingqiTalentId || '').trim()) ||
    index.byOpenId.get(String(member.wxOpenId || '').trim()) ||
    index.byPhone.get(phoneKey(member.contact || member.wechatId)) ||
    ''
  )
}

function resolveLibraryAvatar(entry: Record<string, unknown>, index: AvatarIndex): string {
  const existing = usableAvatar(entry.avatarUrl || entry.wxAvatarUrl)
  if (existing && !existing.startsWith('data:image/')) return existing
  const lq = String(entry.lingqiTalentId || '').trim()
  if (lq && index.byLq.has(lq)) return index.byLq.get(lq)!
  const phone = phoneKey(entry.contact || entry.wechatId)
  if (phone.length >= 11 && index.byPhone.has(phone)) return index.byPhone.get(phone)!
  const pk = platKey(String(entry.platform || '抖音'), String(entry.platformAccount || ''))
  if (pk && index.byPlatformAccount.has(pk)) return index.byPlatformAccount.get(pk)!
  return ''
}

/** 深度补全推荐池 mpTalentMembers / talentLibraryEntries 的头像 URL */
export async function hydrateRecommendHallAvatarsFromAccounts(
  payload: Record<string, unknown>,
  supabaseUrl: string,
  serviceRole: string,
): Promise<Record<string, unknown>> {
  const members = Array.isArray(payload.mpTalentMembers) ? payload.mpTalentMembers : []
  const library = Array.isArray(payload.talentLibraryEntries) ? payload.talentLibraryEntries : []
  if (!members.length && !library.length) return payload

  let index: AvatarIndex
  try {
    index = buildAvatarIndex(await fetchAccountsWithClientState(supabaseUrl, serviceRole))
  } catch (e) {
    console.warn(
      '[recommend_hall_avatars] mp_accounts fetch failed:',
      e instanceof Error ? e.message : e,
    )
    return payload
  }

  let memberHits = 0
  let libraryHits = 0

  const mpTalentMembers = members.map((raw) => {
    const m = raw as Record<string, unknown>
    const av = resolveMemberAvatar(m, index)
    if (!av) return m
    memberHits += 1
    const prev = usableAvatar(m.wxAvatarUrl)
    if (prev === av) return m
    return { ...m, wxAvatarUrl: av }
  })

  const talentLibraryEntries = library.map((raw) => {
    const e = raw as Record<string, unknown>
    const av = resolveLibraryAvatar(e, index)
    if (!av) return e
    libraryHits += 1
    const prev = usableAvatar(e.avatarUrl || e.wxAvatarUrl)
    if (prev === av) return e
    return { ...e, avatarUrl: av }
  })

  if (!memberHits && !libraryHits) return payload

  const meta =
    payload._recommendPoolMeta && typeof payload._recommendPoolMeta === 'object'
      ? { ...(payload._recommendPoolMeta as Record<string, unknown>) }
      : {}
  meta.avatarHydratedFromAccounts = true
  meta.avatarHydratedMemberCount = memberHits
  meta.avatarHydratedLibraryCount = libraryHits

  return {
    ...payload,
    mpTalentMembers,
    talentLibraryEntries,
    _recommendPoolMeta: meta,
  }
}
