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

function looksLikePhone(raw: string): boolean {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length === 11 && /^1\d{10}$/.test(digits)
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
  return (title && n === title) || (customer && n === customer)
}

function isValidPublisherDisplayName(name: string, mp: Record<string, unknown>): boolean {
  const n = String(name || '').trim()
  if (!n || isSameAsOrderTitle(n, mp)) return false
  if (looksLikePhone(n)) return false
  if (n === '灵祺星选') return false
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
  if (injected && !looksLikePhone(injected) && injected !== '灵祺星选') return injected
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

export function buildPrInfoText(mp: Record<string, unknown> | null | undefined): string {
  if (!mp) return ''
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
  const snap =
    meta.prProfileSnapshot && typeof meta.prProfileSnapshot === 'object'
      ? (meta.prProfileSnapshot as PrProfileSnapshot)
      : {}
  const name = resolveOrderPublisherDisplayName(mp) || resolvePrName(meta, snap, mp) || '招募方'
  const contact = String(snap.contactName || meta.prContactName || '').trim()
  const region =
    [snap.province || meta.prProvince, snap.city || meta.prCity].filter(Boolean).join(' ').trim() ||
    String(mp.region || '').trim()
  const intro = String(snap.intro || meta.prIntro || '').trim().slice(0, 120)
  const lines = [`【招募方】${name}`]
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
