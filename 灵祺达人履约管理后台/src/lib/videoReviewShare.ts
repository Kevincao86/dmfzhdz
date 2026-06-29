const ERP_API =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MEOO_API_UPSTREAM) ||
  'https://mofangdianai.com/erp-api'

export type ShareAnnotation = {
  id: string
  applicantId: string
  visitorName: string
  frameTimeSec: number | null
  rectX: number
  rectY: number
  rectW: number
  rectH: number
  commentText: string
  createdAt: string
}

export type ShareVideo = {
  applicantId: string
  displayName: string
  videoUrl: string
  videoStatus: string
  videoSubmittedAt: string
}

async function postShare(body: Record<string, unknown>) {
  const res = await fetch(`${ERP_API.replace(/\/$/, '')}/api/meoo-mp-video-review-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as Record<string, unknown>
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.error || data.detail || res.status))
  }
  return data
}

export function formatShareTimeLabel(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export async function createVideoReviewShareLink(mpOrderId: string) {
  const data = await postShare({ action: 'create', mpOrderId })
  return {
    token: String(data.token || ''),
    shareUrl: String(data.shareUrl || ''),
    expiresAt: String(data.expiresAt || ''),
  }
}

export async function revokeVideoReviewShareLink(mpOrderId: string) {
  await postShare({ action: 'revoke', mpOrderId })
}

export async function fetchVideoReviewShareFeedback(mpOrderId: string) {
  const data = await postShare({ action: 'list_feedback', mpOrderId })
  const annotations = (Array.isArray(data.annotations) ? data.annotations : []) as ShareAnnotation[]
  return {
    annotations,
    shareUrl: data.shareUrl ? String(data.shareUrl) : null,
    expiresAt: data.expiresAt ? String(data.expiresAt) : null,
  }
}

export async function fetchPublicVideoReviewShare(token: string) {
  const data = await postShare({ action: 'public_get', token })
  return {
    mpOrderId: String(data.mpOrderId || ''),
    title: String(data.title || ''),
    expiresAt: String(data.expiresAt || ''),
    videos: (Array.isArray(data.videos) ? data.videos : []) as ShareVideo[],
    annotations: (Array.isArray(data.annotations) ? data.annotations : []) as ShareAnnotation[],
  }
}

export async function addPublicVideoReviewAnnotation(input: {
  token: string
  applicantId: string
  visitorName: string
  commentText: string
  frameTimeSec?: number | null
  rectX?: number
  rectY?: number
  rectW?: number
  rectH?: number
}) {
  const data = await postShare({ action: 'add_annotation', ...input })
  return data.annotation as ShareAnnotation
}

export function groupAnnotationsByApplicant(annotations: ShareAnnotation[]) {
  const map: Record<string, ShareAnnotation[]> = {}
  for (const a of annotations) {
    if (!map[a.applicantId]) map[a.applicantId] = []
    map[a.applicantId].push(a)
  }
  return map
}
