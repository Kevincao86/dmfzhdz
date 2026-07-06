import { merchantApiFetchUrls } from '../lib/merchantErpApiBase'
import type { BriefWebReferenceHit } from '../lib/viralBriefWebReferenceSearchCore'
import type { ViralBriefPlatform } from './viralBriefAi'

const PATHS = ['/api/meoo-brief-reference-search'] as const

export async function fetchBriefWebReferenceHits(input: {
  platform: ViralBriefPlatform
  orderTitle: string
  category?: string
  region?: string
  styleLabel?: string
  requirementSummary?: string
  topics?: string[]
  limit?: number
}): Promise<BriefWebReferenceHit[]> {
  const body = JSON.stringify({
    platform: input.platform,
    orderTitle: input.orderTitle,
    category: input.category,
    region: input.region,
    styleLabel: input.styleLabel,
    requirementSummary: input.requirementSummary,
    topics: input.topics,
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
