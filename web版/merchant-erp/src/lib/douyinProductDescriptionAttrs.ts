/**
 * 抖音来客 product.save 商品描述字段（template.get 官方语义）：
 * - `Description`：商品描述；不需要时传 "[]"
 * - `description_rich_text`：其他说明（NOTE 富文本 JSON 列表）
 * - `product.desc`：顶层短文案（与 Description attr 可分离）
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/product-query/template.get
 */
import {
  attrKeyIsDouyinDescription,
  normalizeDouyinDescription,
  stripDouyinDescriptionUnsafeChars,
} from './douyinDescriptionNormalize.js'
import {
  attrTemplateIsNoteRichText,
  encodeDouyinNoteRichTextFromPlain,
  isDouyinNoteRichTextJsonString,
  parseDouyinTemplateAttrMeta,
  type DouyinTemplateAttrMeta,
} from './douyinNoteRichTextFormat.js'

/** 官方：Description 不需要时传 "[]" */
export const DOUYIN_DESCRIPTION_ATTR_UNUSED = '[]'

export function isDouyinDescriptionAttrUnused(val: string): boolean {
  const t = String(val ?? '').trim()
  return t === '[]' || t === '""'
}

export function findDouyinDescriptionRichTextKey(
  merged: Record<string, string>,
  templateProductAttrs: Record<string, unknown>[],
): string {
  for (const raw of templateProductAttrs) {
    const meta = parseDouyinTemplateAttrMeta(raw)
    if (attrTemplateIsNoteRichText(meta) && !attrKeyIsDouyinDescription(meta.key)) {
      return meta.key
    }
  }
  for (const k of Object.keys(merged)) {
    if (/^description_rich/i.test(k) && !attrKeyIsDouyinDescription(k)) return k
  }
  return 'description_rich_text'
}

/** 写入 NOTE 富文本；有富文本时 Description attr 置为 "[]" */
export function applyDouyinProductDescriptionAttrs(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    productName: string
    productDesc: string
    categoryId?: string
  },
): string {
  const name = ctx.productName.trim()
  const descRaw = String(ctx.productDesc ?? '').trim()
  const short = normalizeDouyinDescription(descRaw || name, name, undefined, undefined, ctx.categoryId)
  const longPlain = stripDouyinDescriptionUnsafeChars(descRaw || short).slice(0, 8000) || short
  const noteJson = encodeDouyinNoteRichTextFromPlain(longPlain)

  const richKey = findDouyinDescriptionRichTextKey(merged, templateProductAttrs)
  const richCur = (merged[richKey] ?? '').trim()
  if (!richCur || !isDouyinNoteRichTextJsonString(richCur)) {
    merged[richKey] = noteJson
  }

  const hasRich = isDouyinNoteRichTextJsonString(String(merged[richKey] ?? ''))

  const metas = templateProductAttrs.map((a) => parseDouyinTemplateAttrMeta(a))
  const metaByKey = new Map(metas.map((m) => [m.key, m]))

  for (const meta of metas) {
    const key = meta.key
    if (!key || !attrKeyIsDouyinDescription(key)) continue
    merged[key] = resolveDescriptionAttrValue(meta, short, hasRich)
  }

  for (const key of Object.keys(merged)) {
    if (!attrKeyIsDouyinDescription(key)) continue
    if (metaByKey.has(key)) continue
    merged[key] = hasRich ? DOUYIN_DESCRIPTION_ATTR_UNUSED : short
  }

  if (!Object.keys(merged).some(attrKeyIsDouyinDescription) && name) {
    merged.Description = hasRich ? DOUYIN_DESCRIPTION_ATTR_UNUSED : short
  }

  for (const [key, val] of Object.entries(merged)) {
    if (metaByKey.has(key)) continue
    if (/^description_rich/i.test(key) && val.trim() && !isDouyinNoteRichTextJsonString(val)) {
      merged[key] = noteJson
    }
  }

  return short
}

function resolveDescriptionAttrValue(
  meta: DouyinTemplateAttrMeta,
  shortPlain: string,
  hasRichNote: boolean,
): string {
  if (hasRichNote) return DOUYIN_DESCRIPTION_ATTR_UNUSED
  if (meta.value_type === 'NOTE') {
    return encodeDouyinNoteRichTextFromPlain(shortPlain)
  }
  return shortPlain
}

/** 网关提交前校验 Description attr（非 product.desc） */
export function validateDouyinDescriptionAttrForSave(
  descVal: string,
  categoryId?: string,
): { ok: true } | { ok: false; message: string; description_len?: number } {
  const v = String(descVal ?? '').trim()
  if (!v) {
    return { ok: false, message: '缺少 Description 商品描述属性。', description_len: 0 }
  }
  if (isDouyinDescriptionAttrUnused(v)) return { ok: true }
  if (isDouyinNoteRichTextJsonString(v)) return { ok: true }
  if (v.startsWith('[') || v.startsWith('{')) {
    return {
      ok: false,
      message:
        'Description 格式不正确：有 description_rich_text 时应传 "[]"，或为 NOTE 类型时传合法 JSON 列表。',
      description_len: v.length,
    }
  }
  const min = 4
  const max = categoryId === '5003003' ? 40 : 200
  if (v.length < min) {
    return {
      ok: false,
      message: `Description 过短（${v.length} 字）。请填写商品说明，或确保 description_rich_text 已生成 NOTE JSON。`,
      description_len: v.length,
    }
  }
  if (v.length > max) {
    return {
      ok: false,
      message: `Description 过长（${v.length} 字，建议 ≤${max}）。长文案请写在商品说明（富文本）。`,
      description_len: v.length,
    }
  }
  return { ok: true }
}
