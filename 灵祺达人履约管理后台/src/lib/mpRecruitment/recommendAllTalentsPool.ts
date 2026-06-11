/**
 * 【锁定】推荐大厅 · 全部达人列表数据源
 *
 * - 仅用于 PR 推荐大厅「全部达人」浏览模式（viewMode === 'all'）
 * - 与智能匹配、招募大厅筛选、推荐商单过滤等逻辑隔离，修改其它板块不得改此文件
 * - 准入：有 id + 可展示昵称即可，不要求 platformAccount（避免会员库有资料却被误过滤）
 */
import type { MpRegistry, TalentCardRow } from './types'
import { formatTalent } from './talentFormat'
import { primaryPlatformProfile } from '../mpSync/talentMember'
import { canonicalTalentMemberIdFromRegistry } from '../mpSync/talentChatKeys'

const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场/
const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕/

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

function appendTalentIfNew(
  row: TalentCardRow | null,
  keys: string[],
  seen: Set<string>,
  out: TalentCardRow[],
) {
  if (!row?.id) return
  if (keys.some((k) => seen.has(k))) return
  keys.forEach((k) => seen.add(k))
  seen.add(`id:${row.id}`)
  out.push(row)
}

/** 从注册表构建「全部达人」列表（Web + 小程序共用逻辑） */
export function buildAllTalentsPool(reg: MpRegistry): TalentCardRow[] {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const seen = new Set<string>()
  const out: TalentCardRow[] = []

  for (const m of members) {
    const mem = m as Record<string, unknown>
    if (!isTalentBoardMember(mem)) continue
    const mid = String(mem.id || '').trim()
    if (!mid) continue
    const nick = displayNameFromMember(mem)
    if (!nick) continue
    const primary = primaryPlatformProfile(mem)
    const p = primary?.profile
    const raw = Number(p?.followers) || 0
    const row = formatTalent({
      id: mid,
      platformNickname: nick,
      wxAvatarUrl: mem.wxAvatarUrl,
      platform: primary?.platform || '抖音',
      followers: raw,
      province: mem.province,
      city: mem.city,
      qualityTag: '会员',
      gender: mem.gender,
      accountTags: accountTagsFromMember(mem),
      douyinSalesLevel: p?.douyinSalesLevel || '',
    })
    appendTalentIfNew(row, collectTalentDedupeKeys(mem, primary), seen, out)
  }

  for (const e of library) {
    const row = e as Record<string, unknown>
    const chatId =
      canonicalTalentMemberIdFromRegistry(reg, String(row.id || row.lingqiTalentId || '')) ||
      String(row.id || row.lingqiTalentId || '').trim()
    if (!chatId) continue
    const nick = displayNameFromLibrary(row)
    if (!nick) continue
    const raw = Number(row.followers) || 0
    const card = formatTalent({
      ...row,
      id: chatId,
      platformNickname: nick,
      qualityTag: raw >= 50000 ? '优质' : '推荐',
    })
    appendTalentIfNew(card, collectTalentDedupeKeys(row), seen, out)
  }

  return out
}

export function registryHasRecommendTalentPool(reg: MpRegistry | Record<string, unknown> | null | undefined): boolean {
  if (!reg || typeof reg !== 'object') return false
  const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
  const mem = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers.length : 0
  return lib + mem > 0
}
