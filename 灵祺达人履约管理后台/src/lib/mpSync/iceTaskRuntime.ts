import { apiUrl, mpErpApiBase } from '../mpApiBase'
import { getToken } from '../mpSession'
import { findMyApplicant } from './talentContactPrGate'
import { isEditTeamIceMpOrder, getIceVerifyMode } from './iceOrderDetect'
import { resolveClaimGroupQr } from './iceGroupQr'
import { parseBatchDeliverUrls } from './editDeliverLinks'
import { isIceMpOrder } from '../mpRecruitment/orderCard'

export type IceApplicantState = {
  isIce: boolean
  isEditTeamIce: boolean
  applicantId: string
  assignedVideoUrl: string
  assignedVideoLabel: string
  iceVerified: boolean
  icePendingConfirm: boolean
  iceRejected: boolean
  iceConfirmed: boolean
  icePendingPrReview: boolean
  iceLinkRejected: boolean
  iceAiFailedNote: string
  iceVerifyMode: 'ai' | 'pr'
  iceSubmitLabel: string
  iceStatusHint: string
  douyinPublishUrl: string
  claimedSlotCount: number
  editGroupQrImage: string
  editDeliverLinks: string[]
  editDeliverPending: boolean
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
  reg?: Record<string, unknown> | null,
): IceApplicantState {
  const isIce = mp ? isIceMpOrder(mp) : false
  const isEditTeamIce = mp ? isEditTeamIceMpOrder(mp) : false
  const applicant = findMyApplicant(mp, mpOrderId)
  const applicantId = applicant ? String(applicant.id || '').trim() : ''
  const empty: IceApplicantState = {
    isIce,
    isEditTeamIce,
    applicantId,
    assignedVideoUrl: '',
    assignedVideoLabel: '',
    iceVerified: false,
    icePendingConfirm: false,
    iceRejected: false,
    iceConfirmed: false,
    icePendingPrReview: false,
    iceLinkRejected: false,
    iceAiFailedNote: '',
    iceVerifyMode: 'ai',
    iceSubmitLabel: '提交链接 · AI 核查',
    iceStatusHint: '',
    douyinPublishUrl: '',
    claimedSlotCount: 0,
    editGroupQrImage: '',
    editDeliverLinks: [],
    editDeliverPending: false,
  }
  if (!isIce || !applicant) return empty

  const iceVerifyMode = getIceVerifyMode(mp!)
  const assignedVideoUrl = String(applicant.assignedVideoDownloadUrl || '').trim()
  const assignedVideoLabel = String(applicant.assignedVideoLabel || '').trim()
  const iceVerified =
    applicant.aiVerifyStatus === 'passed' ||
    applicant.videoStatus === 'passed' ||
    !!String(applicant.completedAt || '').trim()
  const iceRejected = applicant.taskStatus === 'rejected'
  const iceConfirmed = applicant.taskStatus === 'confirmed'
  const icePendingConfirm =
    !iceConfirmed &&
    (applicant.taskStatus === 'pending_confirm' ||
      applicant.taskStatus === 'applied' ||
      (!applicant.taskStatus && !assignedVideoUrl && !isEditTeamIce))
  const icePendingPrReview =
    getIceVerifyMode(mp!) === 'pr' && applicant.videoStatus === 'pending' && !iceVerified
  const iceLinkRejected = applicant.videoStatus === 'rejected'
  const iceAiFailedNote =
    applicant.aiVerifyStatus === 'failed'
      ? String(applicant.aiVerifyNote || 'AI核查不通过，视频与订单无关')
      : ''
  const iceSubmitLabel = iceVerifyMode === 'pr' ? '提交链接 · PR 审核' : '提交链接 · AI 核查'
  const assignedSlotIds = applicant.assignedIceSlotIds
  const assignedSlotLen = Array.isArray(assignedSlotIds) ? assignedSlotIds.length : 0
  const claimedSlotCount = Math.max(
    1,
    Number.parseInt(String(applicant.claimedSlotCount ?? (assignedSlotLen || 1)), 10) || 1,
  )
  const editDeliverLinks = Array.isArray(applicant.editDeliverLinks)
    ? (applicant.editDeliverLinks as string[]).map(String)
    : []
  const editDeliverPending =
    isEditTeamIce && iceConfirmed && !iceVerified && editDeliverLinks.length < claimedSlotCount
  const editGroupQrImage =
    isEditTeamIce && iceConfirmed
      ? resolveClaimGroupQr(reg || null, mpOrderId, mp)
      : ''

  let iceStatusHint = ''
  if (iceVerified) iceStatusHint = '已完成'
  else if (isEditTeamIce && iceConfirmed && editDeliverPending) {
    iceStatusHint = `请回传 ${claimedSlotCount} 条成片链接（已提交 ${editDeliverLinks.length} 条）`
  } else if (icePendingPrReview) iceStatusHint = '链接已提交，待 PR 审核'
  else if (iceLinkRejected) iceStatusHint = String(applicant.videoRejectReason || '链接已驳回，请重新提交')
  else if (iceAiFailedNote) iceStatusHint = iceAiFailedNote

  return {
    isIce,
    isEditTeamIce,
    applicantId,
    assignedVideoUrl,
    assignedVideoLabel,
    iceVerified,
    icePendingConfirm,
    iceRejected,
    iceConfirmed,
    icePendingPrReview,
    iceLinkRejected,
    iceAiFailedNote,
    iceVerifyMode,
    iceSubmitLabel,
    iceStatusHint,
    douyinPublishUrl: String(applicant.douyinPublishUrl || '').trim(),
    claimedSlotCount,
    editGroupQrImage,
    editDeliverLinks,
    editDeliverPending,
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

export async function submitEditDeliverLinks(
  mpOrderId: string,
  applicantId: string,
  deliverText: string,
) {
  await postIce(
    ['/api/meoo-ops-mp-recruitment-edit-deliver-submit', '/api/ops-sync/mp-recruitment-edit-deliver-submit'],
    { mpOrderId, applicantId, deliverText },
  )
}

export { parseBatchDeliverUrls }
