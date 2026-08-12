/** 林客 auth_with_bind 解决方案（须与开放平台已开通且审核通过的方案一致）
 * 独立文件供前端引用，避免拉入 partnerLinkeOnboardCore 的 node:crypto。
 *
 * 文档：solution 21=到店餐饮团购；1/4 即将下线但仍是多数存量应用已开通方案。
 * 「获取解决方案信息失败」= 该 client_key 未开通对应 solution（或未开 商户授权/门店管理）。
 */

export const LINKE_AUTH_SOLUTION_OPTIONS = [
  { key: '1', label: '到店餐饮（旧·多数应用已开通，优先试）' },
  { key: '4', label: '到综行业（旧·多数应用已开通）' },
  { key: '21', label: '到店餐饮团购（新·须开放平台已审过 21）' },
  { key: '16', label: '到综团购（新·须开放平台已审过 16）' },
  { key: '7', label: '餐饮在线点单' },
  { key: '5', label: '随心团' },
  { key: '8', label: '酒店新预售券' },
  { key: '9', label: '酒店日历房' },
  { key: '10', label: '景区日历票' },
  { key: '11', label: '景区团购' },
  { key: '14', label: '度假预售券' },
  { key: '15', label: '度假日历品' },
] as const

/** 默认用 1：新方案 21 未开通时会直接「获取解决方案信息失败」 */
export const DEFAULT_LINKE_AUTH_SOLUTION_KEY = '1'

const LINKE_AUTH_SOLUTION_KEY_SET = new Set<string>(
  LINKE_AUTH_SOLUTION_OPTIONS.map((x) => x.key),
)

export function normalizeLinkeAuthSolutionKey(raw: unknown): string {
  const key = String(raw ?? '').trim()
  if (key && LINKE_AUTH_SOLUTION_KEY_SET.has(key)) return key
  return DEFAULT_LINKE_AUTH_SOLUTION_KEY
}
