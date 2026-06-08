import { buildMerchantErpApiUrl, merchantErpApiBase } from './merchantErpApiBase.js'
import type { RegistryTeamIntro, TeamIntroPublicPayload } from './teamIntroTypes.js'

export async function fetchTeamIntroPublic(): Promise<RegistryTeamIntro> {
  const apiPath = '/api/meoo-team-intro-public'
  const base = merchantErpApiBase()
  const url = base ? buildMerchantErpApiUrl(base, apiPath) : apiPath
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as TeamIntroPublicPayload & { error?: string; intro?: RegistryTeamIntro }
  if (!res.ok || data.ok !== true || !data.intro) {
    throw new Error(String(data.error || `http_${res.status}`))
  }
  return data.intro
}
