/**
 * 抖音来客 template.get / goods.save 的 Notification（使用规则）须为 NotificationStruct 列表 JSON。
 * @see NotificationStruct { title, content }；goods/save 示例可传 "[]"
 */
import { stripDouyinDescriptionUnsafeChars } from './douyinDescriptionNormalize.js'

export function isDouyinNotificationAttrJson(raw: string): boolean {
  const s = String(raw ?? '').trim()
  if (s === '[]') return true
  if (!s.startsWith('[')) return false
  try {
    const j = JSON.parse(s) as unknown
    if (!Array.isArray(j)) return false
    if (j.length === 0) return true
    return j.every((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return false
      const o = row as Record<string, unknown>
      return typeof o.title === 'string' && typeof o.content === 'string'
    })
  } catch {
    return false
  }
}

export function encodeDouyinNotificationJson(title: string, content: string): string {
  const t = title.trim().slice(0, 200) || '使用规则'
  const cleaned = stripDouyinDescriptionUnsafeChars(content.trim().slice(0, 12_000) || '欢迎到店体验，详询门店。')
  const lines = cleaned
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
  const parts = (lines.length > 0 ? lines : [cleaned]).slice(0, 20)
  const items = parts.map((line, i) => ({
    title: (i === 0 ? t : `${t}（${i + 1}）`).slice(0, 200),
    content: line.slice(0, 4000),
  }))
  return JSON.stringify(items)
}

export function normalizeDouyinNotificationValue(
  raw: string,
  title: string,
  content: string,
): string {
  const cur = String(raw ?? '').trim()
  if (isDouyinNotificationAttrJson(cur)) {
    if (cur === '[]') return encodeDouyinNotificationJson(title, content)
    return cur
  }
  return encodeDouyinNotificationJson(title, cur || content)
}

export function notificationContentFromErp(
  erp: Record<string, unknown>,
  productDesc: string,
  productName: string,
): string {
  const consume =
    erp.consume_rules && typeof erp.consume_rules === 'object'
      ? (erp.consume_rules as Record<string, unknown>)
      : {}
  const other = typeof consume.other === 'string' ? consume.other.trim() : ''
  return other || productDesc || productName || '欢迎到店体验，详询门店。'
}
