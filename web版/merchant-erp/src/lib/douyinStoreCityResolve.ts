/**
 * 抖音来客 shop.query 官方响应通常仅含 poi.address（无 city 字段）。
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/local-life/develop/OpenAPI/general-capabilities/life.capacity.shop/store-management/shop.query
 * 本模块从 API 可选字段、地址与商户主体名称中推断「城市」展示值。
 */

export type DouyinStoreCityContext = {
  address?: string
  /** 省市区层级，如「浙江省/温州市/永嘉县」 */
  addressHierarchy?: string
  /** 执照主体 / root_account.account_name，如「温州市瓯楠汇…有限公司」 */
  organization?: string
  accountName?: string
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

export function normalizeCityLabel(raw: string): string {
  const t = raw.trim()
  if (!t || /^\d+$/.test(t)) return t
  if (/[市区县镇旗]$/.test(t)) return t
  return `${t}市`
}

/** 从任意中文标签（公司名、region 串）中提取地级市或县级单位 */
export function extractCityFromChineseLabel(text: string): string | undefined {
  const s = text.replace(/\s+/g, '').trim()
  if (!s) return undefined

  const municipalities = ['北京', '上海', '天津', '重庆'] as const
  for (const m of municipalities) {
    if (s.includes(m)) return `${m}市`
  }

  const allCities = [...s.matchAll(/([\u4e00-\u9fa5]{2,12}?)市/g)]
  for (const m of allCities) {
    const label = `${m[1]}市`
    if (label.endsWith('省')) continue
    if (/社区|街道|乡镇/.test(m[1]!)) continue
    return label
  }

  const slashParts = s.split(/[/／|｜,，>]+/).map((p) => p.trim()).filter(Boolean)
  for (const part of slashParts) {
    if (part.endsWith('市')) return part
    if (/[县区旗]$/.test(part)) return part
  }

  const admin = s.match(/([\u4e00-\u9fa5]{2,10}?(?:县|区|旗|州|盟))/)
  if (admin?.[1]) return admin[1]

  return undefined
}

/** 从门店 address 推断城市；优先「XX市」，其次县/区/旗（官方常只返街道级地址） */
export function inferCityFromChineseAddress(address: string): string | undefined {
  const s = address.replace(/\s+/g, '').trim()
  if (!s) return undefined

  for (const m of ['北京', '上海', '天津', '重庆'] as const) {
    if (s.startsWith(m)) return `${m}市`
  }

  const cityMatches = [...s.matchAll(/([\u4e00-\u9fa5]{2,12}?)市/g)]
  for (const m of cityMatches) {
    const label = `${m[1]}市`
    if (label.endsWith('省')) continue
    return label
  }

  const countyMatches = [...s.matchAll(/([\u4e00-\u9fa5]{2,10}?(?:县|区|旗))/g)]
  for (const m of countyMatches) {
    const label = m[1]!
    if (/街道|社区|乡镇|开发区/.test(label)) continue
    return label
  }

  const prefectureMatches = [...s.matchAll(/([\u4e00-\u9fa5]{2,10}?州)/g)]
  for (const m of prefectureMatches) {
    const label = m[1]!
    if (/街道|社区|自治/.test(label)) continue
    return label
  }

  const townMatch = s.match(/([\u4e00-\u9fa5]{2,8}镇)(?!道)/)
  if (townMatch?.[1]) return townMatch[1]

  /** 部分地址仅有区县简称 + 楼宇名，如「肥西诚挚大厦」 */
  const districtBuilding = s.match(
    /^([\u4e00-\u9fa5]{2,6})(?:诚挚|大厦|广场|中心|酒店|商城|园区|写字|万达|银泰)/,
  )
  if (districtBuilding?.[1] && !/街道|社区|镇/.test(districtBuilding[1])) {
    return `${districtBuilding[1]}区`
  }

  return undefined
}

function extractCityFromRegionString(region: string): string | undefined {
  const fromLabel = extractCityFromChineseLabel(region)
  if (fromLabel) return fromLabel
  return inferCityFromChineseAddress(region)
}

/**
 * 综合 poi / poi_ext 与上下文，解析门店城市展示值。
 * 抖音文档无 city 字段时，依次：API 可选字段 → 地址/region → 商户主体名称。
 */
export function resolveDouyinStoreCity(
  poi: Record<string, unknown>,
  ext: Record<string, unknown> | null,
  ctx?: DouyinStoreCityContext,
): string | undefined {
  const bags: Record<string, unknown>[] = [poi]
  if (ext) bags.push(ext)
  const attrs = poi.attributes
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    bags.push(attrs as Record<string, unknown>)
  }

  const cityKeys = [
    'city',
    'city_name',
    'cityName',
    'region_city',
    'region_city_name',
    'district_name',
    'district',
    'area_name',
  ]
  for (const bag of bags) {
    for (const k of cityKeys) {
      const v = str(bag[k])
      if (v) return normalizeCityLabel(v)
    }
  }

  const regionKeys = [
    'region_name',
    'address_all',
    'full_address',
    'location_name',
    'province_city',
    'ad_info',
  ]
  for (const bag of bags) {
    for (const k of regionKeys) {
      const v = str(bag[k])
      if (!v) continue
      const fromRegion = extractCityFromRegionString(v)
      if (fromRegion) return fromRegion
    }
  }

  const hierarchy = ctx?.addressHierarchy
  if (hierarchy) {
    const fromHierarchy = extractCityFromRegionString(hierarchy)
    if (fromHierarchy) return fromHierarchy
  }

  const addr = ctx?.address ?? str(poi.address) ?? str(ext?.address)
  if (addr) {
    const fromAddr = inferCityFromChineseAddress(addr)
    if (fromAddr) return fromAddr
  }

  for (const label of [ctx?.organization, ctx?.accountName]) {
    if (!label) continue
    const fromOrg = extractCityFromChineseLabel(label)
    if (fromOrg) return fromOrg
  }

  return undefined
}
