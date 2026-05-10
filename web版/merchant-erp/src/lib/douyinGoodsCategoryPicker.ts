/**
 * 抖音来客商品类目选择：与「创建抖音来客商品」页保持一致的数据源与可选规则。
 * @see getDouyinGoodsCategoryTreeMerged — goodlife/v1/goods/category/get
 */
import { type DouyinCategoryNode, findNodeById } from '../data/douyinCategoryMock'
import {
  collectUploadableLeafCategoryIdsFromTree,
  getDouyinGoodsCategoryTreeMerged,
  type DouyinCategoryTreeNode,
} from '../services/douyinProductApi'

export type DouyinCategoryPickerLoadResult =
  | { ok: false; message: string }
  | { ok: true; tree: DouyinCategoryTreeNode[]; uploadableLeafIds: Set<string> }

/** 与 DouyinProductCreateWizard 首屏拉树逻辑一致：合并浅层子树 + 仅用类目树推导可发末级（不调 industry-scope） */
export async function loadDouyinGoodsCategoryTreeForPicker(): Promise<DouyinCategoryPickerLoadResult> {
  /** 一级行业多、餐饮下二级可达数十个，首包合并需较高上限；单请求仍受平台 QPS 限制 */
  const cat = await getDouyinGoodsCategoryTreeMerged(2200, 35)
  if (!cat.ok) return cat
  const ids = collectUploadableLeafCategoryIdsFromTree(cat.category_tree_infos)
  return {
    ok: true,
    tree: cat.category_tree_infos,
    uploadableLeafIds: new Set(ids),
  }
}

export function pickerUploadableLeafIdsFromTree(tree: DouyinCategoryTreeNode[]): Set<string> {
  return new Set(collectUploadableLeafCategoryIdsFromTree(tree))
}

export function pickerChildrenOf(
  tree: DouyinCategoryTreeNode[],
  parentId: string | null,
): DouyinCategoryTreeNode[] {
  if (!parentId) return tree
  const p = findNodeById(tree as DouyinCategoryNode[], parentId)
  return (p?.sub_tree_infos as DouyinCategoryTreeNode[] | undefined) ?? []
}

/** 根 → 末级 category_id 路径（与创建商品页 pathIdsToLeaf 一致） */
export function pickerPathIdsToLeaf(tree: DouyinCategoryTreeNode[], leafId: string): string[] {
  const out: string[] = []
  const walk = (nodes: DouyinCategoryTreeNode[], acc: string[]): boolean => {
    for (const n of nodes) {
      const next = [...acc, n.category_id]
      if (n.category_id === leafId) {
        out.push(...next)
        return true
      }
      if (n.sub_tree_infos?.length && walk(n.sub_tree_infos, next)) return true
    }
    return false
  }
  walk(tree, [])
  return out
}

export function pickerLabelsForPath(
  tree: DouyinCategoryTreeNode[],
  ids: string[],
): { path: string; name: string } {
  const names = ids.map((id) => findNodeById(tree as DouyinCategoryNode[], id)?.name ?? '').filter(Boolean)
  return { path: names.join(' > '), name: names[0] ?? '' }
}

/** 与创建商品页 leafSelectable 一致：末级须在 uploadableLeafIds 中 */
export function pickerLeafSelectable(
  leafId: string,
  node: DouyinCategoryTreeNode,
  uploadableLeafIds: Set<string>,
): boolean {
  return (
    node.is_leaf &&
    node.enable !== false &&
    !node.is_publish_block &&
    uploadableLeafIds.has(leafId)
  )
}
