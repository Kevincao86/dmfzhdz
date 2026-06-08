import type { HelpManualEdition, HelpManualPublicPayload } from './helpManualTypes.js'
import { resolveHelpEdition } from './legalProductMeta.js'

function apiBase(): string {
  const env = (import.meta.env.VITE_MP_API_BASE as string | undefined)?.trim()
  if (env) return env.replace(/\/$/, '')
  if (import.meta.env.DEV) return ''
  return 'https://mofangdianai.com/erp-api'
}

export async function fetchHelpManualPublic(edition?: HelpManualEdition): Promise<HelpManualPublicPayload> {
  const ed = edition ?? resolveHelpEdition()
  const base = apiBase()
  const url = `${base}/api/meoo-help-manual-public?edition=${encodeURIComponent(ed)}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as HelpManualPublicPayload & { error?: string }
  if (!res.ok || data.ok !== true) {
    throw new Error(String(data.error || `http_${res.status}`))
  }
  return data
}
