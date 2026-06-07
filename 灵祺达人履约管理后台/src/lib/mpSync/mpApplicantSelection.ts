import { patchMpRecruitmentOrder } from '../mpApi'
import { platformIdFromName } from './talentPlatformProfiles'
import { readMember } from './talentMember'
import type { MpRegistry } from '../mpRecruitment/types'

const LOCAL_KEY_PREFIX = 'meoo_mp_selected_v1_'

export function readLocalSelectedIds(mpOrderId: string): string[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_KEY_PREFIX}${mpOrderId}`)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}

export function writeLocalSelectedIds(mpOrderId: string, ids: string[]) {
  try {
    localStorage.setItem(`${LOCAL_KEY_PREFIX}${mpOrderId}`, JSON.stringify(ids || []))
  } catch {
    /* ignore */
  }
}

export function normalizeSelectedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))]
}

export function selectedIdsFromMp(mp: Record<string, unknown> | null): string[] {
  if (!mp) return []
  return normalizeSelectedIds(mp.selectedApplicantIds)
}

export type ApplicantRow = Record<string, unknown> & {
  id?: string
  selected?: boolean
  displayName?: string
}

export function stampApplicantsSelected(applicants: ApplicantRow[], selectedIds: string[]): ApplicantRow[] {
  const set = new Set(normalizeSelectedIds(selectedIds))
  return (applicants || []).map((a) => ({
    ...a,
    selected: a?.id ? set.has(String(a.id)) : false,
  }))
}

export function filterSelectedApplicants(applicants: ApplicantRow[], selectedIds: string[]): ApplicantRow[] {
  const set = new Set(normalizeSelectedIds(selectedIds))
  return (applicants || []).filter((a) => a?.id && set.has(String(a.id)))
}

export function applicantMatchesLocalMember(
  applicant: Record<string, unknown>,
  member: Record<string, unknown> | null,
): boolean {
  if (!applicant || !member) return false
  if (member.id && applicant.talentMemberId) {
    return String(member.id).trim() === String(applicant.talentMemberId).trim()
  }
  const contact = String(member.contact || '').trim()
  if (contact && String(applicant.contact || '').trim() === contact) return true
  const plat = platformIdFromName(String(applicant.platform || '抖音'))
  const profs = member.platformProfiles as Record<string, { platformAccount?: string }> | undefined
  const prof = profs?.[plat]
  const account = prof && String(prof.platformAccount || '').trim().toLowerCase()
  return !!(account && String(applicant.platformAccount || '').trim().toLowerCase() === account)
}

export function resolveTalentMemberId(applicant: Record<string, unknown>, reg: MpRegistry): string {
  const a = applicant || {}
  if (a.talentMemberId) return String(a.talentMemberId).trim()
  const member = readMember()
  if (member?.id) {
    const contact = String(member.contact || '').trim()
    if (contact && String(a.contact || '').trim() === contact) return String(member.id).trim()
    const plat = platformIdFromName(String(a.platform || '抖音'))
    const prof = member.platformProfiles?.[plat]
    const account = prof && String(prof.platformAccount || '').trim().toLowerCase()
    if (account && String(a.platformAccount || '').trim().toLowerCase() === account) return String(member.id).trim()
  }
  const members = Array.isArray(reg?.mpTalentMembers) ? reg.mpTalentMembers : []
  const account = String(a.platformAccount || '').trim().toLowerCase()
  const contact = String(a.contact || '').trim()
  const plat = platformIdFromName(String(a.platform || '抖音'))
  for (const m of members) {
    const mem = m as Record<string, unknown>
    const profs = mem.platformProfiles as Record<string, { platformAccount?: string }> | undefined
    const prof = profs?.[plat]
    if (account && prof && String(prof.platformAccount || '').trim().toLowerCase() === account) {
      return String(mem.id || '').trim()
    }
  }
  if (contact) {
    for (const m of members) {
      const mem = m as Record<string, unknown>
      if (String(mem.contact || '').trim() === contact) return String(mem.id || '').trim()
    }
  }
  return ''
}

export async function persistSelectedIds(mpOrderId: string, selectedIds: string[]) {
  const ids = normalizeSelectedIds(selectedIds)
  writeLocalSelectedIds(mpOrderId, ids)
  return patchMpRecruitmentOrder({ id: mpOrderId, selectedApplicantIds: ids })
}
