/** 运营台达人小程序公告 — 客户端筛选预览（与 mpOpsAnnouncementCore 逻辑一致） */
export {
  type MpAnnouncementMemberContext,
  type MpOpsAnnouncementTargetFilter,
  buildAnnounceableMpTalentMemberPool,
  buildMpAnnouncementMemberContext,
  collectAnnouncementProfiles,
  countValidTalentLibraryEntries,
  matchMpTalentMemberForAnnouncement,
  memberAnnouncementDisplayLabel,
  previewMpAnnouncementRecipients,
} from './mpOpsAnnouncementEligibility.js'
export { TALENT_DOUYIN_LEVEL_OPTS, TALENT_FOLLOWER_TIER_OPTS } from './talentLibraryFilters.js'

import type { RegistryMpTalentMember, RegistryTalentLibraryEntry } from './opsRegistryTypes.js'
import { memberAnnouncementDisplayLabel } from './mpOpsAnnouncementEligibility.js'

/** @deprecated 请改用 memberAnnouncementDisplayLabel(member, libraryEntries, members) */
export function memberDisplayLabel(
  member: RegistryMpTalentMember,
  libraryEntries: RegistryTalentLibraryEntry[] = [],
  members: RegistryMpTalentMember[] = [],
): string {
  return memberAnnouncementDisplayLabel(member, libraryEntries, members.length ? members : [member])
}
