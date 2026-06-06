import { readApplications } from './applicationsStore'
import { selectedIdsFromMp } from './mpApplicantSelection'
import { readMember } from './talentMember'
import { platformIdFromName } from './talentPlatformProfiles'
import { getAccount } from '../mpSession'

const ICE_APPLICANT_PREFIX = 'meoo_ice_applicant_v1_'

function localApplicantIdForOrder(mpOrderId: string): string {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  const apps = readApplications()
  const hit = apps.find((a) => a && String(a.mpOrderId || '') === id)
  if (hit?.applicantId) return String(hit.applicantId).trim()
  try {
    const ice = localStorage.getItem(`${ICE_APPLICANT_PREFIX}${id}`)
    if (ice) return String(ice).trim()
  } catch {
    /* ignore */
  }
  return ''
}

function applicantMatchesCurrentTalent(applicant: Record<string, unknown>): boolean {
  const member = readMember()
  const acc = getAccount()
  const memberId = String(acc?.registryMemberId || member?.id || '').trim()
  if (memberId && applicant.talentMemberId) {
    return String(applicant.talentMemberId).trim() === memberId
  }
  if (!member) return false
  const contact = String(member.contact || '').trim()
  if (contact && String(applicant.contact || '').trim() === contact) return true
  const plat = platformIdFromName(String(applicant.platform || '抖音'))
  const prof = member.platformProfiles?.[plat]
  const account = prof && String(prof.platformAccount || '').trim().toLowerCase()
  if (account && String(applicant.platformAccount || '').trim().toLowerCase() === account) return true
  return false
}

export function findMyApplicant(mp: Record<string, unknown> | null, mpOrderId: string) {
  const applicants = Array.isArray(mp?.applicants) ? (mp.applicants as Record<string, unknown>[]) : []
  if (!applicants.length) return null
  const localId = localApplicantIdForOrder(mpOrderId)
  if (localId) {
    const byId = applicants.find((a) => a && String(a.id) === localId)
    if (byId) return byId
  }
  return applicants.find((a) => applicantMatchesCurrentTalent(a)) || null
}

export type ContactPrGate = {
  canContact: boolean
  hasApplication: boolean
  reason: 'not_applied' | 'pending_pr_review' | 'approved'
  message: string
  applicant: Record<string, unknown> | null
}

export function evaluateContactPrGate(mp: Record<string, unknown> | null, mpOrderId: string): ContactPrGate {
  const applicant = findMyApplicant(mp, mpOrderId)
  if (!applicant) {
    return {
      canContact: false,
      hasApplication: false,
      reason: 'not_applied',
      message: '请先报名，招募方 PR 审核通过后方可联系',
      applicant: null,
    }
  }
  const selectedIds = selectedIdsFromMp(mp)
  const approved = selectedIds.includes(String(applicant.id))
  if (!approved) {
    return {
      canContact: false,
      hasApplication: true,
      reason: 'pending_pr_review',
      message: '招募方 PR 尚未通过您的报名，确认选择您之后方可联系',
      applicant,
    }
  }
  return {
    canContact: true,
    hasApplication: true,
    reason: 'approved',
    message: '',
    applicant,
  }
}

export function applicationStatusLabel(gate: ContactPrGate): string {
  if (!gate.hasApplication) return '未报名'
  if (gate.reason === 'pending_pr_review') return '已报名 · 等待 PR 审核'
  if (gate.reason === 'approved') return 'PR 已通过您的报名'
  return '已报名'
}

export function extractPrChatMeta(mp: Record<string, unknown>, fallbackName: string) {
  const meta = (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
    ? mp.mpPublishMeta
    : {}) as Record<string, unknown>
  const prKey = String(meta.prParticipantKey || '').trim()
  if (!prKey) return null
  return {
    prParticipantKey: prKey,
    prDisplayName: String(meta.prDisplayName || fallbackName || '招募方').trim() || '招募方',
    prWxNickName: String(meta.prWxNickName || '').trim(),
    prWxAvatarUrl: String(meta.prWxAvatarUrl || '').trim(),
  }
}
