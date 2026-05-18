import type { ComboPackageGroup, DouyinProductDetailPayload } from '../services/douyinProductApi'

export type ComboItemFormRow = {
  id: string
  name: string
  priceYuan: string
  quantity: number
}

export type ComboGroupFormRow = {
  id: string
  /** 自定义商品组名称，空则保存时用「商品组 N」 */
  groupName: string
  pickRule: string
  items: ComboItemFormRow[]
}

function newRowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyComboItem(): ComboItemFormRow {
  return { id: newRowId('ci'), name: '', priceYuan: '', quantity: 1 }
}

export function defaultComboGroupName(index: number): string {
  return `商品组${index + 1}`
}

export function createDefaultComboGroups(): ComboGroupFormRow[] {
  return [
    {
      id: newRowId('cg'),
      groupName: defaultComboGroupName(0),
      pickRule: '全部必选',
      items: [createEmptyComboItem()],
    },
  ]
}

export function appendComboGroup(groups: ComboGroupFormRow[]): ComboGroupFormRow[] {
  return [
    ...groups,
    {
      id: newRowId('cg'),
      groupName: defaultComboGroupName(groups.length),
      pickRule: '全部必选',
      items: [createEmptyComboItem()],
    },
  ]
}

/** 按组内有效单品数生成「几选几」选项 */
export function pickRuleSelectOptionsForItemCount(itemCount: number): { value: string; label: string }[] {
  const o: { value: string; label: string }[] = [{ value: '', label: '请确认几选几' }]
  o.push({ value: '全部必选', label: '全部必选' })
  if (itemCount <= 1) return o
  for (let k = 1; k <= itemCount; k++) {
    o.push({ value: `${itemCount}选${k}`, label: `${itemCount}选${k}` })
  }
  return o
}

export function normalizePickRuleForSave(pickRule: string, itemCount: number): string {
  const allowed = new Set(pickRuleSelectOptionsForItemCount(itemCount).map((x) => x.value))
  const p = pickRule.trim()
  if (p && allowed.has(p)) return p
  return '全部必选'
}

export function comboGroupsFromPackageCombo(
  raw: DouyinProductDetailPayload['package_combo'],
): ComboGroupFormRow[] {
  const groups = raw?.groups
  if (!Array.isArray(groups) || groups.length === 0) {
    return createDefaultComboGroups()
  }
  return groups.map((g, gi) => {
    const itemsIn = Array.isArray(g.items) ? g.items : []
    const items: ComboItemFormRow[] =
      itemsIn.length > 0
        ? itemsIn.map((it) => ({
            id: newRowId('ci'),
            name: String(it.name ?? '').trim(),
            priceYuan:
              it.origin_price_yuan != null && Number.isFinite(Number(it.origin_price_yuan))
                ? String(Number(it.origin_price_yuan))
                : '',
            quantity: Math.max(1, Number(it.quantity) || 1),
          }))
        : [createEmptyComboItem()]
    const listed = items.filter((it) => it.name.trim()).length
    const gn = String(g.group_name ?? '').trim()
    return {
      id: newRowId('cg'),
      groupName: gn || defaultComboGroupName(gi),
      pickRule: String(g.pick_rule ?? '').trim() || '全部必选',
      items: listed > 0 ? items : [createEmptyComboItem()],
    }
  })
}

/** 表单 → package_combo（团购 product_type=1）；无有效单品时用商品名/售价兜底一组 */
export function packageComboFromFormGroups(
  groups: ComboGroupFormRow[],
  fallback: { productName: string; priceYuan: number },
): { groups: ComboPackageGroup[] } {
  const out: ComboPackageGroup[] = []
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    const items = g.items
      .filter((it) => it.name.trim())
      .map((it) => ({
        name: it.name.trim().slice(0, 120),
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        origin_price_yuan:
          Number.parseFloat(it.priceYuan) > 0
            ? Number.parseFloat(it.priceYuan)
            : fallback.priceYuan,
      }))
    if (items.length === 0) continue
    const groupName =
      g.groupName.trim().slice(0, 60) || defaultComboGroupName(gi)
    out.push({
      group_name: groupName,
      pick_rule: normalizePickRuleForSave(g.pickRule, items.length),
      items,
    })
  }
  if (out.length === 0) {
    const name = fallback.productName.trim().slice(0, 120) || '单品'
    return {
      groups: [
        {
          group_name: defaultComboGroupName(0),
          pick_rule: '全部必选',
          items: [
            {
              name,
              quantity: 1,
              origin_price_yuan: fallback.priceYuan,
            },
          ],
        },
      ],
    }
  }
  return { groups: out }
}
