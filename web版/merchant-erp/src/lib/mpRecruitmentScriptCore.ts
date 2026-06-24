import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { appendMpTalentInboxInSnapshot, type MpTalentInboxEntryInput } from './mpTalentInboxMutations.js'
import { isScriptReviewPlatform } from './deliveryReviewPlatform.js'

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
  for (const m of members) {
    if (applicant.talentMemberId && String(m.id) === String(applicant.talentMemberId)) return m
    if (contact && String(m.contact || '').trim() === contact) return m
    if (account && m.douyin && normalizeAccount(m.douyin.platformAccount) === account) return m
    if (account && m.xiaohongshu && normalizeAccount(m.xiaohongshu.platformAccount) === account) return m
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

export function patchApplicantScriptDraft(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  payload: { scriptUrl?: string; scriptLinkUrl?: string; scriptFileName?: string },
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  if (!aid) return { ok: false, error: 'invalid_draft' }
  const target = (mp.applicants || []).find((a) => String(a.id) === aid)
  if (!target) return { ok: false, error: 'applicant_not_found' }
  const status = String(target.scriptStatus || '')
  if (status === 'passed') return { ok: false, error: 'cannot_draft_in_review' }
  const scriptUrl = String(payload.scriptUrl || target.scriptUrl || '').trim()
  const scriptLinkUrl = String(payload.scriptLinkUrl || target.scriptLinkUrl || '').trim()
  if (!scriptUrl && !scriptLinkUrl) return { ok: false, error: 'invalid_draft' }
  const applicants = (mp.applicants || []).map((a) => {
    if (String(a.id) !== aid) return a
    if (status === 'rejected') {
      return {
        ...a,
        scriptUrl: scriptUrl || undefined,
        scriptLinkUrl: scriptLinkUrl || undefined,
        scriptFileName: payload.scriptFileName ? String(payload.scriptFileName).trim() : a.scriptFileName,
      }
    }
    return {
      ...a,
      scriptUrl: scriptUrl || undefined,
      scriptLinkUrl: scriptLinkUrl || undefined,
      scriptFileName: payload.scriptFileName ? String(payload.scriptFileName).trim() : a.scriptFileName,
      scriptStatus: 'draft' as const,
      scriptRejectReason: undefined,
    }
  })
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() } }
}

export function patchApplicantScriptSubmit(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  payload: { scriptUrl?: string; scriptLinkUrl?: string; scriptFileName?: string },
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  if (!aid) return { ok: false, error: 'invalid_submit' }
  const target = (mp.applicants || []).find((a) => String(a.id) === aid)
  if (!target) return { ok: false, error: 'applicant_not_found' }
  const status = String(target.scriptStatus || '')
  const scriptUrl = String(payload.scriptUrl || target.scriptUrl || '').trim()
  const scriptLinkUrl = String(payload.scriptLinkUrl || target.scriptLinkUrl || '').trim()
  if (!scriptUrl && !scriptLinkUrl) return { ok: false, error: 'no_script' }
  if (status === 'pending') return { ok: false, error: 'already_submitted' }
  if (status === 'passed') return { ok: false, error: 'already_passed' }
  if (status !== 'draft' && status !== '' && status !== 'rejected') {
    return { ok: false, error: 'invalid_submit_state' }
  }
  const applicants = (mp.applicants || []).map((a) => {
    if (String(a.id) !== aid) return a
    const prevCount = Math.max(0, Number(a.scriptSubmitCount || 0))
    return {
      ...a,
      scriptUrl: scriptUrl || undefined,
      scriptLinkUrl: scriptLinkUrl || undefined,
      scriptFileName: payload.scriptFileName ? String(payload.scriptFileName).trim() : a.scriptFileName,
      scriptStatus: 'pending' as const,
      scriptRejectReason: undefined,
      scriptSubmittedAt: nowCn(),
      scriptSubmitCount: prevCount + 1,
    }
  })
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() } }
}

export function patchApplicantScriptReview(
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
      scriptStatus: action === 'pass' ? ('passed' as const) : ('rejected' as const),
      scriptRejectReason: action === 'reject' ? String(rejectReason || '请修改后重新提交').trim() : undefined,
      completedAt:
        action === 'pass' ? new Date().toLocaleString('zh-CN', { hour12: false }) : a.completedAt,
    }
    return target
  })
  if (!target) return { ok: false, error: 'applicant_not_found' }
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() }, applicant: target }
}

function buildScriptReviewInboxEntries(
  reg: RegistrySnapshot,
  mp: RegistryMpRecruitmentOrder,
  reviewedApplicant: RegistryMpRecruitmentApplicant,
  action: 'pass' | 'reject',
  rejectReason?: string,
): MpTalentInboxEntryInput[] {
  const orderTitle = String(mp.title || mp.id)
  const passed = action === 'pass'
  const reason = String(rejectReason || '').trim()
  const submitNo = Math.max(1, Number(reviewedApplicant.scriptSubmitCount || 0) || 1)
  const submitLabel = `（第 ${submitNo} 次提交）`
  const title = passed ? '探店文稿已通过' : '探店文稿需重新提交'
  const body = passed
    ? `您在「${orderTitle}」提交的文稿已通过 PR 审核${submitLabel}。`
    : `您在「${orderTitle}」提交的文稿未通过审核${submitLabel}。${reason ? `驳回原因：${reason}` : ''} 请在「我的报名 → 待传视频」重新提交文稿或链接。`

  const target = inboxTargetFromApplicant(reviewedApplicant, reg)
  if (!target.talentMemberId) return []
  return [
    {
      talentMemberId: target.talentMemberId,
      contact: target.contact,
      platformAccount: target.platformAccount,
      applicantId: target.applicantId,
      mpOrderId: mp.id,
      category: 'business',
      title,
      body,
      noticeType: passed ? 'general' : 'script_reject',
      pinned: passed ? undefined : true,
    },
  ]
}

export function applyScriptDraftToSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  applicantId: string,
  payload: { scriptUrl?: string; scriptLinkUrl?: string; scriptFileName?: string },
): { ok: true } | { ok: false; error: string; status: number } {
  const id = String(mpOrderId || '').trim()
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const cur = data.mpRecruitmentOrders[idx]!
  if (!isScriptReviewPlatform(cur.platform)) {
    return { ok: false, error: 'not_script_platform', status: 400 }
  }
  const patched = patchApplicantScriptDraft(cur, applicantId, payload)
  if (!patched.ok) return { ok: false, error: patched.error, status: 400 }
  data.mpRecruitmentOrders[idx] = patched.mp
  return { ok: true }
}

export function applyScriptSubmitToSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  applicantId: string,
  payload: { scriptUrl?: string; scriptLinkUrl?: string; scriptFileName?: string },
): { ok: true } | { ok: false; error: string; status: number } {
  const id = String(mpOrderId || '').trim()
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const cur = data.mpRecruitmentOrders[idx]!
  if (!isScriptReviewPlatform(cur.platform)) {
    return { ok: false, error: 'not_script_platform', status: 400 }
  }
  const patched = patchApplicantScriptSubmit(cur, applicantId, payload)
  if (!patched.ok) return { ok: false, error: patched.error, status: 400 }
  data.mpRecruitmentOrders[idx] = patched.mp
  return { ok: true }
}

export function applyScriptReviewToSnapshot(
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
  if (!isScriptReviewPlatform(cur.platform)) {
    return { ok: false, error: 'not_script_platform', status: 400 }
  }
  const patched = patchApplicantScriptReview(cur, applicantId, action, rejectReason)
  if (!patched.ok) return { ok: false, error: patched.error, status: 400 }
  data.mpRecruitmentOrders[idx] = patched.mp
  const inbox = buildScriptReviewInboxEntries(data, patched.mp, patched.applicant, action, rejectReason)
  if (inbox.length) {
    const appended = appendMpTalentInboxInSnapshot(data, inbox)
    if (!appended.ok) return { ok: false, error: appended.error, status: appended.status }
  }
  return { ok: true }
}

export function isApplicantScriptVisibleOnPrReview(applicant: Record<string, unknown>): boolean {
  const url = String(applicant.scriptUrl || applicant.scriptLinkUrl || '').trim()
  if (!url) return String(applicant.scriptStatus || '') === 'rejected'
  const s = String(applicant.scriptStatus ?? '').trim()
  if (s === 'draft') return false
  return s === 'pending' || s === 'passed' || s === 'rejected' || !s
}

export function scriptStatusLabel(status: string): string {
  if (status === 'pending') return '待审核'
  if (status === 'passed') return '已通过'
  if (status === 'rejected') return '已驳回待重新提交'
  if (status === 'draft') return '草稿'
  return status || '待审核'
}

export function countPendingScripts(mp: Record<string, unknown> | null | undefined): number {
  if (!mp || !isScriptReviewPlatform(mp.platform)) return 0
  const ids = new Set((Array.isArray(mp.selectedApplicantIds) ? mp.selectedApplicantIds : []).map(String))
  const list = Array.isArray(mp.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
  return list.filter((a) => {
    if (!a) return false
    if (!(a.prSelected || a.merchantSelected || ids.has(String(a.id)))) return false
    if (a.taskStatus === 'rejected') return false
    const url = String(a.scriptUrl || a.scriptLinkUrl || '').trim()
    if (!url) return false
    const s = String(a.scriptStatus ?? '').trim()
    if (s === 'draft') return false
    return s === 'pending' || !s
  }).length
}
