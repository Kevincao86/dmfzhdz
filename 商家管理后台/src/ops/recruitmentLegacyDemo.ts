/**
 * 与 web版/merchant-erp/src/lib/recruitmentLegacyDemoOrders.ts 保持逻辑一致（管控台与网关分别打包）
 */
import type { RegistryRecruitmentOrder } from './opsRegistryApi'

const LEGACY_CANONICAL_IDS = new Set(['RO20260501001', 'RO20260428003', 'RO20260415002'])

const LEGACY_FINGERPRINTS = new Set([
  '蜀味火锅（春熙店）|春熙路旗舰店|美食探店喵',
  '蜀味火锅（春熙店）|宽窄巷子店|成都吃货日记',
  '轻医美·颜究所|总店|变美小课堂',
])

export function canonicalRecruitmentOrderId(id: string): string {
  const s = id.trim()
  const m = /^R0(\d{10,})$/.exec(s)
  if (m) return `RO${m[1]}`
  return s
}

export function isLegacyDemoRecruitmentOrder(o: RegistryRecruitmentOrder): boolean {
  const raw = o.id.trim()
  if (LEGACY_CANONICAL_IDS.has(raw)) return true
  if (LEGACY_CANONICAL_IDS.has(canonicalRecruitmentOrderId(raw))) return true
  const fp = `${o.customerName}|${o.storeName}|${o.talentName}`
  return LEGACY_FINGERPRINTS.has(fp)
}

export function filterLegacyDemoRecruitmentOrders(orders: RegistryRecruitmentOrder[]): RegistryRecruitmentOrder[] {
  return orders.filter((o) => !isLegacyDemoRecruitmentOrder(o))
}
