/** 我的发单：待审核视频数（驳回后不计入，重新提交后再计入） */
export function applicantVideoUrl(a: Record<string, unknown> | null | undefined): string {
  if (!a) return ''
  return String(a.videoUrl || a.douyinPublishUrl || '').trim()
}

export function applicantVideoStatusRaw(a: Record<string, unknown> | null | undefined): string {
  return String(a?.videoStatus ?? '').trim()
}

/** 达人仅上传草稿、尚未点「提交」— PR 侧不可见 */
export function isApplicantVideoDraftStatus(status: unknown): boolean {
  return String(status ?? '').trim() === 'draft'
}

/** 是否进入 PR 视频审核列表（排除 draft；已驳回须保留展示） */
export function isApplicantVideoVisibleOnPrReview(
  a: Record<string, unknown> | null | undefined,
  isIce = false,
): boolean {
  if (!a) return false
  const status = applicantVideoStatusRaw(a)
  if (isApplicantVideoDraftStatus(status)) return false
  if (status === 'rejected') return true
  const url = isIce
    ? String(a.videoUrl || a.douyinPublishUrl || '').trim()
    : String(a.videoUrl || '').trim()
  return !!url
}

/** 待 PR 审核（pending；历史空 status 视为已提交待审） */
export function isApplicantVideoPendingPrReview(status: unknown): boolean {
  const s = String(status ?? '').trim()
  if (s === 'draft') return false
  if (s === 'pending') return true
  if (!s) return true
  return false
}

export function countPendingVideos(mp: Record<string, unknown> | null | undefined): number {
  if (!mp || !Array.isArray(mp.applicants)) return 0
  return (mp.applicants as Record<string, unknown>[]).filter((a) => {
    if (!isApplicantVideoVisibleOnPrReview(a)) return false
    return isApplicantVideoPendingPrReview(a.videoStatus)
  }).length
}

/** 与视频审核页「总视频」一致：已提交 PR 审核流程的视频/链接条数（不含 draft） */
export function countVideos(mp: Record<string, unknown> | null | undefined): number {
  if (!mp || !Array.isArray(mp.applicants)) return 0
  return (mp.applicants as Record<string, unknown>[]).filter((a) => isApplicantVideoVisibleOnPrReview(a)).length
}
