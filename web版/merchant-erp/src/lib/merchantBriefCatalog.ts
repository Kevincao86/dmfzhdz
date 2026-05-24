/**
 * 达人 Brief / 智能体组品共用的门店上下文：经营类目、菜单价目、草稿商品。
 */
import { loadSelectedCompetitorStore } from './competitorStorage'
import { loadProductEditLibraryDraftBriefPicks } from './productEditLibrary'
import { readStoreMarginConfig } from './storeMarginsRead'
import { loadStoreMenuRecord, menuItemsSummary, type StoreMenuItem } from './storeMenuStorage'
import type { BriefProductPick } from '../services/recruitmentBriefAi'

export type MerchantBriefContext = {
  industryLabel: string
  industryPath: string
  storeName?: string
  menuSummary?: string
  menuItemCount: number
}

/** 读取商品页保存的绑定账号经营类目（叶子类目 path / name） */
export function resolveMerchantBriefContext(): MerchantBriefContext {
  const marginCfg = readStoreMarginConfig()
  const menu = loadStoreMenuRecord()
  const sel = loadSelectedCompetitorStore()
  const industryPath = marginCfg.industry.path?.trim() || ''
  const industryName = marginCfg.industry.name?.trim() || ''
  const industryLabel = industryPath || industryName || '本地生活'
  const items = menu?.items ?? []
  return {
    industryLabel,
    industryPath: industryPath || industryName,
    storeName: sel?.storeName ?? menu?.storeName,
    menuSummary: items.length ? menuItemsSummary(items, 48) : undefined,
    menuItemCount: items.length,
  }
}

/** 菜单价目优先，其次 ERP 草稿箱 */
export function loadMerchantBriefProductPicks(limit = 24): BriefProductPick[] {
  const menu = loadStoreMenuRecord()
  const seen = new Set<string>()
  const out: BriefProductPick[] = []

  for (const it of menu?.items ?? []) {
    const name = it.name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({
      id: `menu:${name}`,
      name,
      priceYuan:
        typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan) && it.priceYuan > 0
          ? Math.round(it.priceYuan)
          : 0,
      source: 'store_menu',
    })
    if (out.length >= limit) return out
  }

  for (const d of loadProductEditLibraryDraftBriefPicks(limit)) {
    if (seen.has(d.name)) continue
    seen.add(d.name)
    out.push(d)
    if (out.length >= limit) return out
  }
  return out
}

function scoreProductMatch(name: string, hint: string): number {
  if (!hint || hint.length < 2) return 0
  const n = name.trim()
  const h = hint.trim()
  if (n.includes(h) || h.includes(n.slice(0, Math.min(4, n.length)))) return 10
  if (h.slice(0, 4) && n.includes(h.slice(0, 4))) return 6
  return 0
}

/** 从门店商品池选取主推/次推（结合用户话术关键词） */
export function pickBriefMainAndSecondary(
  userBrief: string,
  catalog: BriefProductPick[],
  hint?: string,
): { main: BriefProductPick; secondary?: BriefProductPick } {
  const keyword = (hint ?? userBrief).replace(/\[引用[\s\S]*?\n\n/, '').trim()
  const priced = catalog.filter((p) => p.priceYuan > 0)
  const pool = priced.length ? priced : catalog
  if (!pool.length) {
    const fallbackName = keyword.slice(0, 24) || '门店主推品'
    return {
      main: { id: 'fallback-main', name: fallbackName, priceYuan: 0, source: 'store_menu' },
    }
  }

  const ranked = [...pool].sort(
    (a, b) => scoreProductMatch(b.name, keyword) - scoreProductMatch(a.name, keyword),
  )
  const main = ranked[0]!
  const secondary = ranked.find((p) => p.id !== main.id && p.name !== main.name)
  return secondary ? { main, secondary } : { main }
}

export function pricedMenuItems(): StoreMenuItem[] {
  return (loadStoreMenuRecord()?.items ?? []).filter(
    (it) =>
      it.name?.trim() &&
      typeof it.priceYuan === 'number' &&
      Number.isFinite(it.priceYuan) &&
      it.priceYuan > 0,
  )
}

function pickMenuSliceForSlot(items: StoreMenuItem[], slotIndex: number, total: number): StoreMenuItem[] {
  if (items.length <= 3) return items.slice(0, Math.min(3, items.length))
  const tierSize = Math.max(1, Math.ceil(items.length / total))
  const start = Math.min(slotIndex * tierSize, Math.max(0, items.length - 1))
  return items.slice(start, start + Math.min(3, tierSize))
}

/** 用户未指定具体商品时，从菜单价目拆出 N 个组品意图描述（供商品方案 API） */
export function buildMenuComboIntentLabels(
  planCount: number,
  menuItems?: StoreMenuItem[],
): { label: string; menuHint: string }[] {
  const items = menuItems ?? pricedMenuItems()
  if (items.length < 2) return []
  const n = Math.min(6, Math.max(2, planCount))
  const sorted = [...items].sort((a, b) => (a.priceYuan ?? 0) - (b.priceYuan ?? 0))
  const labels =
    n === 2 ? (['超值入门组品', '镇店招牌组品'] as const) : Array.from({ length: n }, (_, i) => `组品方案${i + 1}`)

  return labels.slice(0, n).map((label, i) => {
    const chunk = pickMenuSliceForSlot(sorted, i, n)
    const menuHint = chunk.map((it) => `${it.name}(¥${it.priceYuan})`).join('、')
    return { label, menuHint }
  })
}
