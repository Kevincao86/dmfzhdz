import type { HelpManualEdition, HelpManualPublicPayload } from './helpManualTypes.js'
import { buildMerchantErpApiUrl, merchantErpApiBase } from './merchantErpApiBase.js'
import { resolveHelpEdition } from './legalProductMeta.js'

export async function fetchHelpManualPublic(edition?: HelpManualEdition): Promise<HelpManualPublicPayload> {
  const ed = edition ?? resolveHelpEdition()
  const apiPath = `/api/meoo-help-manual-public?edition=${encodeURIComponent(ed)}`
  const base = merchantErpApiBase()
  const url = base ? buildMerchantErpApiUrl(base, apiPath) : apiPath
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as HelpManualPublicPayload & { error?: string }
  if (!res.ok || data.ok !== true) {
    throw new Error(String(data.error || `http_${res.status}`))
  }
  return data
}
