import { scopeIdFromAccount } from '../mpAccountLocalScope'
import { getAccount, type MpAccount } from '../mpSession'
import { prParticipantKey } from '../mpSync/participant'
import { readPublishedOrders, type PublishedOrderLocal } from '../mpSync/applicationsStore'
import { readPrProfile } from '../mpSync/userProfile'

function hallFromMp(mp: Record<string, unknown>): string {
  if (mp.hall === 'urgent' || mp.urgent) return 'urgent'
  if (mp.hall === 'ice' || mp.orderKind === 'ice') return 'ice'
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

  const prId = String(account.lingqiPrId || '').trim()
  const registryPrId = String(account.registryPrId || account.registryMemberId || '').trim()
  const metaPrId = String(meta.lingqiPrId || '').trim()
  const metaRegistryPrId = String(meta.registryPrId || '').trim()

  if (prId && metaPrId && prId === metaPrId) return true
  if (registryPrId && metaRegistryPrId && registryPrId === metaRegistryPrId) return true

  const myKey = prParticipantKey(readPrProfile())
  const metaKey = String(meta.prParticipantKey || '').trim()
  if (myKey && metaKey && myKey === metaKey) return true

  return false
}

/** 本机发单列表 + 注册表上该 PR 的商单（跨端：小程序发单、Web 查看） */
export function mergePublishedOrdersFromRegistry(
  local: PublishedOrderLocal[],
  mpList: Record<string, unknown>[],
  account: MpAccount | null,
): PublishedOrderLocal[] {
  const map = new Map<string, PublishedOrderLocal>()
  for (const item of local) {
    const id = String(item?.mpOrderId || '').trim()
    if (id) map.set(id, item)
  }
  for (const mp of mpList) {
    if (!mp || typeof mp !== 'object') continue
    const id = String(mp.id || '').trim()
    if (!id || map.has(id)) continue
    if (!mpOrderOwnedByCurrentPr(mp, account)) continue
    map.set(id, {
      mpOrderId: id,
      title: String(mp.title || mp.customerName || id),
      publishedAt: String(mp.createdAt || mp.updatedAt || ''),
      hall: hallFromMp(mp),
      ownerAccountId: scopeIdFromAccount(account),
      ownerPrId: String(account?.lingqiPrId || '').trim(),
    })
  }
  return Array.from(map.values()).sort((a, b) => {
    const ta = Date.parse(String(a.publishedAt || '').replace(/\//g, '-')) || 0
    const tb = Date.parse(String(b.publishedAt || '').replace(/\//g, '-')) || 0
    return tb - ta
  })
}

export function listPublishedOrdersForCurrentPr(mpList: Record<string, unknown>[]): PublishedOrderLocal[] {
  return mergePublishedOrdersFromRegistry(readPublishedOrders(), mpList, getAccount())
}
