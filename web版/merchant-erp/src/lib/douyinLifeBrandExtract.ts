/**
 * 抖音来客 goodlife 门店数据中的「门店品牌」：多为结构化对象（文档/JSON 常见键 Brand 或 brand），
 * 与 poi_name（门店名称）、root_account（执照主体）区分。
 * @see goodlife/v1/shop/poi/query/ 返回 data.pois[]
 */

function trimStr(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  return v.trim()
}

/** 从 Brand / life_brand 等对象上取对客品牌名 */
export function pickNameFromBrandLikeObject(v: unknown): string | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const b = v as Record<string, unknown>
  return trimStr(
    b.brand_name ??
      b.brandName ??
      b.name ??
      b.title ??
      b.display_name ??
      b.brand_display_name ??
      b.shop_brand_name ??
      b.customer_display_name,
  )
}

/**
 * 从单行 POI 包络（data.pois[] 元素）或嵌套 poi / poi_ext / attributes 上解析「门店品牌」展示名。
 * 优先 PascalCase `Brand`（与部分网关 JSON 一致），再 `brand` 及常见嵌套键。
 */
export function extractLifeBrandStructName(obj: Record<string, unknown> | null): string | undefined {
  if (!obj) return undefined

  const top = obj.Brand ?? obj.brand
  if (typeof top === 'string') return trimStr(top)
  const fromTop = pickNameFromBrandLikeObject(top)
  if (fromTop) return fromTop

  const nestedKeys = [
    'life_brand',
    'store_brand',
    'brand_info',
    'poi_brand_info',
    'merchant_brand_info',
    'life_account_brand',
  ]
  for (const k of nestedKeys) {
    const v = obj[k]
    if (typeof v === 'string' && trimStr(v)) return trimStr(v)
    const n = pickNameFromBrandLikeObject(v)
    if (n) return n
  }

  if (obj.poi_ext && typeof obj.poi_ext === 'object' && !Array.isArray(obj.poi_ext)) {
    const nested = extractLifeBrandStructName(obj.poi_ext as Record<string, unknown>)
    if (nested) return nested
  }

  if (obj.attributes && typeof obj.attributes === 'object' && !Array.isArray(obj.attributes)) {
    const nested = extractLifeBrandStructName(obj.attributes as Record<string, unknown>)
    if (nested) return nested
  }
  if (obj.attr && typeof obj.attr === 'object' && !Array.isArray(obj.attr)) {
    const nested = extractLifeBrandStructName(obj.attr as Record<string, unknown>)
    if (nested) return nested
  }

  return undefined
}
