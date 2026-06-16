import type { RegistryMpOpsAnnouncement, RegistryMpTalentMember, RegistrySnapshot } from './opsRegistryTypes.js'
import {
  appendMpTalentInboxInSnapshot,
  type MpTalentInboxEntryInput,
} from './mpTalentInboxMutations.js'

export type MpOpsAnnouncementTargetFilter = {
  provinces?: string[]
  cities?: string[]
  platforms?: string[]
  douyinSalesLevels?: string[]
  followerTiers?: string[]
  selectedMemberIds?: string[]
}

const PLATFORM_IDS: { id: string; name: string }[] = [
  { id: 'douyin', name: '抖音' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手' },
  { id: 'dianping', name: '大众点评' },
  { id: 'weixin_video', name: '微信视频号' },
]

function parseFollowers(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
  const n = Number.parseInt(String(raw ?? '0').replace(/,/g, ''), 10)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function normalizeDouyinLevel(level: string): string {
  const raw = String(level || '').trim()
  if (!raw || /暂无/.test(raw)) return '暂无等级'
  const u = raw.toUpperCase().replace(/\s/g, '')
  const m = u.match(/^L(?:V)?([0-8])$/)
  if (m) return `LV${m[1]}`
  if (/^L6\+?$/.test(u)) return 'LV6'
  return raw.toUpperCase().startsWith('LV') ? raw.toUpperCase() : raw
}

function followerMatchesTier(followers: number, tier: string): boolean {
  const n = Math.max(0, Number(followers) || 0)
  switch (tier) {
    case '1000-5000':
      return n >= 1000 && n < 5000
    case '5000-1万':
      return n >= 5000 && n < 10000
    case '1万+':
      return n >= 10000 && n < 50000
    case '5万+':
      return n >= 50000 && n < 100000
    case '10万+':
      return n >= 100000 && n < 500000
    case '50万+':
      return n >= 500000
    default:
      return false
  }
}

type LooseProfile = {
  enabled?: boolean
  platformAccount?: string
  followers?: number | string
  douyinSalesLevel?: string
}

function collectProfiles(member: RegistryMpTalentMember): { platform: string; profile: LooseProfile }[] {
  const out: { platform: string; profile: LooseProfile }[] = []
  const pp = member.platformProfiles
  if (pp && typeof pp === 'object') {
    for (const { id, name } of PLATFORM_IDS) {
      const raw = pp[id]
      if (!raw || raw.enabled === false) continue
      if (!String(raw.platformAccount || '').trim()) continue
      out.push({ platform: name, profile: raw })
    }
    if (out.length) return out
  }
  if (member.douyin?.platformAccount) out.push({ platform: '抖音', profile: member.douyin })
  if (member.xiaohongshu?.platformAccount) out.push({ platform: '小红书', profile: member.xiaohongshu })
  return out
}

function isTalentMember(member: RegistryMpTalentMember): boolean {
  const w = String(member.workIdentity || 'talent').trim()
  return w === 'talent' || w === ''
}

export function matchMpTalentMemberForAnnouncement(
  member: RegistryMpTalentMember,
  filter: MpOpsAnnouncementTargetFilter,
): boolean {
  if (!member?.id || !isTalentMember(member)) return false

  const provinces = (filter.provinces || []).map((x) => String(x).trim()).filter(Boolean)
  const cities = (filter.cities || []).map((x) => String(x).trim()).filter(Boolean)
  const platforms = (filter.platforms || []).map((x) => String(x).trim()).filter(Boolean)
  const levels = (filter.douyinSalesLevels || []).map((x) => normalizeDouyinLevel(x)).filter(Boolean)
  const tiers = (filter.followerTiers || []).map((x) => String(x).trim()).filter(Boolean)

  const province = String(member.province || '').trim()
  const city = String(member.city || '').trim()
  if (provinces.length && !provinces.includes(province)) return false
  if (cities.length && !cities.includes(city)) return false

  const profiles = collectProfiles(member)
  if (!profiles.length) return false

  const scoped =
    platforms.length > 0 ? profiles.filter((p) => platforms.includes(p.platform)) : profiles
  if (!scoped.length) return false

  if (levels.length) {
    const douyin = scoped.find((p) => p.platform === '抖音')
    if (!douyin) return false
    const lv = normalizeDouyinLevel(String(douyin.profile.douyinSalesLevel || ''))
    if (!levels.some((x) => normalizeDouyinLevel(x) === lv)) return false
  }

  if (tiers.length) {
    const followersList = scoped.map((p) => parseFollowers(p.profile.followers))
    if (!followersList.some((n) => tiers.some((tier) => followerMatchesTier(n, tier)))) return false
  }

  return true
}

export function resolveMpAnnouncementRecipients(
  data: RegistrySnapshot,
  filter: MpOpsAnnouncementTargetFilter,
): RegistryMpTalentMember[] {
  const members = (data.mpTalentMembers ?? []).filter(isTalentMember)
  const matched = members.filter((m) => matchMpTalentMemberForAnnouncement(m, filter))
  const selected = [...new Set((filter.selectedMemberIds || []).map((id) => String(id).trim()).filter(Boolean))]
  if (selected.length) {
    const set = new Set(selected)
    return matched.filter((m) => set.has(m.id))
  }
  return matched
}

export type SendMpOpsAnnouncementInput = {
  title: string
  body: string
  showHomePopup?: boolean
  targetFilter: MpOpsAnnouncementTargetFilter
  createdBy?: string | null
}

export type SendMpOpsAnnouncementResult =
  | { ok: true; announcementId: string; recipientCount: number }
  | { ok: false; error: string; status: number }

export function sendMpOpsAnnouncementInSnapshot(
  data: RegistrySnapshot,
  input: SendMpOpsAnnouncementInput,
): SendMpOpsAnnouncementResult {
  const title = String(input.title || '').trim()
  const body = String(input.body || '').trim()
  if (!title) return { ok: false, error: 'title_required', status: 400 }
  if (!body) return { ok: false, error: 'body_required', status: 400 }

  const recipients = resolveMpAnnouncementRecipients(data, input.targetFilter || {})
  if (!recipients.length) return { ok: false, error: 'no_recipients', status: 400 }

  const announcementId = `ops-ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  const showHomePopup = input.showHomePopup !== false

  const entries: MpTalentInboxEntryInput[] = recipients.map((m) => ({
    talentMemberId: m.id,
    title,
    body,
    category: 'system',
    noticeType: 'ops_broadcast',
    contact: String(m.contact || '').trim() || undefined,
    pinned: showHomePopup,
    announcementId,
  }))

  const appended = appendMpTalentInboxInSnapshot(data, entries)
  if (!appended.ok) return { ok: false, error: appended.error, status: appended.status }

  const history = [...(data.mpOpsAnnouncements ?? [])]
  history.unshift({
    id: announcementId,
    title,
    body,
    showHomePopup,
    targetFilter: input.targetFilter || {},
    recipientCount: appended.count,
    createdAt: now,
    createdBy: input.createdBy ?? null,
  })
  data.mpOpsAnnouncements = history.slice(0, 200)

  return { ok: true, announcementId, recipientCount: appended.count }
}

export function listMpOpsAnnouncements(data: RegistrySnapshot): RegistryMpOpsAnnouncement[] {
  return Array.isArray(data.mpOpsAnnouncements) ? data.mpOpsAnnouncements : []
}
