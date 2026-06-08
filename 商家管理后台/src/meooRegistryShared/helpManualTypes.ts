export type HelpManualEdition = 'merchant' | 'partner' | 'fulfillment'

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
