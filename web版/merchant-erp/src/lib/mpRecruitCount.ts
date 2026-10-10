import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

function readNonNeg(value: unknown): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * 已报名人数。
 * 站内报名看 applicants；转发工具的原表/群码跳转记在 formRelayClickCount。
 * 大厅瘦身可能只留下本人那一行 applicants，这时已写好的 applicantCount 更大，取高的那个。
 */
export function resolveApplicantCountFromMp(
  mp: Pick<RegistryMpRecruitmentOrder, 'applicants' | 'applicantCount' | 'formRelayClickCount'> | null | undefined,
): number {
  if (!mp || typeof mp !== 'object') return 0
  const apps = Array.isArray(mp.applicants) ? mp.applicants.length : 0
  const stored = readNonNeg(mp.applicantCount)
  const clicks = readNonNeg(mp.formRelayClickCount)
  if (apps > 0) return Math.max(apps + clicks, stored)
  return Math.max(stored, clicks)
}

/** 写入 registry 时与 applicants 数组保持一致，避免 slim 后仅留错误的 applicantCount=0 */
export function withSyncedApplicantCount<T extends RegistryMpRecruitmentOrder>(order: T): T {
  const count = resolveApplicantCountFromMp(order)
  return { ...order, applicantCount: count }
}
