import {
  migrateMember,
  platformIdFromName,
  profileFilled,
  summaryLabel,
  type PlatformProfile,
  type TalentMember,
} from './talentPlatformProfiles'

export type { TalentMember, PlatformProfile }

const STORAGE_KEY = 'meoo_talent_member_v1'

export function readMember(): TalentMember | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as Record<string, unknown>
    if (!j || (!j.platformProfiles && !j.memberType && !j.douyin)) return null
    return migrateMember(j)
  } catch {
    return null
  }
}

export function writeMember(member: TalentMember) {
  const migrated = migrateMember(member as unknown as Record<string, unknown>)
  if (migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
}

export function memberCoversPlatform(member: TalentMember | null, platform: string) {
  if (!member?.platformProfiles) return false
  const id = platformIdFromName(platform)
  return profileFilled(member.platformProfiles[id])
}

export function platformProfileFromMember(member: TalentMember | null, platform: string): Omit<PlatformProfile, 'enabled'> | null {
  if (!memberCoversPlatform(member, platform)) return null
  const id = platformIdFromName(platform)
  const prof = member!.platformProfiles[id]
  if (!prof) return null
  const { enabled: _e, ...rest } = prof
  return rest
}

export function memberTypeLabel(member: TalentMember | null) {
  return summaryLabel(member)
}
