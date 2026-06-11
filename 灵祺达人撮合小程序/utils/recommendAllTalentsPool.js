/**
 * 【锁定】推荐大厅 · 全部达人列表数据源（与 Web recommendAllTalentsPool.ts 对齐）
 * 修改其它板块不得改此文件；仅服务 PR 推荐大厅「全部达人」模式。
 */
const memberStore = require('./talentMember.js')
const chatKeys = require('./talentChatKeys.js')
const prBoard = require('./prRecommendBoard.js')

const SHOOT_TAG_RE = /拍摄|跟拍|摄像|摄影|片场/
const EDIT_TAG_RE = /剪辑|后期|调色|包装|字幕/

function parseFollowers(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
  const n = Number.parseInt(String(raw == null ? '0' : raw).replace(/,/g, ''), 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

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

function buildLibraryLookup(library) {
  const byLq = new Map()
  const byPk = new Map()
  for (let i = 0; i < library.length; i++) {
    const row = library[i]
    const followers = parseFollowers(row && row.followers)
    const platform = String((row && row.platform) || '抖音').trim() || '抖音'
    const hit = { followers, platform, row }
    const lq = String((row && row.lingqiTalentId) || '').trim()
    if (lq) byLq.set(lq, hit)
    const pk = platAccountDedupeKey(platform, String((row && row.platformAccount) || ''))
    if (pk) byPk.set(pk, hit)
  }
  return { byLq, byPk }
}

function resolveMemberFollowers(mem, primary, lookup) {
  const p = (primary && primary.profile) || {}
  let followers = parseFollowers(p.followers)
  let platform = String((primary && primary.platform) || '抖音').trim() || '抖音'
  if (followers > 0) return { followers, platform, library: null }
  const lq = String(mem.lingqiTalentId || '').trim()
  if (lq && lookup.byLq.has(lq)) {
    const hit = lookup.byLq.get(lq)
    return { followers: hit.followers, platform: hit.platform || platform, library: hit }
  }
  const pk = platAccountDedupeKey(platform, String(p.platformAccount || ''))
  if (pk && lookup.byPk.has(pk)) {
    const hit = lookup.byPk.get(pk)
    return { followers: hit.followers, platform: hit.platform || platform, library: hit }
  }
  return { followers: 0, platform, library: null }
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

function upsertTalentRow(row, keys, seen, keyOwner, out) {
  if (!row || !row.id) return
  let existingId = ''
  for (let i = 0; i < keys.length; i++) {
    const owner = keyOwner.get(keys[i])
    if (owner) {
      existingId = owner
      break
    }
  }
  if (existingId) {
    let idx = -1
    for (let j = 0; j < out.length; j++) {
      if (out[j].id === existingId) {
        idx = j
        break
      }
    }
    const existing = idx >= 0 ? out[idx] : null
    if (existing && (row.followersRaw || 0) <= (existing.followersRaw || 0)) return
    if (idx >= 0) out[idx] = row
    keyOwner.forEach((owner, k) => {
      if (owner === existingId) keyOwner.delete(k)
    })
    for (let i = 0; i < keys.length; i++) {
      seen.add(keys[i])
      keyOwner.set(keys[i], row.id)
    }
    seen.add(`id:${row.id}`)
    return
  }
  for (let i = 0; i < keys.length; i++) {
    if (seen.has(keys[i])) return
  }
  for (let i = 0; i < keys.length; i++) {
    seen.add(keys[i])
    keyOwner.set(keys[i], row.id)
  }
  seen.add(`id:${row.id}`)
  out.push(row)
}

function buildAllTalentsPool(reg) {
  const library = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const lookup = buildLibraryLookup(library)
  const seen = new Set()
  const keyOwner = new Map()
  const out = []

  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    if (!isTalentBoardMember(m)) continue
    const mid = String((m && m.id) || '').trim()
    if (!mid) continue
    const primary = memberStore.primaryPlatformProfile(m)
    const lingqiTalentId = String((m && m.lingqiTalentId) || '').trim()
    if (!primary && !lingqiTalentId) continue
    const nick = displayNameFromMember(m)
    if (!nick) continue
    const resolved = resolveMemberFollowers(m, primary, lookup)
    if (!primary && lingqiTalentId && resolved.followers <= 0) continue
    const p = (primary && primary.profile) || {}
    const lib = resolved.library && resolved.library.row
    const row = prBoard.formatTalentRow({
      id: mid,
      platformNickname: nick,
      wxAvatarUrl: m.wxAvatarUrl,
      avatarUrl: lib && lib.avatarUrl,
      platform: resolved.platform,
      followers: resolved.followers,
      province: m.province || (lib && lib.province),
      city: m.city || (lib && lib.city),
      qualityTag: '会员',
      gender: m.gender || (lib && lib.gender),
      accountTags: accountTagsFromMember(m),
      douyinSalesLevel: p.douyinSalesLevel || (lib && lib.douyinSalesLevel) || '',
    })
    upsertTalentRow(row, collectTalentDedupeKeys(m, primary), seen, keyOwner, out)
  }

  for (let j = 0; j < library.length; j++) {
    const e = library[j]
    const chatId =
      chatKeys.canonicalTalentMemberIdFromRegistry(reg, String(e.id || e.lingqiTalentId || '')) ||
      String(e.id || e.lingqiTalentId || '').trim()
    if (!chatId) continue
    const nick = displayNameFromLibrary(e)
    if (!nick) continue
    const raw = parseFollowers(e.followers)
    let memberWxAvatar = ''
    for (let k = 0; k < members.length; k++) {
      if (String(members[k].id || '').trim() === chatId) {
        memberWxAvatar = members[k].wxAvatarUrl || ''
        break
      }
    }
    const row = prBoard.formatTalentRow({
      ...e,
      id: chatId,
      platformNickname: nick,
      wxAvatarUrl: memberWxAvatar || e.avatarUrl,
      qualityTag: raw >= 50000 ? '优质' : '推荐',
      gender: e.gender,
    })
    upsertTalentRow(row, collectTalentDedupeKeys(e), seen, keyOwner, out)
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
