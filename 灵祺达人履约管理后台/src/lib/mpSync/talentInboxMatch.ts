import type { MpRegistry } from '../mpRecruitment/types'
import { getAccount } from '../mpSession'
import { readApplications } from './applicationsStore'
import { groupQrFromMp } from './mpGroupQr'
import { platformIdFromName, TALENT_PLATFORMS } from './talentPlatformProfiles'
import { readMember } from './talentMember'
import { resolveTalentMemberId, selectedIdsFromMp } from './mpApplicantSelection'

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
  for (const app of readApplications()) {
    if (app?.applicantId) keys.add(`app:${app.applicantId}`)
  }
  return keys
}

export function inboxRowMatchesTalent(
  row: Record<string, unknown>,
  keys: Set<string>,
  member: Record<string, unknown> | null,
): boolean {
  if (!row || !keys.size) return false
  const mid = String(row.talentMemberId || '').trim()
  if (mid && keys.has(mid)) return true
  const contact = String(row.contact || '').trim()
  if (contact) {
    if (keys.has(contact)) return true
    const ck = contactKey(contact)
    if (ck && keys.has(ck)) return true
  }
  const applicantId = String(row.applicantId || '').trim()
  if (applicantId && keys.has(`app:${applicantId}`)) return true
  if (member && contact && String(member.contact || '').trim() === contact) return true
  const plat = String(row.platform || '抖音')
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  if (acct && keys.has(accountKey(plat, acct))) return true
  return false
}

export function buildSelectionNoticeRows(reg: MpRegistry, member: Record<string, unknown> | null) {
  if (!reg || !member) return [] as NotificationLike[]
  const apps = readApplications()
  const rows: NotificationLike[] = []
  const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i]
    if (!app?.mpOrderId || !app.applicantId) continue
    const mp = mpList.find((o) => o && (o as Record<string, unknown>).id === app.mpOrderId) as
      | Record<string, unknown>
      | undefined
    if (!mp) continue
    const selected = selectedIdsFromMp(mp)
    if (!selected.includes(String(app.applicantId))) continue
    const qr = groupQrFromMp(mp)
    rows.push({
      id: `sel-reg-${app.mpOrderId}-${app.applicantId}`,
      title: '恭喜入选招募',
      body: `您已被选入「${mp.title || app.title || app.mpOrderId}」。请扫码加入项目群，二维码见下图。`,
      category: 'business',
      categoryLabel: '业务',
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      read: false,
      fromRegistry: true,
      noticeType: 'selection',
      mpOrderId: app.mpOrderId,
      applicantId: app.applicantId,
      imageUrl: qr || '',
      pinned: true,
    })
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
        pinned: !!r.pinned,
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
