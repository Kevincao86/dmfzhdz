import type { TemplateAttr } from '../services/douyinProductApi'
import {
  attrKeyIsDouyinProductNameHint,
  attrKeyIsDouyinSubTitle,
  normalizeDouyinSubTitle,
} from './douyinSubTitleNormalize'
import { normalizeDouyinDescription } from './douyinDescriptionNormalize'
import {
  attrTemplateIsNoteRichText,
  encodeDouyinNoteRichTextFromPlain,
  parseDouyinTemplateAttrMeta,
} from './douyinNoteRichTextFormat.js'
import {
  douyinAppointmentJson,
  douyinCanNoUseDateJson,
  douyinUseDateJson,
  douyinUseTimeJson,
  normalizeDouyinShowChannelValue,
} from './douyinTradeRuleAttrNormalize'

export type SkuCommodityFormItem = { id: string; name: string; priceCents: string; count: string }
export type SkuCommodityFormGroup = {
  id: string
  groupName: string
  totalCount: string
  optionCount: string
  items: SkuCommodityFormItem[]
}

export type DouyinTemplateAutoFillInput = {
  productType: number | null
  categoryId: string
  productName: string
  productDesc: string
  priceYuan: string
  originYuan: string
  headUrl: string
  auxUrls: string[]
  envUrls: string[]
  salesChannel: string
  afterSalePolicy: string
  consumeDateMode: 'days' | 'calendar'
  consumeValidDays: string
  saleStart: string
  saleEnd: string
  stockQty: string
  stockLimited: boolean
  reserveMode: 'none' | 'required'
  comboGroups: Array<{
    pickRule: string
    items: Array<{ name: string; qty: string; price: string }>
  }>
}

function jsonImageUrlList(urls: string[]): string {
  const list = urls.map((u) => u.trim()).filter(Boolean).slice(0, 30)
  if (list.length === 0) return ''
  return JSON.stringify(list.map((url) => ({ url })))
}

function priceYuanToCents(yuan: string): number {
  const n = Number.parseFloat(String(yuan).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.max(1, Math.round(n * 100))
}

function afterSaleToRefundPolicy(policy: string): string {
  if (policy === 'no_refund') return '2'
  if (policy === 'refund_auto_expire') return '3'
  return '1'
}

function defaultUseDateJson(input: DouyinTemplateAutoFillInput): string {
  const days = Math.max(1, Math.floor(Number(input.consumeValidDays) || 360))
  return douyinUseDateJson(
    days,
    input.consumeDateMode,
    input.saleStart.trim(),
    input.saleEnd.trim(),
  )
}

export function buildSkuCommodityGroupsForAutoFill(
  input: DouyinTemplateAutoFillInput,
  newId: (prefix: string) => string,
): SkuCommodityFormGroup[] {
  const cents = priceYuanToCents(input.priceYuan)
  const fromCombo: SkuCommodityFormGroup[] = []
  for (let gi = 0; gi < input.comboGroups.length; gi++) {
    const g = input.comboGroups[gi]!
    const items = g.items
      .filter((it) => it.name.trim())
      .map((it) => {
        const py = Number.parseFloat(it.price)
        const pc =
          Number.isFinite(py) && py >= 0 ? String(Math.round(py * 100)) : cents > 0 ? String(cents) : ''
        return {
          id: newId('sci'),
          name: it.name.trim(),
          priceCents: pc || '1',
          count: (it.qty || '1').trim() || '1',
        }
      })
    if (items.length === 0) continue
    fromCombo.push({
      id: newId('scg'),
      groupName: `商品组${gi + 1}`,
      totalCount: '1',
      optionCount: '1',
      items,
    })
  }
  if (fromCombo.length > 0) return fromCombo

  const nm = input.productName.trim().slice(0, 120) || '团购套餐'
  const price = cents > 0 ? String(cents) : '1'
  const mk = (): SkuCommodityFormGroup => ({
    id: newId('scg'),
    groupName: '商品组',
    totalCount: '1',
    optionCount: '1',
    items: [{ id: newId('sci'), name: nm, priceCents: price, count: '1' }],
  })
  /** 零售类目默认单组即可；双组同源易触发抖音「数量/单位」误报 */
  return [mk()]
}

export function skuCommodityFormToJson(groups: SkuCommodityFormGroup[]): string {
  const arr = groups.map((g) => ({
    group_name: (g.groupName.trim() || '商品组').slice(0, 80),
    total_count: Math.max(1, parseInt(String(g.totalCount).replace(/\D/g, ''), 10) || 1),
    option_count: Math.max(1, parseInt(String(g.optionCount).replace(/\D/g, ''), 10) || 1),
    item_list: g.items.map((it) => {
      const pc = parseInt(String(it.priceCents).replace(/\D/g, ''), 10)
      const price = Number.isFinite(pc) && pc > 0 ? pc : 1
      const c = Math.max(1, parseInt(String(it.count).replace(/\D/g, ''), 10) || 1)
      return {
        name: (it.name.trim() || '单品').slice(0, 120),
        price,
        count: c,
        unit: '份',
      }
    }),
  }))
  return JSON.stringify(arr)
}

function looksComboTemplateAttr(a: TemplateAttr): boolean {
  const key = (a.key ?? '').trim().toLowerCase()
  const name = (a.name ?? '').toLowerCase()
  const vt = (a.value_type ?? '').toUpperCase()
  if (vt === 'COMMODITY') return true
  if (/^combo_rule$/i.test(key)) return true
  if (/^commodity$/i.test(key)) return true
  if (name.includes('combo_rule')) return true
  if (/套餐规则|搭配规则|组合规则|商品搭配|菜品搭配/.test(a.name ?? '')) return true
  if ((vt === 'STRUCT' || vt === 'OBJECT' || vt === 'JSON') && /套餐|搭配|组合/.test(a.name ?? '')) return true
  return false
}

/**
 * 根据当前向导表单为 template.get 返回的每个 attr 生成可提交的字符串值（含选填项）。
 */
export function buildDouyinTemplateAutoFillMaps(
  productAttrs: TemplateAttr[],
  skuAttrs: TemplateAttr[],
  input: DouyinTemplateAutoFillInput,
  commodityJson: string,
): { product: Record<string, string>; sku: Record<string, string> } {
  const product: Record<string, string> = {}
  const sku: Record<string, string> = {}

  const name = input.productName.trim()
  const descLong = (input.productDesc.trim() || name).slice(0, 12000)
  const descAttr = normalizeDouyinDescription(
    input.productDesc,
    name,
    undefined,
    undefined,
    input.categoryId.trim(),
  )
  const subtitle = normalizeDouyinSubTitle(name, name)
  const head = input.headUrl.trim()
  const aux = input.auxUrls.map((u) => u.trim()).filter(Boolean)
  const env = input.envUrls.map((u) => u.trim()).filter(Boolean)
  const carousel = [...(head ? [head] : []), ...aux]
  const cents = priceYuanToCents(input.priceYuan)
  const originCents = Math.max(cents, priceYuanToCents(input.originYuan) || cents)
  const stock = input.stockLimited
    ? String(Math.max(0, Math.floor(Number(input.stockQty) || 0)))
    : '999999'

  const showCh = normalizeDouyinShowChannelValue(
    '',
    input.salesChannel.trim(),
    input.categoryId.trim(),
  )
  const refund = afterSaleToRefundPolicy(input.afterSalePolicy.trim())

  for (const a of productAttrs) {
    const key = (a.key ?? '').trim()
    if (!key) continue
    const lk = key.toLowerCase()
    const nm = a.name ?? ''
    const vt = (a.value_type ?? '').toUpperCase()

    if (looksComboTemplateAttr(a)) {
      if (input.productType === 1 && commodityJson) product[key] = commodityJson
      continue
    }

    if (vt.includes('IMAGE') || vt === 'PIC') {
      if (/环境|场景/.test(nm)) {
        const j = jsonImageUrlList(env.length ? env : carousel)
        if (j) product[key] = j
      } else if (/1v1|方图|主图/.test(nm) || lk.includes('1v1')) {
        const j = jsonImageUrlList(head ? [head] : carousel.slice(0, 1))
        if (j) product[key] = j
      } else if (/详情|detail/.test(nm) || lk.includes('detail')) {
        const j = jsonImageUrlList(carousel)
        if (j) product[key] = j
      } else {
        const j = jsonImageUrlList(carousel)
        if (j) product[key] = j
      }
      continue
    }

    if (lk === 'description' || /^description$/i.test(key)) {
      product[key] = descAttr
      continue
    }
    if (attrTemplateIsNoteRichText(parseDouyinTemplateAttrMeta(a as unknown as Record<string, unknown>))) {
      product[key] = encodeDouyinNoteRichTextFromPlain(descLong || name)
      continue
    }
    if (attrKeyIsDouyinSubTitle(key)) {
      product[key] = subtitle
      continue
    }
    if (attrKeyIsDouyinProductNameHint(key)) {
      product[key] = ''
      continue
    }
    if (lk === 'show_channel') {
      product[key] = showCh
      continue
    }
    if (lk === 'refundpolicy' || key === 'RefundPolicy') {
      product[key] = refund
      continue
    }
    if (lk === 'appointment') {
      product[key] = douyinAppointmentJson(input.reserveMode === 'required')
      continue
    }
    if (lk === 'use_date') {
      product[key] = defaultUseDateJson(input)
      continue
    }
    if (lk === 'use_time') {
      product[key] = douyinUseTimeJson()
      continue
    }
    if (lk === 'can_no_use_date') {
      product[key] = douyinCanNoUseDateJson(false)
      continue
    }

    if (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER' || vt === 'INTEGER') {
      if (/库存|数量/.test(nm)) product[key] = stock
      else if (/有效|天数/.test(nm)) {
        product[key] = String(Math.max(1, Math.floor(Number(input.consumeValidDays) || 360)))
      } else product[key] = '1'
      continue
    }

    if (vt === 'BOOL' || vt === 'BOOLEAN') {
      product[key] = 'false'
      continue
    }

    if (vt === 'STRUCT' || vt === 'OBJECT' || vt === 'JSON' || vt === 'ARRAY') {
      if (/日期|use_date|有效期/.test(nm)) product[key] = defaultUseDateJson(input)
      else if (/时间|use_time|时段/.test(nm)) product[key] = douyinUseTimeJson()
      else if (/预约|appointment/.test(nm)) product[key] = douyinAppointmentJson(input.reserveMode === 'required')
      else product[key] = '{}'
      continue
    }

    if (/hint|规范|提示/.test(lk) || /规范|提示|名称规范/.test(nm)) {
      product[key] = name.slice(0, 50)
      continue
    }
    if (vt === 'NOTE') {
      product[key] = encodeDouyinNoteRichTextFromPlain(descLong || name)
      continue
    }
    product[key] = descLong.slice(0, 2000) || name.slice(0, 2000) || '-'
  }

  for (const a of skuAttrs) {
    const key = (a.key ?? '').trim()
    if (!key) continue
    const lk = key.toLowerCase()
    const nm = a.name ?? ''
    const vt = (a.value_type ?? '').toUpperCase()

    if (looksComboTemplateAttr(a)) {
      if (input.productType === 1 && commodityJson) sku[key] = commodityJson
      continue
    }
    if (lk === 'actual_amount' || /售价|实付|现价/.test(nm)) {
      sku[key] = String(cents > 0 ? cents : 1)
      continue
    }
    if (lk === 'origin_amount' || /原价|划线/.test(nm)) {
      sku[key] = String(originCents > 0 ? originCents : cents || 1)
      continue
    }
    if (lk === 'stock_qty' || /库存/.test(nm)) {
      sku[key] = stock
      continue
    }
    if (lk === 'code_source_type' || /券码来源|码来源/.test(nm)) {
      sku[key] = '1'
      continue
    }
    if (lk === 'limit_rule') {
      sku[key] = '{"is_limit":false}'
      continue
    }
    if (lk === 'settle_type') {
      sku[key] = '1'
      continue
    }
    if (lk === 'use_type') {
      sku[key] = '1'
      continue
    }
    if (lk === 'sku_name' || /名称|规格/.test(nm)) {
      sku[key] = name.slice(0, 120) || 'SKU'
      continue
    }
    if (vt === 'INT' || vt === 'LONG' || vt === 'NUMBER') {
      sku[key] = String(cents > 0 ? cents : 1)
      continue
    }
    sku[key] = name.slice(0, 120) || '1'
  }

  if (commodityJson) {
    sku.commodity = commodityJson
    product.combo_rule = commodityJson
  }

  return { product, sku }
}
