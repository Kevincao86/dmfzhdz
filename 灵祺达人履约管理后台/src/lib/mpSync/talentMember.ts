import { migrateLegacyKeyToScoped, scopedStorageKey } from '../mpAccountLocalScope'
import {
  migrateMember,
  platformIdFromName,
  profileFilled,
  summaryLabel,
  TALENT_PLATFORMS,
  type PlatformProfile,
  type TalentMember,
} from './talentPlatformProfiles'

export type { TalentMember, PlatformProfile }

const STORAGE_KEY = 'meoo_talent_member_v1'

function memberStorageKey() {
  return scopedStorageKey(STORAGE_KEY)
}

export function readMember(): TalentMember | null {
  try {
    migrateLegacyKeyToScoped(STORAGE_KEY)
    const raw = localStorage.getItem(memberStorageKey())
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
  if (migrated) {
    localStorage.setItem(memberStorageKey(), JSON.stringify(migrated))
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
}

export const TALENT_SMART_MATCH_NEED_PROFILE_HINT = '请补充平台资料，以便AI匹配商单'

export function hasFilledPlatform(member: TalentMember | null): boolean {
  if (!member?.platformProfiles) return false
  return TALENT_PLATFORMS.some((p) => profileFilled(member.platformProfiles[p.id]))
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

export function primaryPlatformProfile(member: Record<string, unknown> | TalentMember | null) {
  if (!member) return null
  const m = member as TalentMember
  if (m.platformProfiles) {
    for (const p of TALENT_PLATFORMS) {
      const prof = m.platformProfiles[p.id]
      if (profileFilled(prof)) return { platform: p.name, profile: prof }
    }
  }
  const legacy = member as Record<string, unknown>
  if (legacy.douyin && String((legacy.douyin as Record<string, unknown>).platformAccount || (legacy.douyin as Record<string, unknown>).platformNickname || '').trim()) {
    return { platform: '抖音', profile: legacy.douyin as PlatformProfile }
  }
  return null
}
