import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

/** 已报名人数：优先 applicants 数组，回退 applicantCount 字段（大厅轻量接口） */
export function resolveApplicantCountFromMp(
  mp: Pick<RegistryMpRecruitmentOrder, 'applicants' | 'applicantCount'> | null | undefined,
): number {
  if (!mp || typeof mp !== 'object') return 0
  const apps = Array.isArray(mp.applicants) ? mp.applicants : []
  if (apps.length > 0) return apps.length
  const n = Number.parseInt(String(mp.applicantCount ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** 写入 registry 时与 applicants 数组保持一致，避免 slim 后仅留错误的 applicantCount=0 */
export function withSyncedApplicantCount<T extends RegistryMpRecruitmentOrder>(order: T): T {
  const count = resolveApplicantCountFromMp(order)
  return { ...order, applicantCount: count }
}
