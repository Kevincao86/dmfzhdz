import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { appendMpTalentInboxInSnapshot, type MpTalentInboxEntryInput } from './mpTalentInboxMutations.js'

function nowCn() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function normalizeAccount(v: unknown): string {
  return String(v || '').trim().toLowerCase()
}

function resolveMemberForApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  members: RegistryMpTalentMember[],
): RegistryMpTalentMember | null {
  const contact = String(applicant.contact || '').trim()
  const account = normalizeAccount(applicant.platformAccount)
  const plat = String(applicant.platform || '抖音')
  for (const m of members) {
    if (applicant.talentMemberId && String(m.id) === String(applicant.talentMemberId)) return m
    if (contact && String(m.contact || '').trim() === contact) return m
    const profs = m.platformProfiles || {}
    for (const p of Object.values(profs)) {
      if (!p) continue
      if (account && normalizeAccount(p.platformAccount) === account) return m
    }
    if (plat === '抖音' && m.douyin && account && normalizeAccount(m.douyin.platformAccount) === account) return m
    if (plat === '小红书' && m.xiaohongshu && account && normalizeAccount(m.xiaohongshu.platformAccount) === account) {
      return m
    }
  }
  return null
}

function inboxTargetFromApplicant(
  applicant: RegistryMpRecruitmentApplicant,
  reg: RegistrySnapshot,
): { talentMemberId: string; contact: string; platformAccount: string; applicantId: string } {
  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const member = resolveMemberForApplicant(applicant, members)
  const contact = String(applicant.contact || member?.contact || '').trim()
  const platformAccount = String(applicant.platformAccount || '').trim()
  const applicantId = String(applicant.id || '').trim()
  let talentMemberId = String(applicant.talentMemberId || member?.lingqiTalentId || member?.id || '').trim()
  if (!talentMemberId && contact) talentMemberId = `contact:${contact.replace(/\D/g, '')}`
  return { talentMemberId, contact, platformAccount, applicantId }
}

function selectedApplicantIds(mp: RegistryMpRecruitmentOrder): string[] {
  const fromField = Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []
  if (fromField.length) return fromField.map(String)
  return (mp.applicants || []).filter((a) => a.prSelected || a.merchantSelected).map((a) => String(a.id))
}

function memberRoleLabel(member: RegistryMpTalentMember | null): '达人' | '拍摄' | '剪辑' {
  const w = member?.workIdentity
  if (w === 'shoot') return '拍摄'
  if (w === 'edit') return '剪辑'
  return '达人'
}

export function patchApplicantVideoSubmit(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  videoUrl: string,
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  const url = String(videoUrl || '').trim()
  if (!aid || !url) return { ok: false, error: 'invalid_submit' }
  const applicants = (mp.applicants || []).map((a) => {
    if (String(a.id) !== aid) return a
    return {
      ...a,
      videoUrl: url,
      videoStatus: 'pending' as const,
      videoRejectReason: undefined,
      videoSubmittedAt: nowCn(),
      aiVerifyStatus: 'pending' as const,
      aiVerifyNote: '待 PR 审核',
    }
  })
  if (!applicants.some((a) => String(a.id) === aid)) return { ok: false, error: 'applicant_not_found' }
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() } }
}

export function patchApplicantVideoReview(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  action: 'pass' | 'reject',
  rejectReason?: string,
): { ok: true; mp: RegistryMpRecruitmentOrder; applicant: RegistryMpRecruitmentApplicant } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  if (!aid) return { ok: false, error: 'invalid_review' }
  let target: RegistryMpRecruitmentApplicant | null = null
  const applicants = (mp.applicants || []).map((a) => {
    if (String(a.id) !== aid) return a
    target = {
      ...a,
      videoStatus: action === 'pass' ? ('passed' as const) : ('rejected' as const),
      videoRejectReason: action === 'reject' ? String(rejectReason || '请修改后重新上传').trim() : undefined,
      aiVerifyStatus: action === 'pass' ? ('passed' as const) : ('failed' as const),
      aiVerifyNote: action === 'pass' ? '视频已通过审核' : String(rejectReason || '视频未通过审核'),
    }
    return target
  })
  if (!target) return { ok: false, error: 'applicant_not_found' }
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() }, applicant: target }
}

export function buildVideoReviewInboxEntries(
  reg: RegistrySnapshot,
  mp: RegistryMpRecruitmentOrder,
  reviewedApplicant: RegistryMpRecruitmentApplicant,
  action: 'pass' | 'reject',
  rejectReason?: string,
): MpTalentInboxEntryInput[] {
  const orderTitle = String(mp.title || mp.id)
  const ownerName = String(reviewedApplicant.platformNickname || reviewedApplicant.name || '达人')
  const passed = action === 'pass'
  const title = passed ? '探店视频已通过' : '探店视频需重新上传'
  const reason = String(rejectReason || '').trim()
  const body = passed
    ? `您在「${orderTitle}」提交的视频已通过 PR 审核。`
    : `您在「${orderTitle}」提交的视频未通过审核。${reason ? `驳回原因：${reason}` : ''} 请在「我的报名」重新上传视频。`

  const entries: MpTalentInboxEntryInput[] = []
  const seen = new Set<string>()
  const pushEntry = (applicant: RegistryMpRecruitmentApplicant, customTitle?: string, customBody?: string) => {
    const target = inboxTargetFromApplicant(applicant, reg)
    if (!target.talentMemberId || seen.has(target.talentMemberId)) return
    seen.add(target.talentMemberId)
    entries.push({
      talentMemberId: target.talentMemberId,
      contact: target.contact,
      platformAccount: target.platformAccount,
      applicantId: target.applicantId,
      mpOrderId: mp.id,
      category: 'business',
      title: customTitle || title,
      body: customBody || body,
      noticeType: 'general',
    })
  }

  pushEntry(reviewedApplicant)

  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const selected = new Set(selectedApplicantIds(mp))
  for (const a of mp.applicants || []) {
    if (String(a.id) === String(reviewedApplicant.id)) continue
    if (!selected.has(String(a.id))) continue
    const member = resolveMemberForApplicant(a, members)
    const role = memberRoleLabel(member)
    if (role === '达人') continue
    const name = String(a.platformNickname || a.name || role)
    const roleBody = passed
      ? `「${orderTitle}」中达人 ${ownerName} 的视频已通过 PR 审核。`
      : `「${orderTitle}」中达人 ${ownerName} 的视频未通过审核，${reason ? `原因：${reason}。` : ''}请关注后续重传进度。`
    pushEntry(a, passed ? `${role}通知：视频已通过` : `${role}通知：视频已驳回`, roleBody)
  }
  return entries
}

export function applyVideoReviewToSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  applicantId: string,
  action: 'pass' | 'reject',
  rejectReason?: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const id = String(mpOrderId || '').trim()
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const cur = data.mpRecruitmentOrders[idx]!
  const patched = patchApplicantVideoReview(cur, applicantId, action, rejectReason)
  if (!patched.ok) return { ok: false, error: patched.error, status: 400 }
  data.mpRecruitmentOrders[idx] = patched.mp
  const inbox = buildVideoReviewInboxEntries(data, patched.mp, patched.applicant, action, rejectReason)
  if (inbox.length) {
    const appended = appendMpTalentInboxInSnapshot(data, inbox)
    if (!appended.ok) return { ok: false, error: appended.error, status: appended.status }
  }
  return { ok: true }
}

export function applyVideoSubmitToSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  applicantId: string,
  videoUrl: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const id = String(mpOrderId || '').trim()
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const cur = data.mpRecruitmentOrders[idx]!
  const patched = patchApplicantVideoSubmit(cur, applicantId, videoUrl)
  if (!patched.ok) return { ok: false, error: patched.error, status: 400 }
  data.mpRecruitmentOrders[idx] = patched.mp
  return { ok: true }
}
