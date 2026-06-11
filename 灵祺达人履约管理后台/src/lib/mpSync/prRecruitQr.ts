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

function resolvePrName(
  meta: Record<string, unknown>,
  snap: PrProfileSnapshot,
  mp: Record<string, unknown>,
): string {
  const display = String(meta.prDisplayName || '').trim()
  if (display) return display
  if (snap.accountType === 'personal') {
    return String(snap.personalName || snap.contactName || '').trim()
  }
  return String(snap.companyName || snap.contactName || mp.customerName || '').trim()
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
