import type {
  RegistryMpRecruitmentApplicant,
  RegistryMpRecruitmentOrder,
  RegistryMpTalentMember,
  RegistrySnapshot,
} from './opsRegistryTypes.js'
import { appendMpTalentInboxInSnapshot, type MpTalentInboxEntryInput } from './mpTalentInboxMutations.js'
import { isIceMpOrder, maybeAdvanceIceMpToSettlement, syncEditSlotReviewFromApplicant } from './mpRecruitmentIceCore.js'
import { verifyRecruitmentPublishWithAi } from './recruitmentPublishLinkVerifyCore.js'
import { isEditTeamIceMpOrder } from './iceOrderDetect.js'

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

export function patchApplicantVideoDraft(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  videoUrl: string,
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  const url = String(videoUrl || '').trim()
  if (!aid || !url) return { ok: false, error: 'invalid_draft' }
  const target = (mp.applicants || []).find((a) => String(a.id) === aid)
  if (!target) return { ok: false, error: 'applicant_not_found' }
  const status = String(target.videoStatus || '')
  if (status === 'pending' || status === 'passed') return { ok: false, error: 'cannot_draft_in_review' }
  const applicants = (mp.applicants || []).map((a) => {
    if (String(a.id) !== aid) return a
    return {
      ...a,
      videoUrl: url,
      videoStatus: 'draft' as const,
      videoRejectReason: undefined,
    }
  })
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() } }
}

export function patchApplicantVideoSubmit(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  videoUrl?: string,
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  const aid = String(applicantId || '').trim()
  if (!aid) return { ok: false, error: 'invalid_submit' }
  const target = (mp.applicants || []).find((a) => String(a.id) === aid)
  if (!target) return { ok: false, error: 'applicant_not_found' }
  const status = String(target.videoStatus || '')
  const url = String(videoUrl || target.videoUrl || '').trim()
  if (!url) return { ok: false, error: 'no_video' }
  if (status === 'pending') return { ok: false, error: 'already_submitted' }
  if (status === 'passed') return { ok: false, error: 'already_passed' }
  if (status === 'rejected') return { ok: false, error: 'reupload_required' }
  if (status !== 'draft' && status !== '') return { ok: false, error: 'invalid_submit_state' }
  const applicants = (mp.applicants || []).map((a) => {
    if (String(a.id) !== aid) return a
    const prevCount = Math.max(0, Number(a.videoSubmitCount || 0))
    return {
      ...a,
      videoUrl: url,
      videoStatus: 'pending' as const,
      videoRejectReason: undefined,
      videoSubmittedAt: nowCn(),
      videoSubmitCount: prevCount + 1,
      aiVerifyStatus: 'pending' as const,
      aiVerifyNote: '待 PR 审核',
    }
  })
  return { ok: true, mp: { ...mp, applicants, updatedAt: nowCn() } }
}

function isVisitFileVideoPrPass(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant,
  action: 'pass' | 'reject',
): boolean {
  if (action !== 'pass' || isIceMpOrder(mp)) return false
  const fileUrl = String(applicant.videoUrl || '').trim()
  const publishUrl = String(applicant.douyinPublishUrl || '').trim()
  if (publishUrl) return false
  return !!fileUrl
}

export function canTalentSubmitVisitPublishLink(
  mp: RegistryMpRecruitmentOrder,
  applicant: RegistryMpRecruitmentApplicant | null | undefined,
): boolean {
  if (!applicant || isIceMpOrder(mp)) return false
  if (String(applicant.videoStatus || '') !== 'passed') return false
  if (String(applicant.completedAt || '').trim()) return false
  const link = String(applicant.douyinPublishUrl || '').trim()
  if (!link) return true
  return applicant.aiVerifyStatus === 'failed'
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
    const isIceLink = !!(a.douyinPublishUrl?.trim() && isIceMpOrder(mp))
    const visitFilePass = isVisitFileVideoPrPass(mp, a, action)
    target = {
      ...a,
      videoStatus: action === 'pass' ? ('passed' as const) : ('rejected' as const),
      videoRejectReason: action === 'reject' ? String(rejectReason || '请修改后重新提交').trim() : undefined,
      aiVerifyStatus:
        action === 'pass'
          ? visitFilePass
            ? ('pending' as const)
            : ('passed' as const)
          : ('failed' as const),
      aiVerifyNote:
        action === 'pass'
          ? isIceLink
            ? 'PR 已通过链接审核'
            : visitFilePass
              ? '视频已通过，请回传发布链接'
              : '视频已通过审核'
          : String(rejectReason || (isIceLink ? '链接未通过审核' : '视频未通过审核')),
      completedAt:
        action === 'pass' && !visitFilePass
          ? new Date().toLocaleString('zh-CN', { hour12: false })
          : visitFilePass
            ? undefined
            : a.completedAt,
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
  const isIceLink = !!(reviewedApplicant.douyinPublishUrl?.trim() && isIceMpOrder(mp))
  const visitAwaitingPublish =
    passed &&
    !isIceMpOrder(mp) &&
    !isIceLink &&
    reviewedApplicant.videoStatus === 'passed' &&
    !String(reviewedApplicant.completedAt || '').trim()
  const title = passed
    ? visitAwaitingPublish
      ? '探店视频已通过'
      : isIceLink
        ? '云剪链接已通过'
        : '探店视频已通过'
    : isIceLink
      ? '云剪链接需重新提交'
      : '探店视频需重新上传'
  const reason = String(rejectReason || '').trim()
  const submitNo = Math.max(1, Number(reviewedApplicant.videoSubmitCount || 0) || 1)
  const submitLabel = `（第 ${submitNo} 次提交）`
  const body = passed
    ? visitAwaitingPublish
      ? `您在「${orderTitle}」提交的视频已通过 PR 审核${submitLabel}。请发布作品并回传平台链接，AI 核查通过后订单完结。`
      : isIceLink
        ? `您在「${orderTitle}」提交的抖音链接已通过 PR 审核${submitLabel}。`
        : `您在「${orderTitle}」提交的视频已通过 PR 审核${submitLabel}。`
    : isIceLink
      ? `您在「${orderTitle}」提交的抖音链接未通过审核${submitLabel}。${reason ? `驳回原因：${reason}` : ''} 请在「我的报名」重新提交链接。`
      : `您在「${orderTitle}」提交的视频未通过审核${submitLabel}。${reason ? `驳回原因：${reason}` : ''} 请在「我的报名」重新上传视频。`

  const entries: MpTalentInboxEntryInput[] = []
  const seen = new Set<string>()
  const pushEntry = (
    applicant: RegistryMpRecruitmentApplicant,
    customTitle?: string,
    customBody?: string,
    opts?: { noticeType?: MpTalentInboxEntryInput['noticeType']; pinned?: boolean },
  ) => {
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
      noticeType: opts?.noticeType ?? (passed ? 'general' : undefined),
      pinned: opts?.pinned,
    })
  }

  pushEntry(reviewedApplicant, undefined, undefined, {
    noticeType: passed ? 'general' : 'video_reject',
    pinned: passed ? undefined : true,
  })

  const members = Array.isArray(reg.mpTalentMembers) ? reg.mpTalentMembers : []
  const selected = new Set(selectedApplicantIds(mp))
  for (const a of mp.applicants || []) {
    if (String(a.id) === String(reviewedApplicant.id)) continue
    if (!selected.has(String(a.id))) continue
    const member = resolveMemberForApplicant(a, members)
    const role = memberRoleLabel(member)
    if (role === '达人') continue
    const roleBody = passed
      ? isIceLink
        ? `「${orderTitle}」中达人 ${ownerName} 的抖音链接已通过 PR 审核。`
        : `「${orderTitle}」中达人 ${ownerName} 的视频已通过 PR 审核。`
      : isIceLink
        ? `「${orderTitle}」中达人 ${ownerName} 的抖音链接未通过审核，${reason ? `原因：${reason}。` : ''}请关注后续重提进度。`
        : `「${orderTitle}」中达人 ${ownerName} 的视频未通过审核，${reason ? `原因：${reason}。` : ''}请关注后续重传进度。`
    pushEntry(a, passed ? `${role}通知：${isIceLink ? '链接已通过' : '视频已通过'}` : `${role}通知：${isIceLink ? '链接已驳回' : '视频已驳回'}`, roleBody)
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
  let nextMp = patched.mp
  if (action === 'pass' && isIceMpOrder(nextMp)) {
    if (isEditTeamIceMpOrder(nextMp as unknown as Record<string, unknown>)) {
      nextMp = syncEditSlotReviewFromApplicant(nextMp, applicantId, 'pass')
    } else {
      nextMp = maybeAdvanceIceMpToSettlement(nextMp)
    }
  } else if (action === 'reject' && isEditTeamIceMpOrder(nextMp as unknown as Record<string, unknown>)) {
    nextMp = syncEditSlotReviewFromApplicant(nextMp, applicantId, 'reject')
  }
  data.mpRecruitmentOrders[idx] = nextMp
  const inbox = buildVideoReviewInboxEntries(data, patched.mp, patched.applicant, action, rejectReason)
  if (inbox.length) {
    const appended = appendMpTalentInboxInSnapshot(data, inbox)
    if (!appended.ok) return { ok: false, error: appended.error, status: appended.status }
  }
  return { ok: true }
}

export function applyVideoDraftToSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  applicantId: string,
  videoUrl: string,
): { ok: true } | { ok: false; error: string; status: number } {
  const id = String(mpOrderId || '').trim()
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) return { ok: false, error: 'not_found', status: 404 }
  const cur = data.mpRecruitmentOrders[idx]!
  const patched = patchApplicantVideoDraft(cur, applicantId, videoUrl)
  if (!patched.ok) return { ok: false, error: patched.error, status: 400 }
  data.mpRecruitmentOrders[idx] = patched.mp
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

export async function submitVisitPublishLinkForApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  publishUrlInput: string,
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<
  | { ok: true; mp: RegistryMpRecruitmentOrder; applicant: RegistryMpRecruitmentApplicant; message: string }
  | { ok: false; error: string; mp?: RegistryMpRecruitmentOrder }
> {
  if (isIceMpOrder(mp)) return { ok: false, error: '云剪单请使用云剪回传接口' }
  const aid = String(applicantId || '').trim()
  const raw = String(publishUrlInput || '').trim()
  if (!aid || !raw) return { ok: false, error: '请填写发布链接' }

  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => String(a.id) === aid)
  if (idx < 0) return { ok: false, error: '未找到报名记录' }
  const app = applicants[idx]!
  if (String(app.videoStatus || '') !== 'passed') {
    return { ok: false, error: '请先上传视频并通过 PR 审核后再回传链接' }
  }
  if (String(app.completedAt || '').trim()) {
    return { ok: false, error: '该单已完成' }
  }

  const aiCheck = await verifyRecruitmentPublishWithAi(mp, app, raw, env)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  if (!aiCheck.passed) {
    applicants[idx] = {
      ...app,
      aiVerifyStatus: 'failed',
      aiVerifyNote: aiCheck.note,
      videoRejectReason: aiCheck.note,
      douyinPublishUrl: undefined,
    }
    return {
      ok: false,
      error: aiCheck.note,
      mp: { ...mp, applicants, updatedAt: now },
    }
  }

  const prevCount = Math.max(0, Number(app.videoSubmitCount || 0))
  const nextApplicant: RegistryMpRecruitmentApplicant = {
    ...app,
    douyinPublishUrl: aiCheck.normalizedUrl,
    aiVerifyStatus: 'passed',
    aiVerifyNote: aiCheck.note,
    videoRejectReason: undefined,
    videoSubmitCount: prevCount + 1,
    videoSubmittedAt: now,
    completedAt: now,
  }
  applicants[idx] = nextApplicant
  const nextMp: RegistryMpRecruitmentOrder = { ...mp, applicants, updatedAt: now }
  return { ok: true, mp: nextMp, applicant: nextApplicant, message: aiCheck.note }
}

export function applyVisitPublishLinkToSnapshot(
  data: RegistrySnapshot,
  mpOrderId: string,
  applicantId: string,
  publishUrlInput: string,
  env: Record<string, string> = process.env as Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const id = String(mpOrderId || '').trim()
  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === id) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) {
    return Promise.resolve({ ok: false, error: 'not_found', status: 404 })
  }
  const cur = data.mpRecruitmentOrders[idx]!
  return submitVisitPublishLinkForApplicant(cur, applicantId, publishUrlInput, env).then((result) => {
    if (!result.ok) {
      if (result.mp) data.mpRecruitmentOrders![idx] = result.mp
      return { ok: false as const, error: result.error, status: 400 }
    }
    data.mpRecruitmentOrders![idx] = result.mp
    const orderTitle = String(result.mp.title || result.mp.id)
    const inbox = appendMpTalentInboxInSnapshot(data, [
      {
        talentMemberId: inboxTargetFromApplicant(result.applicant, data).talentMemberId,
        contact: inboxTargetFromApplicant(result.applicant, data).contact,
        platformAccount: inboxTargetFromApplicant(result.applicant, data).platformAccount,
        applicantId: String(result.applicant.id || ''),
        mpOrderId: result.mp.id,
        category: 'business',
        title: '探店作品已完结',
        body: `您在「${orderTitle}」回传的发布链接已通过 AI 核查，订单已完结。`,
        noticeType: 'general',
      },
    ])
    if (!inbox.ok) return { ok: false as const, error: inbox.error, status: inbox.status }
    return { ok: true as const }
  })
}
