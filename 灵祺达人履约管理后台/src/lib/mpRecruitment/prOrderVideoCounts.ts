/** 我的发单：待审核视频数（驳回后不计入，重新提交后再计入） */
export function applicantVideoUrl(a: Record<string, unknown> | null | undefined): string {
  if (!a) return ''
  return String(a.videoUrl || a.douyinPublishUrl || '').trim()
}

export function countPendingVideos(mp: Record<string, unknown> | null | undefined): number {
  if (!mp || !Array.isArray(mp.applicants)) return 0
  return (mp.applicants as Record<string, unknown>[]).filter((a) => {
    if (!a || !applicantVideoUrl(a)) return false
    return String(a.videoStatus || 'pending') === 'pending'
  }).length
}
