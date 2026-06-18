import type { RegistryMpTalentInboxItem, RegistryMpTalentMember } from './opsRegistryTypes.js'

const PLATFORM_IDS: { id: string; names: string[] }[] = [
  { id: 'douyin', names: ['抖音'] },
  { id: 'xiaohongshu', names: ['小红书'] },
  { id: 'kuaishou', names: ['快手'] },
  { id: 'dianping', names: ['大众点评', '点评'] },
  { id: 'weixin_video', names: ['微信视频号', '视频号'] },
]

function platformIdFromName(name: string): string {
  const n = String(name || '').trim()
  for (const p of PLATFORM_IDS) {
    if (p.names.some((label) => n.includes(label))) return p.id
  }
  return 'douyin'
}

function phoneDigits(contact: unknown): string {
  return String(contact || '').replace(/\D/g, '').slice(-11)
}

function contactKey(contact: unknown): string {
  const digits = phoneDigits(contact)
  return digits.length >= 7 ? `contact:${digits.slice(-11)}` : ''
}

function accountKey(platform: string, account: unknown): string {
  const a = String(account || '').trim().toLowerCase()
  if (!a) return ''
  return `acct:${platformIdFromName(platform)}:${a}`
}

function looksLikeRegistryMemberId(id: string): boolean {
  return /^(MTM-|LQ-[TD]-|talent_)/i.test(id)
}

export function talentInboxMatchKeysFromProfile(
  account: {
    lingqi_talent_id?: string | null
    registry_member_id?: string | null
    openid?: string | null
    login_name?: string | null
  },
  member: RegistryMpTalentMember | null,
): Set<string> {
  const keys = new Set<string>()
  for (const v of [
    account.lingqi_talent_id,
    account.registry_member_id,
    account.openid,
    member?.id,
    member?.lingqiTalentId,
    member?.wxOpenId,
  ]) {
    const s = String(v || '').trim()
    if (s) keys.add(s)
  }
  const loginPhone = phoneDigits(account.login_name)
  if (loginPhone) {
    keys.add(loginPhone)
    const lk = contactKey(loginPhone)
    if (lk) keys.add(lk)
  }
  const contact = String(member?.contact || '').trim()
  if (contact) {
    keys.add(contact)
    const ck = contactKey(contact)
    if (ck) keys.add(ck)
    const phone = phoneDigits(contact)
    if (phone) keys.add(phone)
  }
  const profiles = member?.platformProfiles || {}
  for (const [pid, prof] of Object.entries(profiles)) {
    if (!prof || typeof prof !== 'object') continue
    const acct = String((prof as { platformAccount?: string }).platformAccount || '').trim()
    if (!acct) continue
    const platName =
      PLATFORM_IDS.find((p) => p.id === pid)?.names[0] || '抖音'
    keys.add(accountKey(platName, acct))
    keys.add(acct.toLowerCase())
  }
  return keys
}

function rowMatchesKeys(row: RegistryMpTalentInboxItem, keys: Set<string>): boolean {
  const mid = String(row.talentMemberId || '').trim()
  const isOps = row.noticeType === 'ops_broadcast'

  if (isOps && mid && keys.has(mid)) return true

  const contact = String(row.contact || '').trim()
  if (contact) {
    if (keys.has(contact)) return true
    const ck = contactKey(contact)
    if (ck && keys.has(ck)) return true
    const phone = phoneDigits(contact)
    if (phone && keys.has(phone)) return true
  }

  const plat = '抖音'
  const acct = String(row.platformAccount || '').trim().toLowerCase()
  if (acct && keys.has(accountKey(plat, acct))) return true
  if (acct && keys.has(acct)) return true

  if (mid && keys.has(mid)) return true
  if (mid && looksLikeRegistryMemberId(mid) && !isOps) return false

  return false
}

/** PR 报名管理：仅返回指定招募单相关的入选通知（最多 200 条，新在前） */
export function filterTalentInboxForOrderIds(
  inbox: RegistryMpTalentInboxItem[] | undefined,
  orderIds: Set<string>,
): RegistryMpTalentInboxItem[] {
  if (!orderIds.size || !Array.isArray(inbox) || !inbox.length) return []
  return inbox
    .filter((row) => {
      if (!row) return false
      const mpOrderId = String(row.mpOrderId || '').trim()
      if (!mpOrderId || !orderIds.has(mpOrderId)) return false
      return row.noticeType === 'selection' || /恭喜入选/.test(String(row.title || ''))
    })
    .slice(0, 200)
}

/** 大厅 POST 附带当前达人可见的站内信（最多 80 条，新在前） */
export function filterTalentInboxForHall(
  inbox: RegistryMpTalentInboxItem[] | undefined,
  keys: Set<string>,
): RegistryMpTalentInboxItem[] {
  if (!keys.size || !Array.isArray(inbox) || !inbox.length) return []
  return inbox
    .filter((row) => row && rowMatchesKeys(row, keys))
    .slice(0, 80)
}
