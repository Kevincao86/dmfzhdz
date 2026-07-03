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
import { resolveApplicantDisplayQuotePrice } from './prApplicantSettlementPrice'

import { MP_STATUS_LABEL as CORE_STATUS_LABEL, statusLabel as coreStatusLabel } from '../mpRecruitment/mpOrderStatus'

export const MP_STATUS_LABEL: Record<string, string> = {
  ...CORE_STATUS_LABEL,
  unknown: '未知',
}

export function statusLabel(status: unknown): string {
  const s = String(status || '')
  return MP_STATUS_LABEL[s] || coreStatusLabel(s) || '—'
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
  videoUploadLabel?: string
  videoUploadTone?: 'muted' | 'uploaded' | 'rejected' | 'passed'
  visitVideoUrl?: string
  visitPublishUrl?: string
  publishLinkLabel?: string
  publishLinkTone?: 'muted' | 'pending' | 'passed' | 'rejected' | 'completed'
  publishLinkNote?: string
  orderCompletedAt?: string
}

export type ApplicantPublishLinkTone = 'muted' | 'pending' | 'passed' | 'rejected' | 'completed'

export function resolveApplicantPublishLinkStatus(applicant: Record<string, unknown>): {
  label: string
  tone: ApplicantPublishLinkTone
  url: string
  note: string
} {
  const videoPassed = String(applicant.videoStatus || '') === 'passed'
  const url = String(applicant.douyinPublishUrl || '').trim()
  const completedAt = String(applicant.completedAt || '').trim()
  const aiStatus = String(applicant.aiVerifyStatus || '').trim()
  const note = String(applicant.aiVerifyNote || '').trim()

  if (completedAt) return { label: '已完结', tone: 'completed', url, note }
  if (!videoPassed) return { label: '待视频通过后回传', tone: 'muted', url: '', note: '' }
  if (!url) return { label: '待回传发布链接', tone: 'pending', url: '', note: '' }
  if (aiStatus === 'pending') return { label: 'AI 核查中', tone: 'pending', url, note }
  if (aiStatus === 'failed') return { label: '链接未通过', tone: 'rejected', url, note }
  if (aiStatus === 'passed') return { label: '已回传并通过', tone: 'passed', url, note }
  return { label: '已回传', tone: 'passed', url, note }
}

export type ApplicantVideoUploadTone = 'muted' | 'uploaded' | 'rejected' | 'passed'

export function resolveApplicantVideoUploadStatus(applicant: Record<string, unknown>): {
  label: string
  tone: ApplicantVideoUploadTone
} {
  const url = String(applicant.videoUrl || '').trim()
  const status = String(applicant.videoStatus || '').trim()
  if (!url) return { label: '未上传', tone: 'muted' }
  if (status === 'passed') return { label: '视频审核通过', tone: 'passed' }
  if (status === 'rejected') return { label: '视频驳回待重新回传', tone: 'rejected' }
  return { label: '已上传待审核', tone: 'uploaded' }
}

export function enrichApplicantRow(
  applicant: Record<string, unknown>,
  index: number,
  reg: MpRegistry,
  mpOrder?: Record<string, unknown> | null,
): EnrichedApplicantRow {
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
  const videoUpload = resolveApplicantVideoUploadStatus(a)
  const publishLink = resolveApplicantPublishLinkStatus(a)
  const visitVideoUrl = String(a.videoUrl || '').trim()
  const quotePrice = mpOrder
    ? resolveApplicantDisplayQuotePrice(mpOrder, {
        ...a,
        displaySalesLevel,
        douyinSalesLevel: douyinSalesLevel || a.douyinSalesLevel,
      })
    : String(a.quotePrice || '').trim()

  return {
    ...a,
    quotePrice,
    index: index + 1,
    displayName: String(a.platformNickname || a.name || '未填写昵称'),
    displayFollowers: fansText,
    displayPlatform: platform,
    displayAppliedAt: String(a.appliedAt || '—'),
    displaySalesLevel,
    accountTags,
    hasAccountTags: accountTags.length > 0,
    douyinSalesLevel: douyinSalesLevel || a.douyinSalesLevel,
    videoUploadLabel: videoUpload.label,
    videoUploadTone: videoUpload.tone,
    visitVideoUrl,
    visitPublishUrl: publishLink.url,
    publishLinkLabel: publishLink.label,
    publishLinkTone: publishLink.tone,
    publishLinkNote: publishLink.note,
    orderCompletedAt: String(a.completedAt || '').trim(),
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

/** 视频审核等场景：昵称后小字展示粉丝与带货等级 */
export function buildApplicantTalentMeta(row: {
  displayFollowers?: string
  displaySalesLevel?: string
}): string {
  const parts: string[] = []
  const fans = String(row.displayFollowers || '').trim()
  const level = String(row.displaySalesLevel || '').trim()
  if (fans && fans !== '—') parts.push(`粉丝 ${fans}`)
  if (level && level !== '—') parts.push(`带货 ${level}`)
  return parts.join(' · ')
}
