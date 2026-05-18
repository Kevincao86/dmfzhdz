import type { RegistryMpRecruitmentOrder } from './opsRegistryApi'

/** 同一商家达人招募订单仅允许对应一条小程序招募单 */
export function findMpOrderByMerchantOrderId(
  mpOrders: RegistryMpRecruitmentOrder[] | undefined,
  sourceMerchantOrderId: string,
): RegistryMpRecruitmentOrder | undefined {
  const sid = String(sourceMerchantOrderId || '').trim()
  if (!sid) return undefined
  return (mpOrders ?? []).find((o) => o && String(o.sourceMerchantOrderId || '').trim() === sid)
}
