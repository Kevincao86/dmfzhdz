export type HelpManualEdition = 'merchant' | 'partner' | 'fulfillment' | 'mp'

export const HELP_MANUAL_EDITIONS: HelpManualEdition[] = ['merchant', 'partner', 'fulfillment', 'mp']

export type RegistryHelpManualCategory = {
  id: string
  edition: HelpManualEdition
  title: string
  sortOrder: number
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
