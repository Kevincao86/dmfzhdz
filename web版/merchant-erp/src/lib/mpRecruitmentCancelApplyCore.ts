import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isIceMpOrder } from './iceOrderDetect.js'
import { withSyncedApplicantCount } from './mpRecruitCount.js'

export type CancelMpRecruitmentApplyResult =
  | { ok: true; data: RegistryFile; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; message?: string; code?: string }

function parseTs(text: unknown): number {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function pickField(summary: string, key: string): string {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

/** 与 listFilters.resolveSignupDeadlineMsFromMp 一致，用于判断是否需 PR 审核取消 */
export function resolveSignupDeadlineMsForCancel(mp: Record<string, unknown>): number {
  const summary = [mp.recruitmentInfo, mp.taskDetail, mp.merchantRequirements].filter(Boolean).join('\n')
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : null
  const fromSignup = parseTs(meta?.signupDeadline) || parseTs(pickField(summary, '报名截止'))
  if (fromSignup > 0) return fromSignup
  const deliveryMs = parseTs(meta?.deliveryDeadline) || parseTs(pickField(summary, '交付截止'))
  const deadlineField = parseTs(mp.deadline)
  if (deadlineField > 0 && (!deliveryMs || deadlineField !== deliveryMs)) return deadlineField
  const pub = parseTs(mp.createdAt || mp.updatedAt)
  if (mp.urgent && pub > 0) return pub + 86400000
  return pub > 0 ? pub + 7 * 86400000 : 0
}

export function isMpSignupDeadlinePassedForCancel(
  mp: Record<string, unknown>,
  nowMs = Date.now(),
): boolean {
  const deadlineMs = resolveSignupDeadlineMsForCancel(mp)
  return deadlineMs > 0 && nowMs >= deadlineMs
}

function isApplicantPassed(applicant: Record<string, unknown>, isIce = false): boolean {
  if (String(applicant.completedAt || '').trim()) return true
  if (isIce) {
    if (applicant.aiVerifyStatus === 'passed') return true
    if (applicant.videoStatus === 'passed' && String(applicant.douyinPublishUrl || '').trim()) return true
  }
  return false
}

function isApplicantPrSelected(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null | undefined,
): boolean {
  if (!applicant) return false
  if (applicant.prSelected === true || applicant.merchantSelected === true) return true
  const ids = Array.isArray(mp?.selectedApplicantIds) ? (mp!.selectedApplicantIds as unknown[]) : []
  return ids.map(String).includes(String(applicant.id || ''))
}

function isApplicantSelectionNotified(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null | undefined,
): boolean {
  if (!applicant || !mp) return false
  const id = String(applicant.id || '').trim()
  if (!id) return false
  const ids = Array.isArray(mp.notifiedApplicantIds) ? (mp.notifiedApplicantIds as unknown[]) : []
  return ids.map(String).includes(id)
}

export function isApplicantCancelRequestPending(
  applicant: Record<string, unknown> | null | undefined,
): boolean {
  return String(applicant?.cancelRequestStatus || '').trim() === 'pending'
}

/** 达人是否可在「已报名」阶段取消报名 / 提交取消申请（服务端校验） */
export function canTalentCancelMpApplication(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): boolean {
  if (!mp || !applicant) return false
  if (String(applicant.taskStatus || '') === 'rejected') return false
  if (isApplicantCancelRequestPending(applicant)) return false

  const isIce = isIceMpOrder(mp) || /^MP-ICE-/i.test(String(mpOrderId || mp.id || ''))
  if (isApplicantPassed(applicant, isIce)) return false

  if (isIce) {
    const taskStatus = String(applicant.taskStatus || '')
    if (taskStatus === 'confirmed') return false
    return (
      taskStatus === 'pending_confirm' ||
      taskStatus === 'applied' ||
      (!taskStatus && !String(applicant.assignedVideoDownloadUrl || '').trim())
    )
  }

  if (isApplicantPrSelected(mp, applicant)) return false
  if (isApplicantSelectionNotified(mp, applicant)) return false
  return true
}

function releaseIceSlotsForApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
): RegistryMpRecruitmentOrder['iceVideoSlots'] {
  const applicants = mp.applicants ?? []
  const app = applicants.find((a) => a.id === applicantId)
  if (!app) return mp.iceVideoSlots ?? []

  let slots = [...(mp.iceVideoSlots ?? [])]
  const slotIds = app.assignedIceSlotIds?.length
    ? app.assignedIceSlotIds
    : app.assignedIceSlotId
      ? [app.assignedIceSlotId]
      : []
  for (const sid of slotIds) {
    const si = slots.findIndex((s) => s.slotId === sid)
    if (si >= 0) {
      slots[si] = {
        ...slots[si]!,
        assignedApplicantId: undefined,
        assignedAt: undefined,
        deliverUrl: undefined,
        deliverStatus: undefined,
      }
    }
  }
  if (!slotIds.length) {
    slots = slots.map((s) =>
      String(s.assignedApplicantId || '') === applicantId
        ? {
            ...s,
            assignedApplicantId: undefined,
            assignedAt: undefined,
            deliverUrl: undefined,
            deliverStatus: undefined,
          }
        : s,
    )
  }
  return slots
}

function removeApplicantFromOrder(
  cur: RegistryMpRecruitmentOrder,
  appId: string,
): RegistryMpRecruitmentOrder {
  const applicants = [...(cur.applicants ?? [])]
  const appIdx = applicants.findIndex((a) => a.id === appId)
  if (appIdx < 0) return cur
  applicants.splice(appIdx, 1)
  const selectedApplicantIds = (cur.selectedApplicantIds ?? []).filter((id) => String(id) !== appId)
  const notifiedApplicantIds = (cur.notifiedApplicantIds ?? []).filter((id) => String(id) !== appId)
  const iceVideoSlots = isIceMpOrder(cur) ? releaseIceSlotsForApplicant(cur, appId) : cur.iceVideoSlots
  return withSyncedApplicantCount({
    ...cur,
    applicants,
    selectedApplicantIds,
    notifiedApplicantIds,
    iceVideoSlots,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
}

export function cancelMpRecruitmentApplicationInSnapshot(
  data: RegistryFile,
  mpOrderId: string,
  applicantId: string,
  nowMs = Date.now(),
): CancelMpRecruitmentApplyResult {
  const orderId = String(mpOrderId || '').trim()
  const appId = String(applicantId || '').trim()
  if (!orderId || !appId) {
    return { ok: false, status: 400, error: 'invalid_cancel', message: '参数不完整' }
  }

  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === orderId) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) {
    return { ok: false, status: 404, error: 'not_found', message: '商单不存在' }
  }

  let cur = data.mpRecruitmentOrders[idx]!
  const applicants = [...(cur.applicants ?? [])]
  const appIdx = applicants.findIndex((a) => a.id === appId)
  if (appIdx < 0) {
    return { ok: false, status: 404, error: 'applicant_not_found', message: '未找到报名记录' }
  }

  const applicant = applicants[appIdx]!
  const mpRec = cur as unknown as Record<string, unknown>
  const appRec = applicant as unknown as Record<string, unknown>

  if (isApplicantCancelRequestPending(appRec)) {
    return {
      ok: true,
      data,
      body: {
        ok: true,
        mpOrderId: orderId,
        applicantId: appId,
        cancelled: false,
        cancelRequested: true,
        needsPrReview: true,
        message: '取消申请已提交，等待 PR 审核',
      },
    }
  }

  if (!canTalentCancelMpApplication(mpRec, appRec, orderId)) {
    return {
      ok: false,
      status: 403,
      error: 'cancel_not_allowed',
      code: 'cancel_not_allowed',
      message: '当前状态不可取消报名',
    }
  }

  const needsPrReview = isMpSignupDeadlinePassedForCancel(mpRec, nowMs)
  if (needsPrReview) {
    const nowLabel = new Date(nowMs).toLocaleString('zh-CN', { hour12: false })
    applicants[appIdx] = {
      ...applicant,
      cancelRequestStatus: 'pending',
      cancelRequestedAt: nowLabel,
      cancelRequestReviewedAt: undefined,
      cancelRequestRejectReason: undefined,
    }
    cur = withSyncedApplicantCount({
      ...cur,
      applicants,
      updatedAt: nowLabel,
    })
    data.mpRecruitmentOrders[idx] = cur
    return {
      ok: true,
      data,
      body: {
        ok: true,
        mpOrderId: orderId,
        applicantId: appId,
        cancelled: false,
        cancelRequested: true,
        needsPrReview: true,
        message: '报名已截止，取消申请已提交，待 PR 审核确认',
      },
    }
  }

  cur = removeApplicantFromOrder(cur, appId)
  data.mpRecruitmentOrders[idx] = cur

  return {
    ok: true,
    data,
    body: { ok: true, mpOrderId: orderId, applicantId: appId, cancelled: true },
  }
}

export function reviewCancelMpRecruitmentApplicationInSnapshot(
  data: RegistryFile,
  mpOrderId: string,
  applicantId: string,
  action: 'approve' | 'reject',
  rejectReason?: string,
): CancelMpRecruitmentApplyResult {
  const orderId = String(mpOrderId || '').trim()
  const appId = String(applicantId || '').trim()
  if (!orderId || !appId) {
    return { ok: false, status: 400, error: 'invalid_review', message: '参数不完整' }
  }
  if (action !== 'approve' && action !== 'reject') {
    return { ok: false, status: 400, error: 'invalid_action', message: '无效操作' }
  }

  const idx = data.mpRecruitmentOrders?.findIndex((o) => o.id === orderId) ?? -1
  if (!data.mpRecruitmentOrders || idx < 0) {
    return { ok: false, status: 404, error: 'not_found', message: '商单不存在' }
  }

  let cur = data.mpRecruitmentOrders[idx]!
  const applicants = [...(cur.applicants ?? [])]
  const appIdx = applicants.findIndex((a) => a.id === appId)
  if (appIdx < 0) {
    return { ok: false, status: 404, error: 'applicant_not_found', message: '未找到报名记录' }
  }

  const applicant = applicants[appIdx]!
  if (String(applicant.cancelRequestStatus || '').trim() !== 'pending') {
    return {
      ok: false,
      status: 409,
      error: 'no_pending_cancel',
      code: 'no_pending_cancel',
      message: '该达人没有待审核的取消申请',
    }
  }

  const nowLabel = new Date().toLocaleString('zh-CN', { hour12: false })

  if (action === 'approve') {
    cur = removeApplicantFromOrder(cur, appId)
    data.mpRecruitmentOrders[idx] = cur
    return {
      ok: true,
      data,
      body: {
        ok: true,
        mpOrderId: orderId,
        applicantId: appId,
        cancelled: true,
        reviewed: 'approve',
      },
    }
  }

  const reason = String(rejectReason || '').trim().slice(0, 200)
  applicants[appIdx] = {
    ...applicant,
    cancelRequestStatus: 'rejected',
    cancelRequestReviewedAt: nowLabel,
    cancelRequestRejectReason: reason || undefined,
  }
  cur = withSyncedApplicantCount({
    ...cur,
    applicants,
    updatedAt: nowLabel,
  })
  data.mpRecruitmentOrders[idx] = cur

  return {
    ok: true,
    data,
    body: {
      ok: true,
      mpOrderId: orderId,
      applicantId: appId,
      cancelled: false,
      reviewed: 'reject',
    },
  }
}
