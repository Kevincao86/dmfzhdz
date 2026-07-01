/**
 * dr / 小程序同源：Brief 订单下拉 — 读取本机「我的发单」+ 注册表 PR 归属（浏览器安全）。
 */
import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes'

const MP_ACCOUNT_KEY = 'lingqi_mp_account'
const PUBLISH_BASE = 'meoo_my_published_orders_v1'
const PR_PROFILE_BASE = 'meoo_pr_profile_v1'

type MpAccountLite = {
  accountId?: string
  openid?: string
  lingqiPrId?: string
  lingqi_pr_id?: string
  registryPrId?: string
  registry_pr_id?: string
  registryMemberId?: string
}

export type PublishedOrderLocalLite = {
  mpOrderId: string
  title?: string
  publishedAt?: string
  hall?: string
  ownerAccountId?: string
  ownerPrId?: string
  deletedAt?: string
  lastStatus?: string
}

function readAccount(): MpAccountLite | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MP_ACCOUNT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as MpAccountLite
  } catch {
    return null
  }
}

function scopeIdFromAccount(account: MpAccountLite | null | undefined): string {
  if (!account) return ''
  return String(
    account.accountId || account.openid || account.lingqiPrId || account.lingqi_pr_id || '',
  ).trim()
}

function scopedStorageKey(baseKey: string, account?: MpAccountLite | null): string {
  const scope = scopeIdFromAccount(account ?? readAccount())
  return scope ? `${baseKey}:${scope}` : baseKey
}

function ownerIdsForFilter(account: MpAccountLite | null) {
  return {
    ownerAccountId: scopeIdFromAccount(account),
    prId: String(account?.lingqiPrId || account?.lingqi_pr_id || '').trim(),
  }
}

function entryBelongsToCurrentAccount(
  entry: { ownerAccountId?: string; ownerPrId?: string },
  ids: ReturnType<typeof ownerIdsForFilter>,
) {
  if (!entry.ownerAccountId && !entry.ownerPrId) return false
  if (!ids.ownerAccountId) {
    return Boolean(ids.prId && entry.ownerPrId && entry.ownerPrId === ids.prId)
  }
  if (!entry.ownerAccountId || entry.ownerAccountId !== ids.ownerAccountId) return false
  if (entry.ownerPrId && ids.prId && entry.ownerPrId !== ids.prId) return false
  return true
}

function readListFromKey(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function readPrProfile(): { lingqiPrId?: string; id?: string; contactPhone?: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const account = readAccount()
    const scoped = scopedStorageKey(PR_PROFILE_BASE, account)
    const raw = localStorage.getItem(scoped) || localStorage.getItem(PR_PROFILE_BASE)
    if (!raw) return null
    const p = JSON.parse(raw) as Record<string, unknown>
    return {
      lingqiPrId: String(p.lingqiPrId || '').trim() || undefined,
      id: String(p.id || '').trim() || undefined,
      contactPhone: String(p.contactPhone || '').trim() || undefined,
    }
  } catch {
    return null
  }
}

function prParticipantKey(profile: { contactPhone?: string } | null): string {
  const phone = profile && String(profile.contactPhone || '').trim()
  if (phone) return `pr_${phone.replace(/\D/g, '').slice(-11) || phone}`
  return ''
}

/** 与 dr `mpOrderOwnedByCurrentPr` 对齐 */
export function mpOrderOwnedByCurrentPrBrowser(mp: RegistryMpRecruitmentOrder | null | undefined): boolean {
  const account = readAccount()
  if (!mp || !account) return false
  const pub = String(mp.publisherIdentity || '').trim()
  if (pub && pub !== 'pr') return false

  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}

  const prProfile = readPrProfile()
  const prId = String(account.lingqiPrId || account.lingqi_pr_id || prProfile?.lingqiPrId || '').trim()
  const registryPrId = String(
    account.registryPrId || account.registry_pr_id || account.registryMemberId || prProfile?.id || '',
  ).trim()
  const metaPrId = String(meta.lingqiPrId || '').trim()
  const metaRegistryPrId = String(meta.registryPrId || '').trim()

  if (prId && metaPrId && prId === metaPrId) return true
  if (registryPrId && metaRegistryPrId && registryPrId === metaRegistryPrId) return true

  const myKey = prParticipantKey(prProfile)
  const metaKey = String(meta.prParticipantKey || '').trim()
  if (myKey && metaKey && myKey === metaKey) return true

  return false
}

export function readPublishedOrdersBrowser(): PublishedOrderLocalLite[] {
  const account = readAccount()
  const ids = ownerIdsForFilter(account)
  const scopedKey = scopedStorageKey(PUBLISH_BASE, account)
  const scoped = readListFromKey(scopedKey) as PublishedOrderLocalLite[]
  const legacy = scoped.length ? scoped : (readListFromKey(PUBLISH_BASE) as PublishedOrderLocalLite[])
  return legacy.filter((item) => entryBelongsToCurrentAccount(item, ids))
}

/** 与 dr / 小程序 `listPublishedOrdersForCurrentPr` 对齐 */
export function listPublishedOrdersForCurrentPrBrowser(
  mpList: RegistryMpRecruitmentOrder[],
): PublishedOrderLocalLite[] {
  const local = readPublishedOrdersBrowser()
  const mpById = new Map<string, RegistryMpRecruitmentOrder>()
  for (const mp of mpList) {
    const id = String(mp?.id || '').trim()
    if (id) mpById.set(id, mp)
  }

  const out: PublishedOrderLocalLite[] = []
  const seen = new Set<string>()
  const localById = new Map(local.map((item) => [String(item.mpOrderId || '').trim(), item]))

  for (const item of local) {
    const id = String(item?.mpOrderId || '').trim()
    if (!id || seen.has(id)) continue
    const mp = mpById.get(id)
    if (mp && !mpOrderOwnedByCurrentPrBrowser(mp)) continue
    seen.add(id)
    out.push(item)
  }

  for (const mp of mpList) {
    const id = String(mp?.id || '').trim()
    if (!id || seen.has(id) || !mpOrderOwnedByCurrentPrBrowser(mp)) continue
    if (localById.get(id)?.deletedAt) continue
    seen.add(id)
    out.push({
      mpOrderId: id,
      title: String(mp.title || mp.customerName || id),
      publishedAt: String(mp.createdAt || mp.updatedAt || ''),
    })
  }

  return out.sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '').replace(/\//g, '-')) || 0
    const tb = Date.parse(String(b.publishedAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
}
