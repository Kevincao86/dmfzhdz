const TRAINING_API = [
  'https://mofangdianai.com/erp-api/meoo-mp-training',
  'https://dr.mofangdianai.com/erp-api/meoo-mp-training',
]

export type TrainingCourseRow = {
  id: string
  title: string
  hostId?: string
  hostName: string
  mode: 'online' | 'offline'
  city?: string
  address?: string
  contactName?: string
  contactWay?: string
  fee?: string
  note?: string
  poster?: string
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  reviewNote?: string
  createdAt?: string
}

export type LecturerRow = {
  hostId: string
  name?: string
  city?: string
  platforms?: string
  skills?: string
  years?: string
  intro?: string
  lecturerStatus?: 'pending' | 'approved' | 'rejected' | 'none'
  lecturerNote?: string
  updatedAt?: string
}

async function trainingFetch(query: string, init?: RequestInit) {
  let last = '培训接口没有连上'
  for (const base of TRAINING_API) {
    try {
      return await fetch(`${base}${query}`, { ...init, cache: 'no-store' })
    } catch (e) {
      last = e instanceof Error && e.message !== 'Failed to fetch' ? e.message : '培训接口没有连上'
    }
  }
  throw new Error(last)
}

export async function loadTrainingReview() {
  const res = await trainingFetch('?review=1')
  const data = (await res.json()) as { ok?: boolean; error?: string; courses?: TrainingCourseRow[]; profiles?: LecturerRow[] }
  if (!res.ok || data.ok === false) throw new Error(data.error || '加载失败')
  return {
    courses: Array.isArray(data.courses) ? data.courses : [],
    lecturers: Array.isArray(data.profiles) ? data.profiles : [],
  }
}

export async function postTrainingReview(body: Record<string, unknown>) {
  const res = await trainingFetch('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { ok?: boolean; error?: string }
  if (!res.ok || data.ok === false) throw new Error(data.error || '审核失败')
}

export function reviewBucket(status?: string): 'pending' | 'approved' | 'rejected' {
  if (status === 'rejected') return 'rejected'
  if (status === 'approved') return 'approved'
  return 'pending'
}
