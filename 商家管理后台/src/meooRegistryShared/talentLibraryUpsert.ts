import type {
  RegistryFile,
  RegistryMpRecruitmentApplicant,
  RegistryMpTalentMember,
  RegistryTalentLibraryEntry,
} from './opsRegistryTypes.js'
import { allocateLingqiTalentId } from './lingqiIdentity.js'
import { normalizeRecruitmentPlatform } from './recruitmentInfoFilter.js'
import { extractProfileLinkUrl } from './talentProfileLink.js'

/** 只注册、尚未填写平台账号的达人库占位标记。报价/荐达人须排除。 */
export const TALENT_LIBRARY_INCOMPLETE_TAG = '资料未完善'
export const TALENT_LIBRARY_PENDING_ACCOUNT_PREFIX = '待完善·'

export function isIncompleteTalentLibraryEntry(entry: {
  platformAccount?: string
  accountTags?: string[]
}): boolean {
  const account = String(entry.platformAccount || '')
  if (account.startsWith(TALENT_LIBRARY_PENDING_ACCOUNT_PREFIX)) return true
  return Array.isArray(entry.accountTags) && entry.accountTags.includes(TALENT_LIBRARY_INCOMPLETE_TAG)
}

export function talentLibraryDedupeKey(platform: string, platformAccount: string): string {
  const plat = normalizeRecruitmentPlatform(platform)
  return `${plat}::${platformAccount.trim().toLowerCase()}`
}

const TALENT_ID_RE = /^LQ-D-\d+$/i

function canonTalentId(raw: string | undefined): string {
  const s = String(raw || '').trim()
  return TALENT_ID_RE.test(s) ? s.toUpperCase() : ''
}

function phoneKeyFromText(raw: string | undefined): string {
  const digits = String(raw || '')
    .replace(/\D/g, '')
    .slice(-11)
  return digits.length >= 11 ? digits : ''
}

function findMemberForTalentPhone(
  data: RegistryFile,
  phone: string,
): RegistryMpTalentMember | null {
  if (!phone) return null
  const hits = (data.mpTalentMembers ?? []).filter(
    (m) => phoneKeyFromText(m.contact) === phone || phoneKeyFromText(m.wechatId) === phone,
  )
  return hits.find((m) => canonTalentId(m.lingqiTalentId)) || hits[0] || null
}

/** 达人库行必须有灵祺编号：沿用已有编号，否则按手机号认会员，再没有就新发一个。 */
function ensureLibraryLingqiTalentId(
  data: RegistryFile,
  opts: {
    lingqiTalentId?: string
    applicant: RegistryMpRecruitmentApplicant
  },
  list: RegistryTalentLibraryEntry[],
  idx: number,
): string {
  const direct =
    canonTalentId(opts.lingqiTalentId) ||
    (idx >= 0 ? canonTalentId(list[idx]!.lingqiTalentId) : '')
  if (direct) return direct
  const phone = phoneKeyFromText(opts.applicant.contact) || phoneKeyFromText(opts.applicant.wechatId)
  const member = findMemberForTalentPhone(data, phone)
  const fromMember = canonTalentId(member?.lingqiTalentId)
  if (fromMember) return fromMember
  const fromSibling = phone
    ? canonTalentId(
        list.find(
          (e, i) =>
            i !== idx &&
            (phoneKeyFromText(e.contact) === phone || phoneKeyFromText(e.wechatId) === phone) &&
            canonTalentId(e.lingqiTalentId),
        )?.lingqiTalentId,
      )
    : ''
  if (fromSibling) {
    if (member && !canonTalentId(member.lingqiTalentId)) member.lingqiTalentId = fromSibling
    return fromSibling
  }
  const allocated = allocateLingqiTalentId(data, '')
  if (member) member.lingqiTalentId = allocated
  return allocated
}

export function upsertTalentLibraryFromApplicant(
  data: RegistryFile,
  opts: {
    platform: string
    applicant: RegistryMpRecruitmentApplicant
    mpOrderId: string
    merchantOrderNo: string
    lingqiTalentId?: string
  },
): void {
  const account = String(opts.applicant.platformAccount || '').trim()
  if (!account) return
  const plat = normalizeRecruitmentPlatform(opts.platform)
  const key = talentLibraryDedupeKey(plat, account)
  const list = [...(data.talentLibraryEntries ?? [])]
  const idx = list.findIndex((e) => talentLibraryDedupeKey(e.platform, e.platformAccount) === key)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const alipay = String(opts.applicant.alipayAccount || '').trim()
  const paymentMethod = alipay ? `支付宝：${alipay}` : '支付宝'

  const lingqiTalentId = ensureLibraryLingqiTalentId(data, opts, list, idx)
  const next: RegistryTalentLibraryEntry = {
    id: idx >= 0 ? list[idx]!.id : `TL-${Date.now()}`,
    lingqiTalentId: lingqiTalentId || undefined,
    platform: plat,
    platformAccount: account,
    platformNickname: opts.applicant.platformNickname || opts.applicant.name,
    profileLink:
      extractProfileLinkUrl(opts.applicant.profileLink) ||
      extractProfileLinkUrl(idx >= 0 ? list[idx]!.profileLink : '') ||
      String(opts.applicant.profileLink || (idx >= 0 ? list[idx]!.profileLink : '') || '').trim(),
    followers: Math.max(0, opts.applicant.followers || 0),
    douyinSalesLevel:
      plat === '抖音' ? String(opts.applicant.douyinSalesLevel || '').trim() || undefined : undefined,
    contact: String(opts.applicant.contact || '').trim(),
    wechatId: String(opts.applicant.wechatId || '').trim(),
    quotePrice: String(opts.applicant.quotePrice || '').trim(),
    paymentMethod,
    alipayAccount: alipay || undefined,
    visitTimeSlot: String(opts.applicant.visitTimeSlot || '').trim() || undefined,
    createdAt: idx >= 0 ? list[idx]!.createdAt || now : now,
    updatedAt: now,
    lastMpOrderId: opts.mpOrderId,
    lastMerchantOrderNo: opts.merchantOrderNo,
    province: String(opts.applicant.province || (idx >= 0 ? list[idx]!.province : '') || '').trim() || undefined,
    city: String(opts.applicant.city || (idx >= 0 ? list[idx]!.city : '') || '').trim() || undefined,
    gender:
      String(opts.applicant.gender || (idx >= 0 ? list[idx]!.gender : '') || '').trim() || undefined,
    accountTags: (() => {
      const fromApplicant = Array.isArray(opts.applicant.accountTags)
        ? opts.applicant.accountTags.map((t) => String(t || '').trim()).filter(Boolean)
        : []
      const prev = idx >= 0 ? list[idx]!.accountTags : undefined
      const merged = fromApplicant.length
        ? fromApplicant
        : Array.isArray(prev) && prev.length
          ? prev
          : []
      const cleaned = merged.filter((t) => t !== TALENT_LIBRARY_INCOMPLETE_TAG)
      return cleaned.length ? cleaned : undefined
    })(),
  }

  if (idx >= 0) {
    list[idx] = { ...list[idx]!, ...next }
  } else {
    list.unshift(next)
  }
  data.talentLibraryEntries = list.slice(0, 5000)
}

type TalentLibraryMemberRef = {
  id?: string
  lingqiTalentId?: string
  wxNickName?: string
  contact?: string
  wechatId?: string
  province?: string
  city?: string
  gender?: string
  workIdentity?: string
}

function memberPhoneKey(member: TalentLibraryMemberRef): string {
  const digits = String(member.contact || member.wechatId || '')
    .replace(/\D/g, '')
    .slice(-11)
  return digits.length >= 11 ? digits : ''
}

/** 已补上真实平台号后，去掉同一人的「资料未完善」占位行 */
export function dropIncompleteTalentLibraryForMember(
  data: RegistryFile,
  member: TalentLibraryMemberRef,
): void {
  const lq = String(member.lingqiTalentId || '').trim()
  const id = String(member.id || '').trim()
  const phone = memberPhoneKey(member)
  const pendingAccount = id ? `${TALENT_LIBRARY_PENDING_ACCOUNT_PREFIX}${id}` : ''
  data.talentLibraryEntries = (data.talentLibraryEntries ?? []).filter((e) => {
    if (!isIncompleteTalentLibraryEntry(e)) return true
    if (lq && String(e.lingqiTalentId || '').trim() === lq) return false
    if (pendingAccount && e.platformAccount === pendingAccount) return false
    if (phone && e.platformAccount === phone) return false
    return true
  })
}

/**
 * 达人已注册但还没填平台账号时，仍写入达人库，方便运营台看到人。
 * 不覆盖已有真实平台号。拍摄/剪辑不进达人库。
 */
export function upsertIncompleteTalentLibraryFromMember(
  data: RegistryFile,
  member: TalentLibraryMemberRef,
): void {
  const wid = String(member.workIdentity || '').trim()
  if (wid === 'shoot' || wid === 'edit') {
    dropIncompleteTalentLibraryForMember(data, member)
    return
  }
  const id = String(member.id || '').trim()
  if (!id) return
  const phone = memberPhoneKey(member)
  const account = phone || `${TALENT_LIBRARY_PENDING_ACCOUNT_PREFIX}${id}`
  const key = talentLibraryDedupeKey('抖音', account)
  const list = [...(data.talentLibraryEntries ?? [])]
  const idx = list.findIndex((e) => talentLibraryDedupeKey(e.platform, e.platformAccount) === key)
  if (idx >= 0 && !isIncompleteTalentLibraryEntry(list[idx]!)) return
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const nick =
    String(member.wxNickName || '').trim() ||
    phone ||
    '微信用户'
  const prev = idx >= 0 ? list[idx]! : null
  const row: RegistryTalentLibraryEntry = {
    id: prev?.id || `TL-${Date.now()}`,
    lingqiTalentId: String(member.lingqiTalentId || prev?.lingqiTalentId || '').trim() || undefined,
    platform: '抖音',
    platformAccount: account,
    platformNickname: nick,
    profileLink: prev?.profileLink || '',
    followers: prev?.followers || 0,
    contact: String(member.contact || '').trim(),
    wechatId: String(member.wechatId || '').trim(),
    quotePrice: prev?.quotePrice || '',
    paymentMethod: prev?.paymentMethod || '支付宝',
    province: String(member.province || prev?.province || '').trim() || undefined,
    city: String(member.city || prev?.city || '').trim() || undefined,
    gender: String(member.gender || prev?.gender || '').trim() || undefined,
    accountTags: [TALENT_LIBRARY_INCOMPLETE_TAG],
    updatedAt: now,
    lastMpOrderId: prev?.lastMpOrderId,
    lastMerchantOrderNo: prev?.lastMerchantOrderNo,
  }
  if (idx >= 0) list[idx] = { ...prev!, ...row }
  else list.unshift(row)
  data.talentLibraryEntries = list.slice(0, 5000)
}
