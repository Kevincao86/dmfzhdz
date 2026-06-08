import { fetchPublicPortalJson } from './merchantErpApiBase.js'
import type { RegistryTeamIntro, TeamIntroPublicPayload } from './teamIntroTypes.js'

export async function fetchTeamIntroPublic(): Promise<RegistryTeamIntro> {
  const data = await fetchPublicPortalJson<TeamIntroPublicPayload>('/api/meoo-team-intro-public')
  if (!data.intro) throw new Error('team_intro_empty')
  return data.intro
}
