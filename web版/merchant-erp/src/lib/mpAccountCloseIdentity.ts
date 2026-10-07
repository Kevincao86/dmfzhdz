import type { RegistryFile } from './opsRegistryTypes.js'

/** 注销时用来认出「这一个人」的登录账号字段。 */
export type CloseAccountIdentityRef = {
  openid?: string | null
  dy_openid?: string | null
  login_name?: string | null
  lingqi_talent_id?: string | null
  registry_member_id?: string | null
  lingqi_pr_id?: string | null
  registry_pr_id?: string | null
}

export type ClosedAccountIdentityKeys = {
  phone: string
  openids: string[]
  memberIds: string[]
  talentIds: string[]
  shootTeamIds: string[]
  editTeamIds: string[]
  prRegistryIds: string[]
  prLingqiIds: string[]
}

function text(raw: unknown): string {
  return String(raw ?? '').trim()
}

function phone11(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length >= 11 ? digits.slice(-11) : ''
}

function memberPhone(m: { contact?: string; wechatId?: string }): string {
  return phone11(m.contact || m.wechatId)
}

function prPhone(u: { contactPhone?: string; wechatId?: string }): string {
  return phone11(u.contactPhone || u.wechatId)
}

function libraryPhone(row: { contact?: string; wechatId?: string }): string {
  return phone11(row.contact || row.wechatId)
}

/**
 * 注销账号时清掉这个人在注册表里的达人、PR、拍摄、剪辑身份。
 * 只按本账号的手机号、微信/抖音 openid 和已绑定的灵祺编号匹配，其他用户的资料保留。
 */
export function purgeClosedAccountIdentities(
  data: RegistryFile,
  account: CloseAccountIdentityRef,
): { changed: boolean; keys: ClosedAccountIdentityKeys } {
  const phone = phone11(account.login_name)
  const openids = new Set(
    [account.openid, account.dy_openid].map(text).filter(Boolean),
  )
  const memberIds = new Set<string>()
  const talentIds = new Set<string>()
  const shootTeamIds = new Set<string>()
  const editTeamIds = new Set<string>()
  const linkedMemberId = text(account.registry_member_id)
  const linkedTalentId = text(account.lingqi_talent_id)
  if (linkedMemberId) memberIds.add(linkedMemberId)
  if (linkedTalentId) talentIds.add(linkedTalentId)

  const members = data.mpTalentMembers ?? []
  for (const m of members) {
    const oid = text(m.wxOpenId)
    const hit =
      (linkedMemberId && m.id === linkedMemberId) ||
      (linkedTalentId && text(m.lingqiTalentId) === linkedTalentId) ||
      (oid && openids.has(oid)) ||
      (phone && memberPhone(m) === phone)
    if (!hit) continue
    memberIds.add(m.id)
    const talentId = text(m.lingqiTalentId)
    const shootId = text(m.lingqiShootTeamId)
    const editId = text(m.lingqiEditTeamId)
    if (talentId) talentIds.add(talentId)
    if (shootId) shootTeamIds.add(shootId)
    if (editId) editTeamIds.add(editId)
    if (oid) openids.add(oid)
  }

  const prRegistryIds = new Set<string>()
  const prLingqiIds = new Set<string>()
  const linkedPrId = text(account.registry_pr_id)
  const linkedPrLingqi = text(account.lingqi_pr_id)
  if (linkedPrId) prRegistryIds.add(linkedPrId)
  if (linkedPrLingqi) prLingqiIds.add(linkedPrLingqi)
  for (const u of data.mpPrUsers ?? []) {
    const oid = text(u.wxOpenId)
    const platformOid = text(u.platformAccount)
    const hit =
      (linkedPrId && u.id === linkedPrId) ||
      (linkedPrLingqi && text(u.lingqiPrId) === linkedPrLingqi) ||
      (oid && openids.has(oid)) ||
      (platformOid && openids.has(platformOid)) ||
      (phone && prPhone(u) === phone)
    if (!hit) continue
    prRegistryIds.add(u.id)
    const lq = text(u.lingqiPrId)
    if (lq) prLingqiIds.add(lq)
    if (oid) openids.add(oid)
  }

  const dropMember = (id: unknown) => memberIds.has(text(id))
  const dropTalent = (id: unknown) => {
    const v = text(id)
    return Boolean(v) && talentIds.has(v)
  }
  const dropPhone = (row: { contact?: string; wechatId?: string }) =>
    Boolean(phone) && libraryPhone(row) === phone
  const dropShoot = (id: unknown) => {
    const v = text(id)
    return Boolean(v) && shootTeamIds.has(v)
  }
  const dropEdit = (id: unknown) => {
    const v = text(id)
    return Boolean(v) && editTeamIds.has(v)
  }

  let changed = false
  const keep = <T>(list: T[] | undefined, pred: (row: T) => boolean): T[] | undefined => {
    if (!list?.length) return list
    const next = list.filter(pred)
    if (next.length !== list.length) changed = true
    return next
  }

  data.mpTalentMembers = keep(data.mpTalentMembers, (m) => !dropMember(m.id))
  data.mpPrUsers = keep(
    data.mpPrUsers,
    (u) => !prRegistryIds.has(u.id) && !prLingqiIds.has(text(u.lingqiPrId)),
  )
  data.talentLibraryEntries = keep(
    data.talentLibraryEntries,
    (e) => !dropTalent(e.lingqiTalentId) && !dropPhone(e),
  )
  data.shootTeamLibraryEntries = keep(
    data.shootTeamLibraryEntries,
    (e) => !dropMember(e.memberId) && !dropShoot(e.lingqiTeamId) && !dropTalent(e.lingqiTalentId) && !dropPhone(e),
  )
  data.editTeamLibraryEntries = keep(
    data.editTeamLibraryEntries,
    (e) => !dropMember(e.memberId) && !dropEdit(e.lingqiTeamId) && !dropTalent(e.lingqiTalentId) && !dropPhone(e),
  )
  data.mpTalentInbox = keep(
    data.mpTalentInbox,
    (item) => !dropMember(item.talentMemberId) && !dropPhone(item),
  )
  data.mpWechatOaBindTickets = keep(
    data.mpWechatOaBindTickets,
    (row) => !dropMember(row.talentMemberId),
  )
  data.mpWechatOaBindings = keep(
    data.mpWechatOaBindings,
    (row) => !dropMember(row.talentMemberId),
  )

  return {
    changed,
    keys: {
      phone,
      openids: [...openids],
      memberIds: [...memberIds],
      talentIds: [...talentIds],
      shootTeamIds: [...shootTeamIds],
      editTeamIds: [...editTeamIds],
      prRegistryIds: [...prRegistryIds],
      prLingqiIds: [...prLingqiIds],
    },
  }
}
