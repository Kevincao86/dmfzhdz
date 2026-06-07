import type { MpRegistry } from '../mpRecruitment/types'
import { platformIdFromName } from './talentPlatformProfiles'
import { labels } from './platformLabels'
import { TALENT_TAGS } from './publishFormOptions'
import { readMember, primaryPlatformProfile } from './talentMember'
import {
  extractProfileLinkUrl,
  profileLinkLabel,
  profileLinkOpensExternally,
  resolveTalentProfileHref,
} from './talentProfileLink'

export const MP_STATUS_LABEL: Record<string, string> = {
  open: '招募中',
  collecting: '收集中',
  pending_settlement: '待结算',
  closed: '已停止',
  done: '已完成',
  unknown: '未知',
}

export function statusLabel(status: unknown): string {
  return MP_STATUS_LABEL[String(status || '')] || String(status || '—')
}

export function hallLabelFromMp(mp: Record<string, unknown> | null): string {
  if (!mp) return '—'
  if (mp.hall === 'urgent' || mp.urgent) return '急单大厅'
  if (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice' || mp.orderKind === 'ice') return '云剪任务'
  return '招募大厅'
}

export function normalizeProfileUrl(raw: unknown): string {
  return resolveTalentProfileHref('', raw) || extractProfileLinkUrl(raw)
}

function resolveApplicantProfileLink(applicant: Record<string, unknown>, reg: MpRegistry): string {
  const platform = String(applicant.platform || '抖音')
  const pid = platformIdFromName(platform)
  const account = String(applicant.platformAccount || '').trim().toLowerCase()
  const contact = String(applicant.contact || '').trim()

  const fromRow = resolveTalentProfileHref(platform, applicant.profileLink)
  if (fromRow) return fromRow

  const members = Array.isArray(reg?.mpTalentMembers) ? reg.mpTalentMembers : []
  for (const m of members) {
    const mem = m as Record<string, unknown>
    const profs = mem.platformProfiles as Record<string, { platformAccount?: string; profileLink?: string }> | undefined
    const prof = profs?.[pid]
    if (prof) {
      const profAccount = String(prof.platformAccount || '').trim().toLowerCase()
      if (account && profAccount === account) {
        const href = resolveTalentProfileHref(platform, prof.profileLink)
        if (href) return href
      }
    }
    if (contact && String(mem.contact || '').trim() === contact && prof) {
      const href = resolveTalentProfileHref(platform, prof.profileLink)
      if (href) return href
    }
  }

  const lib = Array.isArray(reg?.talentLibraryEntries) ? reg.talentLibraryEntries : []
  for (const e of lib) {
    const entry = e as Record<string, unknown>
    if (platformIdFromName(entry.platform) !== pid) continue
    const entryAccount = String(entry.platformAccount || '').trim().toLowerCase()
    if (account && entryAccount === account) {
      const href = resolveTalentProfileHref(platform, entry.profileLink)
      if (href) return href
    }
    if (contact && String(entry.contact || '').trim() === contact) {
      const href = resolveTalentProfileHref(platform, entry.profileLink)
      if (href) return href
    }
  }

  return ''
}

function normalizeAccountTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const allowed = new Set<string>(TALENT_TAGS as readonly string[])
  return raw.map((t) => String(t || '').trim()).filter((t) => t && allowed.has(t))
}

function resolveApplicantAvatar(applicant: Record<string, unknown>, reg: MpRegistry): string {
  if (!applicant) return ''
  if (applicant.avatar || applicant.wxAvatarUrl) {
    return String(applicant.avatar || applicant.wxAvatarUrl || '').trim()
  }
  const members = Array.isArray(reg?.mpTalentMembers) ? reg.mpTalentMembers : []
  const account = String(applicant.platformAccount || '').trim().toLowerCase()
  const plat = String(applicant.platform || '抖音')
  const pid = platformIdFromName(plat)

  for (const m of members) {
    const mem = m as Record<string, unknown>
    const profs = mem.platformProfiles as Record<string, { platformAccount?: string }> | undefined
    const prof = profs?.[pid]
    if (prof && account && String(prof.platformAccount || '').trim().toLowerCase() === account) {
      return String(mem.wxAvatarUrl || '').trim()
    }
  }
  const contact = String(applicant.contact || '').trim()
  if (contact) {
    for (const m of members) {
      const mem = m as Record<string, unknown>
      if (String(mem.contact || '').trim() === contact) return String(mem.wxAvatarUrl || '').trim()
    }
  }
  const self = readMember()
  if (self?.wxAvatarUrl && contact && String(self.contact || '').trim() === contact) {
    return String(self.wxAvatarUrl).trim()
  }
  return ''
}

function resolveApplicantMemberProfile(applicant: Record<string, unknown>, reg: MpRegistry) {
  if (!applicant || !reg) return null
  const plat = String(applicant.platform || '抖音')
  const pid = platformIdFromName(plat)
  const account = String(applicant.platformAccount || '').trim().toLowerCase()
  const contact = String(applicant.contact || '').trim()
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []

  const pickFromProf = (prof: Record<string, unknown> | undefined) => {
    if (!prof) return null
    return {
      douyinSalesLevel: String(prof.douyinSalesLevel || '').trim(),
      talentGrade: String(prof.talentGrade || '').trim(),
      accountTags: normalizeAccountTags(prof.accountTags),
    }
  }

  if (account) {
    for (const m of members) {
      const mem = m as Record<string, unknown>
      const profs = mem.platformProfiles as Record<string, Record<string, unknown>> | undefined
      const prof = profs?.[pid]
      if (prof && String(prof.platformAccount || '').trim().toLowerCase() === account) return pickFromProf(prof)
    }
    const lib = Array.isArray(reg.talentLibraryEntries) ? reg.talentLibraryEntries : []
    for (const e of lib) {
      const entry = e as Record<string, unknown>
      if (String(entry.platformAccount || '').trim().toLowerCase() === account) {
        return {
          douyinSalesLevel: String(entry.douyinSalesLevel || '').trim(),
          talentGrade: String(entry.talentGrade || '').trim(),
          accountTags: normalizeAccountTags(entry.accountTags || entry.tags),
        }
      }
    }
  }
  if (contact) {
    for (const m of members) {
      const mem = m as Record<string, unknown>
      if (String(mem.contact || '').trim() !== contact) continue
      const profs = mem.platformProfiles as Record<string, Record<string, unknown>> | undefined
      const prof = profs?.[pid]
      const fromPlat = pickFromProf(prof)
      if (fromPlat) return fromPlat
      const primary = primaryPlatformProfile(mem)
      if (primary && primary.platform === plat) return pickFromProf(primary.profile as Record<string, unknown>)
    }
  }
  return null
}

function resolveApplicantAccountTags(applicant: Record<string, unknown>, reg: MpRegistry): string[] {
  const onRow = normalizeAccountTags(applicant?.accountTags)
  if (onRow.length) return onRow
  const prof = resolveApplicantMemberProfile(applicant, reg)
  return prof?.accountTags || []
}

function resolveDisplaySalesLevel(applicant: Record<string, unknown>, reg: MpRegistry): string {
  const platform = String(applicant.platform || '抖音')
  const lb = labels(platform)
  const prof = resolveApplicantMemberProfile(applicant, reg)
  if (lb.showSalesLevel) {
    const level = String(applicant.douyinSalesLevel || prof?.douyinSalesLevel || '').trim()
    return level || '—'
  }
  if (lb.showTalentGrade) {
    const grade = String(applicant.talentGrade || prof?.talentGrade || '').trim()
    return grade || '—'
  }
  return '—'
}

export type EnrichedApplicantRow = Record<string, unknown> & {
  id?: string
  index: number
  displayName: string
  displayFollowers: string
  displayPlatform: string
  displayAppliedAt: string
  displaySalesLevel: string
  accountTags: string[]
  hasAccountTags: boolean
  avatar: string
  profileLink: string
  resolvedProfileHref: string
  profileLinkDisplay: string
  profileOpensExternally: boolean
  hasProfileLink: boolean
  profileLinkShort: string
  selected?: boolean
}

export function enrichApplicantRow(applicant: Record<string, unknown>, index: number, reg: MpRegistry): EnrichedApplicantRow {
  const a = applicant || {}
  const platform = String(a.platform || '抖音')
  const profileLink = String(a.profileLink || '').trim()
  const resolvedProfileHref = resolveApplicantProfileLink(a, reg)
  const profileLinkDisplay = resolvedProfileHref
    ? profileLinkLabel(platform, resolvedProfileHref)
    : profileLink
      ? profileLinkLabel(platform, profileLink)
      : ''
  const followers = a.followers != null ? a.followers : '—'
  let fansText = String(followers)
  const n = Number(followers)
  if (Number.isFinite(n) && n >= 10000) fansText = `${(n / 10000).toFixed(1)}万`
  else if (Number.isFinite(n)) fansText = `${n}`

  const accountTags = resolveApplicantAccountTags(a, reg)
  const displaySalesLevel = resolveDisplaySalesLevel(a, reg)
  const prof = resolveApplicantMemberProfile(a, reg)
  const douyinSalesLevel = String(a.douyinSalesLevel || '').trim() || prof?.douyinSalesLevel || ''

  return {
    ...a,
    index: index + 1,
    displayName: String(a.platformNickname || a.name || '未填写昵称'),
    displayFollowers: fansText,
    displayPlatform: platform,
    displayAppliedAt: String(a.appliedAt || '—'),
    displaySalesLevel,
    accountTags,
    hasAccountTags: accountTags.length > 0,
    douyinSalesLevel: douyinSalesLevel || a.douyinSalesLevel,
    avatar: resolveApplicantAvatar(a, reg),
    profileLink,
    resolvedProfileHref,
    profileLinkDisplay,
    profileOpensExternally: profileLinkOpensExternally(platform),
    hasProfileLink: !!resolvedProfileHref,
    profileLinkShort: resolvedProfileHref
      ? resolvedProfileHref.length > 36
        ? `${resolvedProfileHref.slice(0, 34)}…`
        : resolvedProfileHref
      : profileLink.length > 36
        ? `${profileLink.slice(0, 34)}…`
        : profileLink,
  }
}
