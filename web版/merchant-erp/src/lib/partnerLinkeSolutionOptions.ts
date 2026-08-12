/** 林客 auth_with_bind 解决方案（须与开放平台已开通方案一致；1/4 已即将下线）
 * 独立文件供前端引用，避免拉入 partnerLinkeOnboardCore 的 node:crypto。
 */

export const LINKE_AUTH_SOLUTION_OPTIONS = [
  { key: '21', label: '到店餐饮团购（推荐）' },
  { key: '16', label: '到综团购（推荐到综）' },
  { key: '7', label: '餐饮在线点单' },
  { key: '5', label: '随心团' },
  { key: '4', label: '到综行业（旧，即将下线）' },
  { key: '1', label: '到店餐饮（旧，即将下线）' },
  { key: '8', label: '酒店新预售券' },
  { key: '9', label: '酒店日历房' },
  { key: '10', label: '景区日历票' },
  { key: '11', label: '景区团购' },
  { key: '14', label: '度假预售券' },
  { key: '15', label: '度假日历品' },
] as const

export const DEFAULT_LINKE_AUTH_SOLUTION_KEY = '21'

const LINKE_AUTH_SOLUTION_KEY_SET = new Set<string>(
  LINKE_AUTH_SOLUTION_OPTIONS.map((x) => x.key),
)

export function normalizeLinkeAuthSolutionKey(raw: unknown): string {
  const key = String(raw ?? '').trim()
  if (key && LINKE_AUTH_SOLUTION_KEY_SET.has(key)) return key
  return DEFAULT_LINKE_AUTH_SOLUTION_KEY
}
