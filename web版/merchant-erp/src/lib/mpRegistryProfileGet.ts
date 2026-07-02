import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryFile, RegistryMpPrUser, RegistryMpTalentMember } from './opsRegistryTypes.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { memberHasResolvablePlatformInfo } from './mpTalentPlatformProfileResolve.js'
import { enrichMemberFromRegistrySources } from './mpRegistryProfileEnrich.js'
import { registryMemberToClientDraft, registryPrToClientDraft } from './registryMemberClientMap.js'
import {
  ensureMonthlyGiftPointsGranted,
  readAccountMpAiPointsBalance,
} from './mpAiPointsSpendCore.js'
import { resolvePrFeatureAccess, resolveMpFeatureAccess } from './prFeatureAccess.js'

function accountPhoneKey(account: MpAccountRow): string {
  return String(account.login_name || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function memberPhoneKey(m: RegistryMpTalentMember): string {
  return String(m.contact || m.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

function prPhoneKey(u: RegistryMpPrUser): string {
  return String(u.contactPhone || u.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
}

export function findRegistryMemberForAccount(
  data: RegistryFile,
  account: MpAccountRow,
): RegistryMpTalentMember | null {
  const members = data.mpTalentMembers ?? []
  const memberId = String(account.registry_member_id || '').trim()
  const talentId = String(account.lingqi_talent_id || '').trim()
  const openId = String(account.openid || '').trim()
  const phone = accountPhoneKey(account)

  if (memberId) {
    const hit = members.find((m) => m.id === memberId)
    if (hit) return hit
  }
  if (talentId) {
    const hit = members.find((m) => String(m.lingqiTalentId || '').trim() === talentId)
    if (hit) return hit
  }
  if (openId) {
    const hit = members.find((m) => String(m.wxOpenId || '').trim() === openId)
    if (hit) return hit
  }
  if (phone.length >= 11) {
    const hits = members.filter((m) => memberPhoneKey(m) === phone)
    if (hits.length === 1) return hits[0]!
    if (hits.length > 1) {
      if (talentId) {
        const byTalent = hits.find((m) => String(m.lingqiTalentId || '').trim() === talentId)
        if (byTalent) return byTalent
      }
      if (memberId) {
        const byId = hits.find((m) => m.id === memberId)
        if (byId) return byId
      }
      return hits.find((m) => memberHasResolvablePlatformInfo(m)) || hits[0]!
    }
  }
  return null
}

export function findRegistryPrForAccount(
  data: RegistryFile,
  account: MpAccountRow,
): RegistryMpPrUser | null {
  const users = data.mpPrUsers ?? []
  const prId = String(account.registry_pr_id || '').trim()
  const lingqiPrId = String(account.lingqi_pr_id || '').trim()
  const openId = String(account.openid || '').trim()
  const phone = accountPhoneKey(account)

  if (openId) {
    const hit = users.find(
      (u) =>
        String(u.wxOpenId || '').trim() === openId ||
        String(u.platformAccount || '').trim() === openId,
    )
    if (hit) return hit
  }
  if (phone.length >= 11) {
    const hits = users.filter((u) => prPhoneKey(u) === phone)
    if (hits.length === 1) return hits[0]!
    if (hits.length > 1) {
      if (lingqiPrId) {
        const byLq = hits.find((u) => String(u.lingqiPrId || '').trim() === lingqiPrId)
        if (byLq) return byLq
      }
      return [...hits].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]!
    }
  }
  if (prId) {
    const hit = users.find((u) => u.id === prId)
    if (hit) return hit
  }
  if (lingqiPrId) {
    const hit = users.find((u) => String(u.lingqiPrId || '').trim() === lingqiPrId)
    if (hit) return hit
  }
  return null
}

export async function mpAuthGetRegistryProfile(
  supabaseUrl: string,
  serviceRole: string,
  account: MpAccountRow,
): Promise<{
  talentMember: Record<string, unknown> | null
  prProfile: Record<string, unknown> | null
  prFeatureAccess: { addons: boolean; recommendHall: boolean }
  mpMembershipPlan: string
  mpMembershipExpiresAt?: string
  mpAiPointsBalance: number
}> {
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const rawMember = findRegistryMemberForAccount(data, account)
  const member = enrichMemberFromRegistrySources(data, account, rawMember)
  const pr = findRegistryPrForAccount(data, account)
  const accTalentId = String(account.lingqi_talent_id || '').trim()
  const accMemberId = String(account.registry_member_id || '').trim()
  const accPrId = String(account.lingqi_pr_id || '').trim()
  const accRegistryPrId = String(account.registry_pr_id || '').trim()
  let talentMember = member ? registryMemberToClientDraft(member) : null
  if (talentMember && typeof talentMember === 'object') {
    talentMember = {
      ...talentMember,
      // 大厅站内信按 registry 会员 id 匹配（如 LQ-D-000015）；勿用错误的 registry_member_id 覆盖
      id: member?.id || accMemberId || talentMember.id,
      lingqiTalentId: accTalentId || member?.lingqiTalentId || talentMember.lingqiTalentId,
      mpMembershipPlan: member?.mpMembershipPlan || 'basic',
      mpMembershipExpiresAt: member?.mpMembershipExpiresAt,
    }
  }
  let prProfile = pr ? registryPrToClientDraft(pr) : null
  if (pr && prProfile && typeof prProfile === 'object') {
    prProfile = {
      ...prProfile,
      id: accRegistryPrId || prProfile.id,
      lingqiPrId: String(pr.lingqiPrId || accPrId || prProfile.lingqiPrId || ''),
      mpMembershipPlan: pr.mpMembershipPlan || 'basic',
      mpMembershipExpiresAt: pr.mpMembershipExpiresAt,
    }
  }
  const mpMembershipPlan = pr
    ? String(pr.mpMembershipPlan || 'basic').trim() || 'basic'
    : member
      ? String(member.mpMembershipPlan || 'basic').trim() || 'basic'
      : 'basic'
  const mpMembershipExpiresAt = pr?.mpMembershipExpiresAt || member?.mpMembershipExpiresAt
  const gift = ensureMonthlyGiftPointsGranted(data, account)
  const mpAiPointsBalance = gift.granted > 0 ? gift.newBalance : readAccountMpAiPointsBalance(data, account)
  if (gift.granted > 0) {
    await io.save(data)
  }
  return {
    talentMember,
    prProfile,
    prFeatureAccess: pr ? resolvePrFeatureAccess(pr) : resolveMpFeatureAccess(member),
    mpMembershipPlan,
    mpMembershipExpiresAt,
    mpAiPointsBalance,
  }
}
