/**
 * 抖音来客 template.get 中 value_type=NOTE（富文本）的 attr 须为 NoteStruct 列表 JSON，
 * 不能传纯文本，否则会报「Description参数不合法」等泛化错误。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get
 */
import {
  attrKeyIsDouyinDescription,
  normalizeDouyinDescription,
  stripDouyinDescriptionUnsafeChars,
} from './douyinDescriptionNormalize.js'

export type DouyinTemplateAttrMeta = {
  key: string
  name: string
  value_type: string
  is_multi: boolean
  is_required: boolean
}

export function parseDouyinTemplateAttrMeta(raw: Record<string, unknown>): DouyinTemplateAttrMeta {
  return {
    key: String(raw.key ?? '').trim(),
    name: String(raw.name ?? ''),
    value_type: String(raw.value_type ?? '').toUpperCase(),
    is_multi: Boolean(raw.is_multi),
    is_required: Boolean(raw.is_required),
  }
}

export function attrTemplateIsNoteRichText(meta: DouyinTemplateAttrMeta): boolean {
  const { key, name, value_type: vt } = meta
  if (vt === 'NOTE') return true
  if (/^description_rich/i.test(key)) return true
  if (/富文本|其他说明|购买须知|使用须知/.test(name) && vt !== 'TEXT' && vt !== 'STRING') {
    return true
  }
  return false
}

export function isDouyinNoteRichTextJsonString(raw: string): boolean {
  const t = String(raw ?? '').trim()
  if (!t.startsWith('[')) return false
  try {
    const j = JSON.parse(t) as unknown
    if (!Array.isArray(j) || j.length === 0) return false
    return j.every((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return false
      const o = row as Record<string, unknown>
      const c = o.content
      return typeof c === 'string' && c.trim().length > 0
    })
  } catch {
    return false
  }
}

/** NOTE 多段富文本： [{ note_type: 1, content: "..." }, ...] */
export function encodeDouyinNoteRichTextFromPlain(plain: string, maxItems = 32): string {
  const cleaned = stripDouyinDescriptionUnsafeChars(plain)
  const lines = cleaned
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
  const parts = (lines.length > 0 ? lines : [cleaned || '欢迎到店体验，详询门店']).slice(0, maxItems)
  const items = parts.map((content) => ({
    note_type: 1,
    content: content.slice(0, 4000),
  }))
  return JSON.stringify(items)
}

export function finalizeDouyinProductAttrsByTemplate(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    productName: string
    productDesc: string
    categoryId?: string
  },
): string {
  const metas = templateProductAttrs.map((a) => parseDouyinTemplateAttrMeta(a))
  const metaByKey = new Map(metas.map((m) => [m.key, m]))

  let shortPlain = ''

  for (const meta of metas) {
    const key = meta.key
    if (!key) continue
    const cur = (merged[key] ?? '').trim()

    if (attrTemplateIsNoteRichText(meta)) {
      if (!cur || !isDouyinNoteRichTextJsonString(cur)) {
        const source = cur || ctx.productDesc || ctx.productName
        merged[key] = encodeDouyinNoteRichTextFromPlain(source)
      }
      continue
    }

    if (attrKeyIsDouyinDescription(key)) {
      if (meta.value_type === 'NOTE') {
        const short = normalizeDouyinDescription(
          cur || ctx.productName,
          ctx.productName,
          undefined,
          undefined,
          ctx.categoryId,
        )
        merged[key] = encodeDouyinNoteRichTextFromPlain(short)
        if (!shortPlain) shortPlain = short
      } else {
        const short = normalizeDouyinDescription(
          cur || ctx.productDesc || ctx.productName,
          ctx.productName,
          undefined,
          undefined,
          ctx.categoryId,
        )
        merged[key] = short
        if (!shortPlain) shortPlain = short
      }
      continue
    }
  }

  for (const [key, val] of Object.entries(merged)) {
    if (metaByKey.has(key)) continue
    if (/^description_rich/i.test(key) && val.trim() && !isDouyinNoteRichTextJsonString(val)) {
      merged[key] = encodeDouyinNoteRichTextFromPlain(val)
    }
  }

  if (!shortPlain) {
    shortPlain = normalizeDouyinDescription(
      ctx.productDesc || ctx.productName,
      ctx.productName,
      undefined,
      undefined,
      ctx.categoryId,
    )
    if (!Object.keys(merged).some(attrKeyIsDouyinDescription)) {
      merged.Description = shortPlain
    }
  }

  return shortPlain
}
