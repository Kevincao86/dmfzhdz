import { apiUrl } from './mpApiBase'

const SHARE_API_PATH = '/api/meoo-mp-applicant-pick-share'

export type ApplicantPickShareNote = {
  id: string
  applicantId: string
  visitorName: string
  noteText: string
  updatedAt: string
}

export type ApplicantPickShareTalent = {
  applicantId: string
  displayName: string
  avatarUrl: string
  platform: string
  platformAccount: string
  displayFollowers: string
  displaySalesLevel: string
  profileLink: string
  accountTags: string[]
}

async function postShare(body: Record<string, unknown>) {
  const res = await fetch(apiUrl(SHARE_API_PATH), {
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

export async function createApplicantPickShareLink(mpOrderId: string, applicantIds: string[]) {
  const data = await postShare({ action: 'create', mpOrderId, applicantIds })
  return {
    token: String(data.token || ''),
    applicantIds: Array.isArray(data.applicantIds) ? (data.applicantIds as string[]) : applicantIds,
    shareUrl: String(data.shareUrl || ''),
    mpShareUrl: data.mpShareUrl ? String(data.mpShareUrl) : null,
    expiresAt: String(data.expiresAt || ''),
  }
}

export async function revokeApplicantPickShareLink(mpOrderId: string) {
  await postShare({ action: 'revoke', mpOrderId })
}

export async function fetchApplicantPickShareFeedback(mpOrderId: string) {
  const data = await postShare({ action: 'list_feedback', mpOrderId })
  const notes = (Array.isArray(data.notes) ? data.notes : []) as ApplicantPickShareNote[]
  const byApplicant: Record<string, ApplicantPickShareNote> = {}
  for (const n of notes) {
    if (n.applicantId) byApplicant[n.applicantId] = n
  }
  return {
    notes,
    byApplicant,
    shareUrl: data.shareUrl ? String(data.shareUrl) : null,
    mpShareUrl: data.mpShareUrl ? String(data.mpShareUrl) : null,
    expiresAt: data.expiresAt ? String(data.expiresAt) : null,
    token: data.token ? String(data.token) : null,
    applicantIds: Array.isArray(data.applicantIds) ? (data.applicantIds as string[]) : [],
  }
}

export async function fetchPublicApplicantPickShare(token: string) {
  const data = await postShare({ action: 'public_get', token })
  return {
    mpOrderId: String(data.mpOrderId || ''),
    title: String(data.title || ''),
    expiresAt: String(data.expiresAt || ''),
    applicantIds: Array.isArray(data.applicantIds) ? (data.applicantIds as string[]) : [],
    talents: (Array.isArray(data.talents) ? data.talents : []) as ApplicantPickShareTalent[],
    notes: (Array.isArray(data.notes) ? data.notes : []) as ApplicantPickShareNote[],
  }
}

export async function upsertPublicApplicantPickNote(input: {
  token: string
  applicantId: string
  visitorName: string
  noteText: string
}) {
  const data = await postShare({ action: 'upsert_note', ...input })
  return data.note as ApplicantPickShareNote
}
