/**
 * 【锁定】推荐大厅 · 全部达人列表数据源（与 Web recommendAllTalentsPool.ts 对齐）
 * 修改其它板块不得改此文件；仅服务 PR 推荐大厅「全部达人」模式。
 */
const memberStore = require('./talentMember.js')
const chatKeys = require('./talentChatKeys.js')
const prBoard = require('./prRecommendBoard.js')

const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场/
const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕/

function accountTagsFromMember(m) {
  const primary = memberStore.primaryPlatformProfile(m)
  const prof = (primary && primary.profile) || {}
  return Array.isArray(prof.accountTags) ? prof.accountTags : []
}

function isTalentBoardMember(m) {
  const tags = accountTagsFromMember(m)
  const blob = tags.join(' ')
  const shootOnly = SHOOT_TAG_RE.test(blob) && !EDIT_TAG_RE.test(blob)
  const editOnly = EDIT_TAG_RE.test(blob) && !SHOOT_TAG_RE.test(blob)
  return !shootOnly && !editOnly
}

function displayNameFromMember(m) {
  const primary = memberStore.primaryPlatformProfile(m)
  const p = (primary && primary.profile) || {}
  return String(
    p.platformNickname || m.wxNickName || m.contact || m.lingqiTalentId || m.id || '',
  ).trim()
}

function displayNameFromLibrary(row) {
  return String(
    row.platformNickname || row.name || row.lingqiTalentId || row.platformAccount || row.id || '',
  ).trim()
}

function platAccountDedupeKey(platform, account) {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return `${String(platform || '抖音').trim()}::${a}`
}

function collectTalentDedupeKeys(source, primary) {
  const keys = []
  const id = String(source.id || '').trim()
  const lq = String(source.lingqiTalentId || '').trim()
  if (id) keys.push(`id:${id}`)
  if (lq) keys.push(`lq:${lq}`)
  const p = primary && primary.profile
  const plat = String((primary && primary.platform) || source.platform || '抖音')
  const pk = platAccountDedupeKey(plat, String((p && p.platformAccount) || source.platformAccount || ''))
  if (pk) keys.push(`pk:${pk}`)
  const phone = String(source.contact || '').replace(/\D/g, '').slice(-11)
  if (phone.length >= 11) keys.push(`ph:${phone}`)
  return keys
}

function appendTalentIfNew(row, keys, seen, out) {
  if (!row || !row.id) return
  for (let i = 0; i < keys.length; i++) {
    if (seen.has(keys[i])) return
  }
  for (let i = 0; i < keys.length; i++) seen.add(keys[i])
  seen.add(`id:${row.id}`)
  out.push(row)
}

function buildAllTalentsPool(reg) {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const seen = new Set()
  const out = []

  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    if (!isTalentBoardMember(m)) continue
    const mid = String((m && m.id) || '').trim()
    if (!mid) continue
    const nick = displayNameFromMember(m)
    if (!nick) continue
    const primary = memberStore.primaryPlatformProfile(m)
    const p = (primary && primary.profile) || {}
    const raw = Number(p.followers) || 0
    const row = prBoard.formatTalentRow({
      id: mid,
      platformNickname: nick,
      wxAvatarUrl: m.wxAvatarUrl,
      platform: (primary && primary.platform) || '抖音',
      followers: raw,
      province: m.province,
      city: m.city,
      qualityTag: '会员',
      gender: m.gender,
      accountTags: accountTagsFromMember(m),
      douyinSalesLevel: p.douyinSalesLevel || '',
    })
    appendTalentIfNew(row, collectTalentDedupeKeys(m, primary), seen, out)
  }

  for (let j = 0; j < library.length; j++) {
    const e = library[j]
    const chatId =
      chatKeys.canonicalTalentMemberIdFromRegistry(reg, String(e.id || e.lingqiTalentId || '')) ||
      String(e.id || e.lingqiTalentId || '').trim()
    if (!chatId) continue
    const nick = displayNameFromLibrary(e)
    if (!nick) continue
    const raw = Number(e.followers) || 0
    const row = prBoard.formatTalentRow({
      ...e,
      id: chatId,
      platformNickname: nick,
      qualityTag: raw >= 50000 ? '优质' : '推荐',
      gender: e.gender,
    })
    appendTalentIfNew(row, collectTalentDedupeKeys(e), seen, out)
  }

  return out
}

function registryHasRecommendTalentPool(reg) {
  if (!reg || typeof reg !== 'object') return false
  const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries.length : 0
  const mem = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers.length : 0
  return lib + mem > 0
}

module.exports = {
  buildAllTalentsPool,
  registryHasRecommendTalentPool,
}
