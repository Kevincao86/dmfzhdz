import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import type { BriefContentForSearch } from '../lib/viralBriefReferenceKeywordCore'
import type { BriefWebReferenceHit } from '../lib/viralBriefWebReferenceSearchCore'
import type { ViralBriefPlatform } from './viralBriefAi'

const PATHS = ['/api/meoo-brief-reference-search'] as const

export async function fetchBriefWebReferenceHits(input: {
  platform: ViralBriefPlatform
  briefContent: BriefContentForSearch
  limit?: number
}): Promise<BriefWebReferenceHit[]> {
  const body = JSON.stringify({
    platform: input.platform,
    briefContent: input.briefContent,
    limit: input.limit,
  })

  for (const path of PATHS) {
    for (const url of merchantApiFetchUrls(path)) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(45_000),
        })
        if (res.status === 404) continue
        const data = (await res.json()) as { ok?: boolean; hits?: BriefWebReferenceHit[]; message?: string }
        if (!res.ok || data.ok === false) continue
        return Array.isArray(data.hits) ? data.hits : []
      } catch {
        continue
      }
    }
  }
  return []
}
