import type { RegistryFile, RegistryMpTalentMember } from './opsRegistryTypes.js'

const TALENT_ID_RE = /^LQ-D-(\d+)$/i
const PR_ID_RE = /^LQ-P-(\d+)$/i
const SHOOT_TEAM_ID_RE = /^LQ-PS-(\d+)$/i
const EDIT_TEAM_ID_RE = /^LQ-J-(\d+)$/i

function maxFromIds(ids: string[], re: RegExp): number {
  let max = 0
  for (const raw of ids) {
    const m = String(raw || '').match(re)
    if (m) max = Math.max(max, Number(m[1]) || 0)
  }
  return max
}

export function allocateLingqiTalentId(data: RegistryFile, preferred?: string): string {
  const p = String(preferred || '').trim()
  if (TALENT_ID_RE.test(p)) return p.toUpperCase()
  const members = data.mpTalentMembers ?? []
  const fromLib = (data.talentLibraryEntries ?? []).map((e) => String(e.lingqiTalentId || ''))
  const max = Math.max(
    maxFromIds(
      members.map((m) => String(m.lingqiTalentId || '')),
      TALENT_ID_RE,
    ),
    maxFromIds(fromLib, TALENT_ID_RE),
  )
  return `LQ-D-${String(max + 1).padStart(6, '0')}`
}

function collectShootTeamIds(data: RegistryFile): string[] {
  const fromMembers = (data.mpTalentMembers ?? []).map((m) => String(m.lingqiShootTeamId || ''))
  const fromLib = (data.shootTeamLibraryEntries ?? []).map((e) =>
    String(e.lingqiTeamId || e.lingqiTalentId || ''),
  )
  return [...fromMembers, ...fromLib]
}

function collectEditTeamIds(data: RegistryFile): string[] {
  const fromMembers = (data.mpTalentMembers ?? []).map((m) => String(m.lingqiEditTeamId || ''))
  const fromLib = (data.editTeamLibraryEntries ?? []).map((e) =>
    String(e.lingqiTeamId || e.lingqiTalentId || ''),
  )
  return [...fromMembers, ...fromLib]
}

export function allocateLingqiShootTeamId(data: RegistryFile, preferred?: string): string {
  const p = String(preferred || '').trim()
  if (SHOOT_TEAM_ID_RE.test(p)) return p.toUpperCase()
  const max = maxFromIds(collectShootTeamIds(data), SHOOT_TEAM_ID_RE)
  return `LQ-PS-${String(max + 1).padStart(6, '0')}`
}

export function allocateLingqiEditTeamId(data: RegistryFile, preferred?: string): string {
  const p = String(preferred || '').trim()
  if (EDIT_TEAM_ID_RE.test(p)) return p.toUpperCase()
  const max = maxFromIds(collectEditTeamIds(data), EDIT_TEAM_ID_RE)
  return `LQ-J-${String(max + 1).padStart(6, '0')}`
}

export function allocateLingqiPrId(data: RegistryFile, preferred?: string): string {
  const p = String(preferred || '').trim()
  if (PR_ID_RE.test(p)) return p.toUpperCase()
  const users = data.mpPrUsers ?? []
  const max = maxFromIds(
    users.map((u) => String(u.lingqiPrId || '')),
    PR_ID_RE,
  )
  return `LQ-P-${String(max + 1).padStart(6, '0')}`
}

export function memberHasPlatformInfo(member: RegistryMpTalentMember): boolean {
  const dy = member.douyin?.platformAccount
  const xhs = member.xiaohongshu?.platformAccount
  return !!(String(dy || '').trim() || String(xhs || '').trim())
}
