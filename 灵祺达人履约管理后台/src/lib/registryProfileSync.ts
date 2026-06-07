import { fetchRegistryProfile } from './mpApi'
import { getAccount } from './mpSession'
import { migrateMember, type TalentMember } from './mpSync/talentPlatformProfiles'
import { writeMember } from './mpSync/talentMember'
import { emptyPrProfile, writePrProfile, type PrProfile } from './mpSync/userProfile'
import { talentDraftBelongsToAccount, prDraftBelongsToAccount } from './mpClientStateGuard'

function digits11(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : ''
}

function enforceLoginPhoneOnMember(draft: Record<string, unknown>, loginName: string | null | undefined) {
  const phone = digits11(loginName)
  if (!phone) return draft
  const contact = digits11(draft.contact)
  const wechat = digits11(draft.wechatId)
  const next = { ...draft }
  if (!contact) next.contact = phone
  if (!wechat) next.wechatId = phone
  return next
}

export async function pullRegistryProfileAfterLogin(): Promise<boolean> {
  const account = getAccount()
  if (!account) return false
  try {
    const { talentMember, prProfile } = await fetchRegistryProfile()
    let applied = false
    if (talentMember && typeof talentMember === 'object' && talentDraftBelongsToAccount(talentMember, account)) {
      const patched = enforceLoginPhoneOnMember(talentMember, account.loginName)
      const migrated = migrateMember(patched as Record<string, unknown>)
      if (migrated) {
        writeMember({
          ...migrated,
          id: String(account.registryMemberId || migrated.id || '').trim(),
          lingqiTalentId: String(account.lingqiTalentId || migrated.lingqiTalentId || '').trim(),
          lingqiShootTeamId: String(account.lingqiShootTeamId || migrated.lingqiShootTeamId || '').trim(),
          lingqiEditTeamId: String(account.lingqiEditTeamId || migrated.lingqiEditTeamId || '').trim(),
        } as TalentMember)
        applied = true
      }
    }
    if (prProfile && typeof prProfile === 'object' && prDraftBelongsToAccount(prProfile, account)) {
      const base = { ...emptyPrProfile(), ...(prProfile as PrProfile) }
      writePrProfile({
        ...base,
        id: String(account.registryPrId || base.id || '').trim(),
        lingqiPrId: String(account.lingqiPrId || base.lingqiPrId || '').trim(),
      })
      applied = true
    }
    return applied
  } catch (e) {
    console.warn('[fulfillment] registry_profile_get', e instanceof Error ? e.message : String(e))
    return false
  }
}
