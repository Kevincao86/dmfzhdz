import type { RegistryMpOpsAnnouncement, RegistryMpTalentMember, RegistrySnapshot } from './opsRegistryTypes.js'
import {
  appendMpTalentInboxInSnapshot,
  type MpTalentInboxEntryInput,
} from './mpTalentInboxMutations.js'
import {
  type MpOpsAnnouncementTargetFilter,
  previewMpAnnouncementRecipients,
} from './mpOpsAnnouncementEligibility.js'

export type { MpOpsAnnouncementTargetFilter }

export function resolveMpAnnouncementRecipients(
  data: RegistrySnapshot,
  filter: MpOpsAnnouncementTargetFilter,
): RegistryMpTalentMember[] {
  const libraryEntries = Array.isArray(data.talentLibraryEntries) ? data.talentLibraryEntries : []
  return previewMpAnnouncementRecipients(data.mpTalentMembers ?? [], filter, libraryEntries)
}

export type SendMpOpsAnnouncementInput = {
  title: string
  body: string
  showHomePopup?: boolean
  targetFilter: MpOpsAnnouncementTargetFilter
  createdBy?: string | null
}

export type SendMpOpsAnnouncementResult =
  | { ok: true; announcementId: string; recipientCount: number }
  | { ok: false; error: string; status: number }

function normalizeAnnouncementContact(member: RegistryMpTalentMember): string | undefined {
  const raw = String(member.contact || member.wechatId || '').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 11) return digits.slice(-11)
  return raw || undefined
}

export function sendMpOpsAnnouncementInSnapshot(
  data: RegistrySnapshot,
  input: SendMpOpsAnnouncementInput,
): SendMpOpsAnnouncementResult {
  const title = String(input.title || '').trim()
  const body = String(input.body || '').trim()
  if (!title) return { ok: false, error: 'title_required', status: 400 }
  if (!body) return { ok: false, error: 'body_required', status: 400 }

  const recipients = resolveMpAnnouncementRecipients(data, input.targetFilter || {})
  if (!recipients.length) return { ok: false, error: 'no_recipients', status: 400 }

  const announcementId = `ops-ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const showHomePopup = input.showHomePopup !== false

  const entries: MpTalentInboxEntryInput[] = recipients.map((m) => ({
    talentMemberId: m.id,
    title,
    body,
    category: 'system',
    noticeType: 'ops_broadcast',
    contact: normalizeAnnouncementContact(m),
    pinned: showHomePopup,
    announcementId,
  }))

  const appended = appendMpTalentInboxInSnapshot(data, entries)
  if (!appended.ok) return { ok: false, error: appended.error, status: appended.status }

  const history = [...(data.mpOpsAnnouncements ?? [])]
  history.unshift({
    id: announcementId,
    title,
    body,
    showHomePopup,
    targetFilter: input.targetFilter || {},
    recipientCount: appended.count,
    createdAt: now,
    createdBy: input.createdBy ?? null,
  })
  data.mpOpsAnnouncements = history.slice(0, 200)

  return { ok: true, announcementId, recipientCount: appended.count }
}

export function listMpOpsAnnouncements(data: RegistrySnapshot): RegistryMpOpsAnnouncement[] {
  return Array.isArray(data.mpOpsAnnouncements) ? data.mpOpsAnnouncements : []
}
