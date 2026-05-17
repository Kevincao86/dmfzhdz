/**
 * 抖音来客 product.save — Description / description_rich_text（按 template.get 官方语义）
 *
 * - `description_rich_text`（NOTE）：长说明 → `[{ note_type: 1, content: "..." }]`
 * - `Description`（NOTE 类目）：短说明 → 同上 JSON，禁止纯文本
 * - `Description`（STRING 类目）：有富文本时传官方空值 `"[]"`，否则短纯文本
 * - `product.desc`：顶层展示短文案（可与 attr Description 分离）
 *
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

/** 官方：STRING 型 Description 不需要时传 "[]" */
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

function descriptionMetaFromTemplate(
  templateProductAttrs: Record<string, unknown>[],
): DouyinTemplateAttrMeta | null {
  for (const raw of templateProductAttrs) {
    const meta = parseDouyinTemplateAttrMeta(raw)
    if (attrKeyIsDouyinDescription(meta.key)) return meta
  }
  return null
}

/** 纠正 merge 阶段误写入的纯文本 NOTE 字段 */
export function coerceDouyinNoteFieldsToJson(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
): void {
  const metas = templateProductAttrs.map((a) => parseDouyinTemplateAttrMeta(a))
  for (const meta of metas) {
    const key = meta.key
    if (!key) continue
    const isDesc = attrKeyIsDouyinDescription(key)
    const isRich = attrTemplateIsNoteRichText(meta) && !isDesc
    if (!isDesc && !isRich) continue
    const val = (merged[key] ?? '').trim()
    if (!val || isDouyinDescriptionAttrUnused(val) || isDouyinNoteRichTextJsonString(val)) continue
    merged[key] = encodeDouyinNoteRichTextFromPlain(val)
  }
  for (const [key, val] of Object.entries(merged)) {
    if (!/^description_rich/i.test(key) || attrKeyIsDouyinDescription(key)) continue
    const t = val.trim()
    if (t && !isDouyinNoteRichTextJsonString(t) && !isDouyinDescriptionAttrUnused(t)) {
      merged[key] = encodeDouyinNoteRichTextFromPlain(t)
    }
  }
}

/**
 * 按模板写入 Description / description_rich_text，返回 product.desc 短文案。
 */
export function applyDouyinProductDescriptionAttrs(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
  ctx: {
    productName: string
    productDesc: string
    categoryId?: string
  },
): string {
  coerceDouyinNoteFieldsToJson(templateProductAttrs, merged)

  const name = ctx.productName.trim()
  const descRaw = String(ctx.productDesc ?? '').trim()
  const short = normalizeDouyinDescription(descRaw || name, name, undefined, undefined, ctx.categoryId)
  const longPlain = stripDouyinDescriptionUnsafeChars(descRaw || short).slice(0, 8000) || short
  const longNote = encodeDouyinNoteRichTextFromPlain(longPlain)
  const shortNote = encodeDouyinNoteRichTextFromPlain(short)

  const richKey = findDouyinDescriptionRichTextKey(merged, templateProductAttrs)
  merged[richKey] = longNote

  const descMeta = descriptionMetaFromTemplate(templateProductAttrs)
  const descKey = descMeta?.key ?? 'Description'
  const descVt = (descMeta?.value_type ?? 'STRING').toUpperCase()

  const setDescription = (value: string) => {
    merged[descKey] = value
    for (const k of Object.keys(merged)) {
      if (attrKeyIsDouyinDescription(k) && k !== descKey) merged[k] = value
    }
  }

  if (descVt === 'NOTE') {
    /** 零售等类目 template 中 Description 为 NOTE：必须传 JSON，纯文本必报「Description参数不合法」 */
    setDescription(shortNote)
  } else {
    /** STRING/TEXT：长说明在 description_rich_text，Description 传官方空值 */
    setDescription(DOUYIN_DESCRIPTION_ATTR_UNUSED)
  }

  if (!merged[descKey] && name) {
    setDescription(descVt === 'NOTE' ? shortNote : DOUYIN_DESCRIPTION_ATTR_UNUSED)
  }

  coerceDouyinNoteFieldsToJson(templateProductAttrs, merged)
  return short
}

/** 网关提交前校验 Description attr */
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
      message: 'Description 须为 NOTE 控件 JSON 列表，或不需要时传 "[]"。',
      description_len: v.length,
    }
  }
  const min = 4
  const max = categoryId === '5003003' ? 40 : 200
  if (v.length < min) {
    return {
      ok: false,
      message: `Description 过短（${v.length} 字）。请填写商品说明。`,
      description_len: v.length,
    }
  }
  if (v.length > max) {
    return {
      ok: false,
      message: `Description 过长（${v.length} 字）。长文案请写在商品说明。`,
      description_len: v.length,
    }
  }
  return { ok: true }
}

export function describeDouyinDescriptionAttrForLog(
  templateProductAttrs: Record<string, unknown>[],
  merged: Record<string, string>,
): Record<string, unknown> {
  const descMeta = descriptionMetaFromTemplate(templateProductAttrs)
  const descKey = descMeta?.key ?? 'Description'
  const val = String(merged[descKey] ?? merged.Description ?? '').trim()
  return {
    description_key: descKey,
    description_value_type: descMeta?.value_type ?? null,
    description_len: val.length,
    description_is_unused_array: isDouyinDescriptionAttrUnused(val),
    description_is_note_json: isDouyinNoteRichTextJsonString(val),
    description_rich_is_note_json: isDouyinNoteRichTextJsonString(
      String(merged.description_rich_text ?? ''),
    ),
  }
}
