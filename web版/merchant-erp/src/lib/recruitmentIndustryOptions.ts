import { MOCK_CATEGORY_TREE } from '../data/douyinCategoryMock'
import { getDouyinGoodsCategoryTreeMerged } from '../services/douyinProductApi'

/** 与「门店毛利配置 / 创建商品」同源：优先抖音来客类目树一级名称，失败则用本地示例树（图8 口径） */
export async function loadRecruitmentIndustryL1Labels(): Promise<string[]> {
  try {
    const r = await getDouyinGoodsCategoryTreeMerged(120, 40)
    if (r.ok && r.category_tree_infos?.length) {
      const names = r.category_tree_infos
        .filter((n) => n.level === 1 && n.enable !== false)
        .map((n) => n.name.trim())
        .filter(Boolean)
      if (names.length) return Array.from(new Set(names))
    }
  } catch {
    /* 未绑定或网关不可用时走示例树 */
  }
  return MOCK_CATEGORY_TREE.map((n) => n.name).filter(Boolean)
}
