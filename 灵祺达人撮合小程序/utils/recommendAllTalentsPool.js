/**
 * 【锁定】推荐大厅 · 全部达人列表数据源（与 Web recommendAllTalentsPool.ts 对齐）
 * 权威数据源：商家管理后台「达人库」talentLibraryEntries；mpTalentMembers 仅作补全。
 */
const memberStore = require('./talentMember.js')
const chatKeys = require('./talentChatKeys.js')
const prBoard = require('./prRecommendBoard.js')

function parseFollowers(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
  const n = Number.parseInt(String(raw == null ? '0' : raw).replace(/,/g, ''), 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function platAccountDedupeKey(platform, account) {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return `${String(platform || '抖音').trim()}::${a}`
}

function findMemberForLibraryEntry(entry, members) {
  const lq = String(entry.lingqiTalentId || '').trim()
  if (lq) {
    for (let i = 0; i < members.length; i++) {
      if (String(members[i].lingqiTalentId || '').trim() === lq) return members[i]
    }
  }
  const key = platAccountDedupeKey(String(entry.platform || '抖音'), String(entry.platformAccount || ''))
  if (!key) return null
  for (let j = 0; j < members.length; j++) {
    const primary = memberStore.primaryPlatformProfile(members[j])
    const p = (primary && primary.profile) || {}
    const pk = platAccountDedupeKey((primary && primary.platform) || '抖音', p.platformAccount || '')
    if (pk === key) return members[j]
  }
  return null
}

function enrichLibraryEntry(entry, members) {
  const gender = String(entry.gender || '').trim()
  const tags = Array.isArray(entry.accountTags) ? entry.accountTags.filter(Boolean) : []
  if (gender && tags.length) return entry
  const member = findMemberForLibraryEntry(entry, members)
  if (!member) return entry
  const out = Object.assign({}, entry)
  if (!gender) out.gender = String(member.gender || '').trim() || entry.gender
  if (!tags.length && Array.isArray(member.accountTags) && member.accountTags.length) {
    out.accountTags = member.accountTags
  }
  return out
}

function libraryCardId(reg, entry) {
  const raw = String(entry.id || entry.lingqiTalentId || '').trim()
  return chatKeys.canonicalTalentMemberIdFromRegistry(reg, raw) || raw
}

function buildAllTalentsPool(reg) {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const out = []

  for (let i = 0; i < library.length; i++) {
    const row = library[i]
    const enriched = enrichLibraryEntry(row, members)
    const chatId = libraryCardId(reg, enriched)
    if (!chatId) continue
    const nick = String(
      enriched.platformNickname ||
        enriched.name ||
        enriched.lingqiTalentId ||
        enriched.platformAccount ||
        '',
    ).trim()
    if (!nick) continue
    const member = findMemberForLibraryEntry(enriched, members)
    const followers = parseFollowers(enriched.followers)
    out.push(
      prBoard.formatTalentRow({
        ...enriched,
        id: chatId,
        platformNickname: nick,
        wxAvatarUrl: member && member.wxAvatarUrl,
        platform: enriched.platform || '抖音',
        followers,
        province: enriched.province || (member && member.province),
        city: enriched.city || (member && member.city),
        qualityTag: followers >= 50000 ? '优质' : '推荐',
        douyinSalesLevel: enriched.douyinSalesLevel || '',
        gender: enriched.gender,
      }),
    )
  }

  return out
}

function registryHasRecommendTalentPool(reg) {
  if (!reg || typeof reg !== 'object') return false
  const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
  return lib > 0
}

function expectTalentLibraryPoolSize(reg) {
  if (!reg || typeof reg !== 'object') return 0
  return Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
}

module.exports = {
  buildAllTalentsPool,
  registryHasRecommendTalentPool,
  expectTalentLibraryPoolSize,
}
