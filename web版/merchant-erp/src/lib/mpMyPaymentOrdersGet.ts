import type { MpAccountRow } from './mpAccountAuth.js'
import { buildMyUsageDetailsFromSnapshot, type MpMyUsageDetails } from './mpMyUsageDetailsGet.js'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import { expireStalePointsCheckoutsInSnapshot } from './mpPointsPayShared.js'
import type {
  RegistryMpMembershipCheckoutRequest,
  RegistryMpPointsCheckoutRequest,
  RegistrySnapshot,
} from './opsRegistryTypes.js'

function accountIdOf(account: MpAccountRow): string {
  return String(account.id || '').trim()
}

function sortByCreatedDesc<T extends { createdAt: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function listMyMembershipCheckoutOrdersFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
): RegistryMpMembershipCheckoutRequest[] {
  const accountId = accountIdOf(account)
  if (!accountId) return []
  const list = data.mpMembershipCheckoutRequests ?? []
  return sortByCreatedDesc(list.filter((row) => String(row.accountId || '').trim() === accountId))
}

export function listMyPointsCheckoutOrdersFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
): RegistryMpPointsCheckoutRequest[] {
  const accountId = accountIdOf(account)
  if (!accountId) return []
  const list = data.mpPointsCheckoutRequests ?? []
  return sortByCreatedDesc(list.filter((row) => String(row.accountId || '').trim() === accountId))
}

export function listMyPaymentOrdersFromSnapshot(
  data: RegistrySnapshot,
  account: MpAccountRow,
  opts?: { roleHint?: MpLibraryRole | null },
): {
  membershipOrders: RegistryMpMembershipCheckoutRequest[]
  pointsOrders: RegistryMpPointsCheckoutRequest[]
  usage: MpMyUsageDetails
} {
  expireStalePointsCheckoutsInSnapshot(data)
  return {
    membershipOrders: listMyMembershipCheckoutOrdersFromSnapshot(data, account),
    pointsOrders: listMyPointsCheckoutOrdersFromSnapshot(data, account),
    usage: buildMyUsageDetailsFromSnapshot(data, account, opts),
  }
}
