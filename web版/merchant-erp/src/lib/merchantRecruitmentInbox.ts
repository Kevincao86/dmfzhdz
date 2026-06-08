import type { RegistryFile, RegistryMpRecruitmentApplicant } from './opsRegistryTypes'

function contactKey(contact: string): string {
  const digits = String(contact || '').replace(/\D/g, '')
  return digits ? `contact:${digits}` : ''
}

function accountKey(platform: string, account: string): string {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return ''
  return `acct:${platform}:${a}`
}

export function resolveTalentMemberIdForApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  reg: RegistryFile,
): string {
  const explicit = String(applicant.talentMemberId || '').trim()
  if (explicit) return explicit
  const members = reg.mpTalentMembers ?? []
  const acct = String(applicant.platformAccount || '').trim().toLowerCase()
  const contact = String(applicant.contact || '').trim()
  for (const m of members) {
    if (!m) continue
    if (contact && m.contact === contact) return String(m.id)
    const profiles = (m.platformProfiles || {}) as Record<string, { platformAccount?: string }>
    for (const prof of Object.values(profiles)) {
      if (acct && String(prof.platformAccount || '').trim().toLowerCase() === acct) {
        return String(m.id)
      }
    }
  }
  if (contact) return contactKey(contact)
  if (acct) return accountKey(String(applicant.platform || '抖音'), acct)
  return `applicant:${applicant.id}`
}
