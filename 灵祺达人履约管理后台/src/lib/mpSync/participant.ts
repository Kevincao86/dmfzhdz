import type { PrProfile } from './userProfile'
import type { TalentMember } from './talentMember'

const SECRET_KEY = 'meoo_talent_chat_secret_v1'

function randomSecret() {
  return `sec_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`
}

function getDeviceSecret() {
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

export function talentParticipantKey(member: TalentMember | null) {
  if (member?.id) return `talent_${member.id}`
  return `talent_guest_${getDeviceSecret().slice(0, 12)}`
}

export function prParticipantKey(profile: PrProfile | null) {
  const phone = profile && String(profile.contactPhone || '').trim()
  if (phone) return `pr_${phone.replace(/\D/g, '').slice(-11) || phone}`
  return `pr_device_${getDeviceSecret().slice(0, 12)}`
}
