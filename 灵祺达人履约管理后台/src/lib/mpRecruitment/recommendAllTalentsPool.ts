/**
 * 【锁定】推荐大厅 · 全部达人列表数据源
 *
 * - 仅用于 PR 推荐大厅「全部达人」浏览模式（viewMode === 'all'）
 * - 与智能匹配、招募大厅筛选、推荐商单过滤等逻辑隔离，修改其它板块不得改此文件
 * - 准入：有 id + 可展示昵称即可，不要求 platformAccount（避免会员库有资料却被误过滤）
 */
import type { MpRegistry, TalentCardRow } from './types'
import { formatTalent, parseFollowers } from './talentFormat'
import { primaryPlatformProfile } from '../mpSync/talentMember'
import { canonicalTalentMemberIdFromRegistry } from '../mpSync/talentChatKeys'

const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场/
const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕/

type LibraryHit = {
  followers: number
  platform: string
  row: Record<string, unknown>
}

type LibraryLookup = {
  byLq: Map<string, LibraryHit>
  byPk: Map<string, LibraryHit>
}

function accountTagsFromMember(m: Record<string, unknown>): string[] {
  const primary = primaryPlatformProfile(m)
  const prof = primary?.profile
  return Array.isArray(prof?.accountTags) ? (prof.accountTags as string[]) : []
}

/** 达人板块：排除纯拍摄/剪辑供应商标记，避免与「全部拍摄/剪辑团队」重复 */
function isTalentBoardMember(m: Record<string, unknown>): boolean {
  const tags = accountTagsFromMember(m)
  const blob = tags.join(' ')
  const shootOnly = SHOOT_TAG_RE.test(blob) && !EDIT_TAG_RE.test(blob)
  const editOnly = EDIT_TAG_RE.test(blob) && !SHOOT_TAG_RE.test(blob)
  return !shootOnly && !editOnly
}

function displayNameFromMember(m: Record<string, unknown>): string {
  const primary = primaryPlatformProfile(m)
  const p = primary?.profile
  return String(
    p?.platformNickname || m.wxNickName || m.contact || m.lingqiTalentId || m.id || '',
  ).trim()
}

function displayNameFromLibrary(row: Record<string, unknown>): string {
  return String(
    row.platformNickname || row.name || row.lingqiTalentId || row.platformAccount || row.id || '',
  ).trim()
}

function platAccountDedupeKey(platform: string, account: string): string | null {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return `${String(platform || '抖音').trim()}::${a}`
}

function buildLibraryLookup(library: Record<string, unknown>[]): LibraryLookup {
  const byLq = new Map<string, LibraryHit>()
  const byPk = new Map<string, LibraryHit>()
  for (const e of library) {
    const row = e as Record<string, unknown>
    const followers = parseFollowers(row.followers)
    const platform = String(row.platform || '抖音').trim() || '抖音'
    const hit: LibraryHit = { followers, platform, row }
    const lq = String(row.lingqiTalentId || '').trim()
    if (lq) byLq.set(lq, hit)
    const pk = platAccountDedupeKey(platform, String(row.platformAccount || ''))
    if (pk) byPk.set(pk, hit)
  }
  return { byLq, byPk }
}

function resolveMemberFollowers(
  mem: Record<string, unknown>,
  primary: ReturnType<typeof primaryPlatformProfile>,
  lookup: LibraryLookup,
): { followers: number; platform: string; library: LibraryHit | null } {
  const p = primary?.profile
  let followers = parseFollowers(p?.followers)
  let platform = String(primary?.platform || '抖音').trim() || '抖音'
  if (followers > 0) return { followers, platform, library: null }

  const lq = String(mem.lingqiTalentId || '').trim()
  if (lq && lookup.byLq.has(lq)) {
    const hit = lookup.byLq.get(lq)!
    return { followers: hit.followers, platform: hit.platform || platform, library: hit }
  }
  const pk = platAccountDedupeKey(platform, String(p?.platformAccount || ''))
  if (pk && lookup.byPk.has(pk)) {
    const hit = lookup.byPk.get(pk)!
    return { followers: hit.followers, platform: hit.platform || platform, library: hit }
  }
  return { followers: 0, platform, library: null }
}

function collectTalentDedupeKeys(source: Record<string, unknown>, primary?: ReturnType<typeof primaryPlatformProfile>) {
  const keys: string[] = []
  const id = String(source.id || '').trim()
  const lq = String(source.lingqiTalentId || '').trim()
  if (id) keys.push(`id:${id}`)
  if (lq) keys.push(`lq:${lq}`)
  const p = primary?.profile
  const plat = String(primary?.platform || source.platform || '抖音')
  const pk = platAccountDedupeKey(plat, String(p?.platformAccount || source.platformAccount || ''))
  if (pk) keys.push(`pk:${pk}`)
  const phone = String(source.contact || '').replace(/\D/g, '').slice(-11)
  if (phone.length >= 11) keys.push(`ph:${phone}`)
  return keys
}

function upsertTalentRow(
  row: TalentCardRow,
  keys: string[],
  seen: Set<string>,
  keyOwner: Map<string, string>,
  out: TalentCardRow[],
) {
  if (!row?.id) return
  let existingId = ''
  for (const k of keys) {
    const owner = keyOwner.get(k)
    if (owner) {
      existingId = owner
      break
    }
  }
  if (existingId) {
    const idx = out.findIndex((r) => r.id === existingId)
    const existing = idx >= 0 ? out[idx] : null
    if (existing && (row.followersRaw || 0) <= (existing.followersRaw || 0)) return
    if (idx >= 0) out[idx] = row
    for (const [k, owner] of keyOwner.entries()) {
      if (owner === existingId) keyOwner.delete(k)
    }
    keys.forEach((k) => {
      seen.add(k)
      keyOwner.set(k, row.id)
    })
    seen.add(`id:${row.id}`)
    return
  }
  if (keys.some((k) => seen.has(k))) return
  keys.forEach((k) => {
    seen.add(k)
    keyOwner.set(k, row.id)
  })
  seen.add(`id:${row.id}`)
  out.push(row)
}

/** 从注册表构建「全部达人」列表（Web + 小程序共用逻辑） */
export function buildAllTalentsPool(reg: MpRegistry): TalentCardRow[] {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const lookup = buildLibraryLookup(library as Record<string, unknown>[])
  const seen = new Set<string>()
  const keyOwner = new Map<string, string>()
  const out: TalentCardRow[] = []

  for (const m of members) {
    const mem = m as Record<string, unknown>
    if (!isTalentBoardMember(mem)) continue
    const mid = String(mem.id || '').trim()
    if (!mid) continue
    const primary = primaryPlatformProfile(mem)
    const lingqiTalentId = String(mem.lingqiTalentId || '').trim()
    // 无平台资料且无灵祺达人编号的 wx 重复账号不展示，避免 0 粉占位（完整资料见达人库或有平台资料的会员）
    if (!primary && !lingqiTalentId) continue
    const nick = displayNameFromMember(mem)
    if (!nick) continue
    const resolved = resolveMemberFollowers(mem, primary, lookup)
    if (!primary && lingqiTalentId && resolved.followers <= 0) continue
    const p = primary?.profile
    const lib = resolved.library?.row
    const row = formatTalent({
      id: mid,
      platformNickname: nick,
      wxAvatarUrl: mem.wxAvatarUrl,
      avatarUrl: lib?.avatarUrl,
      platform: resolved.platform,
      followers: resolved.followers,
      province: mem.province || lib?.province,
      city: mem.city || lib?.city,
      qualityTag: resolved.followers > 0 ? '会员' : '会员',
      gender: mem.gender || lib?.gender,
      accountTags: accountTagsFromMember(mem),
      douyinSalesLevel: p?.douyinSalesLevel || lib?.douyinSalesLevel || '',
    })
    upsertTalentRow(row, collectTalentDedupeKeys(mem, primary), seen, keyOwner, out)
  }

  for (const e of library) {
    const row = e as Record<string, unknown>
    const chatId =
      canonicalTalentMemberIdFromRegistry(reg, String(row.id || row.lingqiTalentId || '')) ||
      String(row.id || row.lingqiTalentId || '').trim()
    if (!chatId) continue
    const nick = displayNameFromLibrary(row)
    if (!nick) continue
    const raw = parseFollowers(row.followers)
    const member = (members as Record<string, unknown>[]).find((m) => String(m.id || '').trim() === chatId)
    const card = formatTalent({
      ...row,
      id: chatId,
      platformNickname: nick,
      wxAvatarUrl: member?.wxAvatarUrl || row.avatarUrl,
      qualityTag: raw >= 50000 ? '优质' : '推荐',
    })
    upsertTalentRow(card, collectTalentDedupeKeys(row), seen, keyOwner, out)
  }

  return out
}

export function registryHasRecommendTalentPool(reg: MpRegistry | Record<string, unknown> | null | undefined): boolean {
  if (!reg || typeof reg !== 'object') return false
  const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
  return lib > 0
}
