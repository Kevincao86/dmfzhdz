import {
  getHelpManualSeedForEdition,
  HELP_MANUAL_SEED_VERSION,
} from '../meooRegistryShared/helpManualSeedContent.ts'
import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'

export type HelpManualEdition = 'merchant' | 'partner' | 'fulfillment' | 'mp'

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

/** 载入默认手册：使用仓库内置种子（不依赖 ECS auth-api 是否已部署最新版） */
export async function fetchHelpManualDefaults(edition: HelpManualEdition): Promise<{
  ok: boolean
  categories?: RegistryHelpManualCategory[]
  articles?: RegistryHelpManualArticle[]
  version?: string
  error?: string
}> {
  try {
    const seed = getHelpManualSeedForEdition(edition)
    return {
      ok: true,
      categories: seed.categories,
      articles: seed.articles,
      version: HELP_MANUAL_SEED_VERSION,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function saveHelpManualEdition(body: {
  edition: HelpManualEdition
  categories: RegistryHelpManualCategory[]
  articles: RegistryHelpManualArticle[]
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchOpsErpApi('/api/meoo-ops-help-manual-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) return { ok: false, error: String(j.error || `http_${res.status}`) }
  return { ok: j.ok !== false }
}
