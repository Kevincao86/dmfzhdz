import type { RegistryHelpManualCategory } from './helpManualTypes.js'

export function topLevelCategories(categories: RegistryHelpManualCategory[]): RegistryHelpManualCategory[] {
  return categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
}

export function childCategories(
  categories: RegistryHelpManualCategory[],
  parentId: string,
): RegistryHelpManualCategory[] {
  return categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
}

export function hasChildCategories(categories: RegistryHelpManualCategory[], parentId: string): boolean {
  return categories.some((c) => c.parentId === parentId)
}

export function firstSelectableCategoryId(categories: RegistryHelpManualCategory[]): string {
  for (const top of topLevelCategories(categories)) {
    const children = childCategories(categories, top.id)
    if (children.length === 0) return top.id
    return children[0].id
  }
  return categories[0]?.id ?? ''
}

/** 删除分类时级联：自身 + 全部二级子分类 */
export function categoryIdsToDelete(categories: RegistryHelpManualCategory[], id: string): string[] {
  const ids = new Set<string>([id])
  for (const c of categories) {
    if (c.parentId && ids.has(c.parentId)) ids.add(c.id)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        changed = true
      }
    }
  }
  return [...ids]
}

export function normalizeHelpManualCategories(
  categories: RegistryHelpManualCategory[],
): RegistryHelpManualCategory[] {
  const ids = new Set(categories.map((c) => c.id))
  return categories.map((c) => {
    const parentId = c.parentId && ids.has(c.parentId) && c.parentId !== c.id ? c.parentId : undefined
    return parentId ? { ...c, parentId } : { ...c, parentId: undefined }
  })
}
