/** 招募详情 · PR 信息二维码（扫码打开公开页，微信可识别 https URL） */

import { getAccount } from '../mpSession'
import { mpOrderOwnedByCurrentPr } from '../mpRecruitment/prPublishedOrders'
import { emptyPrProfile, prDisplayName, readPrProfile, type PrProfile } from './userProfile'

export type PrProfileSnapshot = {
  accountType?: string
  companyName?: string
  personalName?: string
  contactName?: string
  province?: string
  city?: string
  intro?: string
}

export type PublisherDisplayHit = {
  displayName?: string
  prUser?: Record<string, unknown> | null
}

export type BuildPrInfoOpts = {
  publisherDisplay?: PublisherDisplayHit | null
}

function looksLikePhone(raw: string): boolean {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length === 11 && /^1\d{10}$/.test(digits)
}

function isPlaceholderPublisherName(name: string): boolean {
  const n = String(name || '').trim()
  return !n || n === '招募方' || n === '灵祺星选' || n === 'PR'
}

/** 对齐商家后台 PR 用户库「名称」列 */
function prUserRegistryDisplayName(user: Record<string, unknown>): string {
  if (!user || typeof user !== 'object') return ''
  if (user.accountType === 'personal') {
    return String(user.personalName || '').trim()
  }
  return String(user.companyName || '').trim()
}

function orderPublisherMetaKeys(mp: Record<string, unknown>) {
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  return {
    lingqiPrId: String(meta.lingqiPrId || '').trim(),
    registryPrId: String(meta.registryPrId || '').trim(),
    participantKey: String(meta.prParticipantKey || '').trim(),
  }
}

function userMatchesOrderPublisherKeys(user: Record<string, unknown>, keys: ReturnType<typeof orderPublisherMetaKeys>) {
  const uLq = String(user.lingqiPrId || '').trim()
  const uId = String(user.id || '').trim()
  if (keys.lingqiPrId && (uLq === keys.lingqiPrId || uId === keys.lingqiPrId)) return true
  if (keys.registryPrId && (uId === keys.registryPrId || uLq === keys.registryPrId)) return true
  if (keys.participantKey) {
    const phone = String(user.contactPhone || '')
      .replace(/\D/g, '')
      .slice(-11)
    if (phone && keys.participantKey === `pr_${phone}`) return true
  }
  return false
}

function findRegistryPrUserByLingqiId(
  mpPrUsers: Record<string, unknown>[],
  lingqiPrId: string,
): Record<string, unknown> | null {
  const lq = String(lingqiPrId || '').trim().toUpperCase()
  if (!lq) return null
  const list = Array.isArray(mpPrUsers) ? mpPrUsers : []
  return (
    list.find((u) => u && String(u.lingqiPrId || '').trim().toUpperCase() === lq) || null
  )
}

function publisherNameFromPrUser(user: Record<string, unknown> | null | undefined): string {
  if (!user) return ''
  const n = prUserRegistryDisplayName(user)
  return n && !isPlaceholderPublisherName(n) ? n : ''
}

function findRegistryPrUserForOrder(
  mp: Record<string, unknown>,
  users: Record<string, unknown>[],
): Record<string, unknown> | null {
  const list = Array.isArray(users) ? users : []
  if (!mp || !list.length) return null
  const keys = orderPublisherMetaKeys(mp)
  const matched = list.filter((u) => u && userMatchesOrderPublisherKeys(u, keys))
  if (matched.length === 1) return matched[0]!
  if (matched.length > 1) {
    const reg = keys.registryPrId
    if (reg) {
      const hit = matched.find((u) => String(u.id || '').trim() === reg || String(u.lingqiPrId || '').trim() === reg)
      if (hit) return hit
    }
  }
  return matched[0] || null
}

export function buildPrProfileSnapshot(pr: PrProfile | null | undefined): PrProfileSnapshot {
  const p = pr || emptyPrProfile()
  return {
    accountType: p.accountType || 'company',
    companyName: String(p.companyName || '').trim(),
    personalName: String(p.personalName || '').trim(),
    contactName: String(p.contactName || '').trim(),
    province: String(p.province || '').trim(),
    city: String(p.city || '').trim(),
    intro: String(p.intro || '').trim().slice(0, 120),
  }
}

function isSameAsOrderTitle(name: string, mp: Record<string, unknown>): boolean {
  const n = String(name || '').trim()
  if (!n) return false
  const title = String(mp.title || '').trim()
  const customer = String(mp.customerName || '').trim()
  return (!!title && n === title) || (!!customer && n === customer)
}

function isValidPublisherDisplayName(name: string, mp: Record<string, unknown>): boolean {
  const n = String(name || '').trim()
  if (!n || isSameAsOrderTitle(n, mp)) return false
  if (looksLikePhone(n)) return false
  if (isPlaceholderPublisherName(n)) return false
  return true
}

function displayNameFromProfile(profile: PrProfile | null | undefined, mp: Record<string, unknown>): string {
  if (!profile) return ''
  const name = prDisplayName(profile)
  return isValidPublisherDisplayName(name, mp) ? name : ''
}

function resolvePrName(
  meta: Record<string, unknown>,
  snap: PrProfileSnapshot,
  mp: Record<string, unknown>,
): string {
  const accountType = String(snap.accountType || meta.prAccountType || 'company').trim()
  if (accountType === 'personal') {
    const personal = String(snap.personalName || '').trim()
    if (isValidPublisherDisplayName(personal, mp)) return personal
  } else {
    const company = String(snap.companyName || '').trim()
    if (isValidPublisherDisplayName(company, mp)) return company
  }
  const display = String(meta.prDisplayName || '').trim()
  if (isValidPublisherDisplayName(display, mp)) return display
  const contact = String(snap.contactName || '').trim()
  if (isValidPublisherDisplayName(contact, mp)) return contact
  return ''
}

function resolveLivePrProfileForOrderShare(mp: Record<string, unknown>): PrProfile | null {
  const account = getAccount()
  if (!account || !mpOrderOwnedByCurrentPr(mp, account)) return null
  return readPrProfile()
}

function resolveInjectedPublisherDisplayName(meta: Record<string, unknown>): string {
  const injected = String(meta.prDisplayName || '').trim()
  if (injected && !looksLikePhone(injected) && !isPlaceholderPublisherName(injected)) return injected
  return ''
}

/** 分享文案 / 公开页：优先取发布时写入的 PR 机构名，发单 PR 可回退最新资料 */
export function resolveOrderPublisherDisplayName(
  mp: Record<string, unknown> | null | undefined,
  publisherProfile?: PrProfile | null,
): string {
  if (!mp || typeof mp !== 'object') return ''

  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}

  const profile = publisherProfile ?? resolveLivePrProfileForOrderShare(mp)
  const fromProfile = displayNameFromProfile(profile, mp)
  if (fromProfile) return fromProfile

  const injected = resolveInjectedPublisherDisplayName(meta)
  if (injected) return injected

  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? (meta.prProfileSnapshot as PrProfileSnapshot)
      : {}
  return resolvePrName(meta, snap, mp)
}

function resolvePrInfoLingqiPrId(
  mp: Record<string, unknown>,
  opts?: BuildPrInfoOpts & { mpPrUsers?: Record<string, unknown>[] },
): string {
  const pubUser = opts?.publisherDisplay?.prUser
  const keys = orderPublisherMetaKeys(mp)
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const fromReg =
    opts?.mpPrUsers && opts.mpPrUsers.length
      ? findRegistryPrUserForOrder(mp, opts.mpPrUsers)
      : null
  const candidates = [
    pubUser && pubUser.lingqiPrId,
    fromReg && fromReg.lingqiPrId,
    keys.lingqiPrId,
    meta.lingqiPrId,
  ]
  for (const raw of candidates) {
    const s = String(raw || '').trim()
    if (/^LQ-P-/i.test(s)) return s.toUpperCase()
  }
  return ''
}

function resolvePrInfoDisplayName(
  mp: Record<string, unknown>,
  opts?: BuildPrInfoOpts & { mpPrUsers?: Record<string, unknown>[] },
): string {
  const pubUser = opts?.publisherDisplay?.prUser
  if (pubUser) {
    const registryName = publisherNameFromPrUser(pubUser)
    if (registryName) return registryName
    const injected = String(opts?.publisherDisplay?.displayName || '').trim()
    if (injected && !isPlaceholderPublisherName(injected)) return injected
  }
  const mpPrUsers = opts?.mpPrUsers || []
  if (mpPrUsers.length) {
    const user = findRegistryPrUserForOrder(mp, mpPrUsers)
    if (user) {
      const registryName = publisherNameFromPrUser(user)
      if (registryName) return registryName
    }
  }
  const prLq = resolvePrInfoLingqiPrId(mp, opts)
  if (prLq && mpPrUsers.length) {
    const byId = findRegistryPrUserByLingqiId(mpPrUsers, prLq)
    const fromId = publisherNameFromPrUser(byId)
    if (fromId) return fromId
  }
  const fromOrder = resolveOrderPublisherDisplayName(mp)
  if (fromOrder && !isPlaceholderPublisherName(fromOrder)) return fromOrder
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? (meta.prProfileSnapshot as PrProfileSnapshot)
      : {}
  const fromSnap = resolvePrName(meta, snap, mp)
  if (fromSnap && !isPlaceholderPublisherName(fromSnap)) return fromSnap
  return ''
}

export function buildPrInfoText(
  mp: Record<string, unknown> | null | undefined,
  opts?: BuildPrInfoOpts & { mpPrUsers?: Record<string, unknown>[] },
): string {
  if (!mp) return ''
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? (meta.prProfileSnapshot as PrProfileSnapshot)
      : {}
  const pubUser = opts?.publisherDisplay?.prUser
  const name = resolvePrInfoDisplayName(mp, opts)
  const prLingqiId = resolvePrInfoLingqiPrId(mp, opts)
  if (!name && !prLingqiId) return ''
  const contactRaw = String(
    (pubUser && pubUser.contactName) || snap.contactName || meta.prContactName || '',
  ).trim()
  const contact = contactRaw && !looksLikePhone(contactRaw) ? contactRaw : ''
  const region =
    [snap.province || meta.prProvince, snap.city || meta.prCity].filter(Boolean).join(' ').trim() ||
    String(mp.region || '').trim()
  const intro = String(snap.intro || meta.prIntro || '').trim().slice(0, 120)
  const lines: string[] = [`【招募方】${name || '—'}`]
  if (prLingqiId) lines.push(`PRID：${prLingqiId}`)
  if (contact) lines.push(`联系人：${contact}`)
  if (region) lines.push(`地区：${region}`)
  if (intro) lines.push(`简介：${intro}`)
  return lines.join('\n')
}

export function publicWebOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_WEB_ORIGIN || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
  return 'https://dr.mofangdianai.com'
}

/** 写入二维码的内容：必须是 URL，微信扫码才可打开（勿用纯文本） */
export function buildPrQrScanUrl(mpOrderId: string): string {
  const id = String(mpOrderId || '').trim()
  if (!id) return ''
  return `${publicWebOrigin()}/pr-info/${encodeURIComponent(id)}`
}
