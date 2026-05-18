/**
 * 抖音来客商品说明 / 其他说明：审核常见拒稿用语过滤（与平台素材规范对齐）。
 */

const FORBIDDEN_PATTERNS: { re: RegExp; replace?: string }[] = [
  { re: /本店[^。；\n]{0,12}?(?:享有|拥有)?最终解释权/g },
  { re: /本店铺[^。；\n]{0,12}?(?:享有|拥有)?最终解释权/g },
  { re: /商家[^。；\n]{0,12}?(?:享有|拥有)?最终解释权/g },
  { re: /活动[^。；\n]{0,8}?最终解释权/g },
  { re: /包间[^。；\n]{0,16}?最低消费/g },
  { re: /最低消费[^。；\n]{0,12}?(?:\d+\s*元)?/g },
  { re: /(?:限时|限量)\s*(?:抢购|秒杀)/g },
  { re: /秒杀[^。；\n]{0,8}/g },
  { re: /预付定金/g },
  { re: /定金[^。；\n]{0,6}可退/g },
  { re: /仅限今日/g },
  { re: /最后一天/g },
  { re: /疯抢/g },
  { re: /手慢无/g },
]

/** 去掉违规句段，合并空白 */
export function sanitizeDouyinProductDescriptionCompliance(raw: string): string {
  let s = String(raw ?? '').trim()
  if (!s) return s
  for (const { re } of FORBIDDEN_PATTERNS) {
    s = s.replace(re, '')
  }
  s = s
    .replace(/[；;]\s*[；;]+/g, '；')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return s
}
