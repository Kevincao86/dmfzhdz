/** 招募详情 · PR 信息二维码（扫码打开公开页，微信可识别 https URL） */

export type PrProfileSnapshot = {
  accountType?: string
  companyName?: string
  personalName?: string
  contactName?: string
  province?: string
  city?: string
  intro?: string
}

function isSameAsOrderTitle(name: string, mp: Record<string, unknown>): boolean {
  const n = String(name || '').trim()
  if (!n) return false
  const title = String(mp.title || mp.customerName || '').trim()
  return !!title && n === title
}

function resolvePrName(
  meta: Record<string, unknown>,
  snap: PrProfileSnapshot,
  mp: Record<string, unknown>,
): string {
  const accountType = String(snap.accountType || meta.prAccountType || 'company').trim()
  if (accountType === 'personal') {
    const personal = String(snap.personalName || '').trim()
    if (personal && !isSameAsOrderTitle(personal, mp)) return personal
  } else {
    const company = String(snap.companyName || '').trim()
    if (company && !isSameAsOrderTitle(company, mp)) return company
  }
  const display = String(meta.prDisplayName || '').trim()
  if (display && !isSameAsOrderTitle(display, mp)) return display
  const contact = String(snap.contactName || '').trim()
  if (contact && !isSameAsOrderTitle(contact, mp)) return contact
  return ''
}

/** 分享文案 / 公开页：优先取发布时写入的 PR 机构名，而非当前登录用户 */
export function resolveOrderPublisherDisplayName(mp: Record<string, unknown> | null | undefined): string {
  if (!mp || typeof mp !== 'object') return ''
  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}
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
  const name = resolvePrName(meta, snap, mp) || '招募方'
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
