import type { HelpManualEdition, HelpManualPublicPayload } from './helpManualTypes.js'
import { fetchPublicPortalJson } from './merchantErpApiBase.js'
import { resolveHelpEdition } from './legalProductMeta.js'

export async function fetchHelpManualPublic(edition?: HelpManualEdition): Promise<HelpManualPublicPayload> {
  const ed = edition ?? resolveHelpEdition()
  const apiPath = `/api/meoo-help-manual-public?edition=${encodeURIComponent(ed)}`
  return fetchPublicPortalJson<HelpManualPublicPayload>(apiPath)
}
