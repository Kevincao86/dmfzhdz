/**
 * 竞争对手分析所用经营类目：优先商品页「门店毛利配置」，其次从门店名推断。
 */
import {
  readStoreMarginConfig,
  storeMarginIndustryConfigured,
} from './storeMarginsRead'

export type CompetitorIndustryResolved = {
  path: string
  name: string
  source: 'margin_config' | 'store_name' | 'none'
}

function inferIndustryFromStoreName(storeName: string): CompetitorIndustryResolved | null {
  const sn = storeName.trim()
  if (!sn) return null

  if (/3[Cc]|数码|电子|手机|电脑|家电|科技生活|科技馆|通讯|智能设备/.test(sn)) {
    return { path: '购物 > 数码家电', name: '数码家电', source: 'store_name' }
  }
  if (/便利|超市|卖场|生鲜|社区店|小卖部/.test(sn)) {
    return { path: '购物 > 商超便利', name: '商超便利', source: 'store_name' }
  }
  if (/百货|商场|购物中心|奥特莱斯/.test(sn)) {
    return { path: '购物 > 百货零售', name: '百货零售', source: 'store_name' }
  }
  /** 足疗 / SPA / 汤泉等休闲业态（截图门店名常见） */
  if (/足道|足疗|足浴|修脚|采耳|汤泉|温泉|洗浴|汗蒸|SPA|Spa|spa|按摩|推拿|养生会所/.test(sn)) {
    return { path: '休闲娱乐 > 足疗按摩', name: '足疗按摩', source: 'store_name' }
  }
  if (/美容|美发|美甲|美睫|皮肤管理|纹绣/.test(sn)) {
    return { path: '丽人 > 美发', name: '美发', source: 'store_name' }
  }
  return null
}

/** 解析竞品分析应使用的经营类目（绑定配置优先） */
export function resolveCompetitorAnalysisIndustry(storeName?: string): CompetitorIndustryResolved {
  const marginCfg = readStoreMarginConfig()
  const path = marginCfg.industry.path.trim()
  const name = marginCfg.industry.name.trim()
  if (path || name) {
    return {
      path: path || name,
      name: name || path,
      source: 'margin_config',
    }
  }
  /** 仅有类目 id / code 时也视为已配置，避免「已保存但 path 空」卡死分析 */
  if (storeMarginIndustryConfigured(marginCfg.industry)) {
    const fallback =
      marginCfg.industry.name ||
      marginCfg.industry.code ||
      `类目 ${marginCfg.industry.leafCategoryId}`
    return {
      path: fallback,
      name: fallback,
      source: 'margin_config',
    }
  }

  const inferred = inferIndustryFromStoreName(storeName ?? '')
  if (inferred) return inferred

  return { path: '', name: '', source: 'none' }
}

export function competitorIndustrySourceLabel(source: CompetitorIndustryResolved['source']): string {
  if (source === 'margin_config') return '商品页已绑定'
  if (source === 'store_name') return '门店名推断'
  return '未配置'
}
