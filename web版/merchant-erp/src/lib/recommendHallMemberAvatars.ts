/**
 * 推荐大厅：从 mp_accounts / client_state 补全达人头像与主页链接（只读，不写 registry）
 * 注册表快照里 wxAvatarUrl / profileLink 常被剥离或空壳；账号表 client_state 仍保留资料。
 */
import type { MpAccountRow } from './mpAccountAuth.js'
import type { MpClientStatePayload } from './mpAccountClientStateMerge.js'
import { fetchAccountsWithClientState } from './registryRecoverLibraries.js'
import { extractProfileLinkUrl } from './talentProfileLink.js'

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

type ProfileLinkIndex = {
  byLq: Map<string, string>
  byPhone: Map<string, string>
  byPlatformAccount: Map<string, string>
}

type AccountHydrationIndex = {
  avatars: AvatarIndex
  profileLinks: ProfileLinkIndex
}

const PLATFORM_NAMES: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  dianping: '大众点评',
  weixin_video: '微信视频号',
}

function usableProfileLink(raw: unknown): string {
  const text = String(raw || '').trim()
  if (!text) return ''
  return extractProfileLinkUrl(text) || text
}

function buildAccountHydrationIndex(
  rows: Awaited<ReturnType<typeof fetchAccountsWithClientState>>,
): AccountHydrationIndex {
  const avatars: AvatarIndex = {
    byMemberId: new Map(),
    byLq: new Map(),
    byOpenId: new Map(),
    byPhone: new Map(),
    byPlatformAccount: new Map(),
  }
  const profileLinks: ProfileLinkIndex = {
    byLq: new Map(),
    byPhone: new Map(),
    byPlatformAccount: new Map(),
  }

  const put = (map: Map<string, string>, key: string, val: string) => {
    if (!key || !val) return
    if (!map.has(key)) map.set(key, val)
  }

  for (const { account, state } of rows) {
    const av = pickAccountAvatar(account, state)
    if (av) {
      put(avatars.byMemberId, String(account.registry_member_id || '').trim(), av)
      put(avatars.byLq, String(account.lingqi_talent_id || '').trim(), av)
      put(avatars.byOpenId, String(account.openid || '').trim(), av)
      const phone = phoneKey(account.login_name)
      if (phone.length >= 11) put(avatars.byPhone, phone, av)
      indexPlatformProfiles(state, av, avatars.byPlatformAccount)
    }
    indexPlatformProfileLinks(state, account, profileLinks)
  }

  return { avatars, profileLinks }
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
  for (const [id, prof] of Object.entries(pp as Record<string, Record<string, unknown>>)) {
    if (!prof || typeof prof !== 'object') continue
    const pk = platKey(PLATFORM_NAMES[id] || id, String(prof.platformAccount || ''))
    if (pk) byPlatformAccount.set(pk, av)
  }
}

function indexPlatformProfileLinks(
  state: MpClientStatePayload,
  account: MpAccountRow,
  index: ProfileLinkIndex,
): void {
  const draft = state.talentMemberDraft
  if (!draft || typeof draft !== 'object') return
  const pp = draft.platformProfiles
  if (!pp || typeof pp !== 'object') return

  const put = (map: Map<string, string>, key: string, val: string) => {
    if (!key || !val) return
    if (!map.has(key)) map.set(key, val)
  }

  let primaryLink = ''
  for (const [id, prof] of Object.entries(pp as Record<string, Record<string, unknown>>)) {
    if (!prof || typeof prof !== 'object') continue
    const link = usableProfileLink(prof.profileLink)
    if (!link) continue
    const plat = PLATFORM_NAMES[id] || id
    const pk = platKey(plat, String(prof.platformAccount || ''))
    if (pk) put(index.byPlatformAccount, pk, link)
    if (!primaryLink) primaryLink = link
  }

  const lq = String(account.lingqi_talent_id || '').trim()
  if (lq && primaryLink) put(index.byLq, lq, primaryLink)
  const phone = phoneKey(account.login_name)
  if (phone.length >= 11 && primaryLink) put(index.byPhone, phone, primaryLink)
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

function resolveLibraryProfileLink(entry: Record<string, unknown>, index: ProfileLinkIndex): string {
  const existing = usableProfileLink(entry.profileLink)
  if (existing) return existing
  const pk = platKey(String(entry.platform || '抖音'), String(entry.platformAccount || ''))
  if (pk && index.byPlatformAccount.has(pk)) return index.byPlatformAccount.get(pk)!
  const lq = String(entry.lingqiTalentId || '').trim()
  if (lq && index.byLq.has(lq)) return index.byLq.get(lq)!
  const phone = phoneKey(entry.contact || entry.wechatId)
  if (phone.length >= 11 && index.byPhone.has(phone)) return index.byPhone.get(phone)!
  return ''
}

/** 深度补全推荐池 mpTalentMembers / talentLibraryEntries 的头像 URL 与主页链接 */
export async function hydrateRecommendHallAvatarsFromAccounts(
  payload: Record<string, unknown>,
  supabaseUrl: string,
  serviceRole: string,
): Promise<Record<string, unknown>> {
  const members = Array.isArray(payload.mpTalentMembers) ? payload.mpTalentMembers : []
  const library = Array.isArray(payload.talentLibraryEntries) ? payload.talentLibraryEntries : []
  if (!members.length && !library.length) return payload

  let hydration: AccountHydrationIndex
  try {
    hydration = buildAccountHydrationIndex(await fetchAccountsWithClientState(supabaseUrl, serviceRole))
  } catch (e) {
    console.warn(
      '[recommend_hall_avatars] mp_accounts fetch failed:',
      e instanceof Error ? e.message : e,
    )
    return payload
  }
  const index = hydration.avatars
  const profileIndex = hydration.profileLinks

  let memberHits = 0
  let libraryAvatarHits = 0
  let libraryProfileHits = 0

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
    const patch: Record<string, unknown> = {}
    const av = resolveLibraryAvatar(e, index)
    if (av) {
      libraryAvatarHits += 1
      const prev = usableAvatar(e.avatarUrl || e.wxAvatarUrl)
      if (prev !== av) patch.avatarUrl = av
    }
    const link = resolveLibraryProfileLink(e, profileIndex)
    if (link) {
      libraryProfileHits += 1
      if (usableProfileLink(e.profileLink) !== link) patch.profileLink = link
    }
    if (!Object.keys(patch).length) return e
    return { ...e, ...patch }
  })

  if (!memberHits && !libraryAvatarHits && !libraryProfileHits) return payload

  const meta =
    payload._recommendPoolMeta && typeof payload._recommendPoolMeta === 'object'
      ? { ...(payload._recommendPoolMeta as Record<string, unknown>) }
      : {}
  meta.avatarHydratedFromAccounts = true
  meta.avatarHydratedMemberCount = memberHits
  meta.avatarHydratedLibraryCount = libraryAvatarHits
  meta.profileLinkHydratedFromAccounts = libraryProfileHits > 0
  meta.profileLinkHydratedLibraryCount = libraryProfileHits

  return {
    ...payload,
    mpTalentMembers,
    talentLibraryEntries,
    _recommendPoolMeta: meta,
  }
}
