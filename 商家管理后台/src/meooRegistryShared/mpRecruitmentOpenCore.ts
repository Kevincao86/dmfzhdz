import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { inferFulfillmentLoop } from './recruitmentLoop.js'

export type ReviewOpenApplicantAction = 'shortlist' | 'approve' | 'reject'

export function reviewOpenMpApplicant(
  mp: RegistryMpRecruitmentOrder,
  applicantId: string,
  action: ReviewOpenApplicantAction,
): { ok: true; mp: RegistryMpRecruitmentOrder } | { ok: false; error: string } {
  if (inferFulfillmentLoop(mp) !== 'open') {
    return { ok: false, error: '仅开环招募单支持报名反选' }
  }
  const applicants = [...(mp.applicants ?? [])]
  const idx = applicants.findIndex((a) => a.id === applicantId)
  if (idx < 0) return { ok: false, error: '未找到报名记录' }

  const nextStatus =
    action === 'shortlist' ? 'shortlisted' : action === 'approve' ? 'approved' : 'rejected'
  applicants[idx] = {
    ...applicants[idx]!,
    taskStatus: nextStatus,
  }
  return {
    ok: true,
    mp: {
      ...mp,
      applicants,
      updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    },
  }
}

export function openApplicantCounts(mp: RegistryMpRecruitmentOrder): {
  total: number
  pending: number
  approved: number
} {
  const apps = mp.applicants ?? []
  return {
    total: apps.length,
    pending: apps.filter((a) => !a.taskStatus || a.taskStatus === 'applied').length,
    approved: apps.filter((a) => a.taskStatus === 'approved' || a.taskStatus === 'shortlisted').length,
  }
}

