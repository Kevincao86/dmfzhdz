import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { isIceMpOrder } from './iceOrderDetect.js'
import { withSyncedApplicantCount } from './mpRecruitCount.js'

export type CancelMpRecruitmentApplyResult =
  | { ok: true; data: RegistryFile; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; message?: string; code?: string }

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

/** 达人是否可在「已报名」阶段取消报名（服务端校验） */
export function canTalentCancelMpApplication(
  mp: Record<string, unknown> | null,
  applicant: Record<string, unknown> | null,
  mpOrderId?: string,
): boolean {
  if (!mp || !applicant) return false
  if (String(applicant.taskStatus || '') === 'rejected') return false

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

export function cancelMpRecruitmentApplicationInSnapshot(
  data: RegistryFile,
  mpOrderId: string,
  applicantId: string,
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
  if (!canTalentCancelMpApplication(cur as unknown as Record<string, unknown>, applicant as unknown as Record<string, unknown>, orderId)) {
    return {
      ok: false,
      status: 403,
      error: 'cancel_not_allowed',
      code: 'cancel_not_allowed',
      message: '当前状态不可取消报名',
    }
  }

  applicants.splice(appIdx, 1)
  const selectedApplicantIds = (cur.selectedApplicantIds ?? []).filter((id) => String(id) !== appId)
  const notifiedApplicantIds = (cur.notifiedApplicantIds ?? []).filter((id) => String(id) !== appId)
  const iceVideoSlots = isIceMpOrder(cur) ? releaseIceSlotsForApplicant(cur, appId) : cur.iceVideoSlots

  cur = withSyncedApplicantCount({
    ...cur,
    applicants,
    selectedApplicantIds,
    notifiedApplicantIds,
    iceVideoSlots,
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  })
  data.mpRecruitmentOrders[idx] = cur

  return {
    ok: true,
    data,
    body: { ok: true, mpOrderId: orderId, applicantId: appId, cancelled: true },
  }
}
