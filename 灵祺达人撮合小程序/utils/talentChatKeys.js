const sessionStore = require('./mpSessionStore.js')
const talentMember = require('./talentMember.js')
const participant = require('./participant.js')

/** 将卡片/库表 id 解析为 mpTalentMembers 的 MTM id */
function canonicalTalentMemberIdFromRegistry(reg, rawId) {
  const id = String(rawId || '').trim()
  if (!id) return ''
  if (/^MTM-/i.test(id)) return id
  const members = Array.isArray(reg && reg.mpTalentMembers) ? reg.mpTalentMembers : []
  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    const mid = String((m && m.id) || '').trim()
    if (!mid) continue
    if (mid === id) return mid
    if (String((m && m.lingqiTalentId) || '').trim() === id) return mid
  }
  const lib = Array.isArray(reg && reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
  for (let j = 0; j < lib.length; j++) {
    const row = lib[j]
    if (String((row && row.id) || '').trim() !== id) continue
    const lq = String((row && row.lingqiTalentId) || '').trim()
    if (!lq) break
    for (let k = 0; k < members.length; k++) {
      const mem = members[k]
      if (String((mem && mem.lingqiTalentId) || '').trim() === lq) {
        return String((mem && mem.id) || '').trim()
      }
    }
  }
  return id
}

function phoneTail(v) {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function collectTalentChatKeyCandidates(reg) {
  const acc = sessionStore.readAccount()
  const member = talentMember.readMember()
  const memberId = participant.resolveTalentMemberId()
  const lq = String((acc && acc.lingqiTalentId) || '').trim()
  const hintPhone = phoneTail((acc && acc.loginName) || (member && member.contact) || '')
  const hintOpenId = String((acc && acc.openid) || '').trim()
  const rawIds = [
    acc && acc.registryMemberId,
    member && member.id,
    acc && acc.lingqiTalentId,
    memberId,
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const keys = new Set()
  for (let i = 0; i < rawIds.length; i++) keys.add(`talent_${rawIds[i]}`)

  if (reg) {
    const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
    const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
    let mem = null
    for (let i = 0; i < members.length; i++) {
      const row = members[i]
      const mid = String((row && row.id) || '').trim()
      const mlq = String((row && row.lingqiTalentId) || '').trim()
      const mPhone = phoneTail((row && row.contact) || (row && row.wechatId) || '')
      const mOpen = String((row && row.wxOpenId) || '').trim()
      const hit =
        (memberId && mid === memberId) ||
        (lq && mlq === lq) ||
        (hintPhone.length >= 8 && mPhone === hintPhone) ||
        (hintOpenId && mOpen === hintOpenId)
      if (!hit) continue
      mem = row
      if (mid) keys.add(`talent_${mid}`)
      if (mlq) keys.add(`talent_${mlq}`)
    }
    const linkLq = String((mem && mem.lingqiTalentId) || lq || '').trim()
    for (let j = 0; j < lib.length; j++) {
      const row = lib[j]
      const libLq = String((row && row.lingqiTalentId) || '').trim()
      const libId = String((row && row.id) || '').trim()
      if (!libId) continue
      if (libLq && linkLq && libLq === linkLq) keys.add(`talent_${libId}`)
      if (libId && rawIds.indexOf(libId) >= 0) keys.add(`talent_${libId}`)
    }
  }
  return [...keys]
}

function talentChatIdentityPayload(reg) {
  const acc = sessionStore.readAccount()
  const member = talentMember.readMember()
  const payload = {
    aliasParticipantKeys: collectTalentChatKeyCandidates(reg),
  }
  const lq = String((acc && acc.lingqiTalentId) || '').trim()
  const mid = String((acc && acc.registryMemberId) || (member && member.id) || '').trim()
  const phone = String((acc && acc.loginName) || (member && member.contact) || '').trim()
  const openId = String((acc && acc.openid) || '').trim()
  if (lq) payload.lingqiTalentId = lq
  if (mid) payload.registryMemberId = mid
  if (phone) payload.contactPhone = phone
  if (openId) payload.wxOpenId = openId
  return payload
}

function talentChatParticipantForKey(base, participantKey) {
  return {
    ...base,
    participantKey,
    deviceSecret: participant.bootstrapTalentSecret(participantKey),
  }
}

function sessionAuthKeyForMe(session, me) {
  if (me.role === 'talent') return String((session && session.talent_key) || me.participantKey).trim()
  return String((session && session.pr_key) || me.participantKey).trim()
}

function participantForSession(session, base) {
  const me = base || participant.getCurrentParticipant()
  const authKey = sessionAuthKeyForMe(session, me)
  if (me.role === 'talent') return talentChatParticipantForKey(me, authKey)
  if (authKey === me.participantKey) return me
  return { ...me, participantKey: authKey }
}

function participantIdFromKey(participantKey) {
  return String(participantKey || '')
    .replace(/^talent_/, '')
    .replace(/^pr_/, '')
    .trim()
}

function talentSessionGroupKey(reg, talentKey) {
  const raw = participantIdFromKey(talentKey)
  if (!raw) return talentKey
  const canonMtm = canonicalTalentMemberIdFromRegistry(reg, raw)
  const members = Array.isArray(reg && reg.mpTalentMembers) ? reg.mpTalentMembers : []
  for (let i = 0; i < members.length; i++) {
    const mem = members[i]
    const mid = String((mem && mem.id) || '').trim()
    const mlq = String((mem && mem.lingqiTalentId) || '').trim()
    if (mid && (mid === canonMtm || mid === raw || mlq === raw)) return mlq || mid
  }
  return canonMtm || raw
}

function dedupePrTalentSessions(sessions, reg) {
  const byGroup = new Map()
  for (let i = 0; i < (sessions || []).length; i++) {
    const s = sessions[i]
    const tk = String((s && s.talent_key) || '')
    const group = talentSessionGroupKey(reg || null, tk)
    const prev = byGroup.get(group)
    if (!prev || Number(s.last_ts || 0) > Number(prev.last_ts || 0)) byGroup.set(group, s)
  }
  return [...byGroup.values()].sort((a, b) => Number(b.last_ts || 0) - Number(a.last_ts || 0))
}

function resolveTalentDisplayId(reg, talentKey) {
  const raw = participantIdFromKey(talentKey)
  if (!raw) return ''
  const canonMtm = canonicalTalentMemberIdFromRegistry(reg, raw)
  const members = Array.isArray(reg && reg.mpTalentMembers) ? reg.mpTalentMembers : []
  for (let i = 0; i < members.length; i++) {
    const mem = members[i]
    const mid = String((mem && mem.id) || '').trim()
    const mlq = String((mem && mem.lingqiTalentId) || '').trim()
    if (mid && (mid === canonMtm || mid === raw || mlq === raw) && mlq) return mlq
  }
  if (/^LQ-D-/i.test(raw)) return raw.toUpperCase()
  return canonMtm || raw
}

function resolvePrDisplayId(prKey) {
  const raw = participantIdFromKey(prKey)
  if (/^LQ-P-/i.test(raw)) return raw.toUpperCase()
  const phone = raw.replace(/\D/g, '')
  if (phone.length >= 11) return phone.slice(-11)
  return raw
}

module.exports = {
  canonicalTalentMemberIdFromRegistry,
  collectTalentChatKeyCandidates,
  talentChatIdentityPayload,
  talentChatParticipantForKey,
  sessionAuthKeyForMe,
  participantForSession,
  participantIdFromKey,
  dedupePrTalentSessions,
  resolveTalentDisplayId,
  resolvePrDisplayId,
}
