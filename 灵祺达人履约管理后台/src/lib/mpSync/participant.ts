import { getAccount, getActiveRole } from '../mpSession'
import { readMember } from './talentMember'
import { prDisplayName, readPrProfile } from './userProfile'

const SECRET_KEY = 'meoo_talent_chat_secret_v1'

function randomSecret() {
  return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`
}

export function getDeviceSecret() {
  try {
    const existing = localStorage.getItem(SECRET_KEY)
    if (existing && existing.length >= 16) return existing
    const sec = randomSecret()
    localStorage.setItem(SECRET_KEY, sec)
    return sec
  } catch {
    return randomSecret()
  }
}

export function bootstrapTalentSecret(talentKey: string) {
  const core = String(talentKey || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 48)
  return `boot_${core || 'talent'}_meoo_chat_seed`
}

/** 与 registry / PR 发起私信时使用的 member id 对齐 */
export function resolveTalentMemberId(): string {
  const member = readMember()
  const acc = getAccount()
  return String(member?.id || acc?.registryMemberId || '').trim()
}

export function talentParticipantKey(member: { id?: string } | null) {
  const id = String(member?.id || resolveTalentMemberId() || '').trim()
  if (id) return `talent_${id}`
  return `talent_guest_${getDeviceSecret().slice(0, 12)}`
}

export function prParticipantKey(profile: { contactPhone?: string } | null) {
  const phone = profile && String(profile.contactPhone || '').trim()
  if (phone) return `pr_${phone.replace(/\D/g, '').slice(-11) || phone}`
  return `pr_device_${getDeviceSecret().slice(0, 12)}`
}

export type ChatParticipant = {
  role: 'pr' | 'talent'
  participantKey: string
  deviceSecret: string
  displayName: string
  avatarUrl: string
  memberSnapshot: Record<string, unknown> | null
}

export function getCurrentParticipant(): ChatParticipant {
  const role = getActiveRole()
  const acc = getAccount()
  const secret = getDeviceSecret()
  if (role === 'pr') {
    const pr = readPrProfile()
    const name =
      String(pr?.wxNickName || '').trim() ||
      prDisplayName(pr) ||
      String(acc?.wxNickName || acc?.loginName || '').trim() ||
      'PR'
    return {
      role: 'pr',
      participantKey: prParticipantKey(pr),
      deviceSecret: secret,
      displayName: name,
      avatarUrl: String(pr?.wxAvatarUrl || '').trim(),
      memberSnapshot: (pr as Record<string, unknown>) || null,
    }
  }
  const member = readMember()
  const memberId = resolveTalentMemberId()
  const key = memberId ? `talent_${memberId}` : talentParticipantKey(member)
  const primary = member?.platformProfiles
    ? Object.values(member.platformProfiles).find((p) => p?.platformNickname)
    : null
  const name =
    String(primary?.platformNickname || member?.wxNickName || '').trim() ||
    String(acc?.wxNickName || '').trim() ||
    '达人'
  return {
    role: 'talent',
    participantKey: key,
    deviceSecret: bootstrapTalentSecret(key),
    displayName: name,
    avatarUrl: String(member?.wxAvatarUrl || '').trim(),
    memberSnapshot: (member as Record<string, unknown>) || null,
  }
}

export function peerDisplay(session: Record<string, unknown>, myKey: string) {
  if (!session) return { name: '会话', avatar: '' }
  const iAmTalent = session.talent_key === myKey
  if (iAmTalent) {
    return {
      name: String(session.pr_name || '').trim() || 'PR',
      avatar: String(session.pr_avatar || '').trim(),
    }
  }
  return {
    name: String(session.talent_name || '').trim() || '达人',
    avatar: String(session.talent_avatar || '').trim(),
  }
}

export function unreadForMe(session: Record<string, unknown>, myKey: string) {
  if (!session) return 0
  if (session.talent_key === myKey) return Number(session.talent_unread) || 0
  return Number(session.pr_unread) || 0
}
