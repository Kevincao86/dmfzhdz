import { fetchOpsErpApi } from '../lib/opsErpApiBase.js'

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

export async function fetchHelpManualDefaults(edition: HelpManualEdition): Promise<{
  ok: boolean
  categories?: RegistryHelpManualCategory[]
  articles?: RegistryHelpManualArticle[]
  version?: string
  error?: string
}> {
  const res = await fetchOpsErpApi(`/api/meoo-help-manual-defaults?edition=${edition}`)
  const j = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    categories?: RegistryHelpManualCategory[]
    articles?: RegistryHelpManualArticle[]
    version?: string
    error?: string
  }
  if (!res.ok || !j.ok) return { ok: false, error: String(j.error || `http_${res.status}`) }
  return {
    ok: true,
    categories: j.categories ?? [],
    articles: j.articles ?? [],
    version: j.version,
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
