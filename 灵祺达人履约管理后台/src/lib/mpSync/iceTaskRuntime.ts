import { apiUrl, mpErpApiBase } from '../mpApiBase'
import { isIceMpOrder } from '../mpRecruitment/orderCard'
import { getToken } from '../mpSession'
import { findMyApplicant } from './talentContactPrGate'
import { isEditTeamIceMpOrder } from './iceOrderDetect'

export type IceApplicantState = {
  isIce: boolean
  applicantId: string
  assignedVideoUrl: string
  assignedVideoLabel: string
  iceVerified: boolean
  icePendingConfirm: boolean
  iceRejected: boolean
  icePendingPrReview: boolean
  iceLinkRejected: boolean
  iceAiFailedNote: string
  iceVerifyMode: 'ai' | 'pr'
  iceSubmitLabel: string
  iceStatusHint: string
  douyinPublishUrl: string
  isEditTeamIce: boolean
}

async function postIce(paths: string[], body: Record<string, unknown>) {
  let lastErr = 'request_failed'
  for (const path of paths) {
    try {
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { 'X-Mp-Session': getToken()! } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        lastErr = String(data.message || data.detail || data.error || `http_${res.status}`)
        if (/404|not_found/i.test(lastErr)) continue
        throw new Error(lastErr)
      }
      return data
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (!/404|not_found/i.test(lastErr)) throw e
    }
  }
  throw new Error(lastErr)
}

export function resolveIceDownloadUrl(raw: string): string {
  const url = String(raw || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const base = mpErpApiBase()
  if (!base) return url
  return `${base.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`
}

export function resolveIceApplicantState(
  mp: Record<string, unknown> | null,
  mpOrderId: string,
): IceApplicantState {
  const isIce = mp ? isIceMpOrder(mp) : false
  const applicant = findMyApplicant(mp, mpOrderId)
  const applicantId = applicant ? String(applicant.id || '').trim() : ''
  if (!isIce || !applicant) {
    return {
      isIce,
      applicantId,
      assignedVideoUrl: '',
      assignedVideoLabel: '',
      iceVerified: false,
      icePendingConfirm: false,
      iceRejected: false,
      icePendingPrReview: false,
      iceLinkRejected: false,
      iceAiFailedNote: '',
      iceVerifyMode: 'ai',
      iceSubmitLabel: '提交链接 · AI 核查',
      iceStatusHint: '',
      douyinPublishUrl: '',
      isEditTeamIce: mp ? isEditTeamIceMpOrder(mp) : false,
    }
  }
  const meta =
    mp?.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const iceVerifyMode =
    String(meta.iceVerifyMode || meta.iceAuditMode || 'ai').trim().toLowerCase() === 'pr' ? 'pr' : 'ai'
  const assignedVideoUrl = String(applicant.assignedVideoDownloadUrl || '').trim()
  const assignedVideoLabel = String(applicant.assignedVideoLabel || '').trim()
  const iceVerified =
    applicant.aiVerifyStatus === 'passed' ||
    applicant.videoStatus === 'passed' ||
    !!String(applicant.completedAt || '').trim()
  const iceRejected = applicant.taskStatus === 'rejected'
  const icePendingConfirm =
    applicant.taskStatus === 'pending_confirm' || (!applicant.taskStatus && !assignedVideoUrl)
  const icePendingPrReview = applicant.videoStatus === 'pending' && !iceVerified
  const iceLinkRejected = applicant.videoStatus === 'rejected'
  const iceAiFailedNote =
    applicant.aiVerifyStatus === 'failed'
      ? String(applicant.aiVerifyNote || 'AI核查不通过，视频与订单无关')
      : ''
  const iceSubmitLabel = iceVerifyMode === 'pr' ? '提交链接 · PR 审核' : '提交链接 · AI 核查'
  let iceStatusHint = ''
  if (iceVerified) iceStatusHint = '已完成'
  else if (icePendingPrReview) iceStatusHint = '链接已提交，待 PR 审核'
  else if (iceLinkRejected) iceStatusHint = String(applicant.videoRejectReason || '链接已驳回，请重新提交')
  else if (iceAiFailedNote) iceStatusHint = iceAiFailedNote
  return {
    isIce,
    applicantId,
    assignedVideoUrl,
    assignedVideoLabel,
    iceVerified,
    icePendingConfirm,
    iceRejected,
    icePendingPrReview,
    iceLinkRejected,
    iceAiFailedNote,
    iceVerifyMode,
    iceSubmitLabel,
    iceStatusHint,
    douyinPublishUrl: String(applicant.douyinPublishUrl || '').trim(),
    isEditTeamIce: isEditTeamIceMpOrder(mp),
  }
}

export async function confirmIceTask(mpOrderId: string, applicantId: string, action: 'confirm' | 'reject') {
  await postIce(
    ['/api/meoo-ops-mp-recruitment-ice-confirm', '/api/ops-sync/mp-recruitment-orders/ice-confirm'],
    { mpOrderId, applicantId, action },
  )
}

export async function submitIceDouyin(mpOrderId: string, applicantId: string, douyinPublishUrl: string) {
  await postIce(
    ['/api/meoo-ops-mp-recruitment-ice-submit', '/api/ops-sync/mp-recruitment-orders/ice-submit'],
    { mpOrderId, applicantId, douyinPublishUrl },
  )
}
