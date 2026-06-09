import type {
  HelpManualEdition,
  RegistryHelpManualArticle,
  RegistryHelpManualCategory,
} from './helpManualTypes.js'
import { normalizeHelpManualCategories } from './helpManualCategoryTree.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import { getHelpManualSeedForEdition } from './helpManualSeedContent.js'

export function helpManualSliceForEdition(
  data: RegistrySnapshot,
  edition: HelpManualEdition,
): { categories: RegistryHelpManualCategory[]; articles: RegistryHelpManualArticle[] } {
  const categories = (data.helpManualCategories ?? [])
    .filter((c) => c && c.edition === edition)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
  const articles = (data.helpManualArticles ?? [])
    .filter((a) => a && a.edition === edition)
    .sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt))
  if (categories.length === 0 && articles.length === 0) {
    return getHelpManualSeedForEdition(edition)
  }
  return { categories, articles }
}

export function setHelpManualForEdition(
  data: RegistrySnapshot,
  edition: HelpManualEdition,
  categories: RegistryHelpManualCategory[],
  articles: RegistryHelpManualArticle[],
): void {
  const restCat = (data.helpManualCategories ?? []).filter((c) => c.edition !== edition)
  const restArt = (data.helpManualArticles ?? []).filter((a) => a.edition !== edition)
  data.helpManualCategories = [...restCat, ...normalizeHelpManualCategories(categories)].slice(0, 500)
  data.helpManualArticles = [...restArt, ...articles].slice(0, 2000)
}
