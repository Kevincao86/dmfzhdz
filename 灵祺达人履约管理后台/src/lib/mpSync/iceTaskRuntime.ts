import { apiUrl, mpErpApiBase } from '../mpApiBase'
import { isIceMpOrder } from '../mpRecruitment/orderCard'
import { getToken } from '../mpSession'
import { findMyApplicant } from './talentContactPrGate'

export type IceApplicantState = {
  isIce: boolean
  applicantId: string
  assignedVideoUrl: string
  assignedVideoLabel: string
  iceVerified: boolean
  icePendingConfirm: boolean
  iceRejected: boolean
  douyinPublishUrl: string
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
      douyinPublishUrl: '',
    }
  }
  const assignedVideoUrl = String(applicant.assignedVideoDownloadUrl || '').trim()
  const assignedVideoLabel = String(applicant.assignedVideoLabel || '').trim()
  const iceVerified = applicant.aiVerifyStatus === 'passed'
  const iceRejected = applicant.taskStatus === 'rejected'
  const icePendingConfirm =
    applicant.taskStatus === 'pending_confirm' || (!applicant.taskStatus && !assignedVideoUrl)
  return {
    isIce,
    applicantId,
    assignedVideoUrl,
    assignedVideoLabel,
    iceVerified,
    icePendingConfirm,
    iceRejected,
    douyinPublishUrl: String(applicant.douyinPublishUrl || '').trim(),
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
