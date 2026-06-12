import { scopeIdFromAccount } from '../mpAccountLocalScope'
import { getAccount, type MpAccount } from '../mpSession'
import { prParticipantKey } from '../mpSync/participant'
import {
  readPublishedOrders,
  upsertPublishedOrderSnapshot,
  type PublishedOrderLocal,
} from '../mpSync/applicationsStore'
import { readPrProfile } from '../mpSync/userProfile'

function hallFromMp(mp: Record<string, unknown>): string {
  if (mp.hall === 'urgent' || mp.urgent) return 'urgent'
  if (mp.hall === 'ice' || mp.orderKind === 'recruitment_ice' || mp.orderKind === 'ice') return 'ice'
  return 'normal'
}

/** 注册表商单是否由当前 PR 账号发布（与小程序 publish 写入的 mpPublishMeta 对齐） */
export function mpOrderOwnedByCurrentPr(
  mp: Record<string, unknown> | null | undefined,
  account: MpAccount | null,
): boolean {
  if (!mp || !account) return false
  const pub = String(mp.publisherIdentity || '').trim()
  if (pub && pub !== 'pr') return false

  const meta =
    mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object'
      ? (mp.mpPublishMeta as Record<string, unknown>)
      : {}

  const prProfile = readPrProfile()
  const prId = String(account.lingqiPrId || prProfile?.lingqiPrId || '').trim()
  const registryPrId = String(
    account.registryPrId || account.registryMemberId || prProfile?.id || '',
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

/** 本地发单历史 + 注册表：展示全部本 PR 发单（含已删除、已完成） */
export function mergePublishedOrdersFromRegistry(
  local: PublishedOrderLocal[],
  mpList: Record<string, unknown>[],
  account: MpAccount | null,
): PublishedOrderLocal[] {
  const mpById = new Map<string, Record<string, unknown>>()
  for (const mp of mpList) {
    if (!mp || typeof mp !== 'object') continue
    const id = String(mp.id || '').trim()
    if (id) mpById.set(id, mp)
  }

  const out: PublishedOrderLocal[] = []
  const seen = new Set<string>()
  const localById = new Map(local.map((item) => [String(item?.mpOrderId || '').trim(), item]))

  for (const item of local) {
    const id = String(item?.mpOrderId || '').trim()
    if (!id || seen.has(id)) continue
    const mp = mpById.get(id)
    if (mp && !mpOrderOwnedByCurrentPr(mp, account)) continue
    seen.add(id)
    out.push(item)
  }

  for (const mp of mpList) {
    if (!mp || typeof mp !== 'object') continue
    const id = String(mp.id || '').trim()
    if (!id || seen.has(id) || !mpOrderOwnedByCurrentPr(mp, account)) continue
    if (localById.get(id)?.deletedAt) continue
    seen.add(id)
    out.push({
      mpOrderId: id,
      title: String(mp.title || mp.customerName || id),
      publishedAt: String(mp.createdAt || mp.updatedAt || ''),
      hall: hallFromMp(mp),
      ownerAccountId: scopeIdFromAccount(account),
      ownerPrId: String(account?.lingqiPrId || '').trim(),
    })
  }

  return out.sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '').replace(/\//g, '-')) || 0
    const tb = Date.parse(String(b.publishedAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
}

/** 保留本地发单历史，供「我的发单」展示已删除/已完成订单 */
export function pruneOrphanPublishedOrders(_mpList: Record<string, unknown>[]): void {
  /* no-op */
}

export function listPublishedOrdersForCurrentPr(mpList: Record<string, unknown>[]): PublishedOrderLocal[] {
  return mergePublishedOrdersFromRegistry(readPublishedOrders(), mpList, getAccount())
}

/** 将注册表中的 PR 发单写入本地历史，便于 includeMpOrderIds 与离线展示 */
export function cachePublishedOrdersFromMpList(mpList: Record<string, unknown>[]): void {
  const account = getAccount()
  if (!account) return
  const localById = new Map(readPublishedOrders().map((item) => [item.mpOrderId, item]))
  for (const mp of mpList) {
    if (!mp || typeof mp !== 'object' || !mpOrderOwnedByCurrentPr(mp, account)) continue
    const id = String(mp.id || '').trim()
    if (!id) continue
    if (localById.get(id)?.deletedAt) continue
    upsertPublishedOrderSnapshot(id, {
      title: String(mp.title || mp.customerName || id),
      lastStatus: String(mp.status || 'open'),
      hall: hallFromMp(mp),
      publishedAt: String(mp.createdAt || mp.updatedAt || ''),
    })
  }
}
