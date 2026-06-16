import type { MpRegistry } from '../mpRecruitment/types'
import { getAccount } from '../mpSession'
import { readApplications } from './applicationsStore'
import { groupQrFromMp } from './mpGroupQr'
import { applicantMatchesLocalMember, resolveTalentMemberId, selectedIdsFromMp } from './mpApplicantSelection'
import { platformIdFromName, TALENT_PLATFORMS } from './talentPlatformProfiles'
import { readMember } from './talentMember'

function contactKey(contact: string): string {
  const digits = String(contact || '').replace(/\D/g, '')
  return digits ? `contact:${digits}` : ''
}

function accountKey(platform: string, account: string): string {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return ''
  const pid = platformIdFromName(platform || '抖音')
  return `acct:${pid}:${a}`
}

function looksLikeRegistryMemberId(id: string): boolean {
  return /^(MTM-|LQ-[TD]-|talent_)/i.test(id)
}

function strictTalentIds(member: Record<string, unknown> | null): Set<string> {
  const ids = new Set<string>()
  const acc = getAccount()
  for (const v of [
    acc?.lingqiTalentId,
    acc?.registryMemberId,
    member?.id,
    member?.lingqiTalentId,
  ]) {
    const s = String(v ?? '').trim()
    if (s) ids.add(s)
  }
  return ids
}

function userOwnsApplicantId(applicantId: string): boolean {
  const aid = String(applicantId || '').trim()
  if (!aid) return false
  return readApplications().some((a) => String(a.applicantId || '') === aid)
}

export function resolveTalentInboxTarget(applicant: Record<string, unknown>, reg: MpRegistry) {
  const a = applicant || {}
  let talentMemberId = resolveTalentMemberId(a, reg)
  const contact = String(a.contact || '').trim()
  const platformAccount = String(a.platformAccount || '').trim()
  const applicantId = String(a.id || '').trim()
  if (!talentMemberId && contact) talentMemberId = contactKey(contact)
  if (!talentMemberId && platformAccount) talentMemberId = accountKey(String(a.platform || '抖音'), platformAccount)
  return { talentMemberId, contact, platformAccount, applicantId }
}

export function talentMatchKeys(member: Record<string, unknown> | null): Set<string> {
  const keys = new Set<string>()
  if (!member) return keys
  const acc = getAccount()
  if (acc?.lingqiTalentId) keys.add(String(acc.lingqiTalentId).trim())
  if (acc?.registryMemberId) keys.add(String(acc.registryMemberId).trim())
  if (member.id) keys.add(String(member.id).trim())
  if (member.lingqiTalentId) keys.add(String(member.lingqiTalentId).trim())
  const contact = String(member.contact || '').trim()
  if (contact) {
    keys.add(contact)
    const ck = contactKey(contact)
    if (ck) keys.add(ck)
  }
  const profiles = (member.platformProfiles || {}) as Record<string, { platformAccount?: string }>
  for (const p of TALENT_PLATFORMS) {
    const prof = profiles[p.id]
    if (!prof || !String(prof.platformAccount || '').trim()) continue
    keys.add(accountKey(p.name, String(prof.platformAccount || '')))
    keys.add(String(prof.platformAccount).trim().toLowerCase())
  }
  return keys
}

function rowMatchesMemberIdentity(
  row: Record<string, unknown>,
  keys: Set<string>,
  member: Record<string, unknown> | null,
): boolean {
  if (!row || !member) return false
  const strictIds = strictTalentIds(member)
  const mid = String(row.talentMemberId || '').trim()
  const isOps = row.noticeType === 'ops_broadcast'
  if (mid && strictIds.has(mid)) return true
  if (!isOps && mid && looksLikeRegistryMemberId(mid) && !strictIds.has(mid)) return false
  if (mid && keys.has(mid)) return true

  const contact = String(row.contact || '').trim()
  if (contact) {
    if (keys.has(contact) || keys.has(contactKey(contact))) return true
    if (String(member.contact || '').trim() === contact) return true
  }

  const plat = String(row.platform || '抖音')
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  if (acct) {
    if (keys.has(accountKey(plat, acct))) return true
    if (applicantMatchesLocalMember({ platform: plat, platformAccount: acct, contact: row.contact }, member)) {
      return true
    }
  }
  return false
}

export function inboxRowMatchesTalent(
  row: Record<string, unknown>,
  keys: Set<string>,
  member: Record<string, unknown> | null,
): boolean {
  if (!row || !member) return false
  const strictIds = strictTalentIds(member)
  const mid = String(row.talentMemberId || '').trim()
  const applicantId = String(row.applicantId || '').trim()
  const isSelection =
    row.noticeType === 'selection' || /恭喜入选/.test(String(row.title || ''))
  const isOps = row.noticeType === 'ops_broadcast'

  if (isSelection) {
    if (rowMatchesMemberIdentity(row, keys, member)) return true
    if (applicantId && userOwnsApplicantId(applicantId)) return true
    return false
  }

  if (isOps) {
    if (mid && strictIds.has(mid)) return true
    return rowMatchesMemberIdentity(row, keys, member)
  }

  if (mid && strictIds.has(mid)) return true
  if (mid && looksLikeRegistryMemberId(mid)) return false

  if (rowMatchesMemberIdentity(row, keys, member)) return true
  if (applicantId && userOwnsApplicantId(applicantId)) return true
  if (mid && keys.has(mid) && (!applicantId || userOwnsApplicantId(applicantId))) return true

  return false
}

function registryHasSelectionForApplicant(
  reg: MpRegistry,
  member: Record<string, unknown> | null,
  mpOrderId: string,
  applicantId: string,
): boolean {
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const keys = talentMatchKeys(member)
  return inbox.some((row) => {
    const r = row as Record<string, unknown>
    if (String(r.mpOrderId || '') !== mpOrderId) return false
    if (String(r.applicantId || '') !== applicantId) return false
    if (r.noticeType !== 'selection' && !/恭喜入选/.test(String(r.title || ''))) return false
    return inboxRowMatchesTalent(r, keys, member)
  })
}

function isApplicantNotified(mp: Record<string, unknown>, applicantId: string): boolean {
  const aid = String(applicantId || '').trim()
  if (!aid) return false
  const ids = Array.isArray(mp.notifiedApplicantIds) ? mp.notifiedApplicantIds : []
  return ids.map(String).includes(aid)
}

export function buildSelectionNoticeRows(reg: MpRegistry, member: Record<string, unknown> | null) {
  if (!reg || !member) return [] as NotificationLike[]
  const rows: NotificationLike[] = []
  const seen = new Set<string>()
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []

  function pushRow(mp: Record<string, unknown>, applicantId: string) {
    const mpOrderId = String(mp.id || '').trim()
    const aid = String(applicantId || '').trim()
    if (!mpOrderId || !aid || seen.has(`${mpOrderId}:${aid}`)) return
    if (registryHasSelectionForApplicant(reg, member, mpOrderId, aid)) return
    if (!isApplicantNotified(mp, aid)) return
    seen.add(`${mpOrderId}:${aid}`)
    const qr = groupQrFromMp(mp)
    if (!qr) return
    rows.push({
      id: `sel-reg-${mpOrderId}-${aid}`,
      title: '恭喜入选招募',
      body: `您已被选入「${mp.title || mpOrderId}」。请扫码加入项目群，二维码见下图。`,
      category: 'business',
      categoryLabel: '业务',
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      read: false,
      fromRegistry: true,
      noticeType: 'selection',
      mpOrderId,
      applicantId: aid,
      imageUrl: qr || '',
      pinned: true,
    })
  }

  const apps = readApplications()
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i]
    if (!app?.mpOrderId || !app.applicantId) continue
    const mp = mpList.find((o) => o && (o as Record<string, unknown>).id === app.mpOrderId) as
      | Record<string, unknown>
      | undefined
    if (!mp) continue
    const selected = selectedIdsFromMp(mp)
    if (!selected.includes(String(app.applicantId))) continue
    const applicant = ((mp.applicants as unknown[]) || []).find(
      (a) => a && typeof a === 'object' && (a as Record<string, unknown>).id === app.applicantId,
    ) as Record<string, unknown> | undefined
    if (applicant && !applicantMatchesLocalMember(applicant, member)) continue
    pushRow(mp, String(app.applicantId))
  }

  for (const mp of mpList) {
    const m = mp as Record<string, unknown>
    if (!m?.id) continue
    const selected = selectedIdsFromMp(m)
    for (const sid of selected) {
      const applicant = ((m.applicants as unknown[]) || []).find(
        (a) => a && typeof a === 'object' && String((a as Record<string, unknown>).id) === String(sid),
      ) as Record<string, unknown> | undefined
      if (!applicant || !applicantMatchesLocalMember(applicant, member)) continue
      pushRow(m, String(sid))
    }
  }

  return rows
}

type NotificationLike = {
  id: string
  title: string
  body: string
  category: string
  categoryLabel?: string
  createdAt?: string
  read?: boolean
  imageUrl?: string
  fromRegistry?: boolean
  noticeType?: string
  mpOrderId?: string
  applicantId?: string
  pinned?: boolean
}

export function inboxRowsForTalent(reg: MpRegistry, member: Record<string, unknown> | null): NotificationLike[] {
  if (!reg || !member) return []
  const inbox = Array.isArray(reg.mpTalentInbox) ? reg.mpTalentInbox : []
  const keys = talentMatchKeys(member)
  return (inbox as Record<string, unknown>[])
    .filter((row) => inboxRowMatchesTalent(row, keys, member))
    .map((row) => {
      const r = row
      const isSel = r.noticeType === 'selection' || /恭喜入选/.test(String(r.title || ''))
      let imageUrl = r.imageUrl ? String(r.imageUrl) : ''
      if (isSel && !imageUrl && r.mpOrderId) {
        const mp = (reg.mpRecruitmentOrders || []).find(
          (o) => o && (o as Record<string, unknown>).id === r.mpOrderId,
        ) as Record<string, unknown> | undefined
        imageUrl = mp ? groupQrFromMp(mp) : ''
      }
      return {
        id: String(r.id),
        title: String(r.title || '通知'),
        body: String(r.body || ''),
        imageUrl,
        category: isSel ? 'business' : String(r.category || 'system'),
        categoryLabel: isSel ? '业务' : undefined,
        createdAt: String(r.createdAt || ''),
        read: !!r.read,
        fromRegistry: true,
        noticeType: String(r.noticeType || (isSel ? 'selection' : '')),
        mpOrderId: String(r.mpOrderId || ''),
        applicantId: String(r.applicantId || ''),
        pinned:
          !!r.pinned ||
          (r.noticeType === 'video_reject' && !r.read) ||
          (/探店视频需重新上传/.test(String(r.title || '')) && !r.read),
      }
    })
}

export function mergeRegistryInboxForTalent(reg: MpRegistry, member: Record<string, unknown> | null) {
  const selectionRows = buildSelectionNoticeRows(reg, member)
  const remote = inboxRowsForTalent(reg, member)
  const merged = [...selectionRows, ...remote]
  const remoteIds = new Set(merged.map((r) => r.id))
  return { merged, remoteIds }
}
