import type { MpAccount } from './mpSession'
import { readMember, writeMember } from './mpSync/talentMember'
import { emptyAllProfiles, type TalentMember } from './mpSync/talentPlatformProfiles'
import { emptyPrProfile, readPrProfile, writePrProfile } from './mpSync/userProfile'

function digits11(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : ''
}

function stripMismatchedContact(member: TalentMember, account: MpAccount): TalentMember {
  const loginPhone = digits11(account.loginName)
  if (!loginPhone) return member
  const contact = digits11(member.contact)
  const wechat = digits11(member.wechatId)
  if (contact && contact !== loginPhone) {
    return { ...member, contact: '', wechatId: wechat && wechat !== loginPhone ? '' : member.wechatId }
  }
  if (wechat && wechat !== loginPhone) {
    return { ...member, wechatId: '' }
  }
  return member
}

export function syncLocalProfilesFromAccount(account: MpAccount | null | undefined) {
  if (!account) return
  if (account.activeRole === 'pr') {
    const prev = readPrProfile() || emptyPrProfile()
    writePrProfile({
      ...prev,
      id: String(account.registryPrId || prev.id || '').trim(),
      lingqiPrId: String(account.lingqiPrId || prev.lingqiPrId || '').trim(),
      wxNickName: prev.wxNickName || account.wxNickName || '',
      wxAvatarUrl: prev.wxAvatarUrl || account.wxAvatarUrl || '',
    })
    return
  }
  const raw = readMember()
  const base: TalentMember = raw || {
    id: '',
    lingqiTalentId: '',
    wxNickName: '',
    wxAvatarUrl: '',
    contact: '',
    wechatId: '',
    alipayAccount: '',
    province: '',
    city: '',
    platformProfiles: emptyAllProfiles(),
  }
  const cleaned = stripMismatchedContact(base, account)
  writeMember({
    ...cleaned,
    id: String(account.registryMemberId || cleaned.id || '').trim(),
    lingqiTalentId: String(account.lingqiTalentId || cleaned.lingqiTalentId || '').trim(),
    wxNickName: cleaned.wxNickName || account.wxNickName || '',
    wxAvatarUrl: cleaned.wxAvatarUrl || account.wxAvatarUrl || '',
  })
}
