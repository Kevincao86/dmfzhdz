export type HelpManualEdition = 'merchant' | 'partner' | 'fulfillment' | 'mp'

export const HELP_MANUAL_EDITIONS: HelpManualEdition[] = ['merchant', 'partner', 'fulfillment', 'mp']

export type RegistryHelpManualCategory = {
  id: string
  edition: HelpManualEdition
  title: string
  sortOrder: number
  /** 一级分类为空；有值则为二级分类 */
  parentId?: string
}

export type RegistryHelpManualArticle = {
  id: string
  edition: HelpManualEdition
  categoryId: string
  title: string
  body: string
  sortOrder: number
  updatedAt: string
}

export type HelpManualPublicPayload = {
  ok: true
  edition: HelpManualEdition
  categories: RegistryHelpManualCategory[]
  articles: RegistryHelpManualArticle[]
}
