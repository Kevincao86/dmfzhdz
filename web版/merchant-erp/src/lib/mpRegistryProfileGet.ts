import type { MpAccountRow } from './mpAccountAuth.js'
import type { RegistryFile, RegistryMpPrUser, RegistryMpTalentMember } from './opsRegistryTypes.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { memberHasResolvablePlatformInfo } from './mpTalentPlatformProfileResolve.js'
import { enrichMemberFromRegistrySources } from './mpRegistryProfileEnrich.js'
import { registryMemberToClientDraft, registryPrToClientDraft } from './registryMemberClientMap.js'

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

  if (prId) {
    const hit = users.find((u) => u.id === prId)
    if (hit) return hit
  }
  if (lingqiPrId) {
    const hit = users.find((u) => String(u.lingqiPrId || '').trim() === lingqiPrId)
    if (hit) return hit
  }
  if (openId) {
    const hit = users.find((u) => String(u.wxOpenId || '').trim() === openId)
    if (hit) return hit
  }
  if (phone.length >= 11) {
    const hits = users.filter((u) => prPhoneKey(u) === phone)
    if (hits.length === 1) return hits[0]!
    if (hits.length > 1 && lingqiPrId) {
      return hits.find((u) => String(u.lingqiPrId || '').trim() === lingqiPrId) || hits[0]!
    }
    return hits[0] || null
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
}> {
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()
  const rawMember = findRegistryMemberForAccount(data, account)
  const member = enrichMemberFromRegistrySources(data, account, rawMember)
  const pr = findRegistryPrForAccount(data, account)
  const accTalentId = String(account.lingqi_talent_id || '').trim()
  const accMemberId = String(account.registry_member_id || '').trim()
  let talentMember = member ? registryMemberToClientDraft(member) : null
  if (talentMember && typeof talentMember === 'object') {
    talentMember = {
      ...talentMember,
      id: accMemberId || talentMember.id,
      lingqiTalentId: accTalentId || talentMember.lingqiTalentId,
    }
  }
  return {
    talentMember,
    prProfile: pr ? registryPrToClientDraft(pr) : null,
  }
}
