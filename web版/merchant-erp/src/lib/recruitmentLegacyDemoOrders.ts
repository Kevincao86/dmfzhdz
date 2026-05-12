import type { RegistryRecruitmentOrder } from './opsRegistryTypes.js'

/** 旧版 mockData 写入注册表时的规范单号 */
const LEGACY_CANONICAL_IDS = new Set(['RO20260501001', 'RO20260428003', 'RO20260415002'])

/** 与旧演示数据完全一致的客户|门店|达人（防 ID 变体漏网） */
const LEGACY_FINGERPRINTS = new Set([
  '蜀味火锅（春熙店）|春熙路旗舰店|美食探店喵',
  '蜀味火锅（春熙店）|宽窄巷子店|成都吃货日记',
  '轻医美·颜究所|总店|变美小课堂',
])

/**
 * 将 R020260501001 规范为 RO20260501001（历史数据常用数字 0 代替字母 O）
 */
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
