const sessionStore = require('./sessionStore.js')
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

function collectTalentChatKeyCandidates(reg) {
  const acc = sessionStore.readAccount()
  const member = talentMember.readMember()
  const memberId = participant.resolveTalentMemberId()
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
      if (String((members[i] && members[i].id) || '').trim() === memberId) {
        mem = members[i]
        break
      }
    }
    const lq = String((mem && mem.lingqiTalentId) || (acc && acc.lingqiTalentId) || '').trim()
    if (lq) keys.add(`talent_${lq}`)
    for (let j = 0; j < lib.length; j++) {
      const row = lib[j]
      const libLq = String((row && row.lingqiTalentId) || '').trim()
      const libId = String((row && row.id) || '').trim()
      if (!libId) continue
      if (libLq && lq && libLq === lq) keys.add(`talent_${libId}`)
      if (libId && rawIds.indexOf(libId) >= 0) keys.add(`talent_${libId}`)
    }
  }
  return [...keys]
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

module.exports = {
  canonicalTalentMemberIdFromRegistry,
  collectTalentChatKeyCandidates,
  talentChatParticipantForKey,
  sessionAuthKeyForMe,
  participantForSession,
}
