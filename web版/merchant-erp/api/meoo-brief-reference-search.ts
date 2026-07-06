/**
 * POST /api/meoo-brief-reference-search — Brief 案例检索（抖音/网页，只检索不生图）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleMerchantApiOptions } from './merchant/merchantGatewayShared.js'
import {
  buildBriefWebSearchQueries,
  searchBriefWebReferences,
} from '../src/lib/viralBriefWebReferenceSearchCore.js'
import type { ViralBriefPlatform } from '../src/services/viralBriefAi.js'

export const config = { maxDuration: 60 }

const PLATFORMS = new Set<ViralBriefPlatform>([
  'douyin',
  'xiaohongshu',
  'dianping',
  'channels',
  'kuaishou',
])

function readBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>
  if (typeof b === 'string' && b.trim()) {
    try {
      return JSON.parse(b) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method Not Allowed' })
    return
  }

  const body = readBody(req)
  const platformRaw = String(body.platform || 'douyin').trim() as ViralBriefPlatform
  const platform = PLATFORMS.has(platformRaw) ? platformRaw : 'douyin'
  const limit = Math.max(1, Math.min(Number(body.limit) || 4, 8))

  const queriesFromBody = Array.isArray(body.queries)
    ? body.queries.map((x) => String(x).trim()).filter((x) => x.length >= 2)
    : []

  const queries =
    queriesFromBody.length > 0
      ? queriesFromBody.slice(0, 3)
      : buildBriefWebSearchQueries({
          orderTitle: String(body.orderTitle || ''),
          category: String(body.category || ''),
          region: String(body.region || ''),
          platform,
          styleLabel: String(body.styleLabel || ''),
          requirementSummary: String(body.requirementSummary || ''),
          topics: Array.isArray(body.topics) ? body.topics.map((x) => String(x)) : [],
        })

  try {
    const hits = await searchBriefWebReferences({ platform, queries, limit })
    res.status(200).json({ ok: true, hits, queries })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(502).json({ ok: false, message: msg })
  }
}
