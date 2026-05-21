import type { RegistryMpRecruitmentOrder, RegistryRecruitmentOrder } from './opsRegistryApi'

/** 运营重复点击「小程序招募」时的统一提示 */
export const MP_RECRUIT_ALREADY_SUBMITTED_MSG = '订单已提交，请勿重复提交'

/** 同一商家达人招募订单仅允许对应一条小程序招募单 */
export function findMpOrderByMerchantOrderId(
  mpOrders: RegistryMpRecruitmentOrder[] | undefined,
  sourceMerchantOrderId: string,
): RegistryMpRecruitmentOrder | undefined {
  const sid = String(sourceMerchantOrderId || '').trim()
  if (!sid) return undefined
  return (mpOrders ?? []).find((o) => o && String(o.sourceMerchantOrderId || '').trim() === sid)
}

/** 商家订单是否已有关联小程序招募单（注册表 + 订单 linkedMpOrderId） */
export function resolveMpOrderForMerchantOrder(
  mpOrders: RegistryMpRecruitmentOrder[] | undefined,
  merchantOrder: Pick<RegistryRecruitmentOrder, 'id' | 'linkedMpOrderId'>,
): RegistryMpRecruitmentOrder | undefined {
  const byList = findMpOrderByMerchantOrderId(mpOrders, merchantOrder.id)
  if (byList) return byList
  const linked = String(merchantOrder.linkedMpOrderId || '').trim()
  if (!linked) return undefined
  return (mpOrders ?? []).find((o) => o && o.id === linked)
}

/** 列表展示：同一商家订单只保留最早创建的一条小程序单 */
export function dedupeMpOrdersByMerchantSource(
  mpOrders: RegistryMpRecruitmentOrder[] | undefined,
): RegistryMpRecruitmentOrder[] {
  const list = (mpOrders ?? []).filter(Boolean)
  const byMerchant = new Map<string, RegistryMpRecruitmentOrder>()
  const noMerchant: RegistryMpRecruitmentOrder[] = []
  for (const o of list) {
    const sid = String(o.sourceMerchantOrderId || '').trim()
    if (!sid) {
      noMerchant.push(o)
      continue
    }
    const prev = byMerchant.get(sid)
    if (!prev) {
      byMerchant.set(sid, o)
      continue
    }
    const prevTs = Date.parse(String(prev.createdAt || '').replace(/-/g, '/')) || 0
    const curTs = Date.parse(String(o.createdAt || '').replace(/-/g, '/')) || 0
    if (curTs > 0 && prevTs > 0 ? curTs < prevTs : o.id < prev.id) {
      byMerchant.set(sid, o)
    }
  }
  const merged = [...byMerchant.values(), ...noMerchant]
  return merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
