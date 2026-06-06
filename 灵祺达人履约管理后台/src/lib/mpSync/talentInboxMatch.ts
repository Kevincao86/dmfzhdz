import { platformIdFromName } from './talentPlatformProfiles'
import { resolveTalentMemberId } from './mpApplicantSelection'
import type { MpRegistry } from '../mpRecruitment/types'

function contactKey(contact: string): string {
  const digits = String(contact || '').replace(/\D/g, '')
  return digits ? `contact:${digits}` : ''
}

function accountKey(platform: string, account: string): string {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return ''
  const pid = platformIdFromName(platform || '抖音')
  return `acct:${pid}:${a}`
}

export function resolveTalentInboxTarget(applicant: Record<string, unknown>, reg: MpRegistry) {
  const a = applicant || {}
  let talentMemberId = resolveTalentMemberId(a, reg)
  const contact = String(a.contact || '').trim()
  const platformAccount = String(a.platformAccount || '').trim()
  const applicantId = String(a.id || '').trim()
  if (!talentMemberId && contact) talentMemberId = contactKey(contact)
  if (!talentMemberId && platformAccount) talentMemberId = accountKey(String(a.platform), platformAccount)
  return { talentMemberId, contact, platformAccount, applicantId }
}
